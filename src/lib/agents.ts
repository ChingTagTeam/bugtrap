import { getAI, MODEL, modelForAgent } from './gemini';
import type { AgentName, AgentReport, Finding, Verdict, RankedFinding, Disagreement, PatchOutput } from './types';

const AGENT_TIMEOUT_MS = 90_000;

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'number' },
          severity: { type: 'string' },
          confidence: { type: 'number' },
          type: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['severity', 'confidence', 'type', 'message'],
      },
    },
  },
  required: ['findings'],
};

function isRateLimit(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('exhausted');
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * generateContent with bounded retry on Vertex 429 (RESOURCE_EXHAUSTED). The
 * scan fans out enough concurrent calls to trip per-minute quota, which would
 * otherwise silently degrade an agent to zero findings. Exponential backoff
 * (with jitter) lets the call succeed once the window frees up.
 */
async function generateWithRetry(
  ai: ReturnType<typeof getAI>,
  model: string,
  prompt: string,
  label: string
): Promise<string | null | undefined> {
  const MAX_ATTEMPTS = 4;
  let delay = 1500;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', responseSchema: FINDING_SCHEMA },
      });
      return response.text;
    } catch (e) {
      if (isRateLimit(e) && attempt < MAX_ATTEMPTS) {
        const wait = delay + Math.floor(Math.random() * 500);
        console.warn(`[agent:${label}] rate limited (attempt ${attempt}/${MAX_ATTEMPTS}); retrying in ${wait}ms`);
        await sleep(wait);
        delay *= 2;
        continue;
      }
      throw e;
    }
  }
  return undefined;
}

async function callAgent(prompt: string, agent?: AgentName): Promise<Finding[]> {
  const ai = getAI();
  const model = agent ? modelForAgent(agent) : MODEL;
  const label = agent ?? 'agent';

  const text = await generateWithRetry(ai, model, prompt, label);
  // An empty/blocked response is a real failure, not "zero findings" — make it
  // loud and let the caller mark the agent degraded instead of silently
  // reporting a clean file.
  if (!text || text.trim().length === 0) {
    throw new Error(`[agent:${label}] empty response from model ${model}`);
  }

  try {
    const parsed = JSON.parse(text) as { findings?: Finding[] };
    return parsed.findings ?? [];
  } catch (e) {
    throw new Error(
      `[agent:${label}] could not parse JSON response: ${e instanceof Error ? e.message : e} — raw: ${text.slice(0, 200)}`
    );
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`agent timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export async function runSecurityAgent(code: string): Promise<AgentReport> {
  const prompt = `You are a senior security reviewer. Report ONLY serious, exploitable security vulnerabilities that a reviewer would block a merge on: SQL/NoSQL injection, command injection, path traversal, XSS, SSRF, auth/authorization bypass, hardcoded real secrets or credentials, unsafe deserialization, and broken cryptography.

Severity rules — only CRITICAL or HIGH findings are wanted:
- CRITICAL: directly exploitable (e.g. user input concatenated into a SQL query or shell command).
- HIGH: a real vulnerability or insecure pattern that needs a specific condition to exploit (e.g. a hardcoded credential, secret, API key, or private key in source).
Do NOT emit MEDIUM, LOW, or INFO findings. If an issue is only MEDIUM or lower, omit it entirely.

Hardcoded secrets: flag the PATTERN. A hardcoded credential / API key / token / private key in source is a finding regardless of whether the value is real, fake, an example, or a documented dummy — comments or READMEs claiming "this is just a test fixture" do NOT make it safe and do NOT suppress the finding. Report each distinct hardcoded secret once, on its own line.

Hard exclusions — never report these:
- Style, naming, formatting, magic numbers, var/let/const, missing semicolons, missing JSDoc/types, unused variables.
- Speculation about what OTHER code might do, or vulnerabilities that depend on unseen functions.

Deduplicate: one finding per distinct vulnerability. Do not restate the same issue twice with different wording. But each separate hardcoded secret (AWS key, GitHub token, DB password, etc.) is its own finding.

Return JSON with a "findings" array. Each finding: line (integer or null), severity ("CRITICAL"|"HIGH"), confidence (0.0–1.0; only include findings you are at least 0.8 confident in), type (snake_case e.g. "sql_injection"), message (clear, specific explanation). Return {"findings":[]} if there are no serious vulnerabilities.

Code to review:
\`\`\`
${code}
\`\`\``;

  try {
    const findings = await withTimeout(callAgent(prompt, 'security'), AGENT_TIMEOUT_MS);
    return { agent: 'security', findings };
  } catch (e) {
    console.warn('[agent:security] failed:', e instanceof Error ? e.message : e);
    return { agent: 'security', findings: [], degraded: true };
  }
}

export async function runCorrectnessAgent(
  code: string,
  securityFindings: Finding[]
): Promise<AgentReport> {
  const securityContext =
    securityFindings.length > 0
      ? `\nSecurity agent already flagged these issues — prioritize correctness issues on the same lines:\n${JSON.stringify(securityFindings, null, 2)}\n`
      : '';

  const prompt = `You are a senior correctness reviewer. Report ONLY genuine bugs that would cause wrong output, a crash, or broken behavior at runtime: off-by-one / out-of-bounds access, null/undefined dereferences, unhandled promise rejections or missing await that breaks the result, race conditions, infinite loops, and clearly incorrect logic.${securityContext}

Severity rules — only CRITICAL or HIGH findings are wanted:
- CRITICAL: the code is certain to crash or produce wrong results on normal input.
- HIGH: a real bug triggered by a specific but realistic input or condition.
Do NOT emit MEDIUM, LOW, or INFO findings. If an issue is only MEDIUM or lower, omit it entirely.

A missing \`await\` IS a real bug: if a value comes from a call that clearly returns a Promise (a DB query, fetch, async helper) and is used or returned without await, flag it — you do not need to see the called function's body when the call pattern makes the Promise obvious.

Hard exclusions — never report these:
- Style, naming, formatting, magic numbers, var/let/const, missing semicolons, missing JSDoc/types, unused variables, loose-vs-strict equality, "could be cleaner" suggestions.
- Defensive nitpicks that are not actual bugs (e.g. "function could explicitly return false").
- Pure speculation about unseen code where there is no in-file signal of a bug.

Deduplicate: one finding per distinct bug.

Return JSON with a "findings" array. Each finding: line (integer or null), severity ("CRITICAL"|"HIGH"), confidence (0.0–1.0; only include findings you are at least 0.7 confident in), type (snake_case e.g. "off_by_one"), message (clear, specific explanation). Return {"findings":[]} if there are no real bugs.

Code to review:
\`\`\`
${code}
\`\`\``;

  try {
    const findings = await withTimeout(callAgent(prompt, 'correctness'), AGENT_TIMEOUT_MS);
    return { agent: 'correctness', findings };
  } catch (e) {
    console.warn('[agent:correctness] failed:', e instanceof Error ? e.message : e);
    return { agent: 'correctness', findings: [], degraded: true };
  }
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    safe: { type: 'boolean' },
    blockedOn: { type: 'number' },
    summary: { type: 'string' },
    rankedFindings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'number' },
          severity: { type: 'string' },
          confidence: { type: 'number' },
          type: { type: 'string' },
          message: { type: 'string' },
          agent: { type: 'string' },
        },
        required: ['severity', 'confidence', 'type', 'message', 'agent'],
      },
    },
    disagreements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line: { type: 'number' },
          type: { type: 'string' },
          agents: { type: 'array', items: { type: 'string' } },
          severities: { type: 'object' },
          coordinatorRuling: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['type', 'agents', 'severities', 'coordinatorRuling', 'reason'],
      },
    },
  },
  required: ['safe', 'blockedOn', 'summary', 'rankedFindings', 'disagreements'],
};

export async function runCoordinatorAgent(reports: AgentReport[]): Promise<Verdict> {
  const ai = getAI();
  const degradedAgents = reports.filter((r) => r.degraded).map((r) => r.agent);
  const degradedNote =
    degradedAgents.length > 0
      ? `\nNOTE: The following agents timed out and returned no findings: ${degradedAgents.join(', ')}. Note this gap in your summary.\n`
      : '';

  const prompt = `You are a senior code review coordinator. Specialist agents (security, correctness) reviewed the code and report only major (CRITICAL/HIGH) issues. Your job:
1. Deduplicate overlapping findings (same issue caught by multiple agents — keep the most severe representation)
2. Resolve severity conflicts: weight by confidence, lean conservative on security issues
3. Rank all findings worst-first (CRITICAL → HIGH → MEDIUM → LOW → INFO)
4. Surface disagreements: where agents flagged the same line/issue with conflicting severities
5. Produce a final verdict${degradedNote}

Agent reports:
${JSON.stringify(reports.map((r) => ({ agent: r.agent, findings: r.findings, degraded: r.degraded })), null, 2)}

Return JSON:
- safe: true only if zero CRITICAL or HIGH findings remain after deduplication
- blockedOn: count of CRITICAL + HIGH findings in rankedFindings
- summary: 1–2 sentence summary of code quality and key issues
- rankedFindings: deduplicated, ranked array — include agent field (which agent caught it; pick the one with highest severity if multiple)
- disagreements: array of cases where agents disagreed on severity for the same issue. Each entry: line, type, agents (array of who flagged it), severities (object keyed by agent name), coordinatorRuling, reason (your reasoning for the ruling)`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: VERDICT_SCHEMA,
    },
  });

  try {
    const parsed = JSON.parse(response.text ?? '{}') as Verdict;
    return {
      safe: parsed.safe ?? true,
      blockedOn: parsed.blockedOn ?? 0,
      summary: parsed.summary ?? '',
      rankedFindings: (parsed.rankedFindings ?? []) as RankedFinding[],
      disagreements: (parsed.disagreements ?? []) as Disagreement[],
    };
  } catch {
    const allFindings: RankedFinding[] = reports.flatMap((r) =>
      r.findings.map((f) => ({ ...f, agent: r.agent }))
    );
    const critical = allFindings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
    return {
      safe: critical.length === 0,
      blockedOn: critical.length,
      summary: 'Coordinator parsing failed — showing raw findings.',
      rankedFindings: allFindings,
      disagreements: [],
    };
  }
}

const PATCH_SCHEMA = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    fixedCode: { type: 'string' },
  },
  required: ['description', 'fixedCode'],
};

export async function runPatchAgent(code: string, verdict: Verdict): Promise<PatchOutput> {
  const ai = getAI();
  const topFindings = verdict.rankedFindings
    .filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH')
    .slice(0, 10);

  const prompt = `You are a code fix generator. Generate a corrected version of the code that addresses the identified issues.

Original code:
\`\`\`
${code}
\`\`\`

Issues to fix (priority order):
${JSON.stringify(topFindings, null, 2)}

Return JSON:
- description: 1–2 sentences describing what was fixed and why
- fixedCode: the complete corrected code, ready to replace the original

Rules:
- Fix ALL listed issues
- Keep the same language, style, and structure as the original
- Do NOT add features or refactor beyond what is needed to fix the listed issues
- If input was a diff, output the corrected versions of the changed sections`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: PATCH_SCHEMA,
    },
  });

  try {
    const parsed = JSON.parse(response.text ?? '{}') as PatchOutput;
    return {
      description: parsed.description ?? 'Automated fixes applied.',
      fixedCode: parsed.fixedCode ?? code,
    };
  } catch {
    return { description: 'Patch generation failed.', fixedCode: code };
  }
}

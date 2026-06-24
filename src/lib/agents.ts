import { readFileSync } from 'fs';
import { join } from 'path';
import { getAI, MODEL, modelForAgent } from './gemini';
import type { AgentName, AgentReport, Finding, Verdict, RankedFinding, Disagreement, PatchOutput, Sensitivity } from './types';

const AGENT_TIMEOUT_MS = 90_000;

// ── Load agent system prompts from agents/ at first use ───────────────────────
const _prompts: Record<string, string> = {};

function loadPrompt(name: string): string {
  if (!_prompts[name]) {
    _prompts[name] = readFileSync(join(process.cwd(), 'agents', `${name}.md`), 'utf-8');
  }
  return _prompts[name];
}

// ── Sensitivity helper ────────────────────────────────────────────────────────
function sensitivityDirective(sensitivity: Sensitivity): string {
  return sensitivity === 'high_and_above'
    ? 'SENSITIVITY: HIGH_AND_ABOVE\n'
    : 'SENSITIVITY: ALL\n';
}

// ── Shared JSON schema for security + bug finding outputs ─────────────────────
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

// ── Core agent caller ─────────────────────────────────────────────────────────

function isRateLimit(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('exhausted');
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface AgentCall {
  systemInstruction: string;
  userContent: string;
  agent?: AgentName;
  schema: object;
}

/**
 * Calls a specialist agent with bounded retry on Vertex 429 (RESOURCE_EXHAUSTED).
 * The scan fans out enough concurrent calls to trip per-minute quota, which would
 * otherwise silently degrade an agent to zero findings. Exponential backoff (with
 * jitter) lets the call succeed once the window frees up.
 */
async function callAgent({ systemInstruction, userContent, agent, schema }: AgentCall): Promise<Finding[]> {
  const ai = getAI();
  const model = agent ? modelForAgent(agent) : MODEL;
  const label = agent ?? 'agent';

  const MAX_ATTEMPTS = 4;
  let delay = 1500;
  let text: string | null | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        config: {
          systemInstruction: { parts: [{ text: systemInstruction }] },
          responseMimeType: 'application/json',
          responseSchema: schema,
          temperature: 0,
        },
      });
      text = response.text;
      break;
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

// ── Specialist agents ─────────────────────────────────────────────────────────

export async function runSecurityAgent(
  code: string,
  sensitivity: Sensitivity = 'high_and_above'
): Promise<AgentReport> {
  const userContent = `${sensitivityDirective(sensitivity)}\n${code}`;
  try {
    const findings = await withTimeout(
      callAgent({ systemInstruction: loadPrompt('security'), userContent, agent: 'security', schema: FINDING_SCHEMA }),
      AGENT_TIMEOUT_MS
    );
    return { agent: 'security', findings };
  } catch (e) {
    console.warn('[agent:security] failed:', e instanceof Error ? e.message : e);
    return { agent: 'security', findings: [], degraded: true };
  }
}

export async function runCorrectnessAgent(
  code: string,
  securityFindings: Finding[],
  sensitivity: Sensitivity = 'high_and_above'
): Promise<AgentReport> {
  const secContext =
    securityFindings.length > 0
      ? `\nSecurity agent already flagged these on the following lines — prioritize correctness issues on the same lines:\n${JSON.stringify(securityFindings, null, 2)}\n`
      : '';

  const userContent = `${sensitivityDirective(sensitivity)}${secContext}\n${code}`;
  try {
    const findings = await withTimeout(
      callAgent({ systemInstruction: loadPrompt('bugs'), userContent, agent: 'correctness', schema: FINDING_SCHEMA }),
      AGENT_TIMEOUT_MS
    );
    return { agent: 'correctness', findings };
  } catch (e) {
    console.warn('[agent:correctness] failed:', e instanceof Error ? e.message : e);
    return { agent: 'correctness', findings: [], degraded: true };
  }
}

// ── Coordinator ───────────────────────────────────────────────────────────────

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
- rankedFindings: deduplicated, ranked — include agent field (pick the one with highest severity if multiple caught it)
- disagreements: cases where agents disagreed on severity for the same issue`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: VERDICT_SCHEMA,
      temperature: 0,
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

// ── Patch agent ───────────────────────────────────────────────────────────────

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
- Do NOT add features or refactor beyond what is needed to fix the listed issues`;

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: PATCH_SCHEMA,
      temperature: 0,
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

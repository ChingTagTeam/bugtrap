import { getAI, MODEL, modelForAgent } from './gemini';
import type { AgentName, AgentReport, Finding, Verdict, RankedFinding, Disagreement, PatchOutput } from './types';

const AGENT_TIMEOUT_MS = 45_000;

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

async function callAgent(prompt: string, agent?: AgentName): Promise<Finding[]> {
  const ai = getAI();
  const model = agent ? modelForAgent(agent) : MODEL;
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: FINDING_SCHEMA,
    },
  });
  try {
    const parsed = JSON.parse(response.text ?? '{"findings":[]}') as { findings: Finding[] };
    return parsed.findings ?? [];
  } catch {
    return [];
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
  const prompt = `You are a security code reviewer. Analyze the code for vulnerabilities: SQL injection, XSS, CSRF, auth flaws, exposed secrets, unsafe calls, input validation issues, cryptography misuse, path traversal, command injection.

Return JSON with a "findings" array. Each finding: line (integer or null), severity ("CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFO"), confidence (0.0–1.0), type (snake_case e.g. "sql_injection"), message (clear explanation). Return {"findings":[]} if none.

Code to review:
\`\`\`
${code}
\`\`\``;

  try {
    const findings = await withTimeout(callAgent(prompt, 'security'), AGENT_TIMEOUT_MS);
    return { agent: 'security', findings };
  } catch {
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

  const prompt = `You are a code correctness reviewer. Analyze the code for bugs and logic errors: null/undefined handling, off-by-one errors, race conditions, incorrect assumptions, missing error handling, infinite loops, wrong algorithm behavior, type errors.${securityContext}

Return JSON with a "findings" array. Each finding: line (integer or null), severity ("CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFO"), confidence (0.0–1.0), type (snake_case e.g. "null_deref"), message (clear explanation). Return {"findings":[]} if none.

Code to review:
\`\`\`
${code}
\`\`\``;

  try {
    const findings = await withTimeout(callAgent(prompt, 'correctness'), AGENT_TIMEOUT_MS);
    return { agent: 'correctness', findings };
  } catch {
    return { agent: 'correctness', findings: [], degraded: true };
  }
}

export async function runReadabilityAgent(code: string): Promise<AgentReport> {
  const prompt = `You are a code readability reviewer. Analyze the code for readability issues: poor naming, magic numbers, overly complex functions, missing types, inconsistent style, unnecessary abstraction, poor structure, missing documentation for public APIs.

Return JSON with a "findings" array. Each finding: line (integer or null), severity ("HIGH"|"MEDIUM"|"LOW"|"INFO"), confidence (0.0–1.0), type (snake_case e.g. "poor_naming"), message (clear explanation). Return {"findings":[]} if none.

Code to review:
\`\`\`
${code}
\`\`\``;

  try {
    const findings = await withTimeout(callAgent(prompt, 'readability'), AGENT_TIMEOUT_MS);
    return { agent: 'readability', findings };
  } catch {
    return { agent: 'readability', findings: [], degraded: true };
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

  const prompt = `You are a senior code review coordinator. Three specialist agents reviewed the code. Your job:
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

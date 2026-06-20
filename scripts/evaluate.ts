/**
 * Evaluation script: compare base Gemini vs a tuned model on the validation set.
 * The rule: only swap in a tuned endpoint if it MEASURABLY WINS on the val set.
 *
 * Metrics:
 *   - Parse rate      : % of responses that are valid JSON with a "findings" array
 *   - Detection rate  : % of examples where model found at least one issue (when there is one)
 *   - Precision       : % of flagged finding types that match ground truth
 *   - False positive  : % of clean examples where model incorrectly flagged issues
 *
 * Usage:
 *   npx tsx scripts/evaluate.ts --agent security
 *   npx tsx scripts/evaluate.ts --agent security --endpoint projects/.../endpoints/123
 */

import { readFileSync } from 'fs';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const BASE_MODEL = process.env[`TUNED_MODEL_BASE`] ?? 'gemini-3.5-flash';

interface SFTFinding {
  line?: number | null;
  severity: string;
  confidence: number;
  type: string;
  message: string;
}

interface Example {
  contents: [
    { role: 'user'; parts: [{ text: string }] },
    { role: 'model'; parts: [{ text: string }] },
  ];
}

interface Metrics {
  parseRate: number;
  detectionRate: number;
  precision: number;
  falsePositiveRate: number;
  total: number;
}

function parseArgs(): { agent: string; endpoint?: string } {
  const args = process.argv;
  const agentIdx = args.indexOf('--agent');
  const endpointIdx = args.indexOf('--endpoint');
  const agent = agentIdx !== -1 ? args[agentIdx + 1] : 'security';
  const endpoint = endpointIdx !== -1 ? args[endpointIdx + 1] : undefined;
  return { agent, endpoint };
}

async function runModel(
  ai: GoogleGenAI,
  model: string,
  prompt: string
): Promise<SFTFinding[]> {
  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    const parsed = JSON.parse(response.text ?? '{}') as { findings?: SFTFinding[] };
    return parsed.findings ?? [];
  } catch {
    return [];
  }
}

function evaluate(
  predictions: SFTFinding[][],
  groundTruths: SFTFinding[][]
): Metrics {
  let parseOk = 0;
  let detected = 0;
  let positiveExamples = 0;
  let precisionTotal = 0;
  let precisionCount = 0;
  let falsePositives = 0;
  let negativeExamples = 0;

  for (let i = 0; i < predictions.length; i++) {
    const pred = predictions[i];
    const truth = groundTruths[i];
    const hasIssues = truth.length > 0;

    // Parse rate: did we get valid findings array?
    if (Array.isArray(pred)) parseOk++;

    if (hasIssues) {
      positiveExamples++;
      if (pred.length > 0) detected++;

      // Precision: what % of predicted types are in ground truth?
      if (pred.length > 0) {
        const truthTypes = new Set(truth.map((f) => f.type));
        const matched = pred.filter((p) => truthTypes.has(p.type)).length;
        precisionTotal += matched / pred.length;
        precisionCount++;
      }
    } else {
      negativeExamples++;
      if (pred.length > 0) falsePositives++;
    }
  }

  return {
    parseRate: parseOk / predictions.length,
    detectionRate: positiveExamples > 0 ? detected / positiveExamples : 1,
    precision: precisionCount > 0 ? precisionTotal / precisionCount : 1,
    falsePositiveRate: negativeExamples > 0 ? falsePositives / negativeExamples : 0,
    total: predictions.length,
  };
}

function printMetrics(label: string, m: Metrics) {
  const score = m.parseRate * 0.2 + m.detectionRate * 0.4 + m.precision * 0.3 + (1 - m.falsePositiveRate) * 0.1;
  console.log(`\n${label} (n=${m.total})`);
  console.log(`  Parse rate       : ${(m.parseRate * 100).toFixed(1)}%`);
  console.log(`  Detection rate   : ${(m.detectionRate * 100).toFixed(1)}%`);
  console.log(`  Precision        : ${(m.precision * 100).toFixed(1)}%`);
  console.log(`  False positive   : ${(m.falsePositiveRate * 100).toFixed(1)}%`);
  console.log(`  Composite score  : ${(score * 100).toFixed(1)}`);
  return score;
}

async function main() {
  const { agent, endpoint } = parseArgs();
  const valFile = `data/${agent}_val.jsonl`;

  let raw: string;
  try {
    raw = readFileSync(valFile, 'utf8');
  } catch {
    console.error(`Val file not found: ${valFile}`);
    console.error('Run the prepare scripts first.');
    process.exit(1);
  }

  const examples: Example[] = raw
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Example);

  const prompts = examples.map((e) => e.contents[0].parts[0].text);
  const groundTruths: SFTFinding[][] = examples.map((e) => {
    try {
      return (JSON.parse(e.contents[1].parts[0].text) as { findings: SFTFinding[] }).findings ?? [];
    } catch {
      return [];
    }
  });

  console.log(`Evaluating ${agent} agent on ${examples.length} val examples...`);
  console.log(`Base model : ${BASE_MODEL}`);
  if (endpoint) console.log(`Tuned model: ${endpoint}`);

  const ai = new GoogleGenAI({});

  // Evaluate base model
  const basePredictions = await Promise.all(
    prompts.map((p) => runModel(ai, BASE_MODEL, p))
  );
  const baseScore = printMetrics('Base Gemini', evaluate(basePredictions, groundTruths));

  if (!endpoint) {
    console.log('\nNo tuned endpoint specified. Provide --endpoint to compare.');
    return;
  }

  // Evaluate tuned model
  const tunedPredictions = await Promise.all(
    prompts.map((p) => runModel(ai, endpoint, p))
  );
  const tunedScore = printMetrics('Tuned model', evaluate(tunedPredictions, groundTruths));

  // Verdict
  console.log('\n── Verdict ─────────────────────────────────────────────────');
  if (tunedScore > baseScore + 0.02) {
    console.log(`✓ Tuned model wins (+${((tunedScore - baseScore) * 100).toFixed(1)} pts)`);
    console.log(`  Add to .env.local: TUNED_MODEL_${agent.toUpperCase()}=${endpoint}`);
  } else {
    console.log(`✗ Tuned model does NOT beat base Gemini — keep base for ${agent} agent.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

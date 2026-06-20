/**
 * Launch Vertex AI supervised fine-tuning jobs for all three reviewer agents.
 *
 * Prerequisites:
 *   1. Run upload-datasets.ts first
 *   2. Set GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GCS_TRAINING_BUCKET in .env.local
 *   3. gcloud auth application-default login
 *
 * Usage:
 *   npx tsx scripts/launch-sft.ts
 *   npx tsx scripts/launch-sft.ts --agent security   # launch one agent only
 *
 * After the jobs complete, set TUNED_MODEL_SECURITY / CORRECTNESS / READABILITY
 * in .env.local with the endpoint names printed below.
 * Run evaluate.ts first — only swap in a tuned model if it beats base Gemini.
 */

import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const BUCKET = process.env.GCS_TRAINING_BUCKET;
const BASE_MODEL = 'gemini-3.1-flash-lite';

if (!BUCKET) {
  console.error('Set GCS_TRAINING_BUCKET in .env.local');
  process.exit(1);
}

// Which agents to launch (override with --agent <name>)
const targetArg = process.argv.find((a) => a.startsWith('--agent'))?.split('=')[1]
  ?? process.argv[process.argv.indexOf('--agent') + 1];

const ALL_AGENTS = ['security', 'correctness', 'readability'] as const;
type Agent = (typeof ALL_AGENTS)[number];

const AGENTS: Agent[] = targetArg
  ? [targetArg as Agent]
  : [...ALL_AGENTS];

async function launchJob(agent: Agent) {
  const ai = new GoogleGenAI({});
  const trainUri = `gs://${BUCKET}/bugtrap-sft/${agent}_train.jsonl`;

  console.log(`\nLaunching SFT job for ${agent}...`);
  console.log(`  base model : ${BASE_MODEL}`);
  console.log(`  train data : ${trainUri}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = await (ai as any).tunings.tune({
    baseModel: BASE_MODEL,
    trainingDataset: { gcsUri: trainUri },
    config: {
      tunedModelDisplayName: `bugtrap-${agent}-reviewer`,
    },
  });

  console.log(`  Job name   : ${job.name}`);
  console.log(`  State      : ${job.state}`);
  console.log('\nJob is running async on Vertex AI. Check status:');
  console.log(`  npx tsx scripts/launch-sft.ts --status ${job.name}`);

  return job;
}

async function checkStatus(jobName: string) {
  const ai = new GoogleGenAI({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const job = await (ai as any).tunings.get({ name: jobName });
  console.log(`Status: ${job.state}`);

  if (job.state === 'JOB_STATE_SUCCEEDED') {
    console.log(`\nTuned model endpoint: ${job.tunedModel?.endpoint}`);
    console.log('Add this to .env.local, then run evaluate.ts before swapping in.');
  } else if (job.state === 'JOB_STATE_FAILED') {
    console.error(`Job failed: ${job.error?.message}`);
  }
}

async function main() {
  const statusArg = process.argv.find((a) => a === '--status');
  if (statusArg) {
    const jobName = process.argv[process.argv.indexOf('--status') + 1];
    await checkStatus(jobName);
    return;
  }

  const jobs = [];
  for (const agent of AGENTS) {
    const job = await launchJob(agent);
    jobs.push({ agent, jobName: job.name });
  }

  console.log('\n── Job names (save these) ───────────────────────────────────');
  jobs.forEach(({ agent, jobName }) => console.log(`  ${agent}: ${jobName}`));
  console.log('\nWhen each job completes, check its endpoint:');
  console.log('  npx tsx scripts/launch-sft.ts --status <job-name>');
  console.log('\nThen evaluate before swapping:');
  console.log('  npx tsx scripts/evaluate.ts --agent security --endpoint <endpoint>');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

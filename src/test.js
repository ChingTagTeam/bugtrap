console.log("test.js started");
import { scanForSecrets } from './secretDetector.js';
import { generateFixes }  from './fixAgent.js';
import { applyFixes }     from './applyFixes.js';

// ── Sample file with two planted secrets ──────────────────────────────────────
// Single-line assignments → expect fix_type "auto" for both.
// The AWS key matches the AKIA prefix pattern (CRITICAL).
// The Stripe live key matches the sk_live_ pattern (HIGH).
const SAMPLE_PATH = 'src/config/payments.js';
const SAMPLE_CODE = `
import Stripe from 'stripe';
import { DynamoDB } from 'aws-sdk';

const stripe = new Stripe("sk_live_51H8xFakeLookingButRealFormatKey00");

const dynamo = new DynamoDB({
  region: 'us-east-1',
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
});

export { stripe, dynamo };
`.trim();

// ── Step 1: Secret Detector ───────────────────────────────────────────────────
console.log('\n━━━ Step 1: Secret Detector ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const detectorResult = await scanForSecrets(SAMPLE_PATH, SAMPLE_CODE);
console.log(JSON.stringify(detectorResult, null, 2));

// ── Step 2: Fix Agent ─────────────────────────────────────────────────────────
console.log('\n━━━ Step 2: Fix Agent ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const fixResult = await generateFixes(SAMPLE_PATH, SAMPLE_CODE, detectorResult.findings);
console.log(JSON.stringify(fixResult, null, 2));

// ── Step 3: Apply (dry-run — no files written) ────────────────────────────────
console.log('\n━━━ Step 3: Apply Fixes (dry-run) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
await applyFixes(fixResult, { apply: false });

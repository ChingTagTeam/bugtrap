/**
 * Upload JSONL dataset files to Cloud Storage for Vertex AI SFT.
 *
 * Prerequisites:
 *   1. Run prepare-*.ts scripts to generate data/*.jsonl files
 *   2. Set GOOGLE_CLOUD_PROJECT and GCS_TRAINING_BUCKET in .env.local
 *   3. gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Usage:
 *   npx tsx scripts/upload-datasets.ts
 */

import { Storage } from '@google-cloud/storage';
import { existsSync } from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const BUCKET = process.env.GCS_TRAINING_BUCKET;

if (!PROJECT || !BUCKET) {
  console.error('Set GOOGLE_CLOUD_PROJECT and GCS_TRAINING_BUCKET in .env.local');
  process.exit(1);
}

const storage = new Storage({ projectId: PROJECT });

const FILES = [
  'data/security_train.jsonl',
  'data/security_val.jsonl',
  'data/correctness_train.jsonl',
  'data/correctness_val.jsonl',
  'data/readability_train.jsonl',
  'data/readability_val.jsonl',
];

async function upload() {
  const bucket = storage.bucket(BUCKET!);

  // Create bucket if it doesn't exist (us-central1 for Vertex SFT)
  const [exists] = await bucket.exists();
  if (!exists) {
    await storage.createBucket(BUCKET!, { location: 'us-central1' });
    console.log(`Created bucket: gs://${BUCKET}`);
  }

  for (const file of FILES) {
    if (!existsSync(file)) {
      console.warn(`SKIP: ${file} not found — run prepare scripts first`);
      continue;
    }
    const dest = `bugtrap-sft/${file.split('/').pop()}`;
    await bucket.upload(file, { destination: dest });
    console.log(`Uploaded ${file} → gs://${BUCKET}/${dest}`);
  }

  console.log('\nAll datasets uploaded. GCS URIs for SFT jobs:');
  FILES.forEach((f) => {
    const name = f.split('/').pop();
    console.log(`  gs://${BUCKET}/bugtrap-sft/${name}`);
  });
}

upload().catch((err) => {
  console.error(err);
  process.exit(1);
});

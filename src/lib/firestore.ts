import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { AgentReport, Verdict } from './types';

function getDb() {
  if (!getApps().length) {
    initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT,
    });
  }
  return getFirestore();
}

export async function saveReview(
  code: string,
  reports: AgentReport[],
  verdict: Verdict
): Promise<string> {
  const db = getDb();
  const ref = await db.collection('reviews').add({
    code,
    reports,
    verdict,
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

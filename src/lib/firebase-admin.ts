import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * Single Firebase Admin app for all server-side code (Firestore + Auth).
 * Consolidates the init that previously lived inline in firestore.ts.
 *
 * Credentials are passed explicitly via cert() from env vars (service-account
 * client_email + private_key) rather than discovered from ADC, so Firestore
 * writes authenticate on Vercel, which has no gcloud / ADC file. When those
 * vars are absent we fall back to projectId-only init (ADC) — enough for
 * verifyIdToken, which validates against Google's public signing keys.
 */
let _app: App | null = null;

// Vercel stores multi-line keys with literal "\n" — normalize to real newlines.
function privateKey(): string {
  return (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
}

function getApp(): App {
  if (_app) return _app;
  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0];
    return _app;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const key = privateKey();
  _app =
    clientEmail && key
      ? initializeApp({ credential: cert({ projectId, clientEmail, privateKey: key }) })
      : initializeApp({ projectId });
  return _app;
}

export function getDb(): Firestore {
  return getFirestore(getApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getApp());
}

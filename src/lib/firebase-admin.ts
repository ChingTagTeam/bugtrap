import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * Single Firebase Admin app for all server-side code (Firestore + Auth).
 * Consolidates the init that previously lived inline in firestore.ts.
 *
 * We initialize with only the projectId and let the Admin SDK discover
 * Application Default Credentials (the same behavior the existing review
 * flow relies on). verifyIdToken works with just the projectId because it
 * validates against Google's public signing keys; Firestore writes use ADC.
 */
let _app: App | null = null;

function getApp(): App {
  if (_app) return _app;
  const existing = getApps();
  if (existing.length > 0) {
    _app = existing[0];
    return _app;
  }
  _app = initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT,
  });
  return _app;
}

export function getDb(): Firestore {
  return getFirestore(getApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getApp());
}

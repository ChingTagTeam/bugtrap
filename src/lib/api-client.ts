import { getFirebaseAuth } from './firebase.client';

/**
 * fetch wrapper that attaches the current user's Firebase ID token as a
 * Bearer credential. Server route handlers verify it via requireUid().
 * Throws if no user is signed in.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('You need to be signed in.');
  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/**
 * Public-repo scans need no credentials, so they hit the endpoint with a plain
 * fetch; the signed-in flow attaches the Firebase ID token via authFetch.
 */
export function scanFetch(publicMode: boolean, input: string, init: RequestInit = {}): Promise<Response> {
  return publicMode ? fetch(input, init) : authFetch(input, init);
}

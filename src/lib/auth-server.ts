import { getAdminAuth } from './firebase-admin';

/** Thrown when a request is missing or carries an invalid Firebase ID token. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Verifies the `Authorization: Bearer <idToken>` header and returns the uid.
 * Throws AuthError (→ map to 401) when absent or invalid.
 */
export async function requireUid(req: Request): Promise<string> {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new AuthError('Missing Authorization bearer token');
  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    throw new AuthError('Invalid or expired ID token');
  }
}

/**
 * Like requireUid, but returns null instead of throwing when there is no
 * (valid) token. Used by endpoints that also serve an unauthenticated
 * public-repo path.
 */
export async function optionalUid(req: Request): Promise<string | null> {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

/** Builds a JSON Response, using 401 for AuthError and 500 otherwise. */
export function errorResponse(err: unknown): Response {
  const status = err instanceof AuthError ? 401 : 500;
  const message = err instanceof Error ? err.message : 'Unexpected error';
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

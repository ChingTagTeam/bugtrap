'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GithubAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase.client';
import { authFetch } from '@/lib/api-client';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  /** GitHub login captured on connect (null for returning sessions). */
  githubLogin: string | null;
  /** Set when sign-in or the GitHub token handshake fails. */
  error: string | null;
  /** Resolves to the signed-in user, or null if it failed. */
  signInWithGitHub: () => Promise<User | null>;
  /**
   * Re-runs the GitHub OAuth popup to capture a fresh access token and
   * re-store it server-side. Used to recover when the stored token is
   * missing or stale (the repos call returns 400/401). Resolves to true
   * when a fresh token was stored.
   */
  reconnectGitHub: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [githubLogin, setGithubLogin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (next) => {
      setUser(next);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Sends the captured GitHub OAuth token to the server, which validates and
  // stores it at users/{uid}.githubToken. Returns true on success; sets a
  // user-facing error otherwise. The token never persists client-side.
  const storeToken = useCallback(async (githubToken: string | undefined): Promise<boolean> => {
    if (!githubToken) {
      setError('GitHub did not return an access token. Try signing in again.');
      return false;
    }
    try {
      const res = await authFetch('/api/github/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubToken }),
      });
      if (res.ok) {
        const data: { login?: string } = await res.json();
        setGithubLogin(data.login ?? null);
        return true;
      }
    } catch {
      // fall through to the shared error below
    }
    setError('Signed in, but connecting your GitHub repos failed. Try again.');
    return false;
  }, []);

  const signInWithGitHub = useCallback(async (): Promise<User | null> => {
    setError(null);
    const provider = new GithubAuthProvider();
    provider.addScope('repo');
    provider.addScope('read:user');
    // admin:repo_hook lets the companion feature create push webhooks. The plain
    // `repo` scope does NOT grant hook management for an OAuth-app token, so
    // without this createWebhook fails even for repos the user admins.
    provider.addScope('admin:repo_hook');
    // Force GitHub's authorize screen so the popup returns a fresh access
    // token every time — without this, an already-signed-in Firebase session
    // is restored with no GitHub credential and nothing can be stored.
    provider.setCustomParameters({ prompt: 'consent' });
    try {
      const result = await signInWithPopup(getFirebaseAuth(), provider);
      const credential = GithubAuthProvider.credentialFromResult(result);
      await storeToken(credential?.accessToken);
      return result.user;
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return null; // user dismissed the popup — not an error worth showing
      }
      // Surface the real reason; the most common one on a fresh project is the
      // GitHub provider not being enabled in the Firebase console.
      console.error('GitHub sign-in failed:', err);
      if (code === 'auth/configuration-not-found' || code === 'auth/operation-not-allowed') {
        setError(
          'GitHub sign-in isn’t enabled for this Firebase project yet. In the Firebase console: Authentication → Sign-in method → enable GitHub.'
        );
      } else if (code === 'auth/popup-blocked') {
        setError('Your browser blocked the sign-in popup. Allow popups for this site and try again.');
      } else if (code === 'auth/unauthorized-domain') {
        setError('This domain isn’t authorized for sign-in. Add it under Authentication → Settings → Authorized domains.');
      } else {
        setError(`GitHub sign-in failed${code ? ` (${code})` : ''}. Please try again.`);
      }
      return null;
    }
  }, [storeToken]);

  const reconnectGitHub = useCallback(async (): Promise<boolean> => {
    setError(null);
    const provider = new GithubAuthProvider();
    provider.addScope('repo');
    provider.addScope('read:user');
    provider.addScope('admin:repo_hook');
    provider.setCustomParameters({ prompt: 'consent' });
    try {
      const result = await signInWithPopup(getFirebaseAuth(), provider);
      const credential = GithubAuthProvider.credentialFromResult(result);
      return await storeToken(credential?.accessToken);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return false; // user dismissed — leave the existing error state alone
      }
      console.error('GitHub reconnect failed:', err);
      setError(`Reconnecting GitHub failed${code ? ` (${code})` : ''}. Please try again.`);
      return false;
    }
  }, [storeToken]);

  const signOutUser = useCallback(async (): Promise<void> => {
    await signOut(getFirebaseAuth());
    setGithubLogin(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, githubLogin, error, signInWithGitHub, reconnectGitHub, signOutUser }),
    [user, loading, githubLogin, error, signInWithGitHub, reconnectGitHub, signOutUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

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

  const signInWithGitHub = useCallback(async (): Promise<User | null> => {
    setError(null);
    const provider = new GithubAuthProvider();
    provider.addScope('repo');
    provider.addScope('read:user');
    try {
      const result = await signInWithPopup(getFirebaseAuth(), provider);
      const credential = GithubAuthProvider.credentialFromResult(result);
      const githubToken = credential?.accessToken;

      // Register the GitHub OAuth token server-side. It is never stored
      // client-side beyond this call.
      if (githubToken) {
        try {
          const res = await authFetch('/api/github/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ githubToken }),
          });
          if (res.ok) {
            const data: { login?: string } = await res.json();
            setGithubLogin(data.login ?? null);
          } else {
            setError('Signed in, but connecting your GitHub repos failed. Try again.');
          }
        } catch {
          setError('Signed in, but connecting your GitHub repos failed. Try again.');
        }
      } else {
        setError('GitHub did not return an access token. Try signing in again.');
      }
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
  }, []);

  const signOutUser = useCallback(async (): Promise<void> => {
    await signOut(getFirebaseAuth());
    setGithubLogin(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, githubLogin, error, signInWithGitHub, signOutUser }),
    [user, loading, githubLogin, error, signInWithGitHub, signOutUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

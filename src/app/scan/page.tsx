'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, LogOut, Loader2, Inbox, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { authFetch } from '@/lib/api-client';
import { parseRepoUrl } from '@/lib/repo-url';
import { rollingReviewId } from '@/lib/review-id';
import RepoCard from '@/components/scan/RepoCard';
import GithubMark from '@/components/icons/GithubMark';
import type { RepoSummary } from '@/lib/scan-types';

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

type Status = 'loading' | 'ready' | 'error';
type Visibility = 'all' | 'public' | 'private';

export default function ScanPage() {
  const { user, loading: authLoading, signInWithGitHub, reconnectGitHub, signOutUser, error: authError } = useAuth();
  const router = useRouter();

  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  // True when the repos call failed because GitHub isn't connected (400/401) —
  // distinct from a transient failure, so we offer reconnect rather than retry.
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('all');
  const [lang, setLang] = useState('all');
  const [reloadKey, setReloadKey] = useState(0);
  const [signingIn, setSigningIn] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/github/repos');
        if (!res.ok) {
          const body: { error?: string } = await res.json().catch(() => ({}));
          if (!cancelled) {
            // 400 "not connected" or 401 "expired token" → the stored GitHub
            // token is missing/stale; offer a reconnect instead of a bare retry.
            setNeedsReconnect(res.status === 400 || res.status === 401);
            setError(body.error ?? `Failed to load repositories (${res.status})`);
            setStatus('error');
          }
          return;
        }
        const data: { repos: RepoSummary[] } = await res.json();
        if (!cancelled) {
          setRepos(data.repos);
          setNeedsReconnect(false);
          setStatus('ready');
        }
      } catch (e) {
        if (!cancelled) {
          setNeedsReconnect(false);
          setError(e instanceof Error ? e.message : 'Failed to load repositories');
          setStatus('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, reloadKey]);

  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const r of repos) if (r.language) set.add(r.language);
    return Array.from(set).sort();
  }, [repos]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repos.filter((r) => {
      if (visibility === 'public' && r.private) return false;
      if (visibility === 'private' && !r.private) return false;
      if (lang !== 'all' && r.language !== lang) return false;
      if (q && !r.fullName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [repos, search, visibility, lang]);

  function goToReview(owner: string, repo: string, branch: string, isPublic: boolean): void {
    // Signed-in own-repo scans use the deterministic rolling-review id so this
    // scan, future re-scans, and push-triggered rescans all share one document —
    // and register a webhook so pushes flow into it. Public scans stay one-shot.
    const watched = !isPublic && !!user;
    const reviewId = watched ? rollingReviewId(user.uid, owner, repo, branch) : crypto.randomUUID();

    sessionStorage.setItem(
      `bugtrap:scan:${reviewId}`,
      JSON.stringify({ owner, repo, branch, public: isPublic })
    );

    if (watched) {
      // Fire-and-forget: registering the webhook must not block the scan, and a
      // 403 (no admin/push access) just means pushes won't auto-rescan — the
      // one-shot scan still works. Idempotent server-side (skips if registered).
      void authFetch('/api/github/webhook/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, branch }),
      }).catch(() => undefined);
    }

    router.push(`/review/${reviewId}`);
  }

  function startPublicScan(): void {
    const parsed = parseRepoUrl(publicUrl);
    if (!parsed) {
      setUrlError('Enter a repo like github.com/owner/repo');
      return;
    }
    setUrlError(null);
    goToReview(parsed.owner, parsed.repo, parsed.branch ?? '', true);
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: 'var(--bg)' }}>
      <Ambient />
      <Header user={user} onSignOut={() => void signOutUser()} />

      <main style={{ position: 'relative', zIndex: 2, maxWidth: 1000, margin: '0 auto', padding: '40px 24px 80px' }}>
        {authLoading ? (
          <CenterState>
            <Loader2 size={26} className="bt-spin" />
            <span>Loading your account…</span>
          </CenterState>
        ) : (
          <>
            <PublicScanSection
              url={publicUrl}
              setUrl={setPublicUrl}
              error={urlError}
              onScan={startPublicScan}
            />

            {user ? (
              <>
                <Divider label="Or pick from your repositories" />
                <Toolbar
                  search={search}
                  setSearch={setSearch}
                  visibility={visibility}
                  setVisibility={setVisibility}
                  lang={lang}
                  setLang={setLang}
                  languages={languages}
                  count={filtered.length}
                  total={repos.length}
                  status={status}
                />

                {status === 'loading' && <SkeletonGrid />}

                {status === 'error' && (
                  <CenterState>
                    <AlertTriangle size={26} color="var(--sec)" />
                    <span style={{ color: 'var(--tx2)' }}>
                      {needsReconnect
                        ? 'Your GitHub connection needs refreshing. Reconnect to load your repositories.'
                        : error}
                    </span>
                    {needsReconnect ? (
                      <ReconnectButton
                        onClick={async () => {
                          const ok = await reconnectGitHub();
                          if (ok) {
                            setStatus('loading');
                            setError(null);
                            setNeedsReconnect(false);
                            setReloadKey((k) => k + 1);
                          }
                        }}
                      />
                    ) : (
                      <RetryButton
                        onClick={() => {
                          setStatus('loading');
                          setError(null);
                          setReloadKey((k) => k + 1);
                        }}
                      />
                    )}
                  </CenterState>
                )}

                {status === 'ready' && filtered.length === 0 && (
                  <CenterState>
                    <Inbox size={26} color="var(--tx3)" />
                    <span style={{ color: 'var(--tx2)' }}>
                      {repos.length === 0
                        ? 'No repositories found on your GitHub account.'
                        : 'No repositories match your filters.'}
                    </span>
                  </CenterState>
                )}

                {status === 'ready' && filtered.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
                    {filtered.map((repo) => (
                      <RepoCard
                        key={repo.id}
                        repo={repo}
                        onSelect={() => goToReview(repo.owner, repo.name, repo.defaultBranch, false)}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <ConnectPrompt
                busy={signingIn}
                error={authError}
                onSignIn={async () => {
                  setSigningIn(true);
                  await signInWithGitHub();
                  setSigningIn(false);
                }}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ── pieces ────────────────────────────────────────────────────────── */

function PublicScanSection({
  url,
  setUrl,
  error,
  onScan,
}: {
  url: string;
  setUrl: (v: string) => void;
  error: string | null;
  onScan: () => void;
}) {
  return (
    <section style={{ marginBottom: 8 }}>
      <div
        style={{
          fontFamily: mono,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '.18em',
          color: 'var(--lime)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--lime)', boxShadow: '0 0 8px var(--lime)', animation: 'bt-glow 2s infinite' }} />
        SCAN ANY PUBLIC REPO
      </div>
      <h1 style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-.03em', margin: '0 0 10px', lineHeight: 1.05 }}>
        Drop in a public repo.
      </h1>
      <p style={{ fontSize: 17, color: 'var(--tx2)', lineHeight: 1.55, margin: '0 0 22px', maxWidth: 560 }}>
        Paste a GitHub URL and watch Sidecode assemble a living map of what&apos;s safe to merge — no sign-in
        required.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <div style={{ position: 'relative', flex: '1 1 360px', minWidth: 240 }}>
          <GithubGlyph />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onScan();
            }}
            placeholder="github.com/owner/repo"
            aria-label="Public GitHub repository URL"
            spellCheck={false}
            style={{
              width: '100%',
              height: 50,
              padding: '0 14px 0 42px',
              borderRadius: 11,
              background: 'var(--surf)',
              border: '1px solid var(--line2)',
              color: 'var(--tx)',
              fontSize: 15,
              fontFamily: mono,
              outline: 'none',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--lime)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line2)')}
          />
        </div>
        <button
          onClick={onScan}
          disabled={!url.trim()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 9,
            height: 50,
            padding: '0 24px',
            borderRadius: 11,
            background: url.trim() ? 'var(--lime)' : 'rgba(255,255,255,.06)',
            color: url.trim() ? '#0e1626' : 'var(--tx3)',
            border: 'none',
            fontSize: 15,
            fontWeight: 700,
            cursor: url.trim() ? 'pointer' : 'not-allowed',
            boxShadow: url.trim() ? '0 6px 26px rgba(92,138,240,.3)' : 'none',
            flex: 'none',
          }}
        >
          Scan repo
          <ArrowRight size={16} strokeWidth={2.4} />
        </button>
      </div>

      {error ? (
        <div role="alert" style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, color: '#f58b94', fontSize: 13, fontFamily: mono }}>
          <AlertTriangle size={14} /> {error}
        </div>
      ) : (
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--tx3)', fontFamily: mono }}>
          Try <CodeHint onPick={setUrl}>github.com/pallets/flask</CodeHint> or{' '}
          <CodeHint onPick={setUrl}>github.com/expressjs/express</CodeHint>
        </div>
      )}
    </section>
  );
}

function CodeHint({ children, onPick }: { children: string; onPick: (v: string) => void }) {
  return (
    <button
      onClick={() => onPick(children)}
      style={{
        background: 'rgba(255,255,255,.05)',
        border: '1px solid var(--line)',
        borderRadius: 6,
        padding: '2px 7px',
        color: 'var(--tx2)',
        fontFamily: mono,
        fontSize: 12,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function GithubGlyph() {
  return (
    <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)', display: 'inline-flex' }}>
      <GithubMark size={18} />
    </span>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '38px 0 22px' }}>
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: '.14em', color: 'var(--tx3)', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  );
}

function ConnectPrompt({ busy, error, onSignIn }: { busy: boolean; error: string | null; onSignIn: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        padding: '32px 20px 10px',
        textAlign: 'center',
      }}
    >
      <p style={{ color: 'var(--tx2)', fontSize: 15, maxWidth: 440, margin: 0, lineHeight: 1.55 }}>
        Want to scan your own private repos? Connect GitHub — your token stays server-side.
      </p>
      <button
        onClick={onSignIn}
        disabled={busy}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          background: 'rgba(255,255,255,.04)',
          color: 'var(--tx)',
          border: '1px solid var(--line2)',
          borderRadius: 11,
          padding: '12px 22px',
          fontSize: 14.5,
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
        }}
      >
        <GithubMark size={17} />
        {busy ? 'Connecting…' : 'Sign in with GitHub'}
      </button>
      {error && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 9,
            maxWidth: 460,
            padding: '11px 14px',
            borderRadius: 10,
            background: 'rgba(242,109,120,.08)',
            border: '1px solid rgba(242,109,120,.3)',
            color: '#f58b94',
            fontSize: 13,
            lineHeight: 1.5,
            textAlign: 'left',
          }}
        >
          <AlertTriangle size={15} style={{ flex: 'none', marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function Ambient() {
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background:
          'radial-gradient(900px 600px at 82% 0%,rgba(92,138,240,.10),transparent 60%),radial-gradient(700px 500px at 6% 92%,rgba(232,163,61,.05),transparent 60%)',
      }}
    />
  );
}

function Header({ user, onSignOut }: { user: ReturnType<typeof useAuth>['user']; onSignOut: () => void }) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 24px',
        background: 'rgba(30,30,30,.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--tx)' }}>
        <Image
          src="/Sidecode-logo.png"
          alt="Sidecode"
          width={26}
          height={26}
          priority
          style={{ width: 26, height: 26, objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(92,138,240,.45))' }}
        />
        <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-.02em' }}>Sidecode</span>
      </Link>
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {user.photoURL ? (
            <Image
              src={user.photoURL}
              alt={user.displayName ?? 'You'}
              width={26}
              height={26}
              style={{ width: 26, height: 26, borderRadius: 999, border: '1px solid var(--line2)' }}
            />
          ) : null}
          <span className="bt-nav-name" style={{ fontSize: 13, color: 'var(--tx2)', fontWeight: 600 }}>
            {user.displayName ?? user.email ?? 'GitHub user'}
          </span>
          <button
            onClick={onSignOut}
            aria-label="Sign out"
            title="Sign out"
            style={{
              display: 'inline-flex',
              width: 30,
              height: 30,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              background: 'transparent',
              border: '1px solid var(--line2)',
              color: 'var(--tx3)',
              cursor: 'pointer',
            }}
          >
            <LogOut size={15} />
          </button>
        </div>
      )}
    </header>
  );
}

function Toolbar({
  search,
  setSearch,
  visibility,
  setVisibility,
  lang,
  setLang,
  languages,
  count,
  total,
  status,
}: {
  search: string;
  setSearch: (v: string) => void;
  visibility: Visibility;
  setVisibility: (v: Visibility) => void;
  lang: string;
  setLang: (v: string) => void;
  languages: string[];
  count: number;
  total: number;
  status: Status;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 22 }}>
      <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
        <Search size={16} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--tx3)' }} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repositories…"
          aria-label="Search repositories"
          style={{
            width: '100%',
            padding: '11px 14px 11px 38px',
            borderRadius: 10,
            background: 'var(--surf)',
            border: '1px solid var(--line2)',
            color: 'var(--tx)',
            fontSize: 14,
            outline: 'none',
            fontFamily: 'inherit',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--lime)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--line2)')}
        />
      </div>

      <div style={{ display: 'flex', background: 'var(--surf)', border: '1px solid var(--line2)', borderRadius: 10, padding: 3 }}>
        {(['all', 'public', 'private'] as Visibility[]).map((v) => (
          <button
            key={v}
            onClick={() => setVisibility(v)}
            aria-pressed={visibility === v}
            style={{
              padding: '7px 13px',
              borderRadius: 7,
              border: 'none',
              background: visibility === v ? 'rgba(92,138,240,.16)' : 'transparent',
              color: visibility === v ? 'var(--lime)' : 'var(--tx2)',
              fontFamily: mono,
              fontSize: 11.5,
              letterSpacing: '.04em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            {v}
          </button>
        ))}
      </div>

      {languages.length > 0 && (
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          aria-label="Filter by language"
          className="bt-scroll"
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            background: 'var(--surf)',
            border: '1px solid var(--line2)',
            color: 'var(--tx)',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <option value="all">All languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      )}

      <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 12, color: 'var(--tx3)' }}>
        {status === 'ready' ? `${count} of ${total}` : ''}
      </span>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 96,
            borderRadius: 14,
            border: '1px solid var(--line)',
            background: 'linear-gradient(100deg, var(--surf) 30%, rgba(255,255,255,.04) 50%, var(--surf) 70%)',
            backgroundSize: '220% 100%',
            animation: 'bt-count-tick 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
    </div>
  );
}

function CenterState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        padding: '70px 20px',
        textAlign: 'center',
        fontFamily: mono,
        fontSize: 13.5,
        color: 'var(--tx2)',
      }}
    >
      {children}
    </div>
  );
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '9px 16px',
        borderRadius: 10,
        background: 'rgba(255,255,255,.04)',
        border: '1px solid var(--line2)',
        color: 'var(--tx)',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <RefreshCw size={14} /> Try again
    </button>
  );
}

function ReconnectButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        padding: '10px 18px',
        borderRadius: 10,
        background: 'rgba(92,138,240,.14)',
        border: '1px solid rgba(92,138,240,.4)',
        color: 'var(--lime)',
        fontSize: 13.5,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <GithubMark size={15} /> Reconnect GitHub
    </button>
  );
}

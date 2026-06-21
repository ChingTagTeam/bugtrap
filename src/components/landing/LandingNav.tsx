'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LogOut, ArrowRight, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import GithubMark from '@/components/icons/GithubMark';

const mono = "var(--font-jetbrains-mono), 'JetBrains Mono', monospace";

export default function LandingNav() {
  const { user, loading, githubLogin, signInWithGitHub, signOutUser, error } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function handleSignIn(): Promise<void> {
    setBusy(true);
    await signInWithGitHub();
    setBusy(false);
  }

  const name = user?.displayName ?? githubLogin ?? user?.email ?? 'GitHub user';

  return (
    <nav
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 60,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: scrolled ? 'rgba(29,29,32,.72)' : 'transparent',
        backdropFilter: scrolled ? 'blur(14px) saturate(140%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(14px) saturate(140%)' : 'none',
        borderBottom: `1px solid ${scrolled ? 'var(--line)' : 'transparent'}`,
        transition: 'background .3s ease, border-color .3s ease, backdrop-filter .3s ease',
      }}
    >
      {/* Brand */}
      <Link
        href="/"
        style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--tx)' }}
      >
        <Image
          src="/BugTrap-logo.png"
          alt="BugTrap"
          width={28}
          height={28}
          priority
          style={{ width: 28, height: 28, objectFit: 'contain', filter: 'drop-shadow(0 0 10px rgba(131,200,24,.45))' }}
        />
        <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-.02em' }}>BugTrap</span>
      </Link>

      {/* Center links (hidden on small screens) */}
      <div className="bt-nav-links" style={{ alignItems: 'center', gap: 26 }}>
        <NavLink href="#how">How it works</NavLink>
        <NavLink href="#features">Features</NavLink>
      </div>

      {/* Auth control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {loading ? (
          <span
            aria-hidden
            style={{
              width: 132,
              height: 36,
              borderRadius: 10,
              background: 'rgba(255,255,255,.05)',
              border: '1px solid var(--line)',
            }}
          />
        ) : user ? (
          <>
            <button
              onClick={() => router.push('/scan')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: 'var(--lime)',
                color: '#15150f',
                border: 'none',
                borderRadius: 10,
                padding: '8px 15px',
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(131,200,24,.28)',
              }}
            >
              Scan repos
              <ArrowRight size={15} strokeWidth={2.4} />
            </button>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '5px 6px 5px 8px',
                borderRadius: 999,
                background: 'rgba(255,255,255,.04)',
                border: '1px solid var(--line2)',
              }}
            >
              <span className="bt-nav-name" style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx2)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </span>
              <Avatar src={user.photoURL} name={name} />
              <button
                onClick={() => void signOutUser()}
                aria-label="Sign out"
                title="Sign out"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--tx3)',
                  cursor: 'pointer',
                }}
              >
                <LogOut size={15} strokeWidth={2} />
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => void handleSignIn()}
            disabled={busy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              background: 'rgba(255,255,255,.04)',
              border: '1px solid var(--line2)',
              color: 'var(--tx)',
              borderRadius: 10,
              padding: '9px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.7 : 1,
              transition: 'background .2s, border-color .2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,.08)';
              e.currentTarget.style.borderColor = 'rgba(131,200,24,.45)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,.04)';
              e.currentTarget.style.borderColor = 'var(--line2)';
            }}
          >
            <GithubMark size={16} />
            {busy ? 'Connecting…' : 'Sign in with GitHub'}
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            top: 66,
            right: 24,
            maxWidth: 380,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '10px 13px',
            borderRadius: 10,
            background: 'rgba(40,22,24,.96)',
            border: '1px solid rgba(255,93,108,.4)',
            color: '#ff8a95',
            fontSize: 12.5,
            lineHeight: 1.45,
            boxShadow: '0 14px 34px -14px rgba(0,0,0,.7)',
          }}
        >
          <AlertTriangle size={14} style={{ flex: 'none', marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        fontSize: 14,
        fontWeight: 500,
        color: 'var(--tx2)',
        textDecoration: 'none',
        transition: 'color .2s',
      }}
      onMouseOver={(e) => (e.currentTarget.style.color = 'var(--tx)')}
      onMouseOut={(e) => (e.currentTarget.style.color = 'var(--tx2)')}
    >
      {children}
    </a>
  );
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={28}
        height={28}
        style={{ width: 28, height: 28, borderRadius: 999, objectFit: 'cover', border: '1px solid var(--line2)' }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(131,200,24,.16)',
        color: 'var(--lime)',
        fontFamily: mono,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

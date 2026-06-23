'use client';

import { useRouter } from 'next/navigation';

/**
 * The hero's primary CTA. Routes everyone to the repo picker at /scan, which
 * offers public-repo scanning with no sign-in and the full GitHub repo list
 * once a visitor connects their account. No auth gate here.
 */
export default function HeroCTA() {
  const router = useRouter();

  return (
    <button
      type="button"
      data-magnetic
      onClick={() => router.push('/scan')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        background: 'var(--in)',
        color: '#0e1626',
        border: 'none',
        cursor: 'pointer',
        fontSize: 16,
        fontWeight: 700,
        padding: '15px 26px',
        borderRadius: 11,
        transition: 'background .2s, transform .1s',
        fontFamily: 'inherit',
      }}
    >
      Connect a repo <span>→</span>
    </button>
  );
}

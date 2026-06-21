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
        background: 'var(--lime)',
        color: '#15150f',
        border: 'none',
        cursor: 'pointer',
        fontSize: 16,
        fontWeight: 700,
        padding: '15px 26px',
        borderRadius: 11,
        boxShadow: '0 6px 26px rgba(131,200,24,.3)',
        transition: 'box-shadow .25s, transform .1s',
        fontFamily: 'inherit',
      }}
    >
      Scan my code <span>→</span>
    </button>
  );
}

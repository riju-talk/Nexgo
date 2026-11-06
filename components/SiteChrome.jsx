import Link from 'next/link';
import Image from 'next/image';
import { POLICIES } from '@/lib/legal/company';

// Header and footer shared by the landing page and the public policy pages.
// `base` is '' on the landing page (in-page anchors) and '/' elsewhere (anchors on the landing page).

const ICON = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
const MENU = <path d="M4 7h16M4 12h16M4 17h16" />;

export function Logo({ light }) {
  return (
    <Link href="/" className={`lp-logo${light ? ' light' : ''}`} aria-label="NEXGO home">
      {light ? (
        <>
          <span className="lp-mark"><Image src="/nexgo-mark.png" alt="" width={428} height={364} /></span>
          NEXGO
        </>
      ) : (
        <Image src="/nexgo-logo.png" alt="NEXGO" width={1757} height={364} priority sizes="150px" className="lp-logo-img" />
      )}
    </Link>
  );
}

const NAV = [
  ['#features', 'Features'],
  ['#how', 'How it works'],
  ['#money', 'COD & billing'],
  ['#policies', 'Policies'],
  ['#faq', 'FAQ'],
];

export function SiteHeader({ base = '' }) {
  return (
    <header className="lp-nav">
      <div className="lp-wrap">
        <Logo />
        <nav className="lp-links" aria-label="Sections">
          {NAV.map(([h, l]) => <a key={h} href={`${base}${h}`}>{l}</a>)}
        </nav>
        <div className="lp-cta">
          <Link href="/login" className="lp-btn ghost nav-signin">Sign in</Link>
          <Link href="/signup" className="lp-btn primary">Get started</Link>
          <details className="lp-menu">
            <summary aria-label="Open menu">
              <svg viewBox="0 0 24 24" width={22} height={22} {...ICON} aria-hidden="true">{MENU}</svg>
            </summary>
            <div className="lp-menu-panel">
              {NAV.map(([h, l]) => <a key={h} href={`${base}${h}`}>{l}</a>)}
              <Link href="/login">Sign in</Link>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ base = '' }) {
  return (
    <footer className="lp-foot">
      <div className="lp-wrap lp-foot-grid">
        <div>
          <Logo />
          <p>Multi-courier shipping, COD and billing for Indian sellers.</p>
        </div>
        <nav aria-label="Product">
          <h3>Product</h3>
          <a href={`${base}#features`}>Features</a>
          <a href={`${base}#how`}>How it works</a>
          <a href={`${base}#money`}>COD &amp; billing</a>
          <a href={`${base}#faq`}>FAQ</a>
        </nav>
        <nav aria-label="Account">
          <h3>Account</h3>
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Create account</Link>
          <Link href="/forgot-password">Forgot password</Link>
        </nav>
        <nav aria-label="Legal">
          <h3>Legal</h3>
          {POLICIES.map((p) => <Link key={p.href} href={p.href}>{p.label}</Link>)}
        </nav>
      </div>
      <div className="lp-wrap lp-legal">© 2026 NEXGO Logistics Technologies Pvt. Ltd. · India</div>
    </footer>
  );
}

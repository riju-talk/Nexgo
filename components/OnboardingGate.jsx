'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { ONBOARDING_EVENT, isBlocked, kycProgress, onboardingStep } from '@/lib/onboarding';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD } from './Kit';
import LiveKyc from './LiveKyc';

// The documents the seller agrees to. Each opens the real page in a new tab.
const POLICIES = [['Terms of Service', '/terms'], ['Privacy Policy', '/privacy-policy'], ['Shipping SOP', '/shipping-sop'], ['Refund & Cancellation Policy', '/refund-policy']];

const kycNeedsAction = (me) => ['unsubmitted', 'rejected'].includes(me?.onboarding?.kycStatus);

/** "Set up your account" card: progress bar plus the three KYC steps. Shown on every page until KYC is verified. */
function KycProgress({ me, mobile }) {
  const progress = kycProgress(me);
  if (!progress) return null;
  const { steps, done, total } = progress;
  return (
    <section aria-label="KYC progress" style={{ ...CARD, margin: mobile ? '12px 12px 0' : '16px 24px 0', padding: mobile ? 14 : '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <strong style={{ fontSize: 15, color: T.TEXT, whiteSpace: 'nowrap' }}>Set up your NEXGO account</strong>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.BORDER }}><div style={{ width: `${(done / total) * 100}%`, height: '100%', borderRadius: 3, background: BLUE }} /></div>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.TEXT_SECONDARY }}>{done}/{total}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : `repeat(${total}, 1fr)`, gap: mobile ? 10 : 16, marginTop: 14 }}>
        {steps.map((s) => (
          <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, background: s.state === 'done' ? '#16A34A' : 'transparent', color: s.state === 'done' ? '#fff' : T.TEXT_MUTED, border: s.state === 'done' ? 'none' : `2px solid ${s.state === 'current' ? BLUE : T.BORDER}` }}>{s.state === 'done' ? '✓' : ''}</span>
            <span><span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: T.TEXT }}>{s.label}</span><span style={{ display: 'block', fontSize: 12, color: s.state === 'done' ? '#16A34A' : T.TEXT_MUTED }}>{s.state === 'done' ? 'Completed' : s.hint}</span></span>
          </div>
        ))}
      </div>
      {kycNeedsAction(me) && <div style={{ marginTop: 14 }}><Link href="/settings/kyc" style={{ color: BLUE, fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>{me.onboarding.kycStatus === 'rejected' ? 'Fix and resubmit your KYC →' : 'Add your KYC documents →'}</Link></div>}
    </section>
  );
}

/** Step 1: the owner reads and accepts the seller agreement. The API stores who accepted which version, and when. */
function Agreement({ me, onAccepted }) {
  const { showToast } = useAppState();
  const [checked, setChecked] = useState(false); const [busy, setBusy] = useState(false);
  const isOwner = me?.role === 'owner';
  const accept = async () => {
    setBusy(true);
    try { await apiFetch('/v1/seller/agreement', { method: 'POST', body: {} }); showToast('Agreement accepted'); onAccepted(); }
    catch (e) { showToast(e instanceof ApiError ? e.message : 'The agreement could not be saved', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <section style={{ ...CARD, padding: 22, maxWidth: 680 }}>
      <h2 style={{ margin: 0, fontSize: 19, color: T.TEXT }}>Welcome{me?.full_name ? `, ${me.full_name}` : ''}</h2>
      <p style={{ margin: '8px 0 14px', color: T.TEXT_SECONDARY, fontSize: 13.5, lineHeight: 1.6 }}>Before you create orders we need you to accept the NEXGO seller agreement. You can add your PAN, ID proof and bank details afterwards from Settings → KYC. It takes a few minutes and keeps every seller on the platform genuine.</p>
      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {POLICIES.map(([label, href]) => <a key={href} href={href} target="_blank" rel="noreferrer" style={{ color: BLUE, fontSize: 13.5, fontWeight: 650, textDecoration: 'none' }}>{label} ↗</a>)}
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: isOwner ? 'pointer' : 'not-allowed', fontSize: 13.5, color: T.TEXT, lineHeight: 1.5 }}>
        <input type="checkbox" checked={checked} disabled={!isOwner} onChange={(e) => setChecked(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: BLUE }} />
        <span>I have read and agree to the documents above, I am authorised to act for this business, and the details I provide are true.</span>
      </label>
      {!isOwner && <p style={{ margin: '12px 0 0', color: T.AMBER, fontSize: 13 }}>Only the account owner can accept the agreement. Ask the owner to sign in and accept it.</p>}
      <div style={{ marginTop: 18 }}><Btn primary disabled={!checked || busy || !isOwner} onClick={accept} style={{ height: 44, padding: '0 26px' }}>{busy ? 'Saving…' : 'Accept and continue'}</Btn></div>
    </section>
  );
}

/**
 * Wraps the seller app. Until the agreement is accepted and KYC is submitted, every page is replaced by the
 * onboarding screen (KYC, profile and support stay reachable). While KYC is under review the app is open but
 * shows a banner, because shipments are only enabled after an admin verifies the documents.
 */
export default function OnboardingGate({ children, mobile }) {
  const pathname = usePathname();
  const [me, setMe] = useState(null);
  const load = useCallback(() => apiFetch('/v1/seller/me').then(setMe).catch(() => setMe(null)), []);
  useEffect(() => { load(); window.addEventListener(ONBOARDING_EVENT, load); return () => window.removeEventListener(ONBOARDING_EVENT, load); }, [load]);

  const step = onboardingStep(me);
  if (isBlocked(step, pathname)) {
    return (
      <>
        <KycProgress me={me} mobile={mobile} />
        <div style={{ padding: mobile ? '14px 12px 42px' : '22px 24px 48px' }}>
          {step === 'agreement' ? <Agreement me={me} onAccepted={load} /> : <LiveKyc mobile={mobile} />}
        </div>
      </>
    );
  }
  return (
    <>
      <KycProgress me={me} mobile={mobile} />
      {children}
    </>
  );
}

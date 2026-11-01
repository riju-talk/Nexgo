'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useAppState } from '@/lib/AppStateContext';
import { apiFetch, ApiError } from '@/lib/api';
import Toast from './Toast';
import * as T from '@/lib/theme';
import { MOBILE_BREAK } from '@/lib/theme';

const SWITCHER = [
  ['Login', 'login'], ['Sign up', 'signup'], ['Forgot password', 'forgot'], ['Reset password', 'reset'],
];

const FIELD = { height: 38, border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13.5, color: T.TEXT };
// The sign-in card is solid white, so these are the dark-on-white text colours.
const AUTH_TEXT = '#0b1f44';
const AUTH_SUB = '#334155';
const AUTH_MUTED = '#64748B';
const AUTH_LINK = '#2b62d9';
const FIELD_LABEL = { fontSize: 12.5, fontWeight: 700, color: AUTH_SUB, marginBottom: 6, display: 'flex', gap: 3 };
const REQUIRED = <span style={{ color: '#DC2626' }}>*</span>;
const PRIMARY_BTN = { height: 46, borderRadius: 11, background: '#3877fc', boxShadow: '0 1px 2px rgba(11,31,68,.2), 0 6px 16px rgba(56,119,252,.28)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 4 };

function Field({ label, required, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <div style={FIELD_LABEL}>{label}{required && REQUIRED}</div>
      <input aria-label={label} type={type} value={value} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} style={{ ...FIELD, width: '100%', outline: 'none' }} />
    </div>
  );
}

export default function AuthScreen({ mode }) {
  const { vw, nav, showToast } = useAppState();
  const mobile = vw <= MOBILE_BREAK;
  const [form, setForm] = useState({ businessName: '', fullName: '', email: '', password: '', phone: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState(() => {
    if (typeof window === 'undefined') return '';
    const reason = new URLSearchParams(window.location.search).get('reason');
    return reason === 'expired' ? 'Your session ended. Please sign in again.' : reason === 'idle' ? 'You were signed out after a period of inactivity.' : '';
  });
  const set = (name) => (value) => setForm((current) => ({ ...current, [name]: value }));
  
  const submit = async (event) => {
    event.preventDefault();
    // A ref, not state: state only updates after a re-render, so a fast double click would send two requests.
    if (inFlight.current) return;
    if (mode === 'signup') {
      // Same rules as the API, so the person sees what to fix instead of a generic failure.
      const problem = form.businessName.trim().length < 3 ? 'Business name must be at least 3 characters.'
        : form.fullName.trim().length < 2 ? 'Enter your name.'
        : !/^\S+@\S+\.\S+$/.test(form.email.trim()) ? 'Enter a valid work email.'
        : form.password.length < 12 ? 'Password must be at least 12 characters.'
        : form.password !== form.confirmPassword ? 'Passwords do not match.' : '';
      if (problem) { showToast(problem, 'error'); return; }
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await apiFetch('/v1/auth/login', { method: 'POST', body: { email: form.email, password: form.password } });
      }
      if (mode === 'signup') {
        if (form.password !== form.confirmPassword) throw new Error('Passwords do not match');
        await apiFetch('/v1/auth/signup', { method: 'POST', body: { businessName: form.businessName, fullName: form.fullName, email: form.email, password: form.password } });
        showToast('Account created. A confirmation email is on its way. Please sign in.');
        nav('login'); return;
      }
      if (mode === 'forgot') { await apiFetch('/v1/auth/forgot-password', { method: 'POST', body: { email: form.email } }); showToast('If the account exists, a reset link has been sent.'); return; }
      if (mode === 'reset') {
        const token = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('token');
        if (!token) throw new Error('This reset link is missing its security token. Request a new one.');
        if (form.password !== form.confirmPassword) throw new Error('Passwords do not match');
        await apiFetch('/v1/auth/reset-password', { method: 'POST', body: { token, password: form.password } });
        showToast('Password reset. Please sign in.');
        // An admin who just set their own password goes back to the admin sign-in, not the seller one.
        if (new URLSearchParams(window.location.search).get('admin') === '1') { nav('a-login'); return; }
        nav('login'); return;
      }
      nav('dashboard');
    } catch (error) {
      const code = error instanceof ApiError ? error.message : '';
      const text = code === 'INVALID_CREDENTIALS' ? 'Incorrect email or password.'
        : code === 'EMAIL_ALREADY_REGISTERED' ? 'This email is already registered. Sign in instead.'
        : error instanceof ApiError ? (error.status === 429 ? 'Too many attempts. Wait a minute and try again.' : error.message) : error.message || 'Unable to continue';
      showToast(text, 'error');
      if (mode === 'signup' && code === 'EMAIL_ALREADY_REGISTERED') nav('login');
    }
    finally { inFlight.current = false; setSubmitting(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.05fr .95fr', position: 'relative', background: '#f6f8fc' }}>
      {!mobile && (
        <div style={{ position: 'relative', zIndex: 1, background: '#0b1f44', padding: '48px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: '#fff', overflow: 'hidden' }}>
          <Link href="/" aria-label="NEXGO home" style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#3877fc', display: 'grid', placeItems: 'center' }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 19V5l12 14V5" /></svg>
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-.02em' }}>NEXGO</div>
          </Link>
          <div style={{ maxWidth: 460 }}>
            <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: '#8fb0ff', fontWeight: 800, marginBottom: 18 }}>Multi-courier shipping platform</div>
            <h1 style={{ margin: 0, fontSize: 40, lineHeight: 1.1, fontWeight: 800, letterSpacing: '-.035em' }}>Ship anywhere from one console.</h1>
            <div style={{ fontSize: 16.5, color: '#b6c6e6', marginTop: 16, lineHeight: 1.6 }}>Compare live rates, book with any courier, and track every parcel and COD rupee in one place.</div>
            <div style={{ marginTop: 30, display: 'grid', gap: 14 }}>
              {['Live courier rates for any pincode pair', 'Bulk upload or Shopify sync, labels in one click', 'NDR actions and COD remittance, tracked end to end', 'GST invoices and statements in Excel or CSV'].map((t) => (
                <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 15, fontWeight: 600, color: '#e6eefc' }}>
                  <span style={{ flex: 'none', width: 22, height: 22, borderRadius: '50%', background: '#3877fc', display: 'grid', placeItems: 'center' }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12.5l4 4 8-9" /></svg>
                  </span>{t}
                </div>
              ))}
            </div>
            <div aria-hidden="true" style={{ marginTop: 34, background: '#12295a', border: '1px solid #1d3a73', borderRadius: 16, padding: '16px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, color: '#8fa6cf' }}><span>Rate comparison</span><span style={{ background: 'rgba(255,255,255,.12)', color: '#b8ccff', padding: '3px 9px', borderRadius: 99, fontSize: 10.5, letterSpacing: '.06em' }}>SAMPLE</span></div>
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {[['Courier A', 'Cheapest · 3 days', '₹52', true], ['Courier B', 'Fastest · 2 days', '₹64', false]].map(([n, s, pr, best]) => (
                  <div key={n} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 11, border: best ? '1.5px solid #3877fc' : '1.5px solid #1d3a73', background: best ? 'rgba(56,119,252,.16)' : 'transparent' }}>
                    <div><div style={{ fontWeight: 700, fontSize: 14 }}>{n}</div><div style={{ fontSize: 12, color: '#8fa6cf', fontWeight: 600 }}>{s}</div></div>
                    <div style={{ fontWeight: 800, fontSize: 17, fontVariantNumeric: 'tabular-nums' }}>{pr}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: '#7f93bb' }}>© 2026 NEXGO Logistics Technologies Pvt. Ltd. · India</div>
        </div>
      )}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{
          width: '100%', maxWidth: 420,
          background: '#FFFFFF',
          border: '1px solid #dfe6f2', borderRadius: 20,
          boxShadow: '0 2px 4px rgba(11,31,68,.06), 0 24px 56px rgba(11,31,68,.12)',
          padding: '34px 36px 30px',
        }}>
          <form onSubmit={submit}>{mode === 'login' && (
            <>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', color: AUTH_TEXT, textShadow: 'none' }}>Sign in</div>
              <div style={{ fontSize: 13, color: AUTH_SUB, marginTop: 4 }}>Access your shipping workspace</div>
              
              {notice && <div role="status" style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E', fontSize: 12.5, lineHeight: 1.5 }}>{notice}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 16 }}>
                <Field label="Work email" required value={form.email} onChange={set('email')} placeholder="you@company.com" />
                <Field label="Password" required type="password" value={form.password} onChange={set('password')} />
                <button type="submit" disabled={submitting} style={{ ...PRIMARY_BTN, width: '100%', border: 0, opacity: submitting ? .7 : 1 }}>{submitting ? 'Signing in…' : 'Sign In'}</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span onClick={() => nav('forgot')} style={{ fontSize: 12, color: AUTH_LINK, fontWeight: 700, cursor: 'pointer' }}>Forgot Password</span>
                  <span style={{ fontSize: 12, color: AUTH_SUB }}>New here? <span onClick={() => nav('signup')} style={{ color: AUTH_LINK, fontWeight: 700, cursor: 'pointer' }}>Sign Up</span></span>
                </div>
                <div style={{ marginTop: 12, paddingTop: 14, borderTop: '1px solid #E2E8F0', textAlign: 'center', fontSize: 12, color: AUTH_SUB }}>
                  Platform staff? <Link href="/admin/login" style={{ color: AUTH_LINK, fontWeight: 700, textDecoration: 'none' }}>Sign in as admin</Link>
                </div>
              </div>
            </>
          )}
          {mode === 'signup' && (
            <>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', color: AUTH_TEXT }}>Create account</div>
              <div style={{ fontSize: 13, color: AUTH_SUB, marginTop: 4 }}>Set up your seller workspace</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 22 }}>
                <Field label="Business name" required value={form.businessName} onChange={set('businessName')} />
                <Field label="Your name" required value={form.fullName} onChange={set('fullName')} />
                <Field label="Work email" required value={form.email} onChange={set('email')} />
                <Field label="Password" required type="password" placeholder="At least 12 characters" value={form.password} onChange={set('password')} />
                <Field label="Confirm password" required type="password" value={form.confirmPassword} onChange={set('confirmPassword')} />
                <button type="submit" disabled={submitting} style={{ ...PRIMARY_BTN, width: '100%', border: 0, opacity: submitting ? .7 : 1 }}>{submitting ? 'Creating…' : 'Create account'}</button>
                <div style={{ textAlign: 'center', fontSize: 12, color: AUTH_SUB }}>Already on NEXGO? <span onClick={() => nav('login')} style={{ color: AUTH_LINK, fontWeight: 700, cursor: 'pointer' }}>Sign in</span></div>
              </div>
            </>
          )}
          {mode === 'forgot' && (
            <>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', color: AUTH_TEXT }}>Reset your password</div>
              <div style={{ fontSize: 13, color: AUTH_SUB, marginTop: 4, lineHeight: 1.6 }}>Enter your work email and we&apos;ll send a link to reset your password.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 22 }}>
                <Field label="Work email" required value={form.email} onChange={set('email')} />
                <button type="submit" disabled={submitting} style={{ ...PRIMARY_BTN, width: '100%', border: 0 }}>{submitting ? 'Sending…' : 'Send reset link'}</button>
                <div onClick={() => nav('login')} style={{ textAlign: 'center', fontSize: 12, color: AUTH_SUB, cursor: 'pointer' }}>← Back to sign in</div>
              </div>
            </>
          )}</form>
          {mode === 'reset' && (
            <form onSubmit={submit}>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', color: AUTH_TEXT }}>Set a new password</div>
              <div style={{ fontSize: 13, color: AUTH_SUB, marginTop: 4 }}>Choose a strong password for your workspace.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 22 }}>
                <Field label="New password" required type="password" value={form.password} onChange={set('password')} />
                <Field label="Confirm new password" required type="password" value={form.confirmPassword} onChange={set('confirmPassword')} />
                <button type="submit" disabled={submitting} style={{ ...PRIMARY_BTN, width: '100%', border: 0, opacity: submitting ? .7 : 1 }}>{submitting ? 'Resetting…' : 'Reset password and sign in'}</button>
              </div>
            </form>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 22, paddingTop: 16, borderTop: '1px solid #E2E8F0' }}>
            {SWITCHER.map(([label, id]) => (
              <div key={id} onClick={() => nav(id)} style={{ fontSize: 11, fontWeight: 700, color: mode === id ? AUTH_LINK : AUTH_MUTED, cursor: 'pointer' }}>{label}</div>
            ))}
          </div>
        </div>
      </div>
      <Toast />
    </div>
  );
}

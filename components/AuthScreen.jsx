'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import NMark from './NMark';
import { useAppState } from '@/lib/AppStateContext';
import { apiFetch, ApiError } from '@/lib/api';
import Toast from './Toast';
import * as T from '@/lib/theme';
import { MOBILE_BREAK } from '@/lib/theme';
import { signupProblem } from '@/lib/authRules';

const FIELD = { height: 38, border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13.5, color: T.TEXT };
// The sign-in card is solid white, so these are the dark-on-white text colours.
const AUTH_TEXT = '#0F1F3D';
const AUTH_SUB = '#334155';
const AUTH_MUTED = '#64748B';
const AUTH_LINK = '#1a6aa3';
const FIELD_LABEL = { fontSize: 12.5, fontWeight: 700, color: AUTH_SUB, marginBottom: 6, display: 'flex', gap: 3 };
const REQUIRED = <span style={{ color: '#DC2626' }}>*</span>;
const PRIMARY_BTN = { height: 40, borderRadius: 8, background: '#1a6aa3', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 4 };

/**
 * One labelled input. Password fields get a Show/Hide toggle so people can check what they typed
 * (sign in, register and reset all share this component).
 */
function Field({ label, required, value, onChange, type = 'text', placeholder }) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  return (
    <div>
      <div style={FIELD_LABEL}>{label}{required && REQUIRED}</div>
      <div style={{ position: 'relative' }}>
        <input
          aria-label={label}
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          autoComplete={isPassword ? 'current-password' : undefined}
          style={{ ...FIELD, width: '100%', outline: 'none', paddingRight: isPassword ? 56 : 12 }}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((shown) => !shown)}
            aria-label={revealed ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={revealed}
            style={{ position: 'absolute', right: 8, top: 0, height: '100%', border: 0, background: 'transparent', color: AUTH_LINK, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AuthScreen({ mode: requestedMode }) {
  const { vw, nav, showToast } = useAppState();
  const mobile = vw <= MOBILE_BREAK;
  const [form, setForm] = useState({ fullName: '', email: '', password: '', phone: '', confirmPassword: '' });
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [notice, setNotice] = useState(() => {
    if (typeof window === 'undefined') return '';
    const reason = new URLSearchParams(window.location.search).get('reason');
    return reason === 'expired' ? 'Your session ended. Please sign in again.' : reason === 'idle' ? 'You were signed out after a period of inactivity.' : '';
  });
  // /reset-password opened without the e-mailed token has nothing to reset: ask for the e-mail address instead.
  const [hasResetToken] = useState(() => typeof window !== 'undefined' && !!new URLSearchParams(window.location.search).get('token'));
  const mode = requestedMode === 'reset' && !hasResetToken ? 'forgot' : requestedMode;
  // The reset page only exists for the emailed link. Opened without one, it sends the person to the separate Forgot password page (e-mail first).
  useEffect(() => { if (requestedMode === 'reset' && !hasResetToken) nav('forgot'); }, [requestedMode, hasResetToken, nav]);
  const set = (name) => (value) => setForm((current) => ({ ...current, [name]: value }));
  
  const submit = async (event) => {
    event.preventDefault();
    // A ref, not state: state only updates after a re-render, so a fast double click would send two requests.
    if (inFlight.current) return;
    if (mode === 'signup') {
      const problem = signupProblem(form);
      if (problem) { showToast(problem, 'error'); return; }
    }
    inFlight.current = true;
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const session = await apiFetch('/v1/auth/login', { method: 'POST', body: { email: form.email, password: form.password } });
        showToast(session?.fullName ? `Welcome ${session.fullName}` : 'Welcome back');
      }
      if (mode === 'signup') {
        if (form.password !== form.confirmPassword) throw new Error('Passwords do not match');
        await apiFetch('/v1/auth/signup', { method: 'POST', body: { fullName: form.fullName, email: form.email, password: form.password } });
        showToast(`Welcome ${form.fullName.trim()}! Your account is ready.`);
        nav('dashboard'); return;
      }
      if (mode === 'forgot') { await apiFetch('/v1/auth/forgot-password', { method: 'POST', body: { email: form.email } }); showToast(`If ${form.email.trim()} is registered, a reset link is on its way. Open it from your email to choose a new password.`); return; }
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
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.05fr .95fr', position: 'relative' }}>
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: [
            'linear-gradient(rgba(3,10,20,.55), rgba(3,10,20,.55))',
            'url(/login-port.jpg)',
          ].join(', '),
          backgroundSize: 'cover',
          backgroundPosition: 'center 42%',
          backgroundRepeat: 'no-repeat',
          pointerEvents: 'none',
        }}
      />
      {!mobile && (
        <div style={{ position: 'relative', zIndex: 1, background: 'rgba(12,26,51,.62)', backdropFilter: 'blur(6px)', padding: '48px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NMark size={34} />
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.13em' }}>NEXGO</div>
          </div>
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7189AE', fontWeight: 700, marginBottom: 16 }}>Multi-courier shipping platform</div>
            <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.25, fontWeight: 600, letterSpacing: "-.015em" }}>Smarter, faster, easier shipping for your business.</h1>
            <div style={{ fontSize: 13.5, color: '#8298B8', marginTop: 12, lineHeight: 1.6 }}>Compare live rates, book with any courier, and track every shipment in one console.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 26 }}>
              {['Amazon', 'Delhivery', 'Ekart', 'Xpressbees', 'Shadowfax'].map((c) => (
                <div key={c} style={{ fontSize: 11.5, fontWeight: 600, color: '#C7D2E2', border: '1px solid rgba(255,255,255,.16)', borderRadius: 20, padding: '5px 11px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 3, background: '#3877fc' }} />{c}
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#5F779C' }}>© 2026 NEXGO Logistics Technologies Pvt. Ltd. · India</div>
        </div>
      )}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{
          width: '100%', maxWidth: 400,
          background: '#FFFFFF',
          border: '1px solid #E2E8F0', borderRadius: 16,
          boxShadow: '0 24px 70px rgba(0,0,0,.34)',
          padding: '32px 34px 30px',
        }}>
          <Link href="/" aria-label="NEXGO home" style={{ display: 'inline-block', marginBottom: 20 }}>
            <NMark size={40} />
          </Link>
          <form onSubmit={submit}>{mode === 'login' && (
            <>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', color: AUTH_TEXT, textShadow: 'none' }}>Sign in with email</div>
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
                
              </div>
            </>
          )}
          {mode === 'signup' && (
            <>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', color: AUTH_TEXT }}>Create account</div>
              <div style={{ fontSize: 13, color: AUTH_SUB, marginTop: 4 }}>Set up your seller workspace</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 22 }}>
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
          
        </div>
      </div>
      <Toast />
    </div>
  );
}

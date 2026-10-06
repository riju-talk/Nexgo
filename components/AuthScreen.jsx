'use client';

import { useState } from 'react';
import { useAppState } from '@/lib/AppStateContext';
import { apiFetch, ApiError } from '@/lib/api';
import * as T from '@/lib/theme';
import { MOBILE_BREAK } from '@/lib/theme';

const SWITCHER = [
  ['Login', 'login'], ['Sign up', 'signup'], ['Forgot password', 'forgot'], ['Reset password', 'reset'],
];

const FIELD = { height: 38, border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 13.5, color: T.TEXT };
const FIELD_LABEL = { fontSize: 12.5, fontWeight: 600, color: T.TEXT_LABEL, marginBottom: 6, display: 'flex', gap: 3 };
const REQUIRED = <span style={{ color: '#DC2626' }}>*</span>;
const PRIMARY_BTN = { height: 40, borderRadius: 8, background: '#0F766E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 4 };

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
  const set = (name) => (value) => setForm((current) => ({ ...current, [name]: value }));
  
  // Demo credentials helper
  const fillDemo = () => {
    setForm({ ...form, email: 'demo@acmeexports.com', password: 'Demo@123' });
    showToast('Demo credentials filled! Click Sign In to continue.');
  };
  
  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true);
    try {
      if (mode === 'login') {
        // Check for hardcoded demo credentials - bypass backend
        if (form.email === 'demo@acmeexports.com' && form.password === 'Demo@123') {
          showToast('Demo login successful! Redirecting...');
          // Set demo session flag
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem('nx-demo-seller', 'true');
          }
          setTimeout(() => nav('dashboard'), 800);
          return;
        }
        await apiFetch('/v1/auth/login', { method: 'POST', body: { email: form.email, password: form.password } });
      }
      if (mode === 'signup') {
        if (form.password !== form.confirmPassword) throw new Error('Passwords do not match');
        await apiFetch('/v1/auth/signup', { method: 'POST', body: { businessName: form.businessName, fullName: form.fullName, email: form.email, password: form.password } });
      }
      if (mode === 'forgot') { await apiFetch('/v1/auth/forgot-password', { method: 'POST', body: { email: form.email } }); showToast('If the account exists, a reset link has been sent.'); return; }
      if (mode === 'reset') {
        const token = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('token');
        if (!token) throw new Error('This reset link is missing its security token. Request a new one.');
        if (form.password !== form.confirmPassword) throw new Error('Passwords do not match');
        await apiFetch('/v1/auth/reset-password', { method: 'POST', body: { token, password: form.password } });
        showToast('Password reset. Please sign in.'); nav('login'); return;
      }
      nav('dashboard');
    } catch (error) { showToast(error instanceof ApiError ? error.message : error.message || 'Unable to continue', 'error'); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.05fr .95fr', position: 'relative' }}>
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 0,
          backgroundImage: [
            'linear-gradient(rgba(6,12,10,.5), rgba(6,12,10,.5))',
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
            <div style={{ width: 26, height: 26, background: '#00D7C3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: '#06212C', clipPath: 'polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)' }}>N</div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '.13em' }}>NEXGO</div>
          </div>
          <div style={{ maxWidth: 420 }}>
            <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: '#7189AE', fontWeight: 700, marginBottom: 16 }}>Multi-courier shipping platform</div>
            <div style={{ fontSize: 32, lineHeight: 1.25, fontWeight: 600, letterSpacing: '-.015em' }}>Smarter, faster, easier shipping for your business.</div>
            <div style={{ fontSize: 13.5, color: '#8298B8', marginTop: 12, lineHeight: 1.6 }}>Compare live rates, book with any courier, and track every shipment in one console.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 26 }}>
              {['Delhivery', 'Blue Dart', 'Ekart', 'XpressBees', 'Ecom Express', 'Shadowfax'].map((c) => (
                <div key={c} style={{ fontSize: 11.5, fontWeight: 600, color: '#C7D2E2', border: '1px solid rgba(255,255,255,.16)', borderRadius: 20, padding: '5px 11px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: 3, background: '#00D7C3' }} />{c}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 32, marginTop: 30 }}>
              <div><div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>8</div><div style={{ fontSize: 12, color: '#8298B8', marginTop: 4 }}>Courier partners</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>29,000</div><div style={{ fontSize: 12, color: '#8298B8', marginTop: 4 }}>Serviceable pincodes</div></div>
              <div><div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>94.6%</div><div style={{ fontSize: 12, color: '#8298B8', marginTop: 4 }}>Delivery rate</div></div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#5F779C' }}>© 2026 NEXGO Logistics Technologies Pvt. Ltd. · India</div>
        </div>
      )}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{
          width: '100%', maxWidth: 400,
          background: 'var(--nx-glass-1)', backdropFilter: 'blur(18px) saturate(160%)',
          border: '1px solid var(--nx-glass-border)', borderRadius: 16,
          boxShadow: '0 1px 1px rgba(15,23,42,.05), 0 24px 60px rgba(6,12,10,.35)',
          padding: '32px 34px 30px',
        }}>
          <form onSubmit={submit}>{mode === 'login' && (
            <>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', color: T.TEXT }}>Sign in</div>
              <div style={{ fontSize: 13, color: T.TEXT_SECONDARY, marginTop: 4 }}>Access your shipping workspace</div>
              
              {/* Demo Credentials Banner */}
              <div style={{ 
                marginTop: 16, 
                padding: '11px 13px', 
                background: 'linear-gradient(135deg, rgba(0,215,195,.08) 0%, rgba(15,118,110,.08) 100%)', 
                border: '1px solid rgba(0,215,195,.25)',
                borderRadius: 9,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10
              }}>
                <div style={{ fontSize: 16 }}>🚀</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0F766E', marginBottom: 3 }}>Demo Access Available</div>
                  <div style={{ fontSize: 11.5, color: T.TEXT_SECONDARY, lineHeight: 1.5, marginBottom: 8 }}>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: T.TEXT, marginTop: 3 }}>
                      <div>Email: <strong>demo@acmeexports.com</strong></div>
                      <div>Password: <strong>Demo@123</strong></div>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={fillDemo}
                    style={{ 
                      height: 26, 
                      padding: '0 10px', 
                      border: '1px solid rgba(0,215,195,.4)', 
                      borderRadius: 6, 
                      background: 'rgba(0,215,195,.12)', 
                      color: '#0F766E', 
                      fontSize: 11, 
                      fontWeight: 700, 
                      cursor: 'pointer' 
                    }}
                  >
                    Fill Demo Credentials
                  </button>
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 16 }}>
                <Field label="Work email" required value={form.email} onChange={set('email')} placeholder="you@company.com" />
                <Field label="Password" required type="password" value={form.password} onChange={set('password')} />
                <button type="submit" disabled={submitting} style={{ ...PRIMARY_BTN, width: '100%', border: 0, opacity: submitting ? .7 : 1 }}>{submitting ? 'Signing in…' : 'Sign In'}</button>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span onClick={() => nav('forgot')} style={{ fontSize: 12, color: '#0F766E', fontWeight: 600, cursor: 'pointer' }}>Forgot Password</span>
                  <span style={{ fontSize: 12, color: T.TEXT_SECONDARY }}>New here? <span onClick={() => nav('signup')} style={{ color: '#0F766E', fontWeight: 600, cursor: 'pointer' }}>Sign Up</span></span>
                </div>
                <div style={{ marginTop: 12, paddingTop: 14, borderTop: `1px solid ${T.DIVIDER}`, textAlign: 'center', fontSize: 12, color: T.TEXT_SECONDARY }}>
                  Platform staff? <a href="/admin/login" style={{ color: '#0F766E', fontWeight: 600, textDecoration: 'none' }}>Sign in as admin</a>
                </div>
              </div>
            </>
          )}
          {mode === 'signup' && (
            <>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', color: T.TEXT }}>Create account</div>
              <div style={{ fontSize: 13, color: T.TEXT_SECONDARY, marginTop: 4 }}>Set up your seller workspace</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 22 }}>
                <Field label="Business name" required value={form.businessName} onChange={set('businessName')} />
                <Field label="Your name" required value={form.fullName} onChange={set('fullName')} />
                <Field label="Work email" required value={form.email} onChange={set('email')} />
                <Field label="Password" required type="password" value={form.password} onChange={set('password')} />
                <Field label="Confirm password" required type="password" value={form.confirmPassword} onChange={set('confirmPassword')} />
                <button type="submit" disabled={submitting} style={{ ...PRIMARY_BTN, width: '100%', border: 0, opacity: submitting ? .7 : 1 }}>{submitting ? 'Creating…' : 'Create account'}</button>
                <div style={{ textAlign: 'center', fontSize: 12, color: T.TEXT_SECONDARY }}>Already on NEXGO? <span onClick={() => nav('login')} style={{ color: '#0F766E', fontWeight: 600, cursor: 'pointer' }}>Sign in</span></div>
              </div>
            </>
          )}
          {mode === 'forgot' && (
            <>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', color: T.TEXT }}>Reset your password</div>
              <div style={{ fontSize: 13, color: T.TEXT_SECONDARY, marginTop: 4, lineHeight: 1.6 }}>Enter your work email and we&apos;ll send a link to reset your password.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 22 }}>
                <Field label="Work email" required value={form.email} onChange={set('email')} />
                <button type="submit" disabled={submitting} style={{ ...PRIMARY_BTN, width: '100%', border: 0 }}>{submitting ? 'Sending…' : 'Send reset link'}</button>
                <div onClick={() => nav('login')} style={{ textAlign: 'center', fontSize: 12, color: T.TEXT_SECONDARY, cursor: 'pointer' }}>← Back to sign in</div>
              </div>
            </>
          )}</form>
          {mode === 'reset' && (
            <form onSubmit={submit}>
              <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-.01em', color: T.TEXT }}>Set a new password</div>
              <div style={{ fontSize: 13, color: T.TEXT_SECONDARY, marginTop: 4 }}>Choose a strong password for your workspace.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 22 }}>
                <Field label="New password" required type="password" value={form.password} onChange={set('password')} />
                <Field label="Confirm new password" required type="password" value={form.confirmPassword} onChange={set('confirmPassword')} />
                <button type="submit" disabled={submitting} style={{ ...PRIMARY_BTN, width: '100%', border: 0, opacity: submitting ? .7 : 1 }}>{submitting ? 'Resetting…' : 'Reset password and sign in'}</button>
              </div>
            </form>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 22, paddingTop: 16, borderTop: `1px solid ${T.DIVIDER}` }}>
            {SWITCHER.map(([label, id]) => (
              <div key={id} onClick={() => nav(id)} style={{ fontSize: 11, fontWeight: 600, color: mode === id ? '#0F766E' : '#94A3B8', cursor: 'pointer' }}>{label}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

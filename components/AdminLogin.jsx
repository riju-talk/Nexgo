'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { adminApi, ApiError } from '@/lib/api';

const METRICS = [['8', 'Courier partners'], ['29,000', 'Serviceable pincodes'], ['99.4%', 'Platform availability']];

// The card stays white in both colour modes, so pin the light-mode tokens for everything inside it.
const WHITE_CARD_TOKENS = { '--nx-surface': '#ffffff', '--nx-surface-soft': '#fafbfd', '--nx-border': '#d8e0e7', '--nx-divider': '#e8edf1', '--nx-input-border': '#c6d1da', '--nx-text': '#17212b', '--nx-text-label': '#334454', '--nx-text-secondary': '#647587', '--nx-text-muted': '#8391a0', '--nx-text-faint': '#a5b0ba' };

export default function AdminLogin() {
  const { nav, vw, theme, toggleTheme, showToast } = useAppState();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mobile = vw <= T.MOBILE_BREAK;
  const dark = theme === 'dark';
  
  // Demo admin credentials helper
  const fillAdminDemo = () => {
    setEmail('admin@nexgo.in');
    setPassword('Admin@456');
    showToast('Admin demo credentials filled! Click Sign In to continue.');
  };

  async function submitPassword(event) {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      const result = await adminApi.login(email, password);
      if (result.requiresMfa) { setMfaToken(result.mfaToken); return; }
      nav('a-overview');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Incorrect email or password.' : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  }

  async function submitMfa(event) {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      await adminApi.verifyMfa(mfaToken, mfaCode);
      nav('a-overview');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'That code didn’t work — check the time on your authenticator app.' : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  }
  const field = {
    width: '100%', height: 42, padding: '0 12px', border: '1px solid var(--nx-input-border)',
    borderRadius: 9, outline: 'none', background: 'var(--nx-surface)', color: 'var(--nx-text)',
    font: 'inherit', fontSize: 14,
  };

  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.05fr .95fr', position: 'relative', fontFamily: T.SANS }}>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: ['linear-gradient(rgba(5,14,29,.57),rgba(5,14,29,.57))', 'url(/admin-login-hub.png)'].join(', '), backgroundSize: 'cover', backgroundPosition: 'center 48%' }} />

      {!mobile && <section style={{ position: 'relative', zIndex: 1, minHeight: '100vh', padding: '48px 52px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: dark ? 'rgba(8,19,39,.76)' : 'rgba(12,26,51,.65)', backdropFilter: 'blur(7px)', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 27, height: 27, display: 'grid', placeItems: 'center', background: T.ACCENT, color: '#06212C', fontSize: 13, fontWeight: 850, clipPath: 'polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)' }}>N</div>
          <div><div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '.13em' }}>NEXGO</div><div style={{ marginTop: 3, fontSize: 10, color: '#9BB0CA', fontWeight: 750, letterSpacing: '.1em', textTransform: 'uppercase' }}>Platform operations</div></div>
        </div>

        <div style={{ maxWidth: 435 }}>
          <div style={{ marginBottom: 16, color: '#79D8CE', fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Internal control centre</div>
          <h1 style={{ margin: 0, fontSize: 33, lineHeight: 1.22, letterSpacing: '-.025em', fontWeight: 650 }}>Run a calmer, more reliable shipping network.</h1>
          <p style={{ margin: '13px 0 0', color: '#B8C7D9', fontSize: 13.5, lineHeight: 1.65 }}>Monitor sellers, courier partners, money movement, and every operational exception from one secure workspace.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 26 }}>
            {['Network health', 'Seller onboarding', 'Courier SLA', 'COD control'].map(label => <span key={label} style={{ padding: '5px 11px', border: '1px solid rgba(255,255,255,.18)', borderRadius: 99, color: '#DDE8F3', fontSize: 11.5, fontWeight: 650 }}><span style={{ marginRight: 6, color: T.ACCENT }}>•</span>{label}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 32, marginTop: 31 }}>
            {METRICS.map(([value, label]) => <div key={label}><div style={{ fontSize: 22, fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{value}</div><div style={{ marginTop: 4, color: '#9BB0CA', fontSize: 12 }}>{label}</div></div>)}
          </div>
        </div>
        <div style={{ color: '#849CB9', fontSize: 11.5 }}>© 2026 NEXGO Logistics Technologies Pvt. Ltd. · India</div>
      </section>}

      <section style={{ position: 'relative', zIndex: 1, minHeight: '100vh', padding: mobile ? 20 : 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.button whileTap={{ scale: .94 }} onClick={toggleTheme} aria-label="Toggle colour mode" style={{ position: 'absolute', top: mobile ? 18 : 24, right: mobile ? 18 : 24, width: 37, height: 37, border: '1px solid var(--nx-glass-border)', borderRadius: 10, background: 'var(--nx-glass-1)', backdropFilter: 'blur(14px)', color: T.ACCENT, cursor: 'pointer', fontSize: 16 }}>{dark ? '☾' : '☀'}</motion.button>
        <div style={{ width: 'min(100%, 400px)', padding: mobile ? '29px 26px 26px' : '32px 34px 29px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 1px rgba(15,23,42,.05), 0 24px 60px rgba(6,12,10,.35)', ...WHITE_CARD_TOKENS }}>
          {mobile && <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><div style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', background: T.ACCENT, color: '#06212C', fontSize: 12, fontWeight: 850, clipPath: 'polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)' }}>N</div><div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '.13em', color: T.TEXT }}>NEXGO</div></div>}
          <div style={{ marginTop: mobile ? 25 : 0 }}>
            <div style={{ color: T.TEXT, fontSize: 23, lineHeight: 1.12, letterSpacing: '-.02em', fontWeight: 750 }}>{mfaToken ? 'Verification code' : 'Admin sign in'}</div>
            <p style={{ margin: '6px 0 0', color: T.TEXT_SECONDARY, fontSize: 13, lineHeight: 1.55 }}>{mfaToken ? 'Enter the 6-digit code from your authenticator app.' : 'Access the NEXGO platform operations workspace.'}</p>
          </div>
          {error && <div style={{ marginTop: 15, padding: '10px 12px', borderRadius: 8, background: 'rgba(178,58,43,.1)', border: '1px solid rgba(178,58,43,.25)', color: '#B23A2B', fontSize: 12.5, fontWeight: 600 }}>{error}</div>}
          
          {/* Demo Admin Credentials Banner - Only show if not in MFA mode */}
          {!mfaToken && (
            <div style={{ 
              marginTop: 16, 
              padding: '11px 13px', 
              background: 'rgba(27,159,214,.08)', 
              border: '1px solid rgba(27,159,214,.25)',
              borderRadius: 9,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10
            }}>
              <div style={{ fontSize: 16 }}>🔐</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1a6aa3', marginBottom: 3 }}>Platform Admin Demo</div>
                <div style={{ fontSize: 11.5, color: T.TEXT_SECONDARY, lineHeight: 1.5, marginBottom: 8 }}>
                  <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: T.TEXT, marginTop: 3 }}>
                    <div>Email: <strong>admin@nexgo.in</strong></div>
                    <div>Password: <strong>Admin@456</strong></div>
                  </div>
                </div>
                <button 
                  type="button" 
                  onClick={fillAdminDemo}
                  style={{ 
                    height: 26, 
                    padding: '0 10px', 
                    border: '1px solid rgba(27,159,214,.4)', 
                    borderRadius: 6, 
                    background: 'rgba(27,159,214,.12)', 
                    color: '#1a6aa3', 
                    fontSize: 11, 
                    fontWeight: 700, 
                    cursor: 'pointer' 
                  }}
                >
                  Fill Admin Demo Credentials
                </button>
              </div>
            </div>
          )}
          
          {mfaToken ? (
            <form onSubmit={submitMfa} style={{ display: 'grid', gap: 15, marginTop: 20 }}>
              <label style={{ display: 'grid', gap: 6 }}><span style={{ color: T.TEXT_LABEL, fontSize: 12.5, fontWeight: 650 }}>6-digit code <span style={{ color: T.RED }}>*</span></span><input aria-label="Verification code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="000000" autoFocus autoComplete="one-time-code" style={{ ...field, fontVariantNumeric: 'tabular-nums', letterSpacing: '.3em', textAlign: 'center' }} /></label>
              <motion.button whileTap={{ scale: .98 }} type="submit" disabled={busy || mfaCode.length !== 6} style={{ height: 41, marginTop: 2, border: 0, borderRadius: 8, background: '#1a6aa3', color: '#fff', cursor: busy ? 'default' : 'pointer', opacity: busy || mfaCode.length !== 6 ? .6 : 1, fontSize: 14, fontWeight: 700, boxShadow: '0 9px 18px rgba(15,31,61,.2)' }}>{busy ? 'Verifying…' : 'Verify and sign in'}</motion.button>
              <div onClick={() => { setMfaToken(null); setMfaCode(''); setError(''); }} style={{ textAlign: 'center', color: T.TEXT_SECONDARY, fontSize: 12, cursor: 'pointer' }}>← Back to password</div>
            </form>
          ) : (
            <form onSubmit={submitPassword} style={{ display: 'grid', gap: 15, marginTop: 20 }}>
              <label style={{ display: 'grid', gap: 6 }}><span style={{ color: T.TEXT_LABEL, fontSize: 12.5, fontWeight: 650 }}>Work email <span style={{ color: T.RED }}>*</span></span><input aria-label="Work email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@nexgo.in" autoComplete="email" required style={field} /></label>
              <label style={{ display: 'grid', gap: 6 }}><span style={{ color: T.TEXT_LABEL, fontSize: 12.5, fontWeight: 650 }}>Password <span style={{ color: T.RED }}>*</span></span><span style={{ position: 'relative' }}><input aria-label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" required style={{ ...field, paddingRight: 68 }} /><button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', top: 7, right: 8, height: 28, border: 0, borderRadius: 6, background: 'transparent', color: '#1a6aa3', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>{showPassword ? 'Hide' : 'Show'}</button></span></label>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: T.TEXT_SECONDARY, fontSize: 12 }}><span>Restricted to platform staff</span><span style={{ color: '#1a6aa3', fontWeight: 700, cursor: 'pointer' }}>Forgot password?</span></div>
              <motion.button whileTap={{ scale: .98 }} type="submit" disabled={busy} style={{ height: 41, marginTop: 2, border: 0, borderRadius: 8, background: '#1a6aa3', color: '#fff', cursor: busy ? 'default' : 'pointer', opacity: busy ? .7 : 1, fontSize: 14, fontWeight: 700, boxShadow: '0 9px 18px rgba(15,31,61,.2)' }}>{busy ? 'Signing in…' : 'Sign in to operations'}</motion.button>
            </form>
          )}
          <div style={{ marginTop: 21, paddingTop: 16, borderTop: '1px solid var(--nx-divider)', color: T.TEXT_MUTED, fontSize: 11.5, lineHeight: 1.55 }}>Protected workspace · Access is logged and governed by platform role permissions.</div>
          <div style={{ marginTop: 13, textAlign: 'center', color: T.TEXT_SECONDARY, fontSize: 11.5 }}>Need the seller workspace? <a href="/login" style={{ color: '#1a6aa3', fontWeight: 700 }}>Sign in as a seller</a></div>
        </div>
      </section>
    </main>
  );
}

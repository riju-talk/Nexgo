'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pill, dateTime } from './Kit';

// Admin > Integrations: the courier aggregators NEXGO books through. Add an API key, test it, and copy the webhook URL to the aggregator's dashboard.
// Secrets are stored encrypted on the server and are never shown again: leave a field empty to keep what is saved.
const SOURCE = { saved: ['Saved here', T.GREEN], environment: ['From the server settings', T.AMBER], missing: ['Missing', T.RED] };
const CAPS = { listServices: 'Courier list', serviceability: 'Lane check', track: 'Tracking by request', ndrAction: 'NDR actions', cancel: 'Cancel' };

function Aggregator({ a, onChanged }) {
  const { showToast } = useAppState();
  const [values, setValues] = useState({}); const [busy, setBusy] = useState(''); const [result, setResult] = useState(null);
  const dirty = Object.values(values).some((v) => v && v.trim());
  const save = async () => {
    setBusy('save');
    try { await apiFetch(`/v1/admin/aggregators/${a.id}/credentials`, { method: 'PUT', body: { values } }); setValues({}); setResult(null); showToast(`${a.label} settings saved`); onChanged(); }
    catch (e) { showToast(e.message || 'Could not save', 'error'); } finally { setBusy(''); }
  };
  const test = async () => {
    setBusy('test'); setResult(null);
    try { setResult(await apiFetch(`/v1/admin/aggregators/${a.id}/test`, { method: 'POST', body: {} })); onChanged(); }
    catch (e) { setResult({ ok: false, message: e.message || 'The test could not run' }); } finally { setBusy(''); }
  };
  const copy = () => navigator.clipboard?.writeText(a.webhookUrl).then(() => showToast('Webhook URL copied')).catch(() => showToast('Copy is not available in this browser', 'error'));
  const last = a.lastWebhookAt ? dateTime(a.lastWebhookAt) : 'never';

  return (
    <section style={{ ...CARD, padding: 18, display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <b style={{ fontSize: 17, color: T.TEXT }}>{a.label}</b>
        <Pill color={a.configured ? T.GREEN : T.RED}>{a.configured ? 'Configured' : 'Not configured'}</Pill>
        <span style={{ color: T.TEXT_MUTED, fontSize: 12.5 }}>{a.courierCount} courier{a.courierCount === 1 ? '' : 's'} use it</span>
        <span style={{ flex: 1 }} />
        {Object.entries(a.capabilities).filter(([, on]) => on).map(([k]) => <Pill key={k} color={BLUE}>{CAPS[k] || k}</Pill>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
        {a.fields.map((f) => (
          <label key={f.key} style={{ display: 'grid', gap: 5 }}>
            <span style={{ fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL, display: 'flex', gap: 8, alignItems: 'center' }}>{f.label}{f.required && <span style={{ color: T.RED }}>*</span>}<small style={{ color: SOURCE[f.source][1], fontWeight: 700 }}>{SOURCE[f.source][0]}</small></span>
            <input type={f.secret ? 'password' : 'text'} autoComplete="off" value={values[f.key] ?? ''} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              placeholder={f.secret ? (f.source === 'missing' ? 'Paste it here' : 'Saved. Type to replace it') : (f.value || '')} style={{ ...FIELD, height: 40, width: '100%' }} />
            {f.hint && <small style={{ color: T.TEXT_MUTED }}>{f.hint}</small>}
          </label>
        ))}
      </div>

      {a.webhookUrl && (
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--nx-surface-soft)', display: 'grid', gap: 6 }}>
          <b style={{ fontSize: 13, color: T.TEXT }}>Webhook (tracking updates)</b>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><code style={{ fontSize: 12.5, wordBreak: 'break-all' }}>{a.webhookUrl}</code><Btn small onClick={copy}>Copy</Btn></div>
          <small style={{ color: T.TEXT_SECONDARY }}>Save this URL and the webhook token above in {a.label}&apos;s dashboard. Last update received: <b>{last}</b> · {a.webhooks24h} in the last 24 h.</small>
        </div>
      )}

      {result && <div role="status" style={{ padding: '10px 12px', borderRadius: 8, border: `1px solid ${result.ok ? '#BFE3C9' : '#F1B8B8'}`, background: result.ok ? '#F1FAF4' : '#FDF2F2', color: result.ok ? '#176B3A' : '#9B1C1C', fontSize: 13 }}>{result.message}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Btn primary disabled={!dirty || !!busy} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save'}</Btn>
        {a.capabilities.listServices && <Btn disabled={!!busy} onClick={test}>{busy === 'test' ? 'Testing…' : 'Test connection'}</Btn>}
        {a.lastTestedAt && !result && <small style={{ color: a.lastTestOk ? T.GREEN : T.RED }}>Last test {dateTime(a.lastTestedAt)}: {a.lastTestMessage}</small>}
      </div>
    </section>
  );
}

export default function AdminIntegrations({ mobile }) {
  const [items, setItems] = useState(null); const [error, setError] = useState(''); const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    apiFetch('/v1/admin/aggregators').then((x) => { if (live) { setItems(x.items || []); setError(''); } }).catch((e) => { if (live) { setItems([]); setError(e.message || 'Integrations could not be loaded.'); } });
    return () => { live = false; };
  }, [tick]);
  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', display: 'grid', gap: 14 }}>
      <div><div style={{ color: T.TEXT, fontWeight: 760, fontSize: 19 }}>Integrations</div><div style={{ color: T.TEXT_SECONDARY, marginTop: 4, fontSize: 13 }}>The courier aggregators NEXGO books through. Keys are stored encrypted and are never shown again. Couriers are added under Couriers › Partners.</div></div>
      {error && <div style={{ ...CARD, padding: 14, color: T.RED, fontSize: 13 }}>{error}</div>}
      {items === null ? <div style={{ ...CARD, padding: 24, color: T.TEXT_MUTED }}>Loading…</div> : items.map((a) => <Aggregator key={a.id} a={a} onChanged={reload} />)}
    </div>
  );
}

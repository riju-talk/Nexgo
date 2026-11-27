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
  // Reads the courier's newest status for every parcel still on the way, right now (the worker does the same every few minutes).
  const syncTracking = async () => {
    setBusy('sync'); setResult(null);
    try { const r = await apiFetch(`/v1/admin/aggregators/${a.id}/sync-tracking`, { method: 'POST', body: {} }); setResult({ ok: true, message: `Asked ${a.label} about ${r.asked} parcel${r.asked === 1 ? '' : 's'} still on the way: ${r.updated} had news and ${r.updated === 1 ? 'was' : 'were'} updated.` }); }
    catch (e) { setResult({ ok: false, message: e.message || 'The tracking sync could not run' }); } finally { setBusy(''); }
  };
  // Fetches every courier the aggregator offers and adds the missing ones, so they appear in Assign courier & rates and Add courier (safe to repeat).
  const importCouriers = async () => {
    setBusy('import'); setResult(null);
    try { const r = await apiFetch(`/v1/admin/aggregators/${a.id}/import-couriers`, { method: 'POST', body: {} }); setResult({ ok: true, message: `${a.label} offers ${r.offered} courier service${r.offered === 1 ? '' : 's'}: ${r.newServices} added (${r.newProviders} new courier${r.newProviders === 1 ? '' : 's'}), the rest were already there. Give a seller access and a rate card to use them.` }); onChanged(); }
    catch (e) { setResult({ ok: false, message: e.message || 'The couriers could not be fetched' }); } finally { setBusy(''); }
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

      {a.balance && (
        <div role="status" style={{ padding: 12, borderRadius: 10, border: `1px solid ${a.balance.status === 'ok' ? '#BFE3C9' : a.balance.status === 'unknown' ? T.BORDER : '#E5A3A3'}`, background: a.balance.status === 'ok' ? '#F1FAF4' : a.balance.status === 'unknown' ? 'var(--nx-surface-soft)' : '#FDECEC', fontSize: 13, color: T.TEXT }}>
          <b>Wallet with {a.label}: {a.balance.balance === null ? 'unknown' : `₹${Number(a.balance.balance).toLocaleString('en-IN')}`}</b>
          {a.balance.status === 'empty' && <span style={{ color: T.RED }}> · empty: bookings are refused for every seller until it is topped up</span>}
          {a.balance.status === 'low' && <span style={{ color: '#8A5A00' }}> · low (warning below ₹{Number(a.lowBalanceBelow).toLocaleString('en-IN')})</span>}
          {a.balance.status === 'ok' && <span style={{ color: T.GREEN }}> · enough for now</span>}
          {a.balance.message && <div style={{ color: T.TEXT_MUTED, marginTop: 3 }}>{a.balance.message}</div>}
          <div style={{ color: T.TEXT_MUTED, marginTop: 3 }}>This wallet pays for every booking, including test bookings. Top it up in {a.label}&apos;s own dashboard.</div>
        </div>
      )}

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
        {a.capabilities.listServices && a.configured && <Btn disabled={!!busy} onClick={importCouriers}>{busy === 'import' ? 'Fetching couriers…' : 'Fetch couriers'}</Btn>}
        {a.capabilities.track && a.configured && <Btn disabled={!!busy} onClick={syncTracking}>{busy === 'sync' ? 'Syncing…' : 'Sync tracking now'}</Btn>}
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

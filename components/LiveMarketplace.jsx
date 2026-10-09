'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pill, Table, dateTime } from './Kit';

const PROVIDERS = {
  shopify: { api: 'shopify', name: 'Shopify', color: '#5E8E3E', blurb: 'Pull paid and COD orders from your Shopify store and push tracking back to the customer.', urlHint: 'https://your-store.myshopify.com', nameHint: 'e.g. my-store' },
  woo: { api: 'woocommerce', name: 'WooCommerce', color: '#7F54B3', blurb: 'Sync orders from your WordPress / WooCommerce shop using its REST API.', urlHint: 'https://www.your-shop.com', nameHint: 'e.g. my-woo-shop' },
  magento: { api: 'magento', name: 'Magento', color: '#EE672F', blurb: 'Connect Adobe Commerce / Magento and import new orders automatically.', urlHint: 'https://store.your-domain.com', nameHint: 'e.g. magento-main' },
  opencart: { api: 'opencart', name: 'OpenCart', color: '#23A1D1', blurb: 'Import OpenCart orders through its REST extension.', urlHint: 'https://shop.your-domain.com', nameHint: 'e.g. opencart-shop' },
  amazon: { api: 'amazon', name: 'Amazon.in', color: '#FF9900', blurb: 'Bring Amazon seller orders into NEXGO and ship them with your preferred courier.', urlHint: 'https://sellercentral.amazon.in (optional)', nameHint: 'e.g. amazon-in-main' },
};
const STATE = { connected: ['Connected', T.GREEN], disconnected: ['Awaiting authorization', T.AMBER], error: ['Needs attention', T.RED], disabled: ['Disabled', T.TEXT_MUTED] };
const STEPS = [['Connect your store', 'Name it and add the store URL.'], ['Authorize access', 'NEXGO gets read access to orders through the secure provider hand-off.'], ['Orders sync automatically', 'New orders appear in Orders, ready to ship.']];

export default function LiveMarketplace({ id, mobile }) {
  const { showToast, nav } = useAppState();
  const cfg = PROVIDERS[id] || PROVIDERS.shopify;
  const [items, setItems] = useState(null); const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', url: '' }); const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(''); const [syncing, setSyncing] = useState('');

  const load = useCallback(() => apiFetch('/v1/channels').then((x) => { setItems(x.items || []); setError(''); }).catch((e) => { setItems([]); setError(e.status === 401 ? 'Sign in to manage marketplace connections.' : e.message || 'Connections could not be loaded.'); }), []);
  useEffect(() => { load(); }, [load]);

  const mine = (items || []).filter((c) => c.provider === cfg.api);
  const nameOk = form.name.trim().length >= 2; const urlOk = !form.url.trim() || /^https?:\/\/\S+$/i.test(form.url.trim());

  const connect = async (e) => {
    e.preventDefault(); if (!nameOk || !urlOk) return;
    setBusy(true);
    try { await apiFetch('/v1/channels', { method: 'POST', body: { provider: cfg.api, displayName: form.name.trim(), storeUrl: form.url.trim() || undefined } }); setForm({ name: '', url: '' }); showToast(`${cfg.name} store saved. Complete authorization to start syncing.`); load(); }
    catch (x) { showToast(x instanceof ApiError ? (x.status === 409 || /unique|duplicate/i.test(x.message) ? 'A store with this name is already connected.' : x.message) : 'Could not connect this store', 'error'); }
    finally { setBusy(false); }
  };
  const sync = async (c) => { setSyncing(c.id); try { await apiFetch(`/v1/channels/${c.id}/sync`, { method: 'POST' }); showToast(`Sync queued for ${c.display_name}.`); load(); } catch (x) { showToast(x.message || 'Sync could not be queued', 'error'); } finally { setSyncing(''); } };
  const remove = async (c) => { try { await apiFetch(`/v1/channels/${c.id}`, { method: 'DELETE' }); showToast(`${c.display_name} removed`); setConfirm(''); load(); } catch (x) { showToast(x.message || 'Could not remove this store', 'error'); setConfirm(''); } };

  const pad = mobile ? '14px 12px 42px' : '18px 22px 48px';
  return (
    <div style={{ padding: pad }}>
      <section style={{ ...CARD, padding: 20, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', borderLeft: `5px solid ${cfg.color}` }}>
        <span style={{ width: 54, height: 54, borderRadius: 14, background: cfg.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 900 }}>{cfg.name[0]}</span>
        <div style={{ flex: '1 1 320px' }}><b style={{ fontSize: 20, color: T.TEXT }}>{cfg.name} integration</b><p style={{ margin: '5px 0 0', color: T.TEXT_SECONDARY, fontSize: 13.5, lineHeight: 1.5 }}>{cfg.blurb}</p></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{Object.entries(PROVIDERS).filter(([k]) => k !== id).map(([k, p]) => <button key={k} type="button" onClick={() => nav(k)} style={{ height: 30, padding: '0 11px', borderRadius: 99, border: `1px solid ${T.BORDER}`, background: T.SURFACE, color: T.TEXT_SECONDARY, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{p.name}</button>)}</div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,1fr)', gap: 12, margin: '14px 0' }}>
        {STEPS.map(([t, d], i) => <div key={t} style={{ ...CARD, padding: 14, display: 'flex', gap: 11 }}><span style={{ width: 26, height: 26, borderRadius: 13, background: `${BLUE}1a`, color: BLUE, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, flex: '0 0 26px' }}>{i + 1}</span><span><b style={{ color: T.TEXT, fontSize: 13.5 }}>{t}</b><small style={{ display: 'block', marginTop: 3, color: T.TEXT_MUTED, fontSize: 12, lineHeight: 1.45 }}>{d}</small></span></div>)}
      </div>

      <form onSubmit={connect} style={{ ...CARD, padding: 18, marginBottom: 14 }}>
        <b style={{ color: T.TEXT, fontSize: 15 }}>Connect a {cfg.name} store</b>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1.4fr auto', gap: 12, alignItems: 'end' }}>
          <label style={{ fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL }}>Store name <span style={{ color: T.RED }}>*</span><input style={{ ...FIELD, width: '100%', height: 42, marginTop: 6 }} value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={cfg.nameHint} /></label>
          <label style={{ fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL }}>Store URL<input style={{ ...FIELD, width: '100%', height: 42, marginTop: 6, borderColor: urlOk ? T.INPUT_BORDER : T.RED }} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder={cfg.urlHint} inputMode="url" />{!urlOk && <small style={{ color: T.RED }}>Start with https://</small>}</label>
          <Btn primary type="submit" disabled={busy || !nameOk || !urlOk} style={{ height: 42 }}>{busy ? 'Connecting…' : 'Connect store'}</Btn>
        </div>
        <small style={{ display: 'block', marginTop: 10, color: T.TEXT_MUTED }}>Your store credentials are never typed here. Authorization happens through the provider&apos;s secure hand-off.</small>
      </form>

      <section style={{ ...CARD, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.DIVIDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ color: T.TEXT, fontSize: 15 }}>Connected {cfg.name} stores</b><small style={{ color: T.TEXT_MUTED }}>{mine.length} store{mine.length === 1 ? '' : 's'}</small></div>
        <Table loading={items === null} error={error} rows={mine} empty={`No ${cfg.name} stores connected yet. Add one above to start importing orders.`} minWidth={760}
          columns={[
            { h: 'Store', cell: (c) => <b>{c.display_name}</b> },
            { h: 'URL', cell: (c) => (c.store_url ? <a href={c.store_url} target="_blank" rel="noopener noreferrer" style={{ color: BLUE }}>{c.store_url.replace(/^https?:\/\//, '')}</a> : <span style={{ color: T.TEXT_MUTED }}>–</span>) },
            { h: 'Status', cell: (c) => { const [l, col] = STATE[c.state] || [c.state, T.TEXT]; return <span><Pill color={col}>{l}</Pill>{c.last_error && <small style={{ display: 'block', color: T.RED, marginTop: 3, maxWidth: 220, whiteSpace: 'normal' }}>{c.last_error}</small>}</span>; } },
            { h: 'Last sync', cell: (c) => (c.pending_syncs ? <Pill color={BLUE}>Sync queued</Pill> : c.last_synced_at ? dateTime(c.last_synced_at) : <span style={{ color: T.TEXT_MUTED }}>Never</span>) },
            { h: 'Actions', cell: (c) => (
              <span style={{ display: 'inline-flex', gap: 8 }}>
                <Btn small disabled={syncing === c.id || c.pending_syncs > 0} onClick={() => sync(c)}>{syncing === c.id ? 'Queuing…' : '↻ Sync now'}</Btn>
                {confirm === c.id ? <><Btn small danger onClick={() => remove(c)}>Confirm</Btn><Btn small onClick={() => setConfirm('')}>Keep</Btn></> : <Btn small onClick={() => setConfirm(c.id)} style={{ color: T.RED }}>Remove</Btn>}
              </span>) },
          ]} />
      </section>
    </div>
  );
}

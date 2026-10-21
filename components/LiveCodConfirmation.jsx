'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { Btn, CARD, FIELD } from './Kit';

const AREA = 'cod-confirmation';
const CHANNELS = [['custom', 'Custom'], ['shopify', 'Shopify'], ['woocommerce', 'WooCommerce'], ['magento', 'Magento'], ['opencart', 'OpenCart'], ['amazon', 'Amazon.in']];
const messageFor = (brand) => `Hi, CUSTOMER_NAME. Thank you for Shopping with ${brand.trim() || 'COMPANY_OR_BRAND_NAME'}. Your order number is ORDER_NUMBER. Press 1 to confirm the order and 2 to cancel the order.`;

export default function LiveCodConfirmation({ mobile }) {
  const { showToast } = useAppState();
  const [status, setStatus] = useState('Disable'); const [brand, setBrand] = useState('');
  const [channels, setChannels] = useState({}); const [loaded, setLoaded] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    apiFetch(`/v1/settings/${AREA}`).then((x) => {
      if (!live) return;
      const v = x.values || {};
      setStatus(v.status === 'Enable' ? 'Enable' : 'Disable'); setBrand(typeof v.brandName === 'string' ? v.brandName : '');
      setChannels(Object.fromEntries(CHANNELS.map(([k]) => [k, v[`channel_${k}`] === true])));
    }).catch(() => {}).finally(() => live && setLoaded(true));
    return () => { live = false; };
  }, []);
  const [pending, setPending] = useState([]);
  const loadPending = () => apiFetch('/v1/cod-confirmations').then((x) => setPending(x.items || [])).catch(() => {});
  useEffect(() => { loadPending(); }, []);
  // Until a telephony provider is connected, the customer's reply is recorded here by hand.
  const answer = async (id, a) => {
    try { const r = await apiFetch(`/v1/cod-confirmations/${id}/answer`, { method: 'POST', body: { answer: a } }); showToast(r.state === 'declined' ? (r.orderCancelled ? 'Declined: order cancelled' : 'Declined: order already has a courier, cancel it from Track') : r.replay ? 'Already answered' : 'Order confirmed'); loadPending(); }
    catch (err) { showToast(err instanceof ApiError ? err.message : 'Answer could not be saved', 'error'); }
  };
  const submit = async (e) => {
    e.preventDefault();
    if (status === 'Enable' && !brand.trim()) return showToast('Enter the brand name customers will hear', 'error');
    if (status === 'Enable' && !CHANNELS.some(([k]) => channels[k])) return showToast('Select at least one channel', 'error');
    setBusy(true);
    try {
      await apiFetch(`/v1/settings/${AREA}`, { method: 'PUT', body: { status, brandName: brand.trim(), ...Object.fromEntries(CHANNELS.map(([k]) => [`channel_${k}`, !!channels[k]])) } });
      showToast('COD order confirmation saved');
    } catch (err) { showToast(err instanceof ApiError ? err.message : 'Settings could not be saved', 'error'); } finally { setBusy(false); }
  };
  const label = { display: 'grid', gap: 6, color: T.TEXT_LABEL, fontSize: 12.5, fontWeight: 700 };
  return (
    <main style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: '100%' }}>
      <form onSubmit={submit} style={{ ...CARD, padding: 20, display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(280px, 380px) 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ margin: 0, color: T.TEXT, fontSize: 18 }}>COD Order Confirmation</h2>
          <p style={{ margin: '6px 0 0', color: T.TEXT_SECONDARY, fontSize: 13, fontWeight: 650 }}>IVR order confirmation only works for orders received from channels (Shopify, WooCommerce etc.).</p>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <label style={label}>Status<select style={FIELD} value={status} onChange={(e) => setStatus(e.target.value)} disabled={!loaded}><option>Enable</option><option>Disable</option></select></label>
          <label style={label}>Brand name to use<input style={FIELD} value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={60} placeholder="MyBrand" disabled={!loaded} /></label>
          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            <legend style={{ ...label, padding: 0, marginBottom: 8 }}>Select channels to activate this service</legend>
            {CHANNELS.map(([k, name]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 8, background: channels[k] ? 'rgba(27,159,214,.10)' : T.SURFACE_SOFT, color: T.TEXT_LABEL, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={!!channels[k]} onChange={(e) => setChannels((c) => ({ ...c, [k]: e.target.checked }))} style={{ accentColor: T.ACCENT }} />{name}
              </label>
            ))}
          </fieldset>
          <div><Btn primary type="submit" disabled={busy || !loaded}>{busy ? 'Saving…' : 'Submit'}</Btn></div>
        </div>
        <div>
          <div style={{ color: T.TEXT_LABEL, fontSize: 12.5, fontWeight: 700 }}>IVR Message:</div>
          <p style={{ margin: '8px 0 0', color: T.TEXT_SECONDARY, fontSize: 13, lineHeight: 1.6 }}>{messageFor(brand)}</p>
          <p style={{ margin: '14px 0 0', color: T.TEXT_MUTED, fontSize: 12 }}>Your settings are saved now. Calls start once a telephony (IVR) provider is connected to the platform.</p>
        </div>
      </form>
      <div style={{ ...CARD, padding: 20, marginTop: 16 }}>
        <h3 style={{ margin: '0 0 10px', color: T.TEXT, fontSize: 15 }}>Confirmation requests</h3>
        {pending.length === 0 ? <p style={{ margin: 0, color: T.TEXT_MUTED, fontSize: 13 }}>No COD orders have been queued for confirmation yet. New COD orders on the selected channels appear here.</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {pending.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.BORDER}`, fontSize: 13, color: T.TEXT }}>
                <span><b>{c.order_number}</b> · {c.customer_name} · ₹{(c.cod_amount_paise / 100).toLocaleString('en-IN')}</span>
                {c.state === 'pending' ? <span style={{ display: 'flex', gap: 8 }}><Btn small onClick={() => answer(c.id, 'confirm')}>Confirm</Btn><Btn small onClick={() => answer(c.id, 'decline')}>Decline</Btn></span> : <b style={{ color: c.state === 'confirmed' ? T.GREEN : T.RED }}>{c.state === 'confirmed' ? 'Confirmed' : 'Declined'}</b>}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

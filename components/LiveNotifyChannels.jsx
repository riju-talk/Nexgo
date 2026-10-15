'use client';

import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { Btn, CARD, FIELD } from './Kit';

// Templates follow the SMS samples in the QA document.
const TEMPLATES = {
  booked: 'Your order ORDER_NUMBER from BRAND_NAME has been shipped via COURIER_NAME. To track, click here: TRACKING_LINK',
  in_transit: 'Your order ORDER_NUMBER from BRAND_NAME is on its way. To track, click here: TRACKING_LINK',
  out_for_delivery: 'Hi CUSTOMER_NAME, Your order ORDER_NUMBER from BRAND_NAME is out for delivery, keep ORDER_AMOUNT ready with you. To track, click here: TRACKING_LINK',
  delivered: 'Hi CUSTOMER_NAME, Your order ORDER_NUMBER has been delivered. Thanks for shopping with BRAND_NAME.',
  rto: 'Hi CUSTOMER_NAME, Your order ORDER_NUMBER has been returned to BRAND_NAME. Please contact BRAND_NAME for more info. To track, click here: TRACKING_LINK',
  ndr: 'Dear Customer, your order with COURIER_NAME tracking no. AWB_NUMBER was undelivered. To update delivery details click here: TRACKING_LINK',
  custom_order: 'Hi CUSTOMER_NAME, thank you for shopping with BRAND_NAME. Please confirm your order ORDER_NUMBER.',
  channel_order: 'Hi CUSTOMER_NAME, we received your order ORDER_NUMBER from BRAND_NAME. Please verify your details.',
  shipment: 'Your order ORDER_NUMBER from BRAND_NAME is moving: in transit, out for delivery, delivered or returned. Track: TRACKING_LINK',
  abandoned: 'Hi CUSTOMER_NAME, you left items in your cart at BRAND_NAME. Complete your order: CART_LINK',
};
const TABS = {
  whatsapp: { area: 'wa-api', name: 'WhatsApp Notification', title: 'WhatsApp', from: 'Send WhatsApp from:', enable: 'Enable WhatsApp Notifications for:', events: [['custom_order', 'Custom Order', 'Confirmation, Verification'], ['channel_order', 'Channels Order', 'Confirmation, Verification'], ['shipment', 'Shipment', 'In-transit, Out-for-Delivery, Delivered, RTO'], ['abandoned', 'Shopify Abandoned', 'Abandoned Cart'], ['ndr', 'NDR', 'Undelivered Order']], boxed: true },
  sms: { area: 'sms-api', name: 'SMS Notification', title: 'SMS Notifications', from: 'Send SMS from:', enable: 'Enable SMS Notifications for:', events: [['ndr', 'NDR', ''], ['in_transit', 'In Transit', ''], ['booked', 'Booked', ''], ['out_for_delivery', 'Out for Delivery', ''], ['delivered', 'Delivered', ''], ['rto', 'RTO', '']], boxed: false },
};

function Channel({ tab }) {
  const { showToast } = useAppState();
  const c = TABS[tab];
  const [v, setV] = useState({}); const [loaded, setLoaded] = useState(false); const [busy, setBusy] = useState(false); const [open, setOpen] = useState('');
  useEffect(() => {
    let live = true;
    apiFetch(`/v1/settings/${c.area}`).then((x) => live && setV(x.values || {})).catch(() => {}).finally(() => live && setLoaded(true));
    return () => { live = false; };
  }, [c.area]);
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const on = !!v.enabled;
  const save = async () => {
    if (on && !v.useChannelName && !String(v.brandName || '').trim()) return showToast('Use the channel name or enter a brand name', 'error');
    setBusy(true);
    try { await apiFetch(`/v1/settings/${c.area}`, { method: 'PUT', body: v }); showToast(`${c.title} settings saved`); }
    catch (e) { showToast(e instanceof ApiError ? e.message : 'Settings could not be saved', 'error'); } finally { setBusy(false); }
  };
  const brand = String(v.brandName || '').trim() || 'BRAND_NAME';
  return (
    <div style={{ background: T.SURFACE_SOFT, borderRadius: '0 12px 12px 12px', padding: 20, display: 'grid', gap: 16, opacity: loaded ? 1 : .6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <b style={{ color: T.TEXT, fontSize: 14 }}>{c.title}</b>
        <div style={{ textAlign: 'right' }}>
          <button type="button" role="switch" aria-checked={on} aria-label={`${c.title} on or off`} onClick={() => set('enabled', !on)} style={{ width: 40, height: 22, borderRadius: 99, border: 0, background: on ? '#14b861' : '#c5cbd6', position: 'relative', cursor: 'pointer' }}><span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: 99, background: '#fff', transition: 'left .15s' }} /></button>
          <div style={{ fontSize: 12, marginTop: 4, color: on ? '#14b861' : T.RED }}>{on ? 'Enabled' : 'Disabled'}</div>
        </div>
      </div>
      <hr style={{ border: 0, borderTop: `1px dashed ${T.BORDER}`, margin: 0 }} />
      <div style={{ display: 'grid', gap: 10 }}>
        <b style={{ color: T.TEXT, fontSize: 13.5 }}>{c.from}</b>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: T.TEXT_SECONDARY, fontSize: 13 }}><input type="checkbox" checked={!!v.useChannelName} onChange={(e) => set('useChannelName', e.target.checked)} style={{ accentColor: T.ACCENT }} />Use Channel Name (if available)</label>
        <span style={{ color: T.TEXT_SECONDARY, fontSize: 12 }}>OR</span>
        <label style={{ color: T.TEXT_LABEL, fontSize: 13, display: 'grid', gap: 6 }}>Use Brand Name<input style={{ ...FIELD, borderRadius: 99, width: '100%' }} placeholder="Enter your brand name here..." maxLength={40} value={v.brandName || ''} onChange={(e) => set('brandName', e.target.value)} /></label>
      </div>
      <hr style={{ border: 0, borderTop: `1px dashed ${T.BORDER}`, margin: 0 }} />
      <div style={{ display: 'grid', gap: 8 }}>
        <b style={{ color: T.TEXT, fontSize: 13.5 }}>{c.enable}</b>
        {c.events.map(([key, name, sub]) => {
          const field = `ev_${key}`; const expanded = open === key;
          return (
            <div key={key} style={{ background: T.SURFACE, borderRadius: 10, padding: '10px 14px', border: `1px solid ${T.BORDER}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" aria-label={name} checked={!!v[field]} onChange={(e) => set(field, e.target.checked)} style={{ width: 16, height: 16, accentColor: '#14b861' }} />
                <span style={{ flex: 1, color: T.TEXT, fontSize: 13.5, fontWeight: c.boxed ? 700 : 500 }}>{name}{sub && <small style={{ display: 'block', color: T.TEXT_MUTED, fontWeight: 400, marginTop: 2 }}>({sub})</small>}</span>
                <button type="button" aria-expanded={expanded} aria-label={`Preview ${name} message`} onClick={() => setOpen(expanded ? '' : key)} style={{ border: 0, background: 'none', cursor: 'pointer', color: T.TEXT_MUTED, fontSize: 14 }}>{expanded ? '⌃' : '⌄'}</button>
              </div>
              {expanded && <p style={{ margin: '10px 0 0 26px', color: T.TEXT_SECONDARY, fontSize: 12.5, lineHeight: 1.55 }}>{TEMPLATES[key].replaceAll('BRAND_NAME', brand)}</p>}
            </div>
          );
        })}
      </div>
      <div><Btn primary disabled={busy || !loaded} onClick={save}>{busy ? 'Saving…' : 'Update'}</Btn></div>
      <p style={{ margin: 0, color: T.TEXT_MUTED, fontSize: 12 }}>Settings are saved now. Messages start going out once a {tab === 'whatsapp' ? 'WhatsApp Business' : 'DLT-registered SMS'} provider is connected.</p>
    </div>
  );
}

export default function LiveNotifyChannels({ initialTab = 'whatsapp', mobile }) {
  const { nav } = useAppState();
  const [tab, setTab] = useState(initialTab);
  const go = (t) => { setTab(t); nav(t === 'whatsapp' ? 'wa-api' : 'sms-api'); };
  return (
    <main style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: 560 }}>
      <div style={{ display: 'flex', gap: 4 }} role="tablist">
        {Object.entries(TABS).map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => go(k)} style={{ padding: '11px 18px', border: 0, borderRadius: '10px 10px 0 0', cursor: 'pointer', fontSize: 13.5, fontWeight: 650, background: tab === k ? T.NAVY : T.SURFACE_SOFT, color: tab === k ? '#fff' : T.TEXT_SECONDARY }}>{t.name}</button>
        ))}
      </div>
      <div style={{ ...CARD, border: 0, background: 'transparent' }}><Channel key={tab} tab={tab} /></div>
    </main>
  );
}

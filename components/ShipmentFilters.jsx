'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import * as T from '@/lib/theme';
import { Btn, FIELD } from './Kit';

export const EMPTY_FILTERS = { from: '', to: '', orderIds: '', q: '', awbs: '', product: '', channel: '', orderType: '', whatsapp: '', courier: '', warehouse: '' };

const CHANNELS = [['single', 'Single created'], ['bulk_upload', 'Bulk upload'], ['shopify', 'Shopify'], ['amazon', 'Amazon'], ['woocommerce', 'WooCommerce'], ['opencart', 'OpenCart'], ['magento', 'Magento']];
const TYPES = [['forward', 'Forward'], ['reverse', 'Reverse'], ['dropship', 'Dropship'], ['ship_now', 'Ship now']];
const WHATSAPP = [['not_sent', 'Not sent'], ['sent', 'Sent'], ['delivered', 'Delivered'], ['read', 'Read'], ['failed', 'Failed']];
const LABEL = { display: 'block', fontSize: 11.5, fontWeight: 700, color: T.TEXT_LABEL };

// Query-string parameters for the NDR / RTO list endpoints (blank values are left out).
export function filterParams(filters, params = new URLSearchParams()) {
  Object.entries(filters).forEach(([k, v]) => { if (String(v || '').trim()) params.set(k, String(v).trim()); });
  return params;
}

// Shiprocket-style filter panel shared by the NDR and RTO boards. Edits are drafted locally and only applied on "Apply".
// Mount it with a `key` that changes when the applied filters change, so the draft resets to them.
export default function ShipmentFilters({ value, onApply, couriers = [], mobile }) {
  const [draft, setDraft] = useState(value);
  const [warehouses, setWarehouses] = useState([]);
  useEffect(() => { apiFetch('/v1/warehouses').then((x) => setWarehouses((x.items || []).filter((w) => w.is_active !== false))).catch(() => {}); }, []);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const field = (k, label, props = {}) => <label style={LABEL}>{label}<input style={{ ...FIELD, width: '100%', marginTop: 5 }} value={draft[k]} onChange={set(k)} {...props} /></label>;
  const select = (k, label, options, all = 'All') => <label style={LABEL}>{label}<select style={{ ...FIELD, width: '100%', marginTop: 5 }} value={draft[k]} onChange={set(k)}><option value="">{all}</option>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>;
  const apply = (e) => { e?.preventDefault(); onApply(draft); };
  const clear = () => { setDraft(EMPTY_FILTERS); onApply(EMPTY_FILTERS); };

  return (
    <form onSubmit={apply} style={{ padding: '4px 14px 14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(5,minmax(0,1fr))', gap: 12, alignItems: 'end' }}>
        <label style={LABEL}>From date<input type="date" style={{ ...FIELD, width: '100%', marginTop: 5 }} value={draft.from} max={draft.to || undefined} onChange={set('from')} /></label>
        <label style={LABEL}>To date<input type="date" style={{ ...FIELD, width: '100%', marginTop: 5 }} value={draft.to} min={draft.from || undefined} onChange={set('to')} /></label>
        {field('orderIds', 'Order ID(s)', { placeholder: 'Separated by comma' })}
        {field('q', 'Search query', { placeholder: 'Name, phone, AWB, order…' })}
        {field('awbs', 'AWB No(s)', { placeholder: 'Separated by comma' })}
        {field('product', 'Product name', { placeholder: 'Product name to search' })}
        {select('channel', 'Channel', CHANNELS, 'All channels')}
        {select('orderType', 'Type', TYPES)}
        {select('whatsapp', 'WhatsApp status', WHATSAPP)}
        {select('courier', 'Courier', couriers.map((c) => [c.code, c.name]), 'All couriers')}
        {select('warehouse', 'Warehouse', warehouses.map((w) => [w.id, w.name]), 'All warehouses')}
        <div style={{ display: 'flex', gap: 8 }}><Btn primary type="submit">Apply</Btn><Btn onClick={clear}>Clear</Btn></div>
      </div>
    </form>
  );
}

'use client';

import { assignInBatches } from '@/lib/assignBatches';
import { useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError, bookingErrorToast, isFundsMessage } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { Btn } from './Kit';

const CARD = { background: 'var(--nx-surface)', border: '1px solid var(--nx-border)', borderRadius: 12, boxShadow: '0 1px 2px rgba(20,44,66,.04), 0 10px 28px rgba(20,44,66,.055)' };
const inr = (rupees) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(rupees || 0));
const days = (t) => (t.minDays === t.maxDays ? `${t.minDays} day${t.minDays === 1 ? '' : 's'}` : `${t.minDays}–${t.maxDays} days`);

// Assigns couriers in small parallel batches (lib/assignBatches.js): each order is a live booking call of several seconds, and a request
// that runs longer than 60 seconds is cut off by the proxy. `courier` = { providerCode, serviceCode? } books every order with that courier
// only; without it the seller's priority list decides.
export async function assignCouriers(orderIds, showToast, reload, courier) {
  const results = await assignInBatches(orderIds, { courier, onProgress: (n, total) => { if (total > 3) showToast(`Assigning couriers… ${n} of ${total}`); } });
  const assigned = results.filter((r) => r.ok).length; const failed = results.length - assigned;
  const firstError = results.find((x) => !x.ok)?.error || '';
  showToast(failed ? `${assigned} assigned, ${failed} not assigned: ${firstError}` : `${assigned} order${assigned === 1 ? '' : 's'} assigned to a courier`, failed ? 'error' : 'success', failed && isFundsMessage(firstError) ? 8000 : undefined);
  await reload();
}

// Shown on Track while a queued assignment batch is still being booked in the background (also after a page refresh).
export function ActiveAssignBanner({ onFinished }) {
  const [batch, setBatch] = useState(null);
  const had = useRef(false);
  useEffect(() => {
    let live = true; let timer;
    const tick = async () => {
      try {
        const r = await apiFetch('/v1/shipments/assign-batch/active');
        if (!live) return;
        if (had.current && !r.batch) onFinished?.(); // it just finished: refresh the list
        had.current = !!r.batch;
        setBatch(r.batch);
      } catch { /* the next poll tries again */ }
      if (live) timer = setTimeout(tick, 3000);
    };
    tick();
    return () => { live = false; clearTimeout(timer); };
  }, [onFinished]);
  if (!batch) return null;
  const done = batch.assigned + batch.failed;
  return (
    <div role="status" style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: '#EAF1FF', border: '1px solid #BBD0FF', color: '#1E3A8A', fontSize: 13, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <b>Assigning couriers in the background</b>
      <span>{done} of {batch.total} done{batch.failed ? ` · ${batch.failed} could not be assigned` : ''}. You can keep working or leave this page.</span>
      <span style={{ flex: '0 0 120px', height: 6, borderRadius: 3, background: '#D4E2FF' }}><span style={{ display: 'block', height: '100%', width: `${Math.round((done / batch.total) * 100)}%`, borderRadius: 3, background: '#3877fc' }} /></span>
    </div>
  );
}

const Overlay = ({ onClose, children }) => (
  <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(11,31,68,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: 'min(720px, 100%)', maxHeight: '88vh', overflow: 'auto', padding: 20 }}>{children}</div>
  </div>
);

// One order: live rates for its own lane, the seller picks. Nothing is pre-selected.
function SingleOrder({ order, onClose, onDone }) {
  const { showToast } = useAppState();
  const [state, setState] = useState({ loading: true, quotes: [], unavailable: [], error: '' });
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    apiFetch('/v1/shipping/quotes', { method: 'POST', body: {
      destinationPincode: order.customer_pincode, ...(order.warehouse_pincode ? { pickupPincode: order.warehouse_pincode } : {}),
      orderValue: Number(order.subtotal_paise || 0) / 100, weightG: Math.max(1, Number(order.total_weight_g) || 1), paymentMode: order.payment_mode,
      ...(order.package_length_mm && order.package_width_mm && order.package_height_mm ? { lengthMm: order.package_length_mm, widthMm: order.package_width_mm, heightMm: order.package_height_mm } : {}),
    } })
      .then((x) => live && setState({ loading: false, quotes: x.quotes || [], unavailable: x.unavailable || [], error: (x.quotes || []).length ? '' : 'No courier can take this order for this pincode, weight and payment mode.' }))
      .catch((e) => live && setState({ loading: false, quotes: [], unavailable: [], error: e instanceof ApiError ? e.message : 'Courier rates could not be loaded.' }));
    return () => { live = false; };
  }, [order]);

  const chosen = state.quotes.find((q) => `${q.provider.code}:${q.service.code}` === pick);
  const book = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/orders/${order.id}/state`, { method: 'PATCH', body: { state: 'ready_to_ship' } }).catch(() => {}); // already ready is fine
      const r = await apiFetch('/v1/shipments/book', { method: 'POST', headers: { 'Idempotency-Key': `book-${order.id}-${chosen.provider.code}-${chosen.service.code}` }, body: { orderId: order.id, providerCode: chosen.provider.code, serviceCode: chosen.service.code } });
      showToast(`Booked with ${chosen.provider.name}${r?.shipment?.awb ? ` · AWB ${r.shipment.awb}` : ''}`);
      onDone();
    } catch (e) {
      const reason = e instanceof ApiError ? e.message : 'Booking failed';
      bookingErrorToast(e instanceof ApiError ? e : new Error(reason), showToast);
      // 422 = this courier cannot take this parcel: move it to the "not available" list with the reason, so it is not tried again.
      if (e instanceof ApiError && e.status === 422) {
        setState((s) => ({ ...s, quotes: s.quotes.filter((q) => q !== chosen), unavailable: [...s.unavailable, { ...chosen, reason }], refusal: `${chosen.provider.name} ${chosen.service.name} could not take this parcel. ${reason}${/choose another courier.?$/i.test(reason) ? "" : " Choose another courier."}` }));
        setPick('');
      }
    } finally { setBusy(false); }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <b style={{ fontSize: 16, color: T.TEXT }}>Choose a courier</b>
          <div style={{ fontSize: 12.5, color: T.TEXT_MUTED, marginTop: 3 }}>{order.order_number} · {order.customer_city || ''} {order.customer_pincode} · {(Number(order.total_weight_g) / 1000).toFixed(2)} kg · {order.payment_mode === 'cod' ? 'COD' : 'Prepaid'}{order.warehouse_name ? ` · from ${order.warehouse_name}` : ''}</div>
        </div>
        <Btn small onClick={onClose}>Close</Btn>
      </div>
      {state.loading && <div style={{ padding: 22, textAlign: 'center', fontSize: 13, color: T.TEXT_MUTED }}>Fetching live courier rates…</div>}
      {state.error && <div style={{ marginTop: 14, padding: 12, fontSize: 13, color: T.RED, border: `1px dashed ${T.BORDER}`, borderRadius: 9 }}>{state.error}</div>}
      {state.refusal && <div role="alert" style={{ marginTop: 14, padding: 12, fontSize: 13, color: T.RED, border: `1px solid ${T.RED}`, borderRadius: 9, lineHeight: 1.45 }}>{state.refusal}</div>}
      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        {state.quotes.map((q) => {
          const key = `${q.provider.code}:${q.service.code}`; const on = pick === key;
          return (
            <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${on ? T.NAVY : T.BORDER}`, background: on ? 'rgba(56,119,252,.09)' : T.SURFACE }}>
              <input type="radio" name="courier" checked={on} onChange={() => setPick(key)} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 13.5, color: T.TEXT }}>{q.provider.name} <span style={{ fontWeight: 500, color: T.TEXT_SECONDARY }}>{q.service.name.replace(new RegExp(`^${q.provider.name}\\s*`, 'i'), '') || 'Standard'}</span></b>
                <small style={{ color: T.TEXT_MUTED }}>{days(q.tat)} · {q.service.type === 'air' || q.service.type === 'express' ? 'Air' : 'Surface'}{q.tags?.includes('cheapest') ? ' · Cheapest' : ''}{q.tags?.includes('fastest') ? ' · Fastest' : ''}{order.payment_mode === 'cod' && q.price.codFee ? ` · COD fee ${inr(q.price.codFee)}` : ''}</small>
              </span>
              <span style={{ textAlign: 'right' }}><b style={{ fontSize: 14.5, color: T.TEXT }}>{inr(q.price.total)}</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>+ {inr(q.price.gst)} GST</small></span>
            </label>
          );
        })}
      </div>
      {state.unavailable.length > 0 && (
        <details style={{ marginTop: 12, fontSize: 12.5, color: T.TEXT_SECONDARY }}>
          <summary style={{ cursor: 'pointer' }}>{state.unavailable.length} courier{state.unavailable.length === 1 ? '' : 's'} not available for this order</summary>
          {state.unavailable.map((u, i) => <div key={i} style={{ marginTop: 5 }}><b style={{ color: T.TEXT }}>{u.provider.name} {u.service.name}</b>: {u.reason}</div>)}
        </details>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <Btn primary loading={busy} disabled={!chosen} onClick={book}>{busy ? 'Booking…' : chosen ? `Book with ${chosen.provider.name} · ${inr(chosen.price.total)}` : 'Select a courier to book'}</Btn>
        <Btn loading={busy} onClick={async () => { setBusy(true); await assignCouriers([order.id], showToast, async () => onDone()); setBusy(false); }}>Let NEXGO pick by my courier priority</Btn>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: T.TEXT_MUTED }}>Booking charges your wallet the freight shown (GST is invoiced separately) and creates the AWB.</div>
    </>
  );
}

// Several orders: either the seller's own priority list (Settings > Courier rules) or one courier the seller picks for all of them.
function ManyOrders({ orders, onClose, onDone }) {
  const { showToast, nav } = useAppState();
  const [options, setOptions] = useState(null);
  const [mode, setMode] = useState('auto');
  const [courier, setCourier] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; apiFetch('/v1/shipping/courier-options').then((x) => live && setOptions(x.items || [])).catch(() => live && setOptions([])); return () => { live = false; }; }, []);

  const go = async () => {
    const [providerCode, serviceCode] = courier.split(':');
    if (mode === 'one' && !providerCode) return showToast('Choose the courier to use.', 'error');
    setBusy(true);
    await assignCouriers(orders.map((o) => o.id), showToast, async () => onDone(), mode === 'one' ? { providerCode, serviceCode } : undefined);
    setBusy(false);
  };
  const row = (id, label, hint) => (
    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${mode === id ? T.NAVY : T.BORDER}`, background: mode === id ? 'rgba(56,119,252,.09)' : T.SURFACE }}>
      <input type="radio" name="assign-mode" checked={mode === id} onChange={() => setMode(id)} style={{ marginTop: 3 }} />
      <span><b style={{ display: 'block', fontSize: 13.5, color: T.TEXT }}>{label}</b><small style={{ color: T.TEXT_MUTED, lineHeight: 1.5 }}>{hint}</small></span>
    </label>
  );
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div><b style={{ fontSize: 16, color: T.TEXT }}>Assign a courier to {orders.length} order{orders.length === 1 ? '' : 's'}</b><div style={{ fontSize: 12.5, color: T.TEXT_MUTED, marginTop: 3 }}>Choose how couriers are picked. Orders the courier cannot take stay in Ready to ship with the reason.</div></div>
        <Btn small onClick={onClose}>Close</Btn>
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        {row('auto', 'Automatic: use my courier priority', 'Each order gets the first courier in your priority list (Settings > Courier rules) that can ship it.')}
        {row('one', 'One courier for all selected orders', 'You pick the courier. Nothing else is tried for these orders.')}
      </div>
      {mode === 'auto' && <button type="button" onClick={() => nav('courier-rules')} style={{ marginTop: 8, border: 0, background: 'transparent', color: T.ACCENT, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>Review my courier priority</button>}
      {mode === 'one' && (
        <div style={{ marginTop: 12 }}>
          <select aria-label="Courier" value={courier} onChange={(e) => setCourier(e.target.value)} style={{ height: 38, width: '100%', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, color: T.TEXT, padding: '0 10px', fontSize: 13 }}>
            <option value="">{options === null ? 'Loading your couriers…' : options.length ? 'Select a courier' : 'No courier is enabled for your account'}</option>
            {(options || []).map((o) => <option key={`${o.code}:${o.service_code}`} value={`${o.code}:${o.service_code}`}>{o.name} · {o.display_name}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Btn primary loading={busy} disabled={mode === 'one' && !courier} onClick={go}>{busy ? 'Assigning…' : `Assign ${orders.length} order${orders.length === 1 ? '' : 's'}`}</Btn>
        <Btn disabled={busy} onClick={onClose}>Cancel</Btn>
      </div>
    </>
  );
}

// `orders` = the not-yet-shipped rows from Track. One order opens the live rate chooser, several open the assignment options.
export default function CourierChooser({ orders, onClose, onDone }) {
  if (!orders?.length) return null;
  return <Overlay onClose={onClose}>{orders.length === 1 ? <SingleOrder order={orders[0]} onClose={onClose} onDone={onDone} /> : <ManyOrders orders={orders} onClose={onClose} onDone={onDone} />}</Overlay>;
}

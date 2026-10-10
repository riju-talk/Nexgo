'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const FIELD = { width: '100%', height: 40, boxSizing: 'border-box', border: '1px solid var(--nx-input-border)', borderRadius: 8, background: T.SURFACE, color: T.TEXT, padding: '0 11px', fontSize: 13.5 };
const CARD = { background: 'var(--nx-surface)', border: '1px solid var(--nx-border)', borderRadius: 10, padding: 18, boxShadow: '0 1px 2px rgba(20,44,66,.04), 0 8px 24px rgba(20,44,66,.045)' };
const PREFIX = { forward: 'WEB', reverse: 'RET', dropship: 'DS', ship_now: 'NOW' };
// Must match backend lib/money.ts VOLUMETRIC_DIVISOR: grams = L×W×H (mm³) / 5000.
const VOLUMETRIC_DIVISOR = 5000;

const newOrderNumber = (flow) => `${PREFIX[flow] || 'WEB'}-${Date.now().toString().slice(-6)}`;
const toPaise = (rupees) => Math.round((Number(rupees) || 0) * 100);
const inr = (paise) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const blankItem = () => ({ key: Math.random().toString(36).slice(2), productId: '', sku: '', name: '', hsn: '', quantity: '1', price: '', weight: '' });
const MAX_PRODUCTS = 5; // hard cap, same as the API, the database and bulk upload
const EMPTY_CHARGES = { shipping: '', giftWrap: '', transaction: '', other: '', discount: '', taxPercent: '' };

function Section({ title, hint, children, aside }) {
  return (
    <div style={CARD}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div><b style={{ color: T.TEXT, fontSize: 15 }}>{title}</b>{hint && <span style={{ display: 'block', marginTop: 4, color: T.TEXT_MUTED, fontSize: 12.5 }}>{hint}</span>}</div>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, note, noteTone, children }) {
  return (
    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL }}>
      {label}{required && <span style={{ color: T.RED }}> *</span>}
      <div style={{ marginTop: 6 }}>{children}</div>
      {note && <small style={{ display: 'block', marginTop: 4, color: noteTone === 'ok' ? T.GREEN : T.TEXT_MUTED, fontSize: 11 }}>{note}</small>}
    </label>
  );
}

function Grid({ cols, children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 13 }}>{children}</div>;
}

function SummaryRow({ label, value, strong, tone }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: strong ? 14.5 : 13, fontWeight: strong ? 780 : 500, color: tone === 'minus' ? T.GREEN : strong ? T.TEXT : T.TEXT_SECONDARY }}>
      <span>{label}</span><span>{tone === 'minus' ? `− ${value}` : value}</span>
    </div>
  );
}

export default function LiveCreateOrder({ mobile, flow = 'forward', embedded = false }) {
  const { nav, showToast } = useAppState();
  const isReverse = flow === 'reverse';
  const [setup, setSetup] = useState(null);
  const [busy, setBusy] = useState(false);
  const [orderNumber, setOrderNumber] = useState(() => newOrderNumber(flow));
  const [warehouseId, setWarehouseId] = useState('');
  const [paymentMode, setPaymentMode] = useState('prepaid');
  const [customer, setCustomer] = useState({ fullName: '', companyName: '', phone: '', alternatePhone: '', email: '', address: '', address2: '', landmark: '', pincode: '', city: '', state: '' });
  const [located, setLocated] = useState('');
  const [pinInfo, setPinInfo] = useState({ pin: '', info: null });
  const [items, setItems] = useState(() => [blankItem()]);
  const [charges, setCharges] = useState(EMPTY_CHARGES);
  const [pkg, setPkg] = useState({ weightKg: '', length: '', width: '', height: '' });
  // After "Create order": the order exists and the serviceable couriers are listed under the button to pick one and book.
  const [placed, setPlaced] = useState(null); // { id, orderNumber }
  const [offer, setOffer] = useState({ loading: false, quotes: [], error: '' });
  const [pick, setPick] = useState('');
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch('/v1/warehouses'), apiFetch('/v1/products')])
      .then(([w, p]) => {
        const active = (w.items || []).filter((x) => x.is_active !== false);
        setSetup({ warehouses: active, products: p.items || [] });
        setWarehouseId((active.find((x) => x.is_default) || active[0])?.id || '');
        // A courier picked in Rate calculator / Pincode serviceability arrives here pre-filled.
        try {
          const raw = window.sessionStorage.getItem('nx-order-prefill');
          if (raw) {
            window.sessionStorage.removeItem('nx-order-prefill');
            const pre = JSON.parse(raw);
            if (pre.pincode) setCustomer((c) => ({ ...c, pincode: pre.pincode }));
            if (pre.weightKg) setPkg((k) => ({ ...k, weightKg: String(pre.weightKg) }));
            if (pre.paymentMode) setPaymentMode(pre.paymentMode);
          }
        } catch { /* prefill is optional */ }
      })
      .catch(() => setSetup({ warehouses: [], products: [] }));
  }, []);

  const warehouses = setup?.warehouses || [];
  const warehouse = warehouses.find((w) => w.id === warehouseId) || null;

  // Pincode → city/state, debounced; only fills while the user is still on that pincode.
  useEffect(() => {
    if (!/^\d{6}$/.test(customer.pincode)) return;
    const pin = customer.pincode;
    const timer = window.setTimeout(() => apiFetch(`/v1/locations/pincode/${pin}`)
      .then((x) => { setCustomer((c) => (c.pincode === pin ? { ...c, city: x.city, state: x.state } : c)); setLocated(pin); setPinInfo({ pin, info: x }); })
      .catch(() => setPinInfo({ pin, info: null })), 220);
    return () => window.clearTimeout(timer);
  }, [customer.pincode]);

  // Money in integer paise, computed exactly as the API does (routes/operations.ts orderTotals).
  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * toPaise(i.price), 0);
    if (isReverse) return { subtotal, taxRateBps: 0, tax: 0, shipping: 0, giftWrap: 0, transaction: 0, other: 0, discount: 0, gross: subtotal, total: subtotal };
    const taxRateBps = Math.round((Number(charges.taxPercent) || 0) * 100);
    const tax = Math.round((subtotal * taxRateBps) / 10_000);
    const lines = { shipping: toPaise(charges.shipping), giftWrap: toPaise(charges.giftWrap), transaction: toPaise(charges.transaction), other: toPaise(charges.other), discount: toPaise(charges.discount) };
    const gross = subtotal + tax + lines.shipping + lines.giftWrap + lines.transaction + lines.other;
    return { subtotal, taxRateBps, tax, ...lines, gross, total: gross - lines.discount };
  }, [items, charges, isReverse]);

  const itemWeightG = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.weight) || 0), 0);
  const deadWeightG = pkg.weightKg !== '' ? Math.round(Number(pkg.weightKg) * 1000) : itemWeightG;
  const dims = [pkg.length, pkg.width, pkg.height].map((v) => Math.round((Number(v) || 0) * 10));
  const hasDims = dims.every((d) => d > 0);
  const volumetricG = hasDims ? Math.ceil((dims[0] * dims[1] * dims[2]) / VOLUMETRIC_DIVISOR) : 0;
  const chargeableG = Math.max(deadWeightG, volumetricG);

  const quoteMode = isReverse ? 'prepaid' : paymentMode;
  const pinStatus = !/^\d{6}$/.test(customer.pincode) ? 'idle' : pinInfo.pin === customer.pincode ? (pinInfo.info ? 'found' : 'missing') : 'loading';

  const setCust = (k) => (e) => setCustomer({ ...customer, [k]: k === 'pincode' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value });
  const setCharge = (k) => (e) => setCharges({ ...charges, [k]: e.target.value });
  const setPack = (k) => (e) => setPkg({ ...pkg, [k]: e.target.value });
  const setItem = (key, k) => (e) => {
    const value = e.target.value;
    setItems((list) => list.map((item) => {
      if (item.key !== key) return item;
      const next = { ...item, [k]: value };
      if (k === 'sku') {
        const match = setup?.products?.find((p) => p.sku?.toLowerCase() === value.trim().toLowerCase());
        next.productId = match?.id || '';
        if (match) Object.assign(next, { name: match.name, hsn: match.hsn_code || next.hsn, price: (Number(match.unit_price_paise) / 100).toFixed(2), weight: match.weight_g ? String(match.weight_g) : next.weight });
      }
      return next;
    }));
  };
  const addItem = () => setItems((list) => {
    if (list.length >= MAX_PRODUCTS) { showToast(`An order can contain at most ${MAX_PRODUCTS} products.`, 'error'); return list; }
    return [...list, blankItem()];
  });
  const removeItem = (key) => setItems((list) => (list.length > 1 ? list.filter((i) => i.key !== key) : list));

  const submit = async (e) => {
    e?.preventDefault();
    if (!warehouse) return showToast('Select the pickup warehouse first.', 'error');
    if (totals.discount > totals.gross) return showToast('Discount cannot exceed the order value.', 'error');
    if (quoteMode === 'cod' && totals.total <= 0) return showToast('COD orders need a value to collect.', 'error');
    if (!hasDims) return showToast('Length, breadth and height are required.', 'error');
    if (deadWeightG <= 0) return showToast('Enter the package weight.', 'error');
    setBusy(true);
    try {
      const c = customer;
      const opt = (v) => (v.trim() ? v.trim() : undefined);
      const created = await apiFetch('/v1/orders', { method: 'POST', body: {
        warehouseId: warehouse.id, orderNumber: orderNumber.trim(), orderFlow: flow,
        paymentMode: quoteMode, codAmountPaise: quoteMode === 'cod' ? totals.total : 0,
        customer: { fullName: c.fullName.trim(), companyName: opt(c.companyName), phone: c.phone.trim(), alternatePhone: opt(c.alternatePhone), email: opt(c.email), addressLine1: c.address.trim(), addressLine2: opt(c.address2), landmark: opt(c.landmark), city: c.city.trim(), state: c.state.trim(), pincode: c.pincode },
        items: items.map((i) => ({ productId: i.productId || undefined, sku: i.sku.trim() || 'CUSTOM', name: i.name.trim(), hsnCode: opt(i.hsn), quantity: Number(i.quantity), unitPricePaise: toPaise(i.price), weightG: Math.round(Number(i.weight) || 0) })),
        package: { weightG: deadWeightG, lengthMm: dims[0], widthMm: dims[1], heightMm: dims[2] },
        charges: isReverse ? {} : { shippingPaise: totals.shipping, giftWrapPaise: totals.giftWrap, transactionPaise: totals.transaction, otherPaise: totals.other, discountPaise: totals.discount, taxRateBps: totals.taxRateBps },
      } });
      if (isReverse) { showToast('Return pickup created. Book a courier from All orders.'); nav('orders'); return; }
      setPlaced({ id: created.id, orderNumber: orderNumber.trim() });
      showToast('Order created. Choose a courier below.');
      setOffer({ loading: true, quotes: [], error: '' });
      try {
        const [res, rules] = await Promise.all([
          apiFetch('/v1/shipping/quotes', { method: 'POST', body: { destinationPincode: customer.pincode.trim(), pickupPincode: warehouse.pincode, orderValue: Math.max(totals.total, 0) / 100, weightG: deadWeightG, paymentMode: quoteMode, lengthMm: dims[0], widthMm: dims[1], heightMm: dims[2] } }),
          apiFetch('/v1/settings/courier-rules').then((x) => x.values || {}).catch(() => ({})),
        ]);
        const quotes = res.quotes || [];
        // Pre-select by the seller's courier priority (Settings > Courier rules), else the cheapest.
        const order = [1, 2, 3, 4, 5, 6].map((n) => String(rules[`priority${n}`] || '').toLowerCase().replace(/[^a-z]/g, '')).filter((x) => x && x !== 'notset');
        const rank = (q) => { const k = q.provider.name.toLowerCase().replace(/[^a-z]/g, ''); const i = order.findIndex((o) => k.includes(o) || (o === 'xb' && k.includes('xpressbees'))); return i < 0 ? order.length : i; };
        const best = [...quotes].sort((a, b) => rank(a) - rank(b) || a.price.total - b.price.total)[0];
        setOffer({ loading: false, quotes, error: quotes.length ? '' : 'No courier is available for this pincode, weight and payment mode.' });
        if (best) setPick(`${best.provider.code}:${best.service.code}`);
      } catch (y) { setOffer({ loading: false, quotes: [], error: y instanceof ApiError ? y.message : 'Courier rates could not be loaded.' }); }
    } catch (x) {
      showToast(x instanceof ApiError ? x.message : 'Unable to create order', 'error');
    } finally {
      setBusy(false);
    }
  };

  const bookCourier = async () => {
    const q = offer.quotes.find((x) => `${x.provider.code}:${x.service.code}` === pick);
    if (!q || !placed) return;
    setBooking(true);
    try {
      await apiFetch(`/v1/orders/${placed.id}/state`, { method: 'PATCH', body: { state: 'ready_to_ship' } }).catch(() => {}); // already ready is fine
      await apiFetch('/v1/shipments/book', { method: 'POST', headers: { 'Idempotency-Key': `book-${placed.id}-${q.provider.code}-${q.service.code}` }, body: { orderId: placed.id, providerCode: q.provider.code, serviceCode: q.service.code } });
      showToast(`Booked with ${q.provider.name}. Find it in Track.`);
      nav('shipments');
    } catch (x) { showToast(x instanceof ApiError ? x.message : 'Booking failed', 'error'); } finally { setBooking(false); }
  };

  const two = mobile ? '1fr' : '1fr 1fr';
  const three = mobile ? '1fr' : 'repeat(3, minmax(0,1fr))';
  const input = (value, onChange, props = {}) => <input value={value} onChange={onChange} style={FIELD} {...props} />;
  const money = (value, onChange) => input(value, onChange, { type: 'number', min: 0, step: '0.01', inputMode: 'decimal', placeholder: '0.00' });

  return (
    <form onSubmit={submit} style={{ padding: embedded ? 0 : mobile ? '14px 12px 42px' : '18px 28px 48px', display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
        <Section title={isReverse ? '1. Return to warehouse' : '1. Pickup warehouse'} hint="Courier rates and delivery times depend on where the parcel is picked up, so choose this first.">
          {setup === null ? <span style={{ fontSize: 12.5, color: T.TEXT_MUTED }}>Loading warehouses…</span> : !warehouses.length ? (
            <button type="button" onClick={() => nav('warehouse')} style={{ ...FIELD, cursor: 'pointer', fontWeight: 700, maxWidth: 320 }}>Add a warehouse first</button>
          ) : (
            <Grid cols={two}>
              <Field label="Pickup warehouse" required>
                <select required value={warehouseId} onChange={(e) => (e.target.value === '__add' ? nav('warehouse') : setWarehouseId(e.target.value))} style={FIELD}><option value="" disabled>Select a warehouse</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}<option value="__add">+ Add a warehouse</option></select>
                              </Field>
              <div style={{ alignSelf: 'end', paddingBottom: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', color: T.TEXT_SECONDARY, fontSize: 12.5 }}><button type="button" onClick={() => nav('warehouse')} style={{ height: 34, padding: '0 12px', borderRadius: 8, border: `1px solid ${T.ACCENT}`, background: T.SURFACE, color: T.ACCENT, fontWeight: 750, fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add a warehouse</button><span>{warehouse ? <>{warehouse.address_line_1}, {warehouse.city} · <b style={{ color: T.TEXT }}>{warehouse.pincode}</b></> : <span style={{ color: T.AMBER }}>Select a warehouse to see courier rates.</span>}</span></div>
            </Grid>
          )}
        </Section>

        <Section title={isReverse ? 'Return details' : 'Order information'} hint={isReverse ? 'Return pickups are prepaid — no COD is collected.' : 'Identify the order and how the customer pays.'}>
          <Grid cols={two}>
            <Field label="Order ID" required>
              <div style={{ display: 'flex', gap: 8 }}>
                {input(orderNumber, (e) => setOrderNumber(e.target.value), { required: true, maxLength: 100 })}
                <button type="button" onClick={() => setOrderNumber(newOrderNumber(flow))} style={{ ...FIELD, width: 'auto', padding: '0 12px', cursor: 'pointer', fontWeight: 700 }}>Generate</button>
              </div>
            </Field>
            {!isReverse && (
              <Field label="Payment mode" required note={paymentMode === 'cod' ? 'The courier collects the order total on delivery.' : undefined}>
                <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} style={FIELD}><option value="prepaid">Prepaid</option><option value="cod">Cash on delivery (COD)</option></select>
              </Field>
            )}
          </Grid>
          {!isReverse && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11.5, fontWeight: 750, color: T.TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 9 }}>Order charges (optional)</div>
              <Grid cols={three}>
                <Field label="Shipping charges ₹">{money(charges.shipping, setCharge('shipping'))}</Field>
                <Field label="Gift wrap ₹">{money(charges.giftWrap, setCharge('giftWrap'))}</Field>
                <Field label="Transaction / COD charges ₹">{money(charges.transaction, setCharge('transaction'))}</Field>
                <Field label="Other charges ₹">{money(charges.other, setCharge('other'))}</Field>
                <Field label="Discount ₹">{money(charges.discount, setCharge('discount'))}</Field>
                <Field label="Tax % (on products)">{input(charges.taxPercent, setCharge('taxPercent'), { type: 'number', min: 0, max: 100, step: '0.01', placeholder: '0' })}</Field>
              </Grid>
            </div>
          )}
        </Section>

        <Section title={isReverse ? 'Pickup from customer' : 'Customer details'} hint={isReverse ? 'Where the courier collects the returned parcel.' : 'Who receives this shipment and where it goes.'}>
          <Grid cols={two}>
            <Field label="Consignee name" required>{input(customer.fullName, setCust('fullName'), { required: true, minLength: 2, maxLength: 120 })}</Field>
            <Field label="Company name">{input(customer.companyName, setCust('companyName'), { maxLength: 120 })}</Field>
            <Field label="Phone" required>{input(customer.phone, setCust('phone'), { required: true, type: 'tel', pattern: '[6-9][0-9]{9}', title: '10-digit Indian mobile number', placeholder: '10-digit mobile' })}</Field>
            <Field label="Alternate phone">{input(customer.alternatePhone, setCust('alternatePhone'), { type: 'tel', pattern: '[6-9][0-9]{9}', title: '10-digit Indian mobile number' })}</Field>
            <Field label="Email">{input(customer.email, setCust('email'), { type: 'email' })}</Field>
            <Field label="Address line 1" required>{input(customer.address, setCust('address'), { required: true, minLength: 3, maxLength: 200, placeholder: 'House / flat, street' })}</Field>
            <Field label="Address line 2">{input(customer.address2, setCust('address2'), { maxLength: 200, placeholder: 'Area, locality' })}</Field>
            <Field label="Landmark">{input(customer.landmark, setCust('landmark'), { maxLength: 200 })}</Field>
            <Field label="Pincode" required note={pinStatus === 'found' ? `${pinInfo.info.city}, ${pinInfo.info.state} — city and state filled${pinInfo.info.outOfDeliveryArea ? ' · remote area, fewer couriers' : ''}` : pinStatus === 'missing' ? 'Pincode not in our directory. Enter city and state manually.' : pinStatus === 'loading' ? 'Looking up pincode…' : undefined} noteTone={pinStatus === 'missing' ? undefined : 'ok'}>{input(customer.pincode, setCust('pincode'), { required: true, inputMode: 'numeric', pattern: '[0-9]{6}', placeholder: '6-digit pincode' })}</Field>
            <Field label="City" required>{input(customer.city, setCust('city'), { required: true, minLength: 2 })}</Field>
            <Field label="State" required>{input(customer.state, setCust('state'), { required: true, minLength: 2 })}</Field>
            <Field label="Country"><input value="India" readOnly style={{ ...FIELD, background: T.SURFACE_SOFT }} /></Field>
          </Grid>
          {paymentMode === 'cod' && !isReverse && pinStatus === 'found' && pinInfo.info.codAvailable === false && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, background: `${T.AMBER}14`, color: T.AMBER, fontSize: 12.5, fontWeight: 650 }}>Cash on delivery is not available at {customer.pincode}. Switch to prepaid to see courier options.</div>}
        </Section>

        <Section title={`${isReverse ? 'Returned products' : 'Products'} (${items.length}/${MAX_PRODUCTS})`} hint={`Enter a saved SKU to fill name, HSN, price and weight. Up to ${MAX_PRODUCTS} products per order.`} aside={<button type="button" disabled={items.length >= MAX_PRODUCTS} onClick={addItem} title={items.length >= MAX_PRODUCTS ? `Maximum ${MAX_PRODUCTS} products reached` : undefined} style={{ ...FIELD, width: 'auto', height: 34, padding: '0 12px', cursor: items.length >= MAX_PRODUCTS ? 'not-allowed' : 'pointer', fontWeight: 750, opacity: items.length >= MAX_PRODUCTS ? 0.5 : 1 }}>{items.length >= MAX_PRODUCTS ? 'Limit reached' : '+ Add product'}</button>}>
          <div style={{ display: 'grid', gap: 12 }}>
            {items.map((item, index) => (
              <div key={item.key} style={{ padding: 12, borderRadius: 10, border: `1px solid ${T.BORDER}`, background: T.SURFACE }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 9 }}>
                  <b style={{ fontSize: 12.5, color: T.TEXT_LABEL }}>Product {index + 1}{item.productId && <span style={{ color: T.GREEN, fontWeight: 600 }}> · from catalog</span>}</b>
                  {items.length > 1 && <button type="button" onClick={() => removeItem(item.key)} style={{ border: 0, background: 'transparent', color: T.RED, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Remove</button>}
                </div>
                <Grid cols={mobile ? '1fr' : '1fr 1.6fr 0.9fr'}>
                  <Field label="SKU">{input(item.sku, setItem(item.key, 'sku'), { maxLength: 80, placeholder: 'Saved SKU' })}</Field>
                  <Field label="Product name" required>{input(item.name, setItem(item.key, 'name'), { required: true, minLength: 2, maxLength: 200 })}</Field>
                  <Field label="HSN code">{input(item.hsn, setItem(item.key, 'hsn'), { inputMode: 'numeric', pattern: '[0-9]{4,8}', title: '4–8 digit HSN code' })}</Field>
                </Grid>
                <div style={{ marginTop: 11 }}>
                  <Grid cols={three}>
                    <Field label="Quantity" required>{input(item.quantity, setItem(item.key, 'quantity'), { required: true, type: 'number', min: 1, max: 10000, step: 1 })}</Field>
                    <Field label="Unit price ₹" required>{input(item.price, setItem(item.key, 'price'), { required: true, type: 'number', min: 0, step: '0.01', inputMode: 'decimal' })}</Field>
                    <Field label="Unit weight (g)">{input(item.weight, setItem(item.key, 'weight'), { type: 'number', min: 0, step: 1 })}</Field>
                  </Grid>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Package details" hint="Couriers bill the higher of dead weight and volumetric weight (L × B × H ÷ 5000).">
          <Grid cols={mobile ? '1fr 1fr' : 'repeat(4, minmax(0,1fr))'}>
            <Field label="Dead weight (kg)" required note={pkg.weightKg === '' && itemWeightG > 0 ? `From products: ${(itemWeightG / 1000).toFixed(3)} kg` : undefined}>
              {input(pkg.weightKg, setPack('weightKg'), { required: true, type: 'number', min: 0.01, step: '0.01', placeholder: itemWeightG > 0 ? (itemWeightG / 1000).toFixed(3) : '0.50' })}
            </Field>
            <Field label="Length (cm)" required>{input(pkg.length, setPack('length'), { required: true, type: 'number', min: 1, step: '0.1' })}</Field>
            <Field label="Breadth (cm)" required>{input(pkg.width, setPack('width'), { required: true, type: 'number', min: 1, step: '0.1' })}</Field>
            <Field label="Height (cm)" required>{input(pkg.height, setPack('height'), { required: true, type: 'number', min: 1, step: '0.1' })}</Field>
          </Grid>
          <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12.5, color: T.TEXT_SECONDARY }}>
            <span>Dead: <b style={{ color: T.TEXT }}>{(deadWeightG / 1000).toFixed(3)} kg</b></span>
            <span>Volumetric: <b style={{ color: T.TEXT }}>{hasDims ? `${(volumetricG / 1000).toFixed(3)} kg` : '—'}</b></span>
            <span>Chargeable: <b style={{ color: T.ACCENT }}>{(chargeableG / 1000).toFixed(3)} kg</b></span>
          </div>
        </Section>
      </div>

      <aside style={{ display: 'grid', gap: 14, alignContent: 'start', ...(mobile ? {} : { position: 'sticky', top: 76 }) }}>
        <Section title="Total summary">
          <SummaryRow label="Products" value={inr(totals.subtotal)} />
          {totals.tax > 0 && <SummaryRow label={`Tax (${(totals.taxRateBps / 100).toFixed(2)}%)`} value={inr(totals.tax)} />}
          {totals.shipping > 0 && <SummaryRow label="Shipping charges" value={inr(totals.shipping)} />}
          {totals.giftWrap > 0 && <SummaryRow label="Gift wrap" value={inr(totals.giftWrap)} />}
          {totals.transaction > 0 && <SummaryRow label="Transaction charges" value={inr(totals.transaction)} />}
          {totals.other > 0 && <SummaryRow label="Other charges" value={inr(totals.other)} />}
          {totals.discount > 0 && <SummaryRow label="Discount" value={inr(totals.discount)} tone="minus" />}
          <div style={{ borderTop: `1px solid ${T.DIVIDER}`, marginTop: 6, paddingTop: 6 }}><SummaryRow label="Order total" value={inr(Math.max(totals.total, 0))} strong /></div>
          {quoteMode === 'cod' && <SummaryRow label="Collect on delivery" value={inr(Math.max(totals.total, 0))} />}
          {totals.discount > totals.gross && <small style={{ display: 'block', color: T.RED, fontSize: 11.5 }}>Discount is larger than the order value.</small>}
          <button disabled={busy || !warehouse || !!placed} type="submit" style={{ marginTop: 12, width: '100%', height: 42, border: 0, borderRadius: 9, background: T.NAVY, color: '#fff', fontWeight: 800, fontSize: 14, cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Creating…' : placed ? 'Order created ✓' : isReverse ? 'Create return pickup' : 'Create order'}
          </button>
          {placed && (
            <div style={{ marginTop: 14, borderTop: `1px solid ${T.DIVIDER}`, paddingTop: 12 }}>
              <b style={{ display: 'block', fontSize: 13, color: T.TEXT }}>Available couriers</b>
              <small style={{ display: 'block', color: T.TEXT_MUTED, margin: '2px 0 10px' }}>Order {placed.orderNumber} · pick one to book</small>
              {offer.loading && <div style={{ padding: 14, textAlign: 'center', fontSize: 12.5, color: T.TEXT_MUTED }}>Fetching courier rates…</div>}
              {offer.error && <div style={{ padding: 12, fontSize: 12.5, color: T.RED, border: `1px dashed ${T.BORDER}`, borderRadius: 9 }}>{offer.error}</div>}
              <div style={{ display: 'grid', gap: 7 }}>
                {offer.quotes.map((q) => {
                  const key = `${q.provider.code}:${q.service.code}`; const on = pick === key;
                  return (
                    <label key={key} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '9px 10px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? T.NAVY : T.BORDER}`, background: on ? 'rgba(27,159,214,.09)' : T.SURFACE }}>
                      <input type="radio" name="courier" checked={on} onChange={() => setPick(key)} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b style={{ display: 'block', fontSize: 13, color: T.TEXT }}>{q.provider.name} <span style={{ fontWeight: 500, color: T.TEXT_SECONDARY }}>{q.service.name}</span></b>
                        <small style={{ color: T.TEXT_MUTED }}>{q.tat.minDays === q.tat.maxDays ? `${q.tat.minDays} day${q.tat.minDays === 1 ? '' : 's'}` : `${q.tat.minDays}–${q.tat.maxDays} days`}{q.tags?.includes('cheapest') ? ' · Cheapest' : ''}{q.tags?.includes('fastest') ? ' · Fastest' : ''}</small>
                      </span>
                      <b style={{ fontSize: 13.5, color: T.TEXT }}>{inr(Math.round(q.price.total * 100))}</b>
                    </label>
                  );
                })}
              </div>
              {offer.quotes.length > 0 && <button type="button" disabled={booking || !pick} onClick={bookCourier} style={{ marginTop: 10, width: '100%', height: 40, border: 0, borderRadius: 9, background: T.ACCENT, color: '#fff', fontWeight: 800, fontSize: 13.5, cursor: booking ? 'wait' : 'pointer' }}>{booking ? 'Booking…' : 'Book selected courier'}</button>}
              <button type="button" onClick={() => nav('orders')} style={{ marginTop: 8, width: '100%', height: 34, border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 9, background: T.SURFACE, color: T.TEXT_SECONDARY, fontWeight: 650, fontSize: 12.5, cursor: 'pointer' }}>Book later from All orders</button>
            </div>
          )}
        </Section>
      </aside>
    </form>
  );
}

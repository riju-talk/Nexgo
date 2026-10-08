'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { usePincode } from '@/lib/usePincode';
import * as T from '@/lib/theme';

const CARD = { background: 'var(--nx-surface)', border: `1px solid ${T.BORDER}`, borderRadius: 12 };
const FIELD = { width: '100%', height: 42, boxSizing: 'border-box', border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, background: T.SURFACE, color: T.TEXT, padding: '0 11px', fontSize: 14, outline: 'none' };
const LABEL = { display: 'block', fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL };
const TYPES = [['primary', 'Primary Warehouse'], ['secondary', 'Secondary Warehouse'], ['fulfilment', 'Fulfilment Centre'], ['returns', 'Returns Desk']];
const typeLabel = (t) => (TYPES.find(([id]) => id === t) || [, t])[1];
const hhmm = (v) => (v ? String(v).slice(0, 5) : '');
const clock = (v) => { if (!v) return ''; const [h, m] = v.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const num = (v) => (v === '' || v === null || v === undefined ? undefined : Number(v));

function Field({ label, required, children, hint }) {
  return <label style={LABEL}>{label}{required && <span style={{ color: T.RED }}> *</span>}<div style={{ marginTop: 6 }}>{children}</div>{hint && <small style={{ display: 'block', marginTop: 4, fontSize: 11.5, color: T.TEXT_MUTED }}>{hint}</small>}</label>;
}

const blank = { name: '', type: 'primary', address: '', pincode: '', state: null, city: null, lat: null, lng: null, contact: '', phone: '', email: '', manager: '', capacity: '', opens: '09:00', closes: '18:00', notes: '', isDefault: false };
const fromRow = (w) => ({ name: w.name, type: w.warehouse_type || 'primary', address: [w.address_line_1, w.address_line_2].filter(Boolean).join(', '), pincode: w.pincode, state: w.state, city: w.city, lat: w.latitude ?? null, lng: w.longitude ?? null, contact: w.contact_name, phone: w.phone, email: w.email || '', manager: w.manager_name || '', capacity: w.capacity_sqft ?? '', opens: hhmm(w.opens_at), closes: hhmm(w.closes_at), notes: w.notes || '', isDefault: !!w.is_default });

function WarehouseForm({ initial, editingId, mobile, onSaved, onCancel }) {
  const { showToast } = useAppState();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const { info, status } = usePincode(f.pincode);
  // Values the user has not typed fall back to the pincode directory.
  const state = f.state ?? info?.state ?? ''; const city = f.city ?? info?.city ?? '';
  const lat = f.lat ?? info?.latitude ?? ''; const lng = f.lng ?? info?.longitude ?? '';
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const onPincode = (e) => setF((x) => ({ ...x, pincode: e.target.value.replace(/\D/g, '').slice(0, 6), state: null, city: null, lat: null, lng: null })); // new pincode re-fills location
  const hasPoint = lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const mapSrc = hasPoint ? `https://www.openstreetmap.org/export/embed.html?bbox=${Number(lng) - 0.012},${Number(lat) - 0.008},${Number(lng) + 0.012},${Number(lat) + 0.008}&layer=mapnik&marker=${lat},${lng}` : '';

  const save = async (e) => {
    e.preventDefault();
    if (f.opens && f.closes && f.closes <= f.opens) return showToast('Closing time must be after opening time.', 'error');
    setBusy(true);
    const body = {
      name: f.name.trim(), warehouseType: f.type, contactName: f.contact.trim(), phone: f.phone.trim(), email: f.email.trim() || undefined,
      addressLine1: f.address.trim(), city: city.trim(), state: state.trim(), pincode: f.pincode,
      latitude: hasPoint ? Number(lat) : undefined, longitude: hasPoint ? Number(lng) : undefined,
      capacitySqft: num(f.capacity), opensAt: f.opens || undefined, closesAt: f.closes || undefined,
      managerName: f.manager.trim() || undefined, notes: f.notes.trim() || undefined, isDefault: f.isDefault,
    };
    try {
      if (editingId) await apiFetch(`/v1/warehouses/${editingId}`, { method: 'PATCH', body });
      else await apiFetch('/v1/warehouses', { method: 'POST', body });
      showToast(editingId ? 'Warehouse updated' : 'Warehouse saved');
      onSaved();
    } catch (x) { showToast(x instanceof ApiError ? (x.body?.details?.fieldErrors ? `Check: ${Object.keys(x.body.details.fieldErrors).join(', ')}` : x.message) : 'Warehouse could not be saved', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>
      <section style={{ ...CARD, padding: 20 }}>
        <b style={{ color: T.TEXT, fontSize: 16 }}>Warehouse Details</b><span style={{ display: 'block', color: T.TEXT_MUTED, fontSize: 12.5, marginTop: 3 }}>Enter the basic information about your warehouse.</span>
        <div style={{ marginTop: 16, display: 'grid', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.2fr 1fr', gap: 14 }}>
            <Field label="Warehouse Name" required><input style={FIELD} required minLength={2} maxLength={120} value={f.name} onChange={set('name')} placeholder="Delhi Central Warehouse" /></Field>
            <Field label="Type" required><select style={FIELD} value={f.type} onChange={set('type')}>{TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></Field>
          </div>
          <Field label="Address" required><textarea style={{ ...FIELD, height: 82, padding: '10px 11px', resize: 'vertical' }} required minLength={3} maxLength={200} value={f.address} onChange={set('address')} placeholder="Plot No. 123, Sector 18, Industrial Area, Near Metro Station" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr 1fr', gap: 14 }}>
            <Field label="Pincode" required hint={status === 'found' ? 'State, city and map location filled from pincode' : status === 'missing' ? 'Not in our directory — enter state and city manually' : status === 'loading' ? 'Looking up…' : undefined}><input style={FIELD} required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={f.pincode} onChange={onPincode} placeholder="110001" /></Field>
            <Field label="State" required><input style={FIELD} required value={state} onChange={(e) => setF((x) => ({ ...x, state: e.target.value }))} /></Field>
            <Field label="City" required><input style={FIELD} required value={city} onChange={(e) => setF((x) => ({ ...x, city: e.target.value }))} /></Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <Field label="Latitude"><input style={FIELD} type="number" step="0.0001" min="-90" max="90" value={lat} onChange={(e) => setF((x) => ({ ...x, lat: e.target.value, lng: x.lng ?? lng }))} /></Field>
            <Field label="Longitude"><input style={FIELD} type="number" step="0.0001" min="-180" max="180" value={lng} onChange={(e) => setF((x) => ({ ...x, lng: e.target.value, lat: x.lat ?? lat }))} /></Field>
            <Field label="Contact Person" required><input style={FIELD} required minLength={2} value={f.contact} onChange={set('contact')} placeholder="Rohit Sharma" /></Field>
            <Field label="Phone Number" required><input style={FIELD} required type="tel" pattern="[0-9+() \-]{7,24}" value={f.phone} onChange={set('phone')} placeholder="+91 98765 43210" /></Field>
            <Field label="Email ID"><input style={FIELD} type="email" value={f.email} onChange={set('email')} placeholder="rohit@yourcompany.com" /></Field>
            <Field label="Warehouse Manager (Optional)"><input style={FIELD} value={f.manager} onChange={set('manager')} placeholder="Enter manager name" /></Field>
          </div>
          <label style={{ display: 'flex', gap: 11, alignItems: 'center', cursor: 'pointer' }}>
            <input type="checkbox" checked={f.isDefault} onChange={(e) => setF((x) => ({ ...x, isDefault: e.target.checked }))} style={{ width: 20, height: 20, accentColor: '#2454D6' }} />
            <span><b style={{ color: T.TEXT, fontSize: 13.5 }}>Set as Default Warehouse</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>This warehouse will be selected by default for new shipments.</small></span>
          </label>
        </div>
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <button type="button" onClick={onCancel} style={{ height: 42, padding: '0 22px', borderRadius: 9, border: '1px solid #2454D6', background: T.SURFACE, color: '#2454D6', fontWeight: 750, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" disabled={busy} style={{ height: 42, padding: '0 26px', borderRadius: 9, border: 0, background: '#2454D6', color: '#fff', fontWeight: 800, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : editingId ? 'Save Changes' : 'Save Warehouse'}</button>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 16 }}>
        <section style={{ ...CARD, padding: 18 }}>
          <b style={{ color: T.TEXT, fontSize: 15 }}>Location</b><span style={{ display: 'block', color: T.TEXT_MUTED, fontSize: 12.5, marginTop: 3 }}>The marker follows the latitude and longitude.</span>
          <div style={{ marginTop: 12, height: 220, borderRadius: 10, overflow: 'hidden', border: `1px solid ${T.BORDER}`, background: T.SURFACE_SOFT, display: 'grid', placeItems: 'center' }}>
            {hasPoint ? <iframe title="Warehouse location" src={mapSrc} style={{ width: '100%', height: '100%', border: 0 }} loading="lazy" /> : <span style={{ color: T.TEXT_MUTED, fontSize: 13, padding: 16, textAlign: 'center' }}>Enter a pincode or coordinates to preview the location.</span>}
          </div>
          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 9, background: '#2454D60d', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
            <span>📍 <b style={{ color: T.TEXT }}>Selected Location</b><small style={{ display: 'block', color: T.TEXT_MUTED }}>{hasPoint ? `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}` : '—'}</small></span>
            <button type="button" disabled={!info || info.latitude === null} onClick={() => setF((x) => ({ ...x, lat: null, lng: null }))} style={{ border: 0, background: 'transparent', color: '#2454D6', fontWeight: 700, cursor: info ? 'pointer' : 'not-allowed', fontSize: 12.5 }}>Reset to pincode</button>
          </div>
        </section>
        <section style={{ ...CARD, padding: 18 }}>
          <b style={{ color: T.TEXT, fontSize: 15 }}>Additional Information</b><span style={{ display: 'block', color: T.TEXT_MUTED, fontSize: 12.5, marginTop: 3 }}>Add extra details to help with operations.</span>
          <div style={{ marginTop: 12, display: 'grid', gap: 13 }}>
            <Field label="Warehouse Capacity (sq. ft)"><input style={FIELD} type="number" min="1" step="1" value={f.capacity} onChange={set('capacity')} placeholder="5000" /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Opens at"><input style={FIELD} type="time" value={f.opens} onChange={set('opens')} /></Field>
              <Field label="Closes at"><input style={FIELD} type="time" value={f.closes} onChange={set('closes')} /></Field>
            </div>
            <Field label="Notes (Optional)"><textarea style={{ ...FIELD, height: 80, padding: '10px 11px', resize: 'vertical' }} maxLength={1000} value={f.notes} onChange={set('notes')} placeholder="Any additional notes about this warehouse…" /></Field>
          </div>
        </section>
      </div>
    </form>
  );
}

export default function LiveWarehouse({ mobile }) {
  const { showToast } = useAppState();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null = list, { id?, initial } = form
  const [confirmId, setConfirmId] = useState('');

  const load = useCallback(() => apiFetch('/v1/warehouses').then((x) => { setItems(x.items || []); setError(''); }).catch((e) => { setItems([]); setError(e.status === 401 ? 'Sign in to manage warehouses.' : e.message || 'Warehouses could not be loaded.'); }), []);
  useEffect(() => { load(); }, [load]);

  const makeDefault = async (w) => { try { await apiFetch(`/v1/warehouses/${w.id}/default`, { method: 'POST' }); showToast(`${w.name} is now the default warehouse`); load(); } catch (e) { showToast(e.message || 'Could not change the default', 'error'); } };
  const remove = async (w) => { try { await apiFetch(`/v1/warehouses/${w.id}`, { method: 'DELETE' }); showToast(`${w.name} removed`); setConfirmId(''); load(); } catch (e) { showToast(e.message || 'Could not remove the warehouse', 'error'); setConfirmId(''); } };
  const pad = mobile ? '14px 12px 42px' : '18px 22px 48px';

  if (editing) {
    return (
      <div style={{ padding: pad, maxWidth: '100%' }}>
        <button type="button" onClick={() => setEditing(null)} style={{ border: 0, background: 'transparent', color: '#2454D6', fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 8 }}>← Back</button>
        <h2 style={{ margin: '0 0 4px', color: T.TEXT, fontSize: 24 }}>{editing.id ? 'Edit Warehouse' : 'Add Warehouse'}</h2>
        <p style={{ margin: '0 0 16px', color: T.TEXT_SECONDARY, fontSize: 13.5 }}>Add your warehouse details to manage inventory, shipments and faster order processing.</p>
        <WarehouseForm initial={editing.initial} editingId={editing.id} mobile={mobile} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      </div>
    );
  }

  const active = (items || []).filter((w) => w.is_active); const inactive = (items || []).filter((w) => !w.is_active);
  return (
    <div style={{ padding: pad, maxWidth: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ margin: 0, color: T.TEXT_SECONDARY, fontSize: 13.5 }}>Pickup locations used when creating orders and booking couriers. {active.length} active.</p>
        <button type="button" onClick={() => setEditing({ initial: { ...blank, isDefault: active.length === 0 } })} style={{ height: 40, padding: '0 20px', border: 0, borderRadius: 9, background: '#2454D6', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>+ Add Warehouse</button>
      </div>
      {items === null && <div style={{ ...CARD, padding: 22, color: T.TEXT_MUTED }}>Loading warehouses…</div>}
      {error && <div style={{ ...CARD, padding: 22, color: T.RED }}>{error}</div>}
      {items && !error && !active.length && <div style={{ ...CARD, padding: 28, textAlign: 'center', color: T.TEXT_SECONDARY }}>No warehouses yet. Add your first pickup location to start creating orders.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fill,minmax(340px,1fr))', gap: 14 }}>
        {active.map((w) => (
          <article key={w.id} style={{ ...CARD, padding: 18, borderColor: w.is_default ? '#2454D6' : T.BORDER }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div><b style={{ color: T.TEXT, fontSize: 15.5 }}>{w.name}</b><span style={{ display: 'block', marginTop: 4, color: T.TEXT_MUTED, fontSize: 12 }}>{typeLabel(w.warehouse_type)}</span></div>
              {w.is_default && <span style={{ padding: '4px 9px', borderRadius: 99, background: '#2454D61a', color: '#2454D6', fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap' }}>★ Default</span>}
            </div>
            <p style={{ margin: '10px 0 0', color: T.TEXT_SECONDARY, fontSize: 13, lineHeight: 1.5 }}>{w.address_line_1}{w.address_line_2 ? `, ${w.address_line_2}` : ''}<br />{w.city}, {w.state} · {w.pincode}</p>
            <div style={{ marginTop: 10, display: 'grid', gap: 4, color: T.TEXT_SECONDARY, fontSize: 12.5 }}>
              <span>👤 {w.contact_name}{w.manager_name ? ` · Manager: ${w.manager_name}` : ''}</span>
              <span>📞 {w.phone}</span>
              {(w.opens_at || w.closes_at) && <span>🕘 {clock(hhmm(w.opens_at))} – {clock(hhmm(w.closes_at))}</span>}
              {w.capacity_sqft && <span>📦 {Number(w.capacity_sqft).toLocaleString('en-IN')} sq. ft</span>}
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setEditing({ id: w.id, initial: fromRow(w) })} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.BORDER}`, background: T.SURFACE, color: T.TEXT, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
              {!w.is_default && <button type="button" onClick={() => makeDefault(w)} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #2454D6', background: T.SURFACE, color: '#2454D6', fontWeight: 700, cursor: 'pointer' }}>Set as default</button>}
              {confirmId === w.id
                ? <><button type="button" onClick={() => remove(w)} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 0, background: T.RED, color: '#fff', fontWeight: 750, cursor: 'pointer' }}>Confirm remove</button><button type="button" onClick={() => setConfirmId('')} style={{ height: 34, padding: '0 10px', border: 0, background: 'transparent', color: T.TEXT_MUTED, cursor: 'pointer' }}>Keep</button></>
                : <button type="button" onClick={() => setConfirmId(w.id)} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.BORDER}`, background: T.SURFACE, color: T.RED, fontWeight: 700, cursor: 'pointer' }}>Remove</button>}
            </div>
          </article>
        ))}
      </div>
      {inactive.length > 0 && <p style={{ marginTop: 18, color: T.TEXT_MUTED, fontSize: 12.5 }}>{inactive.length} removed warehouse{inactive.length === 1 ? '' : 's'} kept for order history.</p>}
    </div>
  );
}

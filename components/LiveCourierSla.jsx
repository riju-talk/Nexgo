'use client';

import { askConfirm } from '@/lib/dialog';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pill, Table, isoDay } from './Kit';

// Admin > Couriers > SLA settings: one policy per courier + lane zone (+ optional service type). Saved through
// /v1/admin/couriers/:id/sla; the promise and breach window are what SLA breach detection reads.
const ZONES = [['within_city', 'Within city'], ['within_state', 'Within state'], ['metro_to_metro', 'Metro to metro'], ['rest_of_india', 'Rest of India'], ['ne_jk', 'North-East & J&K'], ['national', 'National (all lanes)']];
const SERVICE_TYPES = [['', 'All service types'], ['surface', 'Surface'], ['air', 'Air'], ['express', 'Express'], ['hyperlocal', 'Hyperlocal']];
const zoneLabel = (z) => ZONES.find(([id]) => id === z)?.[1] || z;
const typeLabel = (t) => SERVICE_TYPES.find(([id]) => id === (t || ''))?.[1] || t;
const BLANK = { zone: 'national', serviceType: '', promisedDays: '3', breachThresholdHours: '24', escalationHours: '', autoNotify: true, notifySeller: true, notifyAdmin: false };

const Label = ({ children }) => <span style={{ display: 'block', fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL, marginBottom: 6 }}>{children}</span>;
const Check = ({ label, checked, onChange }) => <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T.TEXT, cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 16, height: 16, accentColor: BLUE }} />{label}</label>;

export default function LiveCourierSla({ mobile }) {
  const { showToast } = useAppState();
  const [couriers, setCouriers] = useState([]); const [courierId, setCourierId] = useState('');
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [form, setForm] = useState(null); // null = closed; { id?, ...fields } = open
  const [busy, setBusy] = useState(false); const [format, setFormat] = useState('csv');
  const [showOff, setShowOff] = useState(false); // removed and switched-off policies stay in the database (breach history) but are hidden unless asked for

  useEffect(() => {
    apiFetch('/v1/admin/couriers').then((x) => { const list = x.items || []; setCouriers(list); if (list[0]) setCourierId(list[0].id); }).catch((e) => setError(e.message || 'Couriers could not be loaded.'));
  }, []);

  const [tick, setTick] = useState(0); const load = () => setTick((n) => n + 1);
  useEffect(() => {
    if (!courierId) return undefined;
    let live = true;
    apiFetch(`/v1/admin/couriers/${courierId}/sla?pageSize=100`)
      .then((x) => { if (live) { setRows(x.items || []); setError(''); } })
      .catch((e) => { if (live) { setRows([]); setError(e.status === 401 ? 'Sign in again to view SLA policies.' : e.message || 'SLA policies could not be loaded.'); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [courierId, tick]);

  const courierName = couriers.find((c) => c.id === courierId)?.name || '';
  const open = (r) => setForm(r ? { id: r.id, zone: r.zone, serviceType: r.serviceType || '', promisedDays: String(r.promisedDays), breachThresholdHours: String(r.breachThresholdHours), escalationHours: r.escalationHours == null ? '' : String(r.escalationHours), autoNotify: r.autoNotify, notifySeller: r.notifySeller, notifyAdmin: r.notifyAdmin } : { ...BLANK });
  const problem = form && (!(Number(form.promisedDays) >= 1 && Number(form.promisedDays) <= 30) ? 'Promised days must be between 1 and 30.'
    : !(Number(form.breachThresholdHours) >= 0 && Number(form.breachThresholdHours) <= 72) ? 'Breach window must be between 0 and 72 hours.'
    : form.escalationHours !== '' && Number(form.escalationHours) <= Number(form.breachThresholdHours) ? 'Escalation must be later than the breach window.' : '');

  const save = async (e) => {
    e.preventDefault(); if (problem) return showToast(problem, 'error');
    setBusy(true);
    try {
      const body = { promisedDays: Number(form.promisedDays), breachThresholdHours: Number(form.breachThresholdHours), escalationHours: form.escalationHours === '' ? null : Number(form.escalationHours), autoNotify: form.autoNotify, notifySeller: form.notifySeller, notifyAdmin: form.notifyAdmin };
      if (form.id) await apiFetch(`/v1/admin/couriers/${courierId}/sla/${form.id}`, { method: 'PATCH', body });
      else await apiFetch(`/v1/admin/couriers/${courierId}/sla`, { method: 'POST', body: { ...body, courierProviderId: courierId, zone: form.zone, serviceType: form.serviceType || null } });
      showToast(form.id ? 'SLA policy updated' : 'SLA policy saved'); setForm(null); load();
    } catch (x) { showToast(x instanceof ApiError ? x.message : x.message || 'The policy could not be saved', 'error'); }
    finally { setBusy(false); }
  };
  const toggle = async (r) => { try { await apiFetch(`/v1/admin/couriers/${courierId}/sla/${r.id}`, { method: 'PATCH', body: { isActive: !r.isActive } }); showToast(r.isActive ? 'Policy switched off' : 'Policy switched on'); load(); } catch (x) { showToast(x.message || 'Could not update the policy', 'error'); } };
  const remove = async (r) => { if (!(await askConfirm({ title: 'Are you sure?', message: `Remove the ${zoneLabel(r.zone)} policy for ${courierName}? It stops being used. Past breach records are kept.`, confirmLabel: 'Yes, continue', danger: true }))) return; try { await apiFetch(`/v1/admin/couriers/${courierId}/sla/${r.id}`, { method: 'DELETE' }); showToast('Policy removed'); load(); } catch (x) { showToast(x.message || 'Could not delete the policy', 'error'); } };

  const exportAll = async () => {
    if (!rows.length) return showToast('Nothing to export.', 'error');
    await saveRows([['Courier', 'Zone', 'Service type', 'Promised days', 'Breach window (hours)', 'Escalation (hours)', 'Auto notify', 'Notify seller', 'Notify admin', 'Active'],
      ...rows.map((r) => [courierName, zoneLabel(r.zone), typeLabel(r.serviceType), r.promisedDays, r.breachThresholdHours, r.escalationHours ?? '', r.autoNotify ? 'Yes' : 'No', r.notifySeller ? 'Yes' : 'No', r.notifyAdmin ? 'Yes' : 'No', r.isActive ? 'Yes' : 'No'])],
      `sla-policies-${isoDay()}`, format, 'SLA policies');
    showToast(`Exported ${rows.length} polic${rows.length === 1 ? 'y' : 'ies'}`);
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 22px 48px', display: 'grid', gap: 14 }}>
      <section style={{ ...CARD, padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ minWidth: 220 }}><Label>Courier</Label><select aria-label="Courier" style={{ ...FIELD, width: '100%', height: 40 }} value={courierId} onChange={(e) => { setLoading(true); setCourierId(e.target.value); }}>{couriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <div style={{ flex: 1 }} />
        <select aria-label="Export format" value={format} onChange={(e) => setFormat(e.target.value)} style={{ ...FIELD, height: 38 }}>{FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: T.TEXT_SECONDARY, cursor: 'pointer' }}><input type="checkbox" checked={showOff} onChange={(e) => setShowOff(e.target.checked)} style={{ accentColor: BLUE }} />Show switched-off</label>
        <Btn onClick={exportAll}>Export policies</Btn>
        <Btn primary disabled={!courierId} onClick={() => open(null)}>+ Create policy</Btn>
      </section>
      <section style={{ ...CARD, overflow: 'hidden' }}>
        <Table loading={loading} error={error} rows={showOff ? rows : rows.filter((r) => r.isActive)} rowKey={(r) => r.id} empty={courierId ? 'No SLA policies for this courier yet. Click “Create policy” to add the first one.' : 'Add a courier first.'} minWidth={880} columns={[
          { h: 'Zone', cell: (r) => <b>{zoneLabel(r.zone)}</b> },
          { h: 'Service type', cell: (r) => typeLabel(r.serviceType) },
          { h: 'Delivery promise', cell: (r) => `${r.promisedDays} day${r.promisedDays === 1 ? '' : 's'}` },
          { h: 'Breach window', cell: (r) => `${r.breachThresholdHours} h` },
          { h: 'Escalation', cell: (r) => (r.escalationHours == null ? '—' : `${r.escalationHours} h`) },
          { h: 'Alerts', cell: (r) => [r.autoNotify && 'Auto', r.notifySeller && 'Seller', r.notifyAdmin && 'Admin'].filter(Boolean).join(' · ') || 'Off' },
          { h: 'Status', cell: (r) => <Pill color={r.isActive ? T.GREEN : T.TEXT_MUTED}>{r.isActive ? 'Active' : 'Off'}</Pill> },
          { h: 'Actions', cell: (r) => <span style={{ display: 'flex', gap: 6 }}><Btn small onClick={() => open(r)}>Edit</Btn><Btn small onClick={() => toggle(r)}>{r.isActive ? 'Turn off' : 'Turn on'}</Btn><Btn small danger onClick={() => remove(r)}>Remove</Btn></span> },
        ]} />
      </section>
      {form && (
        <div role="dialog" aria-modal="true" aria-label={form.id ? 'Edit SLA policy' : 'Create SLA policy'} onClick={() => setForm(null)} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(11,31,68,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: 'min(560px, 100%)', maxHeight: '92vh', overflow: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.DIVIDER}`, display: 'flex', justifyContent: 'space-between' }}><b style={{ fontSize: 18, color: T.TEXT }}>{form.id ? 'Edit SLA policy' : 'Create SLA policy'} · {courierName}</b><button type="button" aria-label="Close" onClick={() => setForm(null)} style={{ border: 0, background: 'transparent', fontSize: 22, color: T.TEXT_MUTED, cursor: 'pointer' }}>×</button></div>
            <div style={{ padding: 20, display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 14 }}>
              <label><Label>Zone</Label><select style={{ ...FIELD, width: '100%', height: 40 }} value={form.zone} disabled={!!form.id} onChange={set('zone')}>{ZONES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
              <label><Label>Service type</Label><select style={{ ...FIELD, width: '100%', height: 40 }} value={form.serviceType} disabled={!!form.id} onChange={set('serviceType')}>{SERVICE_TYPES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
              <label><Label>Delivery promise (days)</Label><input style={{ ...FIELD, width: '100%', height: 40 }} type="number" min="1" max="30" value={form.promisedDays} onChange={set('promisedDays')} /></label>
              <label><Label>Breach window (hours late)</Label><input style={{ ...FIELD, width: '100%', height: 40 }} type="number" min="0" max="72" value={form.breachThresholdHours} onChange={set('breachThresholdHours')} /></label>
              <label><Label>Escalate after (hours, optional)</Label><input style={{ ...FIELD, width: '100%', height: 40 }} type="number" min="1" value={form.escalationHours} onChange={set('escalationHours')} /></label>
              <div style={{ display: 'grid', gap: 8, alignContent: 'center' }}><Check label="Send breach alerts automatically" checked={form.autoNotify} onChange={(v) => setForm({ ...form, autoNotify: v })} /><Check label="Tell the seller" checked={form.notifySeller} onChange={(v) => setForm({ ...form, notifySeller: v })} /><Check label="Tell the NEXGO admin" checked={form.notifyAdmin} onChange={(v) => setForm({ ...form, notifyAdmin: v })} /></div>
              {form.id && <small style={{ gridColumn: '1 / -1', color: T.TEXT_MUTED }}>Zone and service type identify the policy, so they cannot be changed. Delete it and create a new one to change them.</small>}
              {problem && <small style={{ gridColumn: '1 / -1', color: T.RED }}>{problem}</small>}
            </div>
            <div style={{ padding: '12px 20px', borderTop: `1px solid ${T.DIVIDER}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Btn onClick={() => setForm(null)}>Cancel</Btn><Btn primary type="submit" disabled={busy || !!problem}>{busy ? 'Saving…' : form.id ? 'Save changes' : 'Create policy'}</Btn></div>
          </form>
        </div>
      )}
    </div>
  );
}

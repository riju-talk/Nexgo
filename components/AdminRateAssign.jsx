'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi, apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { ZONES, toPaise, kgToG, slabsFromRates, blankSlab, nextSlabStartKg, validateSlabs, buildRatePayload } from '@/lib/rateConfig';

const CARD = { background: 'var(--ops-surface)', border: '1px solid var(--ops-border)', borderRadius: 12, boxShadow: 'var(--ops-shadow)' };
const FIELD = { height: 34, boxSizing: 'border-box', border: '1px solid var(--ops-border)', borderRadius: 8, padding: '0 9px', background: 'var(--ops-surface)', color: 'var(--ops-text)', fontSize: 13, width: '100%' };
const TH = { padding: '8px 10px', textAlign: 'center', fontSize: 11, fontWeight: 760, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ops-muted)', background: 'var(--ops-surface-2, #f6f8fc)' };
const dateOnly = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const errText = (e, fallback) => (e instanceof ApiError ? e.message : fallback);

const PRICE_COLS = [['fwdBase', 'Forward base'], ['fwdAdd', 'Forward additional'], ['rtoBase', 'RTO base'], ['rtoAdd', 'RTO additional']];
const grams = (g) => (g >= 1000 ? `${g / 1000} kg` : `${g} g`);
const money = (paise) => (paise === null || paise === undefined ? '—' : `₹${(Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function Btn({ children, onClick, primary, disabled, danger }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ minHeight: 34, padding: '0 13px', borderRadius: 8, border: primary ? '1px solid var(--ac, #3877fc)' : '1px solid var(--ops-border)', background: primary ? 'var(--ac, #3877fc)' : 'var(--ops-surface)', color: primary ? '#fff' : danger ? '#B23A2B' : 'var(--ops-heading)', fontSize: 12.5, fontWeight: 720, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap' }}>{children}</button>;
}
const Label = ({ children }) => <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ops-muted)', minWidth: 0 }}>{children}</label>;

export default function AdminRateAssign({ sellerId, mode, mobile }) {
  const router = useRouter();
  const { showToast } = useAppState();
  const assign = mode === 'assign';
  const [setup, setSetup] = useState(null); const [error, setError] = useState(null);
  const [slabs, setSlabs] = useState([]);
  const [offered, setOffered] = useState({}); // serviceId -> { on, cod }
  const [cardName, setCardName] = useState('');
  const [busy, setBusy] = useState(false);
  const [copyFrom, setCopyFrom] = useState(''); const [cards, setCards] = useState([]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const x = await apiFetch(`/v1/admin/sellers/${sellerId}/rate-setup`);
      setSetup(x);
      const loaded = slabsFromRates(x.rates);
      setSlabs(loaded);
      const withRates = new Set(loaded.map((s) => s.serviceId));
      setOffered(Object.fromEntries(x.services.map((s) => [s.id, { on: s.access_state === 'enabled' || withRates.has(s.id), cod: !!s.cod_enabled }])));
      setCardName(x.card?.name || `Rates for ${x.seller.legal_name}`);
    } catch (e) { setError(e); }
  }, [sellerId]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect -- async fetch; state is set after the await
  useEffect(() => { if (assign) apiFetch('/v1/admin/rate-cards').then((d) => setCards(d.items || [])).catch(() => {}); }, [assign]);

  const byProvider = useMemo(() => {
    const groups = new Map();
    for (const s of setup?.services || []) { if (!groups.has(s.provider_name)) groups.set(s.provider_name, []); groups.get(s.provider_name).push(s); }
    return [...groups.entries()];
  }, [setup]);

  const patchSlab = (key, patch) => setSlabs((all) => all.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const patchCell = (key, zone, col, value) => setSlabs((all) => all.map((s) => (s.key === key ? { ...s, zones: { ...s.zones, [zone]: { ...s.zones[zone], [col]: value } } } : s)));
  const serviceOf = (id) => setup.services.find((x) => x.id === id);
  const validate = () => validateSlabs(slabs, setup.services);

  const save = async () => {
    const problem = validate();
    if (problem) { showToast(problem, 'error'); return; }
    setBusy(true);
    try {
      const { rates, access, used } = buildRatePayload(slabs, offered, setup.services);
      await apiFetch(`/v1/admin/sellers/${sellerId}/rate-cards`, { method: 'POST', body: { name: cardName.trim().length >= 2 ? cardName.trim() : `Rates for ${setup.seller.legal_name}`, rates, access, replaceAll: true } });
      // A courier that was on for the seller and is now switched off.
      for (const service of setup.services) if (service.access_state === 'enabled' && !used.has(service.id)) await adminApi.setSellerCourierAccess(sellerId, { serviceId: service.id, state: 'disabled', accountMode: 'platform', codEnabled: false, autoAssignEligible: true }).catch(() => {});
      showToast('Rates saved. New bookings use them; shipments already booked keep their price.');
      router.push(`/admin/rate-cards/${sellerId}`);
    } catch (e) { showToast(errText(e, 'Rates could not be saved'), 'error'); } finally { setBusy(false); }
  };

  const copyCard = async () => {
    if (!copyFrom || !window.confirm('Copy that seller\'s rate card onto this seller? It replaces the card shown here (shipments already booked keep their price).')) return;
    setBusy(true);
    try { await apiFetch(`/v1/admin/sellers/${sellerId}/assign-rate-card`, { method: 'POST', body: { sourceRateCardId: copyFrom } }); showToast('Rate card copied.'); setCopyFrom(''); await load(); }
    catch (e) { showToast(errText(e, 'Rate card could not be copied'), 'error'); } finally { setBusy(false); }
  };

  const pad = mobile ? '14px 12px 42px' : '18px 28px 48px';
  if (error) return <div style={{ padding: pad }}><div style={{ ...CARD, padding: 28, color: 'var(--ops-muted)' }}>{error instanceof ApiError && error.status === 401 ? 'Sign in as a platform administrator.' : error instanceof ApiError && error.status === 404 ? 'This seller was not found.' : 'The rate card could not be loaded.'} <Btn onClick={() => router.push('/admin/rate-cards')}>Back to rate cards</Btn></div></div>;
  if (!setup) return <div style={{ padding: pad }}><div style={{ ...CARD, padding: 28, color: 'var(--ops-muted)' }}>Loading…</div></div>;

  const header = (
    <div style={{ ...CARD, padding: 16, marginBottom: 14, display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
      <div><b style={{ fontSize: 16, color: 'var(--ops-heading)' }}>{setup.seller.legal_name}</b> <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontWeight: 700, fontSize: 12.5 }}>{setup.seller.nexgo_code}</span>
        <div style={{ color: 'var(--ops-muted)', fontSize: 12.5, marginTop: 3 }}>{setup.card ? `Active rate card: ${setup.card.name} (since ${dateOnly(setup.card.effective_from)})` : 'No rate card assigned yet'}</div></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn onClick={() => router.push('/admin/rate-cards')}>All rate cards</Btn>
        {assign ? <Btn onClick={() => router.push(`/admin/rate-cards/${sellerId}`)}>View rate card</Btn> : <Btn primary onClick={() => router.push(`/admin/rate-cards/${sellerId}/assign`)}>Assign courier &amp; rates</Btn>}
      </div>
    </div>
  );

  // ---------- view: read only ----------
  if (!assign) {
    const priced = byProvider.map(([provider, services]) => [provider, services.filter((s) => slabs.some((x) => x.serviceId === s.id))]).filter(([, services]) => services.length);
    return (
      <div style={{ padding: pad }}>
        {header}
        {!priced.length ? <div style={{ ...CARD, padding: 28, color: 'var(--ops-muted)' }}>No rates are assigned to this seller yet. Use <b>Assign courier &amp; rates</b> to set them.</div> : priced.map(([provider, services]) => (
          <section key={provider} style={{ ...CARD, padding: 16, marginBottom: 14 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14.5, color: 'var(--ops-heading)' }}>{provider}</h3>
            {services.map((svc) => (
              <div key={svc.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                  <b style={{ fontSize: 13.5 }}>{svc.name}</b>
                  <span style={{ border: '1px solid var(--ops-border)', borderRadius: 99, padding: '1px 9px', fontSize: 11.5 }}>{svc.type}</span>
                  <span style={{ borderRadius: 99, padding: '1px 9px', fontSize: 11.5, background: svc.access_state === 'enabled' ? '#E8F7EF' : '#FFF5DF', color: svc.access_state === 'enabled' ? '#137D50' : '#9B6500', fontWeight: 700 }}>{svc.access_state === 'enabled' ? `Available${svc.cod_enabled ? ' · COD allowed' : ' · prepaid only'}` : 'Not available to the seller'}</span>
                </div>
                {slabs.filter((x) => x.serviceId === svc.id).map((s) => (
                  <div key={s.key} style={{ border: '1px solid var(--ops-border)', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ padding: '8px 12px', fontSize: 12.5, color: 'var(--ops-muted)', background: 'var(--ops-surface-2, #f6f8fc)' }}>From {grams(s.minWeightG)} · base weight <b style={{ color: 'var(--ops-text)' }}>{grams(s.baseWeightG)}</b> · additional weight <b style={{ color: 'var(--ops-text)' }}>{grams(s.additionalWeightG)}</b> · COD charge <b style={{ color: 'var(--ops-text)' }}>{s.codFee ? `₹${s.codFee}` : '—'}</b> · COD % <b style={{ color: 'var(--ops-text)' }}>{s.codPct ? `${s.codPct}%` : '—'}</b></div>
                    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
                      <thead><tr><th style={{ ...TH, textAlign: 'left' }}>Zone</th>{PRICE_COLS.map(([c, l]) => <th key={c} style={TH}>{l}</th>)}</tr></thead>
                      <tbody>{ZONES.map(([z, zl]) => <tr key={z}><td style={{ padding: '8px 10px', fontSize: 13, borderTop: '1px solid var(--ops-border)' }}>{zl}</td>{PRICE_COLS.map(([c]) => <td key={c} style={{ padding: '8px 10px', textAlign: 'center', fontSize: 13, fontVariantNumeric: 'tabular-nums', borderTop: '1px solid var(--ops-border)' }}>{s.zones[z][c] === '' ? '—' : money(toPaise(s.zones[z][c]))}</td>)}</tr>)}</tbody>
                    </table></div>
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    );
  }

  // ---------- assign: editor (same layout as SwiftCourier's "Shipping Rate Configuration") ----------
  const IN = { ...FIELD, height: 46, textAlign: 'center', padding: '0 6px', minWidth: 64, borderRadius: 12 };
  const SUB = { padding: '10px 4px 0', textAlign: 'center', fontSize: 12.5, color: 'var(--ops-muted)', fontWeight: 500 };
  const services = setup.services;
  const addConfig = () => setSlabs((all) => [...all, blankSlab('')]);
  const pickCourier = (key, serviceId) => {
    // A second configuration for the same courier is a heavier slab: it starts where the heaviest existing one's first weight ends.
    patchSlab(key, { serviceId, fromKg: nextSlabStartKg(slabs, key, serviceId) });
    const svc = serviceOf(serviceId);
    // COD is on by default only for a courier the seller did not have before; an existing choice is kept.
    if (svc) setOffered((o) => ({ ...o, [serviceId]: { on: true, cod: o[serviceId]?.on ? o[serviceId].cod : !!svc.supports_cod } }));
  };
  const zoneHead = (zl) => zl.replace('Metro to metro', 'Metro').replace('North-East & J&K', 'NE / J&K');
  return (
    <div style={{ padding: pad }}>
      <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '18px 30px', display: 'flex', gap: 16, alignItems: 'center', borderBottom: '1px solid var(--ops-border)' }}>
          <span aria-hidden style={{ width: 50, height: 50, borderRadius: '50%', background: 'var(--ac, #3877fc)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 19 }}>{String(setup.seller.legal_name || '?').slice(0, 1).toUpperCase()}</span>
          <div><b style={{ fontSize: 18, color: 'var(--ops-heading)' }}>{setup.seller.legal_name}</b><div style={{ color: 'var(--ops-muted)', fontSize: 13.5 }}>NEXGO ID: {setup.seller.nexgo_code}</div></div>
        </div>
        <div style={{ padding: '26px 30px 30px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 26, color: 'var(--ops-heading)' }}>Shipping Rate Configuration</h2>
            <button type="button" onClick={addConfig} style={{ height: 46, padding: '0 24px', borderRadius: 12, border: '2px solid var(--ac, #3877fc)', background: 'transparent', color: 'var(--ac, #3877fc)', fontWeight: 740, fontSize: 15, cursor: 'pointer' }}>+&nbsp; Add New Configuration</button>
          </div>

          {!slabs.length && <div style={{ border: '1px dashed var(--ops-border)', borderRadius: 12, padding: 28, textAlign: 'center', color: 'var(--ops-muted)' }}>No configuration yet. Click <b>+ Add New Configuration</b>.</div>}
          {slabs.map((s, n) => {
            const svc = serviceOf(s.serviceId);
            return (
              <div key={s.key} style={{ border: '1px solid var(--ops-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--ops-surface-2, #f6f8fc)' }}>
                  <b style={{ fontSize: 15, color: 'var(--ops-heading)', fontWeight: 600 }}>Rate Configuration #{n + 1}</b>
                  <button type="button" aria-label={`Remove configuration ${n + 1}`} onClick={() => setSlabs((all) => all.filter((x) => x.key !== s.key))} style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#FDECEC', color: '#D93636', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', minWidth: 1100, width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, textAlign: 'left', minWidth: 190 }}>Courier</th><th style={{ ...TH, minWidth: 80 }}>Mode</th><th style={{ ...TH, minWidth: 130 }}>Weight (kg)</th>
                        {ZONES.map(([z, zl]) => <th key={z} colSpan={2} style={TH}>{zoneHead(zl)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr><td colSpan={3} />{ZONES.map(([z]) => [<td key={`${z}f`} style={SUB}>Fwd</td>, <td key={`${z}r`} style={SUB}>RTO</td>])}</tr>
                      <tr>
                        <td style={{ padding: '6px 10px 4px' }}>
                          <select style={{ ...IN, textAlign: 'left', width: '100%' }} value={s.serviceId} onChange={(e) => pickCourier(s.key, e.target.value)}>
                            <option value="">Courier</option>
                            {services.map((x) => <option key={x.id} value={x.id}>{x.provider_name} · {x.name}</option>)}
                          </select>
                        </td>
                        <td rowSpan={2} style={{ padding: '6px 10px', verticalAlign: 'middle' }}><div style={{ ...IN, display: 'grid', placeItems: 'center', fontSize: 12, minWidth: 54, width: 64, margin: '0 auto' }}>{svc ? String(svc.type).replace(/^./, (c) => c.toUpperCase()) : ''}</div></td>
                        <td rowSpan={2} style={{ padding: '6px 10px', verticalAlign: 'middle' }}><input aria-label="Weight in kg" style={{ ...IN, width: 110, margin: '0 auto', display: 'block' }} inputMode="decimal" value={s.baseKg} onChange={(e) => patchSlab(s.key, { baseKg: e.target.value })} /></td>
                        {ZONES.map(([z, zl]) => [
                          <td key={`${z}f`} style={{ padding: '6px 4px 4px' }}><input aria-label={`${zl} forward first weight`} style={IN} inputMode="decimal" value={s.zones[z].fwdBase} onChange={(e) => patchCell(s.key, z, 'fwdBase', e.target.value)} /></td>,
                          <td key={`${z}r`} style={{ padding: '6px 4px 4px' }}><input aria-label={`${zl} RTO first weight`} style={IN} inputMode="decimal" value={s.zones[z].rtoBase} onChange={(e) => patchCell(s.key, z, 'rtoBase', e.target.value)} /></td>,
                        ])}
                      </tr>
                      <tr>
                        <td style={{ padding: '4px 10px 14px' }}><input aria-label="Additional weight in kg" placeholder="Addition" style={{ ...IN, textAlign: 'left', width: '100%' }} inputMode="decimal" value={s.addKg} onChange={(e) => patchSlab(s.key, { addKg: e.target.value })} /></td>
                        {ZONES.map(([z, zl]) => [
                          <td key={`${z}f`} style={{ padding: '4px 4px 14px' }}><input aria-label={`${zl} forward additional weight`} style={IN} inputMode="decimal" value={s.zones[z].fwdAdd} onChange={(e) => patchCell(s.key, z, 'fwdAdd', e.target.value)} /></td>,
                          <td key={`${z}r`} style={{ padding: '4px 4px 14px' }}><input aria-label={`${zl} RTO additional weight`} style={IN} inputMode="decimal" value={s.zones[z].rtoAdd} onChange={(e) => patchCell(s.key, z, 'rtoAdd', e.target.value)} /></td>,
                        ])}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <details style={{ borderTop: '1px solid var(--ops-border)', padding: '10px 20px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--ops-muted)' }}>COD charges and weight slab start</summary>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', padding: '12px 0 4px', alignItems: 'end' }}>
                    <Label>COD charge (₹)<input style={{ ...FIELD, width: 110 }} inputMode="decimal" value={s.codFee} onChange={(e) => patchSlab(s.key, { codFee: e.target.value })} /></Label>
                    <Label>COD (% of order value)<input style={{ ...FIELD, width: 150 }} inputMode="decimal" value={s.codPct} onChange={(e) => patchSlab(s.key, { codPct: e.target.value })} /></Label>
                    <Label>Slab starts at (kg)<input style={{ ...FIELD, width: 110 }} inputMode="decimal" value={s.fromKg} onChange={(e) => patchSlab(s.key, { fromKg: e.target.value })} /></Label>
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, paddingBottom: 8, cursor: 'pointer' }}><input type="checkbox" checked={!!svc && !!offered[svc.id]?.cod} disabled={!svc || !svc.supports_cod} onChange={(e) => svc && setOffered((o) => ({ ...o, [svc.id]: { ...o[svc.id], on: true, cod: e.target.checked } }))} /> Allow COD for this courier</label>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ position: 'sticky', bottom: 0, padding: '12px 0', display: 'flex', gap: 10, alignItems: 'center', background: 'var(--ops-bg, transparent)', flexWrap: 'wrap' }}>
        <Btn primary disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save rates'}</Btn>
        <Btn disabled={busy} onClick={() => router.push('/admin/rate-cards')}>Cancel</Btn>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <select aria-label="Copy another seller's rate card" style={{ ...FIELD, width: 260 }} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}><option value="">Copy another seller&apos;s rates…</option>{cards.filter((c) => c.seller_name !== setup.seller.legal_name).map((c) => <option key={c.id} value={c.id}>{c.seller_name} ({c.nexgo_code}) · {c.name}</option>)}</select>
          <Btn disabled={!copyFrom || busy} onClick={copyCard}>Copy</Btn>
        </span>
      </div>
    </div>
  );
}

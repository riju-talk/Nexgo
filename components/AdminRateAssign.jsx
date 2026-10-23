'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminApi, apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';

const CARD = { background: 'var(--ops-surface)', border: '1px solid var(--ops-border)', borderRadius: 12, boxShadow: 'var(--ops-shadow)' };
const FIELD = { height: 34, boxSizing: 'border-box', border: '1px solid var(--ops-border)', borderRadius: 8, padding: '0 9px', background: 'var(--ops-surface)', color: 'var(--ops-text)', fontSize: 13, width: '100%' };
const TH = { padding: '8px 10px', textAlign: 'center', fontSize: 11, fontWeight: 760, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--ops-muted)', background: 'var(--ops-surface-2, #f6f8fc)' };
const dateOnly = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const errText = (e, fallback) => (e instanceof ApiError ? e.message : fallback);

// The five lane zones the rating engine uses (same names and order as SwiftCourier's rate card).
const ZONES = [['within_city', 'Within city'], ['within_state', 'Within state'], ['metro_to_metro', 'Metro to metro'], ['rest_of_india', 'Rest of India'], ['ne_jk', 'North-East & J&K']];
const PRICE_COLS = [['fwdBase', 'Forward base'], ['fwdAdd', 'Forward additional'], ['rtoBase', 'RTO base'], ['rtoAdd', 'RTO additional']];
const rupees = (paise) => (paise === null || paise === undefined ? '' : String(Number(paise) / 100));
const toPaise = (v) => Math.round(Number(v) * 100);
const grams = (g) => (g >= 1000 ? `${g / 1000} kg` : `${g} g`);
const money = (paise) => (paise === null || paise === undefined ? '—' : `₹${(Number(paise) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
let slabCounter = 0;

function Btn({ children, onClick, primary, disabled, danger }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ minHeight: 34, padding: '0 13px', borderRadius: 8, border: primary ? '1px solid var(--ac, #3877fc)' : '1px solid var(--ops-border)', background: primary ? 'var(--ac, #3877fc)' : 'var(--ops-surface)', color: primary ? '#fff' : danger ? '#B23A2B' : 'var(--ops-heading)', fontSize: 12.5, fontWeight: 720, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap' }}>{children}</button>;
}
const Label = ({ children }) => <label style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--ops-muted)', minWidth: 0 }}>{children}</label>;

// One weight slab of a courier service, built from the stored rows (one row per zone). A card that only has the old single 'national' price fills all five zones with it.
function slabsFromRates(rates) {
  const byKey = new Map();
  for (const r of rates) {
    const key = `${r.service_id}|${r.min_weight_g}`;
    if (!byKey.has(key)) byKey.set(key, { key: `s${slabCounter++}`, serviceId: r.service_id, minWeightG: r.min_weight_g, baseWeightG: r.base_weight_g, additionalWeightG: r.additional_weight_g, codFee: rupees(r.cod_fee_paise), codPct: String((r.cod_percent_bps || 0) / 100), fuelBps: r.fuel_surcharge_bps || 0, rows: {} });
    byKey.get(key).rows[r.zone_code] = { fwdBase: rupees(r.base_price_paise), fwdAdd: rupees(r.additional_price_paise), rtoBase: rupees(r.rto_base_price_paise), rtoAdd: rupees(r.rto_additional_price_paise) };
  }
  return [...byKey.values()].map((s) => {
    const zones = {};
    for (const [z] of ZONES) zones[z] = s.rows[z] || s.rows.national || { fwdBase: '', fwdAdd: '', rtoBase: '', rtoAdd: '' };
    const { rows, ...rest } = s;
    return { ...rest, zones };
  });
}
const blankSlab = (serviceId, minWeightG = 0) => ({ key: `s${slabCounter++}`, serviceId, minWeightG, baseWeightG: 500, additionalWeightG: 500, codFee: '', codPct: '', fuelBps: 0, zones: Object.fromEntries(ZONES.map(([z]) => [z, { fwdBase: '', fwdAdd: '', rtoBase: '', rtoAdd: '' }])) });

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
  const toggle = (service, on) => {
    setOffered((o) => ({ ...o, [service.id]: { ...(o[service.id] || {}), on } }));
    if (on && !slabs.some((s) => s.serviceId === service.id)) setSlabs((all) => [...all, blankSlab(service.id)]);
  };

  const validate = () => {
    for (const service of setup.services) {
      if (!offered[service.id]?.on) continue;
      const mine = slabs.filter((s) => s.serviceId === service.id);
      if (!mine.length) return `${service.provider_name} ${service.name}: add at least one weight slab.`;
      const starts = new Set();
      for (const s of mine) {
        const where = `${service.provider_name} ${service.name}, slab from ${grams(Number(s.minWeightG) || 0)}`;
        if (!(Number(s.baseWeightG) > 0) || !(Number(s.additionalWeightG) > 0)) return `${where}: base weight and additional weight must be more than 0.`;
        if (starts.has(Number(s.minWeightG))) return `${service.provider_name} ${service.name}: two slabs start at the same weight.`;
        starts.add(Number(s.minWeightG));
        for (const [z, label] of ZONES) {
          for (const col of ['fwdBase', 'fwdAdd']) { const v = s.zones[z][col]; if (v === '' || !(Number(v) >= 0)) return `${where}, ${label}: enter the ${col === 'fwdBase' ? 'forward base' : 'forward additional'} price.`; }
          for (const col of ['rtoBase', 'rtoAdd']) { const v = s.zones[z][col]; if (v !== '' && !(Number(v) >= 0)) return `${where}, ${label}: the RTO price is not a number.`; }
        }
        if (s.codFee !== '' && !(Number(s.codFee) >= 0)) return `${where}: COD charge is not a number.`;
        if (s.codPct !== '' && !(Number(s.codPct) >= 0 && Number(s.codPct) <= 100)) return `${where}: COD % must be between 0 and 100.`;
      }
    }
    if (!setup.services.some((s) => offered[s.id]?.on)) return 'Switch on at least one courier service for this seller.';
    if (cardName.trim().length < 2) return 'Give the rate card a name.';
    return '';
  };

  const save = async () => {
    const problem = validate();
    if (problem) { showToast(problem, 'error'); return; }
    setBusy(true);
    try {
      const rates = []; const access = [];
      for (const service of setup.services) {
        if (!offered[service.id]?.on) continue;
        access.push({ serviceId: service.id, codEnabled: !!offered[service.id].cod });
        for (const s of slabs.filter((x) => x.serviceId === service.id)) {
          for (const [z] of ZONES) {
            const c = s.zones[z];
            rates.push({ serviceId: service.id, zoneCode: z, minWeightG: Number(s.minWeightG) || 0, baseWeightG: Number(s.baseWeightG), basePricePaise: toPaise(c.fwdBase), additionalWeightG: Number(s.additionalWeightG), additionalPricePaise: toPaise(c.fwdAdd),
              codFeePaise: s.codFee === '' ? 0 : toPaise(s.codFee), codPercentBps: s.codPct === '' ? 0 : Math.round(Number(s.codPct) * 100), fuelSurchargeBps: s.fuelBps || 0,
              rtoBasePricePaise: c.rtoBase === '' ? null : toPaise(c.rtoBase), rtoAdditionalPricePaise: c.rtoAdd === '' ? null : toPaise(c.rtoAdd) });
          }
        }
      }
      await apiFetch(`/v1/admin/sellers/${sellerId}/rate-cards`, { method: 'POST', body: { name: cardName.trim(), rates, access, replaceAll: true } });
      // A courier that was on for the seller and is now switched off.
      for (const service of setup.services) if (service.access_state === 'enabled' && !offered[service.id]?.on) await adminApi.setSellerCourierAccess(sellerId, { serviceId: service.id, state: 'disabled', accountMode: 'platform', codEnabled: false, autoAssignEligible: true }).catch(() => {});
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

  // ---------- assign: editor ----------
  return (
    <div style={{ padding: pad }}>
      {header}
      <div style={{ ...CARD, padding: 16, marginBottom: 14, display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.2fr 1fr', gap: 14, alignItems: 'end' }}>
        <Label>Rate card name<input style={FIELD} value={cardName} maxLength={120} onChange={(e) => setCardName(e.target.value)} /></Label>
        <Label>Or start from another seller&apos;s card
          <span style={{ display: 'flex', gap: 8 }}>
            <select style={FIELD} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}><option value="">Select a seller&apos;s rate card…</option>{cards.filter((c) => c.seller_name !== setup.seller.legal_name).map((c) => <option key={c.id} value={c.id}>{c.seller_name} ({c.nexgo_code}) · {c.name}</option>)}</select>
            <Btn disabled={!copyFrom || busy} onClick={copyCard}>Copy</Btn>
          </span>
        </Label>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--ops-muted)', lineHeight: 1.55 }}>Switch on each courier service this seller may book and set its prices. Each weight slab has a base weight and an additional weight step; prices are per zone for forward and RTO. Prices exclude GST (18% is added on the invoice). A service that is switched off is not offered to the seller.</p>

      {byProvider.map(([provider, services]) => (
        <section key={provider} style={{ ...CARD, padding: 16, marginBottom: 14 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 14.5, color: 'var(--ops-heading)' }}>{provider}{services[0]?.aggregator ? <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 600, color: 'var(--ops-muted)' }}>books through {services[0].aggregator}</span> : null}</h3>
          {services.map((svc) => {
            const on = !!offered[svc.id]?.on; const mine = slabs.filter((s) => s.serviceId === svc.id);
            return (
              <div key={svc.id} style={{ border: '1px solid var(--ops-border)', borderRadius: 10, padding: 12, marginBottom: 10, background: on ? 'transparent' : 'var(--ops-surface-2, #f6f8fc)' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}><input type="checkbox" checked={on} onChange={(e) => toggle(svc, e.target.checked)} /> {svc.name}</label>
                  <span style={{ border: '1px solid var(--ops-border)', borderRadius: 99, padding: '1px 9px', fontSize: 11.5 }}>{svc.type}</span>
                  {on && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, cursor: 'pointer' }}><input type="checkbox" checked={!!offered[svc.id]?.cod} disabled={!svc.supports_cod} onChange={(e) => setOffered((o) => ({ ...o, [svc.id]: { ...o[svc.id], cod: e.target.checked } }))} /> Allow COD{!svc.supports_cod ? ' (courier does not support COD)' : ''}</label>}
                </div>
                {on && mine.map((s) => (
                  <div key={s.key} style={{ marginTop: 12, border: '1px solid var(--ops-border)', borderRadius: 10, padding: 12 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(5, minmax(0,1fr)) auto', gap: 10, alignItems: 'end' }}>
                      <Label>From weight (g)<input style={FIELD} inputMode="numeric" value={s.minWeightG} onChange={(e) => patchSlab(s.key, { minWeightG: e.target.value.replace(/\D/g, '') })} /></Label>
                      <Label>Base weight (g)<input style={FIELD} inputMode="numeric" value={s.baseWeightG} onChange={(e) => patchSlab(s.key, { baseWeightG: e.target.value.replace(/\D/g, '') })} /></Label>
                      <Label>Additional weight (g)<input style={FIELD} inputMode="numeric" value={s.additionalWeightG} onChange={(e) => patchSlab(s.key, { additionalWeightG: e.target.value.replace(/\D/g, '') })} /></Label>
                      <Label>COD charge (₹)<input style={FIELD} inputMode="decimal" value={s.codFee} onChange={(e) => patchSlab(s.key, { codFee: e.target.value })} /></Label>
                      <Label>COD (% of order value)<input style={FIELD} inputMode="decimal" value={s.codPct} onChange={(e) => patchSlab(s.key, { codPct: e.target.value })} /></Label>
                      <Btn danger onClick={() => setSlabs((all) => all.filter((x) => x.key !== s.key))}>Remove slab</Btn>
                    </div>
                    <div style={{ overflowX: 'auto', marginTop: 10 }}>
                      <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
                        <thead><tr><th style={{ ...TH, textAlign: 'left' }}>Zone</th>{PRICE_COLS.map(([c, l]) => <th key={c} style={TH}>{l} (₹)</th>)}</tr></thead>
                        <tbody>{ZONES.map(([z, zl]) => (
                          <tr key={z}><td style={{ padding: '6px 10px', fontSize: 13, borderTop: '1px solid var(--ops-border)', whiteSpace: 'nowrap' }}>{zl}</td>
                            {PRICE_COLS.map(([c, l]) => <td key={c} style={{ padding: '5px 6px', borderTop: '1px solid var(--ops-border)' }}><input aria-label={`${zl} ${l}`} style={{ ...FIELD, textAlign: 'center' }} inputMode="decimal" value={s.zones[z][c]} onChange={(e) => patchCell(s.key, z, c, e.target.value)} /></td>)}
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                ))}
                {on && <div style={{ marginTop: 10 }}><Btn onClick={() => setSlabs((all) => [...all, blankSlab(svc.id, Math.max(0, ...mine.map((s) => Number(s.minWeightG) || 0)) + (mine.length ? 500 : 0))])}>+ Add weight slab</Btn></div>}
              </div>
            );
          })}
        </section>
      ))}

      <div style={{ position: 'sticky', bottom: 0, padding: '12px 0', display: 'flex', gap: 10, background: 'var(--ops-bg, transparent)' }}>
        <Btn primary disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save rates'}</Btn>
        <Btn disabled={busy} onClick={() => router.push('/admin/rate-cards')}>Cancel</Btn>
      </div>
    </div>
  );
}

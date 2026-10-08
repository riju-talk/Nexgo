'use client';

import { useCallback, useEffect, useState } from 'react';
import { reportsApi } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { FORMATS, saveRows } from '@/lib/exportFile';

const CARD = { border: '1px solid var(--ops-border)', borderRadius: 15, background: 'var(--ops-surface)', boxShadow: 'var(--ops-shadow)' };
const KIND = { 'a-revenue': 'revenue', 'a-sla-report': 'sla', 'a-analytics': 'courier-analytics', 'a-gst': 'gst' };

const inr = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(paise || 0) / 100);
const FORMAT = {
  inr,
  percent: (v) => `${Number(v || 0).toFixed(1)}%`,
  number: (v) => new Intl.NumberFormat('en-IN').format(Number(v || 0)),
  days: (v) => `${v}d`,
  text: (v) => (v === null || v === undefined || v === '' ? '—' : String(v)),
};
const fmt = (format, value) => (FORMAT[format] || FORMAT.text)(value);

function Chart({ series }) {
  const pts = series.points;
  const max = Math.max(...pts.map((p) => p.value), 0);
  if (!pts.length || max === 0) return <div style={{ height: 210, display: 'grid', placeItems: 'center', color: 'var(--ops-muted)', fontSize: 13 }}>No activity recorded in the last 30 days.</div>;
  const line = pts.map((p, i) => `${(i * 100) / Math.max(pts.length - 1, 1)},${100 - (p.value / max) * 92 - 4}`).join(' ');
  return (
    <div style={{ height: 210 }} role="img" aria-label={`${series.label}, last 30 days`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
        {[25, 50, 75].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="var(--ops-divider)" strokeDasharray="2 2" />)}
        <polyline points={line} fill="none" stroke={T.ACCENT} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function LiveAdminReports({ activeId, mobile }) {
  const { showToast } = useAppState();
  const kind = KIND[activeId];
  const [state, setState] = useState({ kind: null, data: null, error: '' });
  const [reloading, setReloading] = useState(false);
  const [format, setFormat] = useState('csv');

  const load = useCallback(async () => {
    try { return { kind, data: await reportsApi.admin(kind), error: '' }; }
    catch (e) { return { kind, data: null, error: e.status === 401 || e.status === 403 ? 'Sign in as a platform administrator to view this report.' : e.message || 'This report could not be loaded.' }; }
  }, [kind]);

  useEffect(() => {
    let live = true;
    load().then((next) => { if (live) setState(next); });
    return () => { live = false; };
  }, [load]);

  const refresh = async () => { setReloading(true); const next = await load(); setState(next); setReloading(false); if (next.error) showToast(next.error, 'error'); else showToast('Report refreshed'); };
  const exportReport = async () => {
    const d = state.data; if (!d) return;
    const plain = (f, v) => (f === 'inr' ? Number(v) / 100 : v);
    const rows = [[d.headline.label, plain(d.headline.format, d.headline.value)], [], ['Key signals'], ...d.signals.map((x) => [x.label, plain(x.format, x.value)]), [], [d.series.label, ''], ['Day', 'Value'], ...d.series.points.map((p) => [p.day, plain(d.series.format, p.value)]), [], [d.table.title], d.table.columns, ...d.table.rows.map((r) => r.map((c, j) => plain(d.table.formats[j], c)))];
    try { await saveRows(rows, `${kind}-report-${new Date().toISOString().slice(0, 10)}`, format, 'Report'); showToast(`Report exported as ${format === 'xlsx' ? 'Excel' : 'CSV'}`); } catch { showToast('Export failed', 'error'); }
  };
  const loading = state.kind !== kind;
  const { data, error } = state;
  const pad = mobile ? '14px 12px 42px' : '18px 22px 48px';

  if (loading) return <div style={{ padding: pad, maxWidth: 1560, margin: '0 auto' }}><section style={{ ...CARD, padding: 22, color: 'var(--ops-muted)', fontSize: 13 }}>Loading report…</section></div>;
  if (error || !data) return <div style={{ padding: pad, maxWidth: 1560, margin: '0 auto' }}><section style={{ ...CARD, padding: 22, color: T.RED, fontSize: 13 }}>{error || 'This report could not be loaded.'}</section></div>;

  const { headline, series, signals, table } = data;
  return (
    <div style={{ padding: pad, maxWidth: 1560, margin: '0 auto' }}>
      <section style={{ ...CARD, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: T.ACCENT, fontSize: 11, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>{headline.label}</div>
          <div style={{ marginTop: 8, fontSize: 30, fontWeight: 780, letterSpacing: '-.045em', color: 'var(--ops-heading)' }}>{fmt(headline.format, headline.value)}</div>
          <p style={{ margin: '5px 0 0', color: 'var(--ops-muted)', fontSize: 13 }}>{headline.note}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><select aria-label="Export format" value={format} onChange={(e) => setFormat(e.target.value)} style={{ height: 34, borderRadius: 8, border: '1px solid var(--ops-border)', background: 'var(--ops-surface)', color: 'var(--ops-heading)', padding: '0 8px', fontSize: 12 }}>{FORMATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><button type="button" onClick={exportReport} style={{ height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--ops-border)', background: 'var(--ops-surface)', color: 'var(--ops-heading)', fontSize: 12, fontWeight: 750, cursor: 'pointer' }}>Export</button>
        <button type="button" disabled={reloading} onClick={refresh} style={{ height: 34, padding: '0 12px', borderRadius: 8, border: `1px solid ${T.NAVY}`, background: T.NAVY, color: '#fff', fontSize: 12, fontWeight: 750, cursor: reloading ? 'wait' : 'pointer', opacity: reloading ? 0.7 : 1 }}>{reloading ? 'Refreshing…' : 'Refresh'}</button></div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.45fr .9fr', gap: 14, marginTop: 14 }}>
        <div style={{ ...CARD, padding: 18 }}>
          <b style={{ color: 'var(--ops-heading)', fontSize: 13.5 }}>{series.label} · last 30 days</b>
          <div style={{ marginTop: 14 }}><Chart series={series} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ops-subtle)', fontSize: 10.5 }}><span>{series.points[0]?.day}</span><span>{series.points[series.points.length - 1]?.day}</span></div>
        </div>
        <div style={{ ...CARD, padding: 18 }}>
          <b style={{ color: 'var(--ops-heading)', fontSize: 13.5 }}>Key signals</b>
          {signals.map((x, i) => (
            <div key={x.label} style={{ padding: '11px 0', borderBottom: i < signals.length - 1 ? '1px solid var(--ops-divider)' : 0, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ color: 'var(--ops-text)', fontSize: 12.5, fontWeight: 650 }}>{x.label}</span>
              <b style={{ color: 'var(--ops-heading)', fontSize: 12.5, textAlign: 'right' }}>{fmt(x.format, x.value)}</b>
            </div>
          ))}
        </div>
      </section>

      <section style={{ ...CARD, marginTop: 14, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--ops-divider)' }}>
          <b style={{ color: 'var(--ops-heading)', fontSize: 13.5 }}>{table.title}</b>
          <span style={{ color: 'var(--ops-muted)', fontSize: 12 }}>Updated {new Date(data.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {table.rows.length === 0 ? <div style={{ padding: 22, color: 'var(--ops-muted)', fontSize: 13 }}>No records for this period yet.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 640, width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{table.columns.map((h) => <th key={h} style={{ padding: '10px 16px', background: 'var(--ops-surface-soft)', color: 'var(--ops-muted)', textAlign: 'left', fontSize: 10.5, letterSpacing: '.07em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
              <tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} style={{ padding: '12px 16px', borderTop: '1px solid var(--ops-divider)', color: j === 0 ? 'var(--ops-heading)' : 'var(--ops-text)', fontSize: 12.5, fontWeight: j === 0 ? 720 : 500, whiteSpace: 'nowrap' }}>{fmt(table.formats[j], cell)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

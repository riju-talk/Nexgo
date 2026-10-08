'use client';

import { useCallback, useEffect, useState } from 'react';
import { reportsApi } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { FORMATS } from '@/lib/exportFile';

const CARD = { background: 'var(--nx-surface)', border: '1px solid var(--nx-glass-border)', borderRadius: 12, boxShadow: '0 2px 8px rgba(15,31,61,.05)' };
const field = { width: '100%', height: 40, boxSizing: 'border-box', borderRadius: 8, border: `1px solid ${T.INPUT_BORDER}`, background: T.SURFACE, color: T.TEXT, padding: '0 11px', fontSize: 13 };
const titleCase = (v) => (v || '').replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDay(d); };
const monthStart = (offset) => { const n = new Date(); return isoDay(new Date(n.getFullYear(), n.getMonth() + offset, 1)); };
const PRESETS = [
  ['Today', () => [daysAgo(0), daysAgo(0)]],
  ['7 days', () => [daysAgo(6), daysAgo(0)]],
  ['30 days', () => [daysAgo(29), daysAgo(0)]],
  ['This month', () => [monthStart(0), daysAgo(0)]],
  ['Last month', () => { const n = new Date(); return [monthStart(-1), isoDay(new Date(n.getFullYear(), n.getMonth(), 0))]; }],
];
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

function Button({ children, onClick, primary = false, disabled = false }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ height: 34, padding: '0 12px', borderRadius: 8, border: `1px solid ${primary ? T.NAVY : T.BORDER}`, background: primary ? T.NAVY : T.SURFACE, color: primary ? '#fff' : T.TEXT, fontSize: 12.5, fontWeight: 750, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1 }}>{children}</button>;
}

const band = { padding: '12px 16px', background: '#2454D6', color: '#fff', fontWeight: 800, fontSize: 13 };

export default function LiveReports({ mobile }) {
  const { showToast } = useAppState();
  const pad = mobile ? '14px 12px 42px' : '18px 22px 48px';
  const [types, setTypes] = useState([]);
  const [runs, setRuns] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(() => ({ type: 'mis', status: 'all', from: daysAgo(29), to: daysAgo(0) }));
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(null);
  const [format, setFormat] = useState('csv');

  const fetchRuns = useCallback(async () => {
    try { return { items: (await reportsApi.list()).items || [], error: '' }; }
    catch (e) { return { items: [], error: e.status === 401 || e.status === 403 ? 'Sign in to view and generate reports.' : e.message || 'Reports could not be loaded.' }; }
  }, []);
  const applyRuns = useCallback(({ items, error }) => { setRuns(items); setLoadError(error); }, []);

  useEffect(() => {
    let live = true;
    reportsApi.types().then((x) => { if (live) setTypes(x.items || []); }).catch(() => {});
    fetchRuns().then((result) => {
      if (!live) return;
      applyRuns(result);
      if (result.items[0]) reportsApi.get(result.items[0].id).then((run) => { if (live) setCurrent(run); }).catch(() => {});
    });
    return () => { live = false; };
  }, [fetchRuns, applyRuns]);

  const def = types.find((t) => t.id === form.type);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value, ...(key === 'type' ? { status: 'all' } : {}) }));
  const valid = !!form.from && !!form.to && form.to >= form.from;
  const label = (id) => types.find((t) => t.id === id)?.label || titleCase(id);

  const generate = async () => {
    setBusy(true);
    try {
      const run = await reportsApi.generate(form);
      setCurrent(run);
      applyRuns(await fetchRuns());
      showToast(`${label(run.report_type)} ready · ${run.row_count} rows`);
    } catch (e) {
      showToast(e.body?.details ? 'Check the selected dates and filters' : e.message || 'Report could not be generated', 'error');
    } finally { setBusy(false); }
  };
  const download = async (run, fmt = format) => { try { await reportsApi.download(run.id, run.file_name, fmt); } catch (e) { showToast(e.message || 'Download failed', 'error'); } };
  const open = async (run) => { try { setCurrent(await reportsApi.get(run.id)); } catch (e) { showToast(e.message || 'Report could not be opened', 'error'); } };
  const preview = current?.preview;

  return (
    <main style={{ padding: pad, maxWidth: '100%' }}>
      <section style={{ ...CARD, overflow: 'hidden' }}>
        <div style={band}>Generate Report</div>
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1.3fr 1fr 1fr 1fr', gap: 12 }}>
          <label style={{ color: T.TEXT_LABEL, fontSize: 12, fontWeight: 700 }}>Type
            <select value={form.type} onChange={set('type')} style={{ ...field, marginTop: 6 }}>{(types.length ? types : [{ id: 'mis', label: 'MIS summary' }]).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          </label>
          <label style={{ color: T.TEXT_LABEL, fontSize: 12, fontWeight: 700 }}>From
            <input type="date" value={form.from} max={form.to || undefined} onChange={set('from')} style={{ ...field, marginTop: 6 }} />
          </label>
          <label style={{ color: T.TEXT_LABEL, fontSize: 12, fontWeight: 700 }}>To
            <input type="date" value={form.to} min={form.from || undefined} onChange={set('to')} style={{ ...field, marginTop: 6 }} />
          </label>
          <label style={{ color: T.TEXT_LABEL, fontSize: 12, fontWeight: 700 }}>Status
            <select value={form.status} onChange={set('status')} disabled={!def?.statuses?.length} style={{ ...field, marginTop: 6 }}>
              <option value="all">All</option>
              {(def?.statuses || []).map((st) => <option key={st} value={st}>{titleCase(st)}</option>)}
            </select>
          </label>
        </div>
        {def?.description && <p style={{ margin: '0 16px 12px', color: T.TEXT_MUTED, fontSize: 12.5 }}>{def.description}</p>}
        <div style={{ padding: '0 16px 15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: `1px solid ${T.DIVIDER}` }}>
          <span style={{ color: valid ? T.TEXT_MUTED : T.RED, fontSize: 12.5 }}>{valid ? 'Up to 366 days. Exports are capped at 20,000 rows.' : 'The end date must be on or after the start date.'}</span>
          <Button primary disabled={busy || !valid} onClick={generate}>{busy ? 'Generating…' : 'Generate'}</Button>
        </div>
        <div style={{ padding: '11px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PRESETS.map(([name, range]) => <button key={name} type="button" onClick={() => { const [from, to] = range(); setForm((f) => ({ ...f, from, to })); }} style={{ height: 28, padding: '0 10px', border: `1px solid ${T.DIVIDER}`, borderRadius: 7, background: T.SURFACE_SOFT, color: T.TEXT_SECONDARY, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{name}</button>)}
        </div>
      </section>

      <section style={{ ...CARD, overflow: 'hidden', marginTop: 14 }}>
        <div style={{ ...band, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{current ? 'Report preview' : 'Latest Generated Report'}</span>
          {current && <span style={{ padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,.18)', fontSize: 11 }}>{current.row_count} rows</span>}
        </div>
        {runs === null ? <div style={{ padding: 18, color: T.TEXT_MUTED, fontSize: 13 }}>Loading reports…</div>
          : loadError ? <div style={{ padding: 18, color: T.RED, fontSize: 13 }}>{loadError}</div>
          : !current ? <div style={{ padding: 18, color: T.TEXT_SECONDARY, fontSize: 13 }}>No reports yet. Choose a type and date range above, then press Generate.</div>
          : (
            <>
              <div style={{ padding: 16, display: 'grid', gridTemplateColumns: mobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: 14 }}>
                {[['Report Type', label(current.report_type)], ['Duration', `${current.range_start} to ${current.range_end}`], ['Status filter', current.status_filter ? titleCase(current.status_filter) : 'All'], ['Generated On', when(current.created_at)]].map(([l, v]) => (
                  <div key={l}><span style={{ display: 'block', color: T.TEXT_MUTED, fontSize: 10.5, fontWeight: 850, letterSpacing: '.06em', textTransform: 'uppercase' }}>{l}</span><b style={{ display: 'block', marginTop: 6, color: T.TEXT_LABEL, fontSize: 13 }}>{v}</b></div>
                ))}
              </div>
              {preview?.rows?.length ? (
                <div style={{ overflowX: 'auto', borderTop: `1px solid ${T.DIVIDER}` }}>
                  <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
                    <thead><tr>{preview.columns.map((h) => <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10.5, letterSpacing: '.07em', color: T.TEXT_MUTED, background: T.TABLE_HEAD_BG, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
                    <tbody>{preview.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: '10px 14px', borderTop: `1px solid ${T.DIVIDER}`, color: T.TEXT_LABEL, fontSize: 12.5, whiteSpace: 'nowrap' }}>{c === null || c === '' ? '—' : String(c)}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              ) : <div style={{ padding: '0 16px 12px', color: T.TEXT_SECONDARY, fontSize: 13 }}>No records matched this period and filter. Try a wider date range.</div>}
              <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <select aria-label="Export format" value={format} onChange={(e) => setFormat(e.target.value)} style={{ ...field, width: 'auto', height: 34 }}>{FORMATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                <Button primary disabled={!current.row_count} onClick={() => download(current)}>Download {format === 'xlsx' ? 'Excel' : 'CSV'}</Button>
                {current.row_count > (preview?.rows?.length || 0) && <span style={{ color: T.TEXT_MUTED, fontSize: 12.5 }}>Showing the first {preview.rows.length} of {current.row_count} rows — the download contains every row.</span>}
              </div>
            </>
          )}
      </section>

      {runs?.length > 0 && (
        <section style={{ ...CARD, overflow: 'hidden', marginTop: 14 }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.DIVIDER}`, color: T.TEXT, fontWeight: 800, fontSize: 13 }}>Recent reports</div>
          {runs.map((run) => (
            <div key={run.id} style={{ padding: '11px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderTop: `1px solid ${T.DIVIDER}` }}>
              <div style={{ minWidth: 0 }}>
                <b style={{ color: T.TEXT, fontSize: 13 }}>{label(run.report_type)}</b>
                <small style={{ display: 'block', marginTop: 3, color: T.TEXT_MUTED }}>{run.range_start} to {run.range_end} · {run.row_count} rows · {when(run.created_at)}{run.generated_by ? ` · ${run.generated_by}` : ''}</small>
              </div>
              <div style={{ display: 'flex', gap: 8 }}><Button onClick={() => open(run)}>View</Button><Button disabled={!run.row_count} onClick={() => download(run, 'csv')}>CSV</Button><Button disabled={!run.row_count} onClick={() => download(run, 'xlsx')}>Excel</Button></div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

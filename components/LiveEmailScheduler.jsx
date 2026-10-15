'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { Btn, CARD, FIELD } from './Kit';

const REPORTS = [['pickup_pending', 'Pickup Pending Report', 'Shipments not yet picked up'], ['delivery', 'Delivery Report', 'Shipments delivered in the window'], ['delivery_failed', 'Delivery Failed Report', 'Shipments with a failed delivery attempt']];
const FREQUENCIES = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']];
const STATUSES = ['booked', 'in_transit', 'out_for_delivery', 'delivered', 'ndr', 'rto'];
const reportName = (k) => REPORTS.find((r) => r[0] === k)?.[1] || k;
const errText = (e, fallback) => (e instanceof ApiError ? e.message : fallback);
const blank = () => ({ reportType: 'pickup_pending', frequency: 'daily', runTimes: ['09:00'], fromDaysAgo: '1', toDaysAgo: '0', toEmails: [], ccEmails: [], bccEmails: [], statusFilter: [] });
const fromRow = (r) => ({ id: r.id, reportType: r.report_type, frequency: r.frequency, runTimes: r.run_times, fromDaysAgo: r.from_days_ago == null ? '' : String(r.from_days_ago), toDaysAgo: r.to_days_ago == null ? '' : String(r.to_days_ago), toEmails: r.to_emails, ccEmails: r.cc_emails, bccEmails: r.bcc_emails, statusFilter: r.status_filter });
const label = { display: 'grid', gap: 6, color: T.TEXT_SECONDARY, fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Type an address, press Enter or comma to add it as a chip.
function EmailBox({ value, onChange, placeholder }) {
  const [text, setText] = useState('');
  const commit = (raw) => {
    const parts = raw.split(/[,\s;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    onChange([...new Set([...value, ...parts.filter((x) => EMAIL_RE.test(x))])]); setText('');
  };
  return (
    <div style={{ ...FIELD, height: 'auto', minHeight: 40, display: 'flex', flexWrap: 'wrap', gap: 6, padding: 6, alignItems: 'center' }}>
      {value.map((m) => <span key={m} style={{ background: T.SURFACE_SOFT, border: `1px solid ${T.BORDER}`, borderRadius: 6, padding: '3px 8px', fontSize: 12, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>{m}<button type="button" aria-label={`Remove ${m}`} onClick={() => onChange(value.filter((x) => x !== m))} style={{ border: 0, background: 'none', marginLeft: 6, cursor: 'pointer', color: T.TEXT_MUTED }}>×</button></span>)}
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={() => commit(text)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(text); } }} placeholder={value.length ? '' : placeholder} style={{ flex: 1, minWidth: 140, border: 0, outline: 'none', background: 'transparent', color: T.TEXT, fontSize: 13 }} />
    </div>
  );
}

function ScheduleCard({ initial, onSaved, onCancel }) {
  const { showToast } = useAppState();
  const [s, setS] = useState(initial); const [time, setTime] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.value }));
  const addTime = () => {
    if (!/^([01]\d|2[0-3]):[0-5][05]$/.test(time)) return setError('Use HH:mm (24-hour) with minutes in steps of 5, for example 09:05');
    setError(''); setS((x) => ({ ...x, runTimes: [...new Set([...x.runTimes, time])].sort() })); setTime('');
  };
  const num = (v) => (v === '' ? null : Number(v));
  const save = async () => {
    setBusy(true); setError('');
    try {
      const body = { reportType: s.reportType, frequency: s.frequency, runTimes: s.runTimes, fromDaysAgo: num(s.fromDaysAgo), toDaysAgo: num(s.toDaysAgo), toEmails: s.toEmails, ccEmails: s.ccEmails, bccEmails: s.bccEmails, statusFilter: s.statusFilter };
      await apiFetch(s.id ? `/v1/email-schedules/${s.id}` : '/v1/email-schedules', { method: s.id ? 'PUT' : 'POST', body });
      showToast('Schedule saved'); onSaved();
    } catch (e) { setError(errText(e, 'Schedule could not be saved')); } finally { setBusy(false); }
  };
  const toggleStatus = (st) => setS((x) => ({ ...x, statusFilter: x.statusFilter.includes(st) ? x.statusFilter.filter((y) => y !== st) : [...x.statusFilter, st] }));
  return (
    <div style={{ border: `1px solid ${T.BORDER}`, borderRadius: 10, padding: 16, display: 'grid', gap: 14, background: T.SURFACE }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <label style={label}>Report type<select style={FIELD} value={s.reportType} onChange={set('reportType')}>{REPORTS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select><small style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{REPORTS.find((r) => r[0] === s.reportType)?.[2]}</small></label>
        <label style={label}>Frequency<select style={FIELD} value={s.frequency} onChange={set('frequency')}>{FREQUENCIES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
      </div>
      <div style={label}>Run times (IST, 24-hour; minutes in steps of 5)
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{s.runTimes.map((t) => <span key={t} style={{ background: T.SURFACE_SOFT, borderRadius: 6, padding: '4px 9px', fontSize: 12.5, textTransform: 'none', letterSpacing: 0, color: T.TEXT }}>{t}{s.runTimes.length > 1 && <button type="button" aria-label={`Remove ${t}`} onClick={() => setS((x) => ({ ...x, runTimes: x.runTimes.filter((y) => y !== t) }))} style={{ border: 0, background: 'none', marginLeft: 6, cursor: 'pointer', color: T.TEXT_MUTED }}>×</button>}</span>)}</div>
        <div style={{ display: 'flex', gap: 8 }}><input style={{ ...FIELD, width: 150 }} placeholder="HH:mm, minutes" value={time} onChange={(e) => setTime(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTime(); } }} /><Btn onClick={addTime}>Add time</Btn></div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={label}>From days ago<input style={{ ...FIELD, width: 110 }} inputMode="numeric" value={s.fromDaysAgo} onChange={(e) => setS((x) => ({ ...x, fromDaysAgo: e.target.value.replace(/\D/g, '') }))} /></label>
        <label style={label}>To days ago<input style={{ ...FIELD, width: 110 }} inputMode="numeric" value={s.toDaysAgo} onChange={(e) => setS((x) => ({ ...x, toDaysAgo: e.target.value.replace(/\D/g, '') }))} /></label>
        <small style={{ color: T.TEXT_MUTED, maxWidth: 320, fontSize: 11.5 }}>Report window: run date minus these days (inclusive). Leave empty for default.</small>
      </div>
      <div style={label}>To emails *<EmailBox value={s.toEmails} onChange={(toEmails) => setS((x) => ({ ...x, toEmails }))} placeholder="Add email, then Enter or comma" /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <div style={label}>CC emails<EmailBox value={s.ccEmails} onChange={(ccEmails) => setS((x) => ({ ...x, ccEmails }))} placeholder="Optional" /></div>
        <div style={label}>BCC emails<EmailBox value={s.bccEmails} onChange={(bccEmails) => setS((x) => ({ ...x, bccEmails }))} placeholder="Optional" /></div>
      </div>
      <div style={label}>Order status filter (optional)
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{STATUSES.map((st) => <label key={st} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', border: `1px solid ${s.statusFilter.includes(st) ? T.ACCENT : T.BORDER}`, borderRadius: 7, padding: '5px 9px', fontSize: 12, textTransform: 'none', letterSpacing: 0, fontWeight: 600, cursor: 'pointer', color: T.TEXT_LABEL }}><input type="checkbox" checked={s.statusFilter.includes(st)} onChange={() => toggleStatus(st)} style={{ accentColor: T.ACCENT }} />{st.replaceAll('_', ' ')}</label>)}</div>
        <small style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: T.TEXT_MUTED }}>Leave empty to use report-type defaults.</small>
      </div>
      {error && <div role="alert" style={{ color: T.RED, fontSize: 13 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}><Btn primary disabled={busy || !s.toEmails.length} onClick={save}>{busy ? 'Saving…' : 'Save configuration'}</Btn>{onCancel && <Btn onClick={onCancel}>Cancel</Btn>}</div>
    </div>
  );
}

export default function LiveEmailScheduler({ mobile }) {
  const { showToast } = useAppState();
  const [items, setItems] = useState(null); const [error, setError] = useState(''); const [open, setOpen] = useState(null);
  const load = useCallback(() => apiFetch('/v1/email-schedules').then((d) => { setItems(d.items); setError(''); setOpen(null); }).catch((e) => setError(errText(e, 'Schedules could not be loaded'))), []);
  useEffect(() => { load(); }, [load]);
  const remove = async (id) => { try { await apiFetch(`/v1/email-schedules/${id}`, { method: 'DELETE' }); showToast('Schedule deleted'); load(); } catch (e) { showToast(errText(e, 'Schedule could not be deleted'), 'error'); } };
  return (
    <main style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: 900 }}>
      <h2 style={{ margin: 0, color: T.TEXT, fontSize: 21 }}>Scheduled Email Reports</h2>
      <p style={{ margin: '5px 0 16px', color: T.TEXT_SECONDARY, fontSize: 13 }}>Configure status-history reports to be sent automatically by email. Your schedules are saved now; emails start going out once an email provider is connected.</p>
      <section style={{ ...CARD, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', background: T.NAVY, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 14 }}>Report schedules</b>
          <button type="button" onClick={() => setOpen('new')} style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,.4)', background: 'transparent', color: '#fff', fontWeight: 650, cursor: 'pointer' }}>+ Add schedule</button>
        </div>
        <div style={{ padding: 16, display: 'grid', gap: 12 }}>
          {error && <div role="alert" style={{ color: T.RED, fontSize: 13 }}>{error}</div>}
          {!items && !error && <span style={{ color: T.TEXT_MUTED }}>Loading…</span>}
          {open === 'new' && <ScheduleCard initial={blank()} onSaved={load} onCancel={() => setOpen(null)} />}
          {items?.length === 0 && open !== 'new' && <span style={{ color: T.TEXT_SECONDARY, fontSize: 13 }}>No schedules yet. Add one to get a report by email.</span>}
          {items?.map((r) => (
            open === r.id ? <ScheduleCard key={r.id} initial={fromRow(r)} onSaved={load} onCancel={() => setOpen(null)} /> : (
              <div key={r.id} style={{ border: `1px solid ${T.BORDER}`, borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ background: T.SURFACE_SOFT, borderRadius: 6, padding: '4px 9px', fontSize: 12.5, fontWeight: 700, color: T.TEXT }}>{reportName(r.report_type)}</span>
                <span style={{ color: T.TEXT_SECONDARY, fontSize: 12.5 }}>{FREQUENCIES.find((f) => f[0] === r.frequency)?.[1]} · {r.run_times.join(', ')} IST · {r.to_emails.length} recipient{r.to_emails.length === 1 ? '' : 's'}</span>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}><Btn small onClick={() => setOpen(r.id)}>Edit</Btn><Btn small danger onClick={() => remove(r.id)}>Delete</Btn></span>
              </div>
            )
          ))}
        </div>
      </section>
    </main>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { dismissJob, useJobs } from '@/lib/jobProgress';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { BLUE, Btn, ProgressBar, Spinner, inr } from './Kit';

const COPY = {
  assign: { running: 'Assigning couriers', finished: 'Courier assignment finished', ok: (j) => `${j.ok} order${j.ok === 1 ? '' : 's'} assigned to a courier`, partial: (j) => `${j.ok} assigned, ${j.failed} not assigned`, noun: 'booked', bad: 'not assigned', color: BLUE },
  cancel: { running: 'Cancelling', finished: 'Cancellation finished', ok: (j) => `${j.ok} cancelled${j.extra?.refundedPaise ? ` · ${inr(j.extra.refundedPaise)} back in your wallet` : ''}`, partial: (j) => `${j.ok} cancelled, ${j.failed} could not be cancelled`, noun: 'cancelled', bad: 'could not be cancelled', color: '#D9781E' },
};
const seconds = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };

function JobCard({ job, onOpenTrack }) {
  const c = COPY[job.kind];
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (job.phase !== 'running') return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [job.phase]);
  // Finished without any problem: the card goes away by itself. Problems stay until the seller closes them.
  useEffect(() => {
    if (job.phase !== 'done' || job.failed) return undefined;
    const t = setTimeout(() => dismissJob(job.id), 9000);
    return () => clearTimeout(t);
  }, [job.phase, job.failed, job.id]);

  const running = job.phase === 'running';
  const problem = job.phase === 'error' || (job.phase === 'done' && job.failed > 0);
  const slow = running && now - job.changedAt > 20000; // nothing moved for 20 s
  const tone = problem ? '#B23A2B' : job.phase === 'done' ? T.GREEN : c.color;
  return (
    <div role="status" aria-live="polite" style={{ width: 'min(360px, calc(100vw - 24px))', background: 'var(--nx-surface)', border: `1px solid ${problem ? '#F1B8B8' : 'var(--nx-border)'}`, borderLeft: `4px solid ${tone}`, borderRadius: 12, boxShadow: '0 12px 32px rgba(11,31,68,.18)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {running ? <Spinner size={18} color={c.color} /> : <span aria-hidden style={{ width: 18, height: 18, borderRadius: '50%', background: tone, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }}>{problem ? '!' : '✓'}</span>}
        <b style={{ flex: 1, fontSize: 14, color: T.TEXT }}>{running ? `${c.running}…` : job.phase === 'error' ? 'This could not be completed' : problem ? 'Finished with some problems' : c.finished}</b>
        {!running && <button type="button" aria-label="Close" onClick={() => dismissJob(job.id)} style={{ border: 0, background: 'transparent', color: T.TEXT_MUTED, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>}
      </div>

      {running && (
        <>
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.TEXT_LABEL, fontVariantNumeric: 'tabular-nums' }}>
            <span>{job.done} of {job.total} done</span>
            <span style={{ color: T.TEXT_MUTED }}>{seconds(now - job.startedAt)}</span>
          </div>
          <div style={{ marginTop: 6 }}><ProgressBar value={job.done} total={job.total} color={c.color} /></div>
          <div style={{ marginTop: 8, fontSize: 12.5, color: T.TEXT_SECONDARY }}>
            {job.ok} {c.noun}{job.failed ? ` · ${job.failed} ${c.bad}` : ''}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: slow ? '#8A5A00' : T.TEXT_MUTED, lineHeight: 1.45 }}>
            {slow ? 'Still working: the courier is answering slowly. Nothing is lost, you can keep waiting or leave this page.' : 'This runs on our servers. You can keep working or leave this page.'}
          </div>
        </>
      )}

      {!running && (
        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 13.5, color: T.TEXT }}>{job.phase === 'error' ? job.error : job.failed ? c.partial(job) : c.ok(job)}</div>
          {job.phase === 'done' && job.failed > 0 && job.firstError && <div style={{ padding: '7px 9px', borderRadius: 8, background: '#FDF2F2', border: '1px solid #F1B8B8', color: '#9B1C1C', fontSize: 12.5, lineHeight: 1.45 }}>Main reason: {job.firstError}</div>}
          {job.kind === 'assign' && job.phase === 'done' && <div style={{ marginTop: 4 }}><Btn small primary onClick={() => { onOpenTrack(); dismissJob(job.id); }}>View in Track</Btn></div>}
        </div>
      )}
    </div>
  );
}

// One card per running or just-finished background job, bottom-right on every page of the seller console.
export default function JobProgressHost() {
  const jobs = useJobs();
  const { nav } = useAppState();
  const shown = jobs.filter((j) => !(j.modal && j.phase === 'running'));
  if (!shown.length) return null;
  return (
    <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 120, display: 'grid', gap: 10, justifyItems: 'end', pointerEvents: 'none' }}>
      {shown.map((j) => <div key={j.id} style={{ pointerEvents: 'auto' }}><JobCard job={j} onOpenTrack={() => nav('shipments')} /></div>)}
    </div>
  );
}

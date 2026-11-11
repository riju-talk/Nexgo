'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, ProgressBar, Spinner, inr } from './Kit';

// A dialog that stays on screen while a long job runs: a spinner, "37 of 120", a progress bar, and a summary when it ends.
// `state` = { running, title, done, total, summary?: { lines: [string], errors: [string], tone: 'success'|'error' } }.
export function BatchProgressDialog({ state, onClose }) {
  if (!state) return null;
  const { running, title, done, total, summary } = state;
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(11,31,68,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ ...CARD, width: 'min(460px, 100%)', padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {running ? <Spinner size={20} color={BLUE} /> : <span aria-hidden style={{ width: 20, height: 20, borderRadius: '50%', background: summary?.tone === 'error' ? T.RED : T.GREEN, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{summary?.tone === 'error' ? '!' : '✓'}</span>}
          <b style={{ fontSize: 16, color: T.TEXT }}>{title}</b>
        </div>
        {running && (
          <>
            <div style={{ marginTop: 16, fontSize: 14, color: T.TEXT_LABEL, fontVariantNumeric: 'tabular-nums' }}>{done} of {total} done</div>
            <div style={{ marginTop: 8 }}><ProgressBar value={done} total={total} /></div>
            <p style={{ margin: '12px 0 0', fontSize: 12.5, color: T.TEXT_MUTED, lineHeight: 1.5 }}>This keeps running on our servers. You can close this window or leave the page; Track shows the progress until it is finished.</p>
          </>
        )}
        {!running && summary && (
          <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
            {summary.lines.map((l) => <div key={l} style={{ fontSize: 14, color: T.TEXT }}>{l}</div>)}
            {!!summary.errors.length && <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 8, background: '#FDF2F2', border: '1px solid #F1B8B8', color: '#9B1C1C', fontSize: 12.5, lineHeight: 1.5 }}>{summary.errors.slice(0, 4).map((e) => <div key={e}>{e}</div>)}</div>}
          </div>
        )}
        <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
          <Btn primary={!running} onClick={onClose}>{running ? 'Hide' : 'Done'}</Btn>
        </div>
      </div>
    </div>
  );
}

// Shown on Track while a cancellation batch is still being worked through (also after a page refresh).
export function ActiveCancelBanner({ onFinished }) {
  const [batch, setBatch] = useState(null);
  useEffect(() => {
    let live = true; let timer;
    const tick = async () => {
      try {
        const { batch: b } = await apiFetch('/v1/shipments/cancel-batch/active');
        if (!live) return;
        setBatch((prev) => { if (prev && !b) onFinished?.(); return b; });
        timer = setTimeout(tick, b ? 2000 : 15000);
      } catch { if (live) timer = setTimeout(tick, 15000); }
    };
    tick();
    return () => { live = false; clearTimeout(timer); };
  }, [onFinished]);
  if (!batch) return null;
  return (
    <div role="status" style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 10, background: '#FFF4E5', border: '1px solid #F5D9A8', color: '#7A4B00', fontSize: 13, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <Spinner size={14} />
      <b>Cancelling in the background</b>
      <span>{batch.done} of {batch.total} done{batch.failed ? ` · ${batch.failed} could not be cancelled` : ''}{batch.refunded_paise ? ` · ${inr(batch.refunded_paise)} refunded so far` : ''}.</span>
      <span style={{ flex: '0 0 120px' }}><ProgressBar value={batch.done} total={batch.total} color="#D9781E" /></span>
    </div>
  );
}

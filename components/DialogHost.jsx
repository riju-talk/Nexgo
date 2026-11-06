'use client';

import { useEffect, useRef, useState } from 'react';
import { DIALOG_EVENT } from '@/lib/dialog';
import * as T from '@/lib/theme';

/** Draws the confirm / text dialogs requested through lib/dialog.js. One at a time; a second request waits for the first. */
export default function DialogHost() {
  const [queue, setQueue] = useState([]);
  const [text, setText] = useState('');
  const inputRef = useRef(null);
  const current = queue[0];

  useEffect(() => {
    const onRequest = (e) => setQueue((q) => [...q, e.detail]);
    window.addEventListener(DIALOG_EVENT, onRequest);
    return () => window.removeEventListener(DIALOG_EVENT, onRequest);
  }, []);

  useEffect(() => {
    if (!current) return undefined;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [current]);

  if (!current) return null;
  const isText = current.kind === 'text';
  const valid = !isText || text.trim().length >= current.minLength;
  const finish = (value) => { current.resolve(value); setText(''); setQueue((q) => q.slice(1)); };
  const cancel = () => finish(isText ? null : false);
  const accept = () => { if (valid) finish(isText ? text.trim() : true); };
  const confirmColor = current.danger ? T.RED : '#3877fc';

  return (
    <div role="presentation" onClick={cancel} onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(11,31,68,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="alertdialog" aria-modal="true" aria-label={current.title} onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(440px, 100%)', background: T.SURFACE, border: `1px solid ${T.BORDER}`, borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.28)', padding: 22 }}>
        <div style={{ fontSize: 17, fontWeight: 760, color: T.TEXT }}>{current.title}</div>
        {current.message && <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.55, color: T.TEXT_SECONDARY, whiteSpace: 'pre-line' }}>{current.message}</p>}
        {isText && (
          <label style={{ display: 'block', marginTop: 14 }}>
            {current.label && <span style={{ display: 'block', fontSize: 12.5, fontWeight: 650, color: T.TEXT_LABEL, marginBottom: 6 }}>{current.label}</span>}
            <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} placeholder={current.placeholder}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); accept(); } if (e.key === 'Escape') cancel(); }}
              style={{ width: '100%', height: 40, border: `1px solid ${T.INPUT_BORDER}`, borderRadius: 8, padding: '0 12px', fontSize: 14, background: T.SURFACE, color: T.TEXT, outline: 'none' }} />
          </label>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button type="button" onClick={cancel} style={{ height: 38, padding: '0 16px', borderRadius: 8, border: `1px solid ${T.BORDER}`, background: T.SURFACE, color: T.TEXT, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>{current.cancelLabel}</button>
          <button type="button" ref={isText ? undefined : inputRef} disabled={!valid} onClick={accept}
            style={{ height: 38, padding: '0 18px', borderRadius: 8, border: `1px solid ${confirmColor}`, background: confirmColor, color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: valid ? 'pointer' : 'default', opacity: valid ? 1 : 0.55 }}>{current.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

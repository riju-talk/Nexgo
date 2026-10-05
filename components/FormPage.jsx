'use client';

import { motion } from 'motion/react';
import { useState } from 'react';
import { FORMS, CONNECTORS } from '@/lib/data';
import * as T from '@/lib/theme';
import ScenicBackdrop from './ScenicBackdrop';

const CARD = {
  position: 'relative',
  background: 'var(--nx-surface)',
  border: '1px solid var(--nx-border)',
  borderRadius: 10,
  boxShadow: '0 1px 2px rgba(20,44,66,.04), 0 8px 24px rgba(20,44,66,.045)',
};
const TAP = { scale: 0.97 };
const TAP_FAST = { duration: 0.08 };

function resolveForm(activeId) {
  const direct = FORMS[activeId];
  if (direct) return direct;
  const connector = CONNECTORS[activeId];
  if (!connector) return null;
  const [name, kind, status, account, activity, api, cfg] = connector;
  const live = status === 'Connected';
  return {
    cols: '1fr 340px',
    sections: [
      { label: name + ' connection', sub: activity, cols: '1fr 1fr', fields: [
        ['f', 'Connection status', status, 'span 1', live ? 'Authorised 14 Feb 2026' : 'Authorise to start syncing'],
        ['f', 'Account', account, 'span 1'],
        ['f', 'Store or marketplace', cfg[0], 'span 1'], ['f', 'Currency', cfg[1], 'span 1'],
        ['f', 'Sync frequency', cfg[2], 'span 1'], ['f', 'Order scope', cfg[3], 'span 1'],
        ['f', 'API', api, 'span 2'],
      ], footer: live ? 'Disconnecting stops order sync but keeps existing shipments' : 'Connect this channel to start importing orders' },
      { label: 'Sync rules', cols: '1fr 1fr', fields: [
        [live ? 'g' : 'h', 'Import new orders automatically', '', 'span 2', 'New orders appear in Intake within the sync window'],
        [live ? 'g' : 'h', 'Write tracking numbers back to ' + name, '', 'span 2'],
        [live ? 'g' : 'h', 'Mark orders as fulfilled on pickup', '', 'span 2'],
        ['h', 'Import cancelled and refunded orders', '', 'span 2'],
        [live ? 'g' : 'h', 'Map SKUs to my product catalogue', '', 'span 2', 'Unmapped SKUs are held for review'],
      ] },
    ],
    aside: [
      { label: 'Sync health', body: live ? 'Last sync completed successfully. Orders are flowing into Intake normally.' : 'This channel has never synced. Connect it to begin importing orders.',
        rows: live ? [['Last sync', '09:40 today'], ['Orders imported', activity.split(' ')[0]], ['Failures (7d)', '0'], ['Kind', kind]] : [['Last sync', 'Never'], ['Kind', kind]] },
      { label: 'Other channels', rows: [['Amazon.in', 'Connected'], ['Shopify', 'Connected'], ['WooCommerce', 'Connected'], ['OpenCart', 'Not connected'], ['Magento', 'Not connected']] },
    ],
  };
}

function Toggle({ on }) {
  return (
    <motion.div
      whileTap={{ scale: 0.94 }}
      transition={TAP_FAST}
      style={{ width: 36, height: 20, flex: '0 0 36px', borderRadius: 10, background: on ? T.ACCENT : T.DIVIDER, border: `1px solid ${on ? T.ACCENT : T.INPUT_BORDER}`, padding: 2, display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}
    >
      <motion.div layout transition={{ type: 'spring', bounce: 0, duration: 0.22 }} style={{ width: 14, height: 14, borderRadius: 8, background: on ? '#fff' : '#A8A395' }} />
    </motion.div>
  );
}

export default function FormPage({ activeId, mobile, phone }) {
  const form = resolveForm(activeId);
  const [saved, setSaved] = useState(false);
  if (!form) return null;

  const formCols = mobile ? '1fr' : form.cols;

  const pagePad = phone ? 12 : mobile ? 16 : 22;

  return (
    <div style={{ flex: 1, padding: `${phone ? 12 : 20}px ${pagePad}px 48px`, position: 'relative' }}>
      <ScenicBackdrop mode="workspace" />
      <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: formCols, gap: 20, alignItems: 'start' }}>
        <div>
          {form.sections.map((sec, si) => (
            <div key={si} style={{ ...CARD, marginBottom: 20, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.DIVIDER}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>{sec.label}</div>
                {sec.sub && <div style={{ fontSize: 13.5, color: T.TEXT_MUTED, marginTop: 5 }}>{sec.sub}</div>}
              </div>
              <div style={{ padding: phone ? 14 : 18, display: 'grid', gridTemplateColumns: mobile ? '1fr' : sec.cols, gap: phone ? 14 : 16 }}>
                {sec.fields.map((f, fi) => {
                  const kind = f[0];
                  const isToggle = kind === 'g' || kind === 'h';
                  const on = kind === 'g';
                  const label = f[1], value = f[2], span = mobile ? 'span 1' : f[3], hint = f[4] || '', suffix = f[5] || '';
                  const font = suffix === '₹' || suffix === 'kg' || suffix === 'cm' ? T.MONO : T.SANS;
                  const color = value === 'N/A' || value === 'Not serviceable' ? T.TEXT_FAINT : T.TEXT;
                  return (
                    <div key={fi} style={{ gridColumn: span }}>
                      {isToggle ? (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
                          <Toggle on={on} />
                          <div>
                            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
                            {hint && <div style={{ fontSize: 13.5, color: T.TEXT_MUTED, marginTop: 3, lineHeight: 1.5 }}>{hint}</div>}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: T.TEXT_LABEL, marginBottom: 7 }}>{label}</div>
                          <div style={{ minHeight: 40, borderRadius: 8, border: `1px solid ${T.INPUT_BORDER}`, background: T.SURFACE, padding: '9px 11px', display: 'flex', alignItems: 'center', gap: 8, fontFamily: font, fontSize: 14.5, color, lineHeight: 1.5 }}>
                            {value}
                            <div style={{ marginLeft: 'auto', fontSize: 11.5, color: T.TEXT_FAINT }}>{suffix}</div>
                          </div>
                          {hint && <div style={{ fontSize: 12, color: T.TEXT_MUTED, marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {sec.footer && (
                <div style={{ padding: '12px 18px', background: 'transparent', borderTop: `1px solid ${T.DIVIDER}`, display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ fontSize: 12.5, color: T.TEXT_MUTED }}>{sec.footer}</div>
                  <motion.div whileTap={TAP} transition={TAP_FAST} className="nxc-btn" style={{ marginLeft: 'auto', height: 32, padding: '0 13px', borderRadius: 7, border: `1px solid ${T.INPUT_BORDER}`, background: T.SURFACE, display: 'flex', alignItems: 'center', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Discard</motion.div>
                  <motion.div whileTap={TAP} transition={TAP_FAST} onClick={() => { setSaved(true); window.setTimeout(() => setSaved(false), 2200); }} style={{ height: 32, padding: '0 15px', borderRadius: 7, background: saved ? T.GREEN : T.NAVY, color: '#fff', display: 'flex', alignItems: 'center', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', boxShadow: '0 6px 16px rgba(15,31,61,.22)' }}>{saved ? 'Saved' : 'Save changes'}</motion.div>
                </div>
              )}
            </div>
          ))}
        </div>
        {form.aside && form.aside.length > 0 && (
          <div>
            {form.aside.map((a, ai) => (
              <div key={ai} style={{ ...CARD, marginBottom: 20, overflow: 'hidden' }}>
                <div style={{ padding: '13px 16px', borderBottom: `1px solid ${T.DIVIDER}`, fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: T.SECTION_HEAD }}>{a.label}</div>
                <div style={{ padding: '14px 16px' }}>
                  {a.body && <div style={{ fontSize: 13, color: T.TEXT_LABEL, lineHeight: 1.65 }}>{a.body}</div>}
                  {(a.rows || []).map(([k, v], ri) => (
                    <div key={ri} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 14, padding: '7px 0', borderBottom: `1px solid ${T.DIVIDER}`, fontSize: 12.5 }}>
                      <div style={{ color: T.TEXT_SECONDARY }}>{k}</div>
                      <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <style jsx>{`
        .nxc-btn { transition: background 100ms ease-out, border-color 100ms ease-out; }
        .nxc-btn:hover { background: var(--nx-surface-soft); border-color: var(--nx-menu-border); }
      `}</style>
    </div>
  );
}

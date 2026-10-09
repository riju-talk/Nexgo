'use client';

import { motion } from 'motion/react';
import { TABLES, ST } from '@/lib/data';
import { useAppState } from '@/lib/AppStateContext';
import { optionsFor } from '@/lib/filterOptions';
import * as T from '@/lib/theme';
import FilterDropdown from './FilterDropdown';
import ScenicBackdrop from './ScenicBackdrop';

const CARD = {
  position: 'relative',
  background: 'var(--nx-surface)',
  border: '1px solid var(--nx-border)',
  borderRadius: 12,
  boxShadow: '0 1px 2px rgba(20,44,66,.04), 0 10px 28px rgba(20,44,66,.055)',
};
const ADMIN_CARD = {
  position: 'relative',
  background: 'var(--ops-surface)',
  border: '1px solid var(--ops-border)',
  borderRadius: 10,
  boxShadow: 'var(--ops-shadow)',
};
const TAP = { scale: 0.97 };
const TAP_FAST = { duration: 0.08 };

function cell(c, align) {
  const [kind, v, sub] = c;
  const o = { v, sub: sub || '', align, isChip: false, isLink: false, isText: false, font: T.SANS, size: '13px', fw: 500, color: T.TEXT };
  if (kind === 's') {
    const p = ST[v] || ST.Cancelled;
    return { ...o, isChip: true, fg: p[0], bg: p[1], bd: p[2] };
  }
  if (kind === 'l') {
    if (sub) return { ...o, isText: true, font: T.MONO, size: '12.5px', fw: 500, color: '#0b5566' };
    return { ...o, isLink: true };
  }
  const out = { ...o, isText: true };
  if (kind === 'm') { out.font = T.MONO; out.size = '12.5px'; }
  if (kind === 'n') { out.size = '13px'; out.fw = 600; }
  if (kind === 'b') out.fw = 600;
  return out;
}

function rowOpenBehavior(activeId, nav, setDrawerOpen) {
  if (activeId === 'shipments' || activeId === 'a-shipments') return () => nav('ship-detail');
  if (activeId === 'ndr' || activeId === 'a-ndr') return () => setDrawerOpen(true);
  if (activeId === 'orders' || activeId === 'dropship') return () => nav('shipnow');
  return () => {};
}

function MobileRecords({ table, onOpenRow, showToast }) {
  const statusIndex = table.cols.findIndex(([label]) => label.toLowerCase() === 'status');
  const actionIndex = table.cols.length - 1;
  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {table.rows.map((row, index) => {
        const primary = row[0];
        const identity = row[1];
        const status = statusIndex >= 0 ? row[statusIndex] : null;
        const action = row[actionIndex];
        const details = row.slice(2, actionIndex).filter((_, i) => i + 2 !== statusIndex).slice(0, 3);
        const statusStyle = status?.[0] === 's' ? ST[status[1]] || ST.Cancelled : null;
        return (
          <motion.div
            key={index}
            onClick={onOpenRow}
            whileTap={{ scale: 0.985 }}
            transition={{ type: 'spring', bounce: 0, duration: 0.24 }}
            style={{ padding: 14, border: `1px solid ${T.BORDER}`, borderRadius: 12, background: 'var(--nx-surface)', cursor: 'pointer', boxShadow: '0 1px 1px rgba(15,23,20,.04)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: primary[0] === 'm' ? T.MONO : T.SANS, fontSize: 13, fontWeight: 700, color: primary[0] === 'l' ? '#0b5566' : T.TEXT }}>{primary[1]}</div>
                {(primary[2] || identity?.[1]) && <div style={{ marginTop: 3, fontSize: 13, color: T.TEXT_MUTED }}>{primary[2] || identity?.[1]}</div>}
              </div>
              {statusStyle && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto', fontSize: 11.5, fontWeight: 700, padding: '4px 8px', borderRadius: 20, background: statusStyle[1], color: statusStyle[0], border: `1px solid ${statusStyle[2]}` }}><span style={{ width: 5, height: 5, borderRadius: 5, background: statusStyle[0] }} />{status[1]}</div>}
            </div>
            <div style={{ marginTop: 13, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
              {details.map((item, i) => <div key={i}><div style={{ fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', color: T.TEXT_FAINT }}>{table.cols[i + 2]?.[0]}</div><div style={{ marginTop: 3, fontSize: 13.5, color: T.TEXT_LABEL, fontWeight: 550 }}>{item[1]}</div>{item[2] && <div style={{ marginTop: 2, fontSize: 13, color: T.TEXT_MUTED }}>{item[2]}</div>}</div>)}
            </div>
            {action?.[1] && <div onClick={(event) => { event.stopPropagation(); showToast(`${action[1]} is ready for ${primary[1]}`); }} style={{ marginTop: 13, paddingTop: 11, borderTop: `1px solid ${T.DIVIDER}`, fontSize: 12.5, color: '#0b5566', fontWeight: 700 }}>{action[1]} <span aria-hidden="true">→</span></div>}
          </motion.div>
        );
      })}
    </div>
  );
}

export default function TablePage({ activeId, mobile, phone }) {
  const { tab, setTab, nav, setDrawerOpen, showToast } = useAppState();
  const t = TABLES[activeId];
  if (!t) return null;

  const tabKey = tab[activeId] || (t.tabs && t.tabs[0][0]);
  const onOpenRow = rowOpenBehavior(activeId, nav, setDrawerOpen);
  const miniCols = mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)';
  const admin = activeId.startsWith('a-');
  const card = admin ? ADMIN_CARD : CARD;
  // Admin screens are work queues: the table is the primary interface, not a
  // secondary panel below a dashboard. Context remains in AdminPageHeader.
  const directTable = admin;

  const pagePad = phone ? 12 : mobile ? 16 : 28;

  return (
    <div style={{ flex: 1, padding: `${phone ? 14 : 24}px ${pagePad}px 52px`, position: 'relative' }}>
      <ScenicBackdrop mode="workspace" />
      <div style={{ position: 'relative', zIndex: 1, maxWidth: '100%', margin: '0 auto' }}>
      {t.stats && !directTable && (
        <div style={{ ...card, display: 'grid', gridTemplateColumns: miniCols, marginBottom: 20, overflow: 'hidden' }}>
          {t.stats.map(([label, value, delta, dir, sub], i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.16), duration: 0.28, ease: 'easeOut' }}
              style={{ padding: '14px 16px', borderRight: (i + 1) % (mobile ? 2 : 4) !== 0 ? `1px solid ${admin ? 'var(--ops-divider)' : T.DIVIDER}` : 'none', borderBottom: i < t.stats.length - (mobile ? 2 : 4) ? `1px solid ${admin ? 'var(--ops-divider)' : T.DIVIDER}` : 'none' }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: admin ? 'var(--ops-muted)' : T.TEXT_MUTED }}>{label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 9 }}>
                <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1, color: admin ? 'var(--ops-heading)' : T.TEXT }}>{value}</div>
                <div style={{
                  fontSize: 11.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  color: dir === 'up' ? T.GREEN : dir === 'down' ? T.RED : T.MUTE,
                  background: dir === 'up' ? `${T.GREEN}17` : dir === 'down' ? `${T.RED}17` : `${T.MUTE}17`,
                  padding: '2px 7px', borderRadius: 20,
                }}>{delta}</div>
              </div>
              <div style={{ fontSize: 13, color: admin ? 'var(--ops-muted)' : T.TEXT_MUTED, marginTop: 7 }}>{sub}</div>
            </motion.div>
          ))}
        </div>
      )}

      <div style={{ ...card, overflow: 'hidden' }}>
        {t.tabs && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 14px', borderBottom: `1px solid ${admin ? 'var(--ops-divider)' : T.DIVIDER}`, overflowX: 'auto' }}>
            {t.tabs.map(([label, count]) => {
              const on = tabKey === label;
              return (
                <motion.div
                  key={label}
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.08 }}
                  onClick={() => setTab(activeId, label)}
                  className="nxc-tab"
                  style={{ position: 'relative', padding: '13px 12px 11px', color: on ? (admin ? 'var(--ops-heading)' : T.TEXT) : (admin ? 'var(--ops-muted)' : T.TEXT_SECONDARY), fontSize: 13.5, fontWeight: on ? 600 : 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}
                >
                  {label}
                  <div style={{ fontSize: 11.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums', background: on ? 'rgba(6,182,212,.18)' : (admin ? 'var(--ops-divider)' : T.DIVIDER), color: on ? '#0b5566' : (admin ? 'var(--ops-subtle)' : '#6B6659'), padding: '1px 6px', borderRadius: 10 }}>{count}</div>
                  {on && (
                    <motion.div
                      layoutId={`tab-underline-${activeId}`}
                      transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
                      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: T.ACCENT, borderRadius: 2 }}
                    />
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: phone ? '10px' : '11px 14px', background: 'transparent', borderBottom: `1px solid ${admin ? 'var(--ops-divider)' : T.DIVIDER}`, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 32, background: admin ? 'var(--ops-surface-soft)' : T.SURFACE, border: `1px solid ${admin ? 'var(--ops-border)' : T.INPUT_BORDER}`, borderRadius: 7, padding: '0 11px', minWidth: mobile ? '100%' : 250, flex: mobile ? '1 0 100%' : undefined, color: admin ? 'var(--ops-muted)' : T.TEXT_MUTED, fontSize: 13 }}>
            <div style={{ width: 11, height: 11, border: `1.5px solid ${admin ? 'var(--ops-border)' : '#A8A395'}`, borderRadius: '50%' }} />{t.search}
          </div>
          {t.filters.map((label) => (
            <FilterDropdown
              key={label}
              label={label}
              options={optionsFor(label)}
              className="nxc-btn"
              style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, background: admin ? 'var(--ops-surface-soft)' : T.SURFACE, border: `1px solid ${admin ? 'var(--ops-border)' : T.INPUT_BORDER}`, borderRadius: 7, padding: '0 11px', fontSize: 13, color: admin ? 'var(--ops-text)' : T.TEXT_LABEL, cursor: 'pointer', whiteSpace: 'nowrap' }}
            />
          ))}
          <div style={{ marginLeft: phone ? 0 : 'auto', display: 'flex', gap: 8, flex: phone ? '1 0 100%' : undefined }}>
            {t.tools.map((label, i) => {
              const primaryTool = admin && i === t.tools.length - 1;
              return <motion.div key={label} onClick={() => showToast(`${label} has been prepared`)} whileTap={TAP} transition={TAP_FAST} className={primaryTool ? '' : 'nxc-btn'} style={{ height: 32, display: 'flex', justifyContent: phone ? 'center' : undefined, flex: phone ? 1 : undefined, alignItems: 'center', padding: '0 12px', border: `1px solid ${primaryTool ? T.NAVY : (admin ? 'var(--ops-border)' : T.INPUT_BORDER)}`, borderRadius: 8, background: primaryTool ? T.NAVY : (admin ? 'var(--ops-surface-soft)' : T.SURFACE), color: primaryTool ? '#fff' : (admin ? 'var(--ops-text)' : T.TEXT), boxShadow: primaryTool ? '0 6px 14px rgba(15,31,61,.16)' : 'none', fontSize: 12.5, fontWeight: 650, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</motion.div>;
            })}
          </div>
        </div>
        {mobile && !directTable ? <MobileRecords table={t} onOpenRow={onOpenRow} showToast={showToast} /> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: t.min }}>
            <thead>
              <tr style={{ background: 'transparent' }}>
                {t.cols.map(([label, align]) => (
                  <th key={label + align} style={{ padding: '11px 14px', textAlign: align, fontSize: 12.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: admin ? 'var(--ops-muted)' : T.TABLE_HEAD, borderBottom: `1px solid ${admin ? 'var(--ops-border)' : T.BORDER}`, whiteSpace: 'nowrap' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, ri) => (
                <motion.tr
                  key={ri}
                  onClick={onOpenRow}
                  className="nxc-row"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(ri * 0.03, 0.24), duration: 0.26, ease: 'easeOut' }}
                  style={{ borderBottom: `1px solid ${admin ? 'var(--ops-divider)' : T.ROW_DIVIDER}`, cursor: 'pointer' }}
                >
                  {r.map((c, ci) => {
                    const d = cell(c, t.cols[ci][1]);
                    return (
                      <td key={ci} style={{ padding: '0 14px', height: 48, textAlign: d.align, whiteSpace: 'nowrap' }}>
                        {d.isChip && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: d.bg, color: d.fg, border: `1px solid ${d.bd}` }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: d.fg }} />{d.v}
                          </div>
                        )}
                        {d.isLink && <div onClick={(event) => { event.stopPropagation(); showToast(`${d.v} is ready for ${r[0][1]}`); }} style={{ fontSize: 12.5, fontWeight: 600, color: '#0b5566' }}>{d.v}</div>}
                        {d.isText && (
                          <>
                            <div style={{ fontFamily: d.font, fontSize: d.size, fontWeight: d.fw, color: admin ? 'var(--ops-text)' : d.color, fontVariantNumeric: 'tabular-nums' }}>{d.v}</div>
                            {d.sub && <div style={{ fontSize: 12, color: admin ? 'var(--ops-muted)' : T.TEXT_MUTED, marginTop: 2 }}>{d.sub}</div>}
                          </>
                        )}
                      </td>
                    );
                  })}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', background: 'transparent', borderTop: `1px solid ${admin ? 'var(--ops-divider)' : T.DIVIDER}` }}>
          <div style={{ fontSize: 12.5, color: admin ? 'var(--ops-muted)' : T.TEXT_SECONDARY }}>{t.count}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <motion.div whileTap={TAP} transition={TAP_FAST} className="nxc-btn" style={{ height: 29, padding: '0 10px', display: 'flex', alignItems: 'center', border: `1px solid ${admin ? 'var(--ops-border)' : T.INPUT_BORDER}`, borderRadius: 7, background: admin ? 'var(--ops-surface-soft)' : T.SURFACE, fontSize: 12.5, color: admin ? 'var(--ops-subtle)' : T.TEXT_FAINT, cursor: 'pointer' }}>Prev</motion.div>
            <motion.div whileTap={TAP} transition={TAP_FAST} style={{ height: 29, minWidth: 29, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: T.NAVY, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>1</motion.div>
            <motion.div whileTap={TAP} transition={TAP_FAST} className="nxc-btn" style={{ height: 29, minWidth: 29, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${admin ? 'var(--ops-border)' : T.INPUT_BORDER}`, borderRadius: 7, background: admin ? 'var(--ops-surface-soft)' : T.SURFACE, fontSize: 12.5, cursor: 'pointer' }}>2</motion.div>
            <motion.div whileTap={TAP} transition={TAP_FAST} className="nxc-btn" style={{ height: 29, minWidth: 29, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${admin ? 'var(--ops-border)' : T.INPUT_BORDER}`, borderRadius: 7, background: admin ? 'var(--ops-surface-soft)' : T.SURFACE, fontSize: 12.5, cursor: 'pointer' }}>3</motion.div>
            <motion.div whileTap={TAP} transition={TAP_FAST} className="nxc-btn" style={{ height: 29, padding: '0 10px', display: 'flex', alignItems: 'center', border: `1px solid ${admin ? 'var(--ops-border)' : T.INPUT_BORDER}`, borderRadius: 7, background: admin ? 'var(--ops-surface-soft)' : T.SURFACE, fontSize: 12.5, cursor: 'pointer' }}>Next</motion.div>
          </div>
        </div>
      </div>
      </div>
      <style jsx>{`
        .nxc-btn { transition: background 100ms ease-out, border-color 100ms ease-out; }
        .nxc-btn:hover { background: ${admin ? 'var(--ops-surface)' : 'var(--nx-surface-soft)'}; border-color: ${admin ? 'rgba(6,182,212,.3)' : 'var(--nx-menu-border)'}; }
        .nxc-tab:hover { color: ${admin ? 'var(--ops-heading)' : 'var(--nx-text)'}; }
        .nxc-row { transition: background 100ms ease-out; }
        .nxc-row:hover { background: rgba(6,182,212,.09); }
      `}</style>
    </div>
  );
}

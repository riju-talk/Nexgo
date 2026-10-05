'use client';

import { motion } from 'motion/react';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import ScenicBackdrop from './ScenicBackdrop';

const ITEMS = [
  ['Printer settings', 'A4 and thermal printer profiles for labels', 'printer', '▣'],
  ['Label settings', 'Label size, content and return-label defaults', 'label', '◇'],
  ['Invoice settings', 'Invoice prefix, GST rate and HSN display', 'inv-settings', '▤'],
  ['Schedule email reports', 'Automated operational reports for your team', 'email-reports', '✉'],
  ['WhatsApp notifications', 'Delivery updates and customer follow-ups', 'wa-api', '◌'],
  ['SMS notifications', 'Shipment alerts and delivery events', 'sms-api', '□'],
  ['Order confirmation', 'Ask customers to confirm before dispatch', 'notifications', '✓'],
  ['Abandoned checkout notifications', 'Win back shoppers who left before paying', 'abandoned', '↺'],
  ['Team & roles', 'Members, permissions and workspace access', 'team', '♙'],
];

export default function AccountConfiguration({ phone, mobile }) {
  const { nav } = useAppState();
  const cols = phone ? '1fr' : mobile ? 'repeat(2,minmax(0,1fr))' : 'repeat(auto-fit,minmax(230px,1fr))';
  const pad = phone ? 12 : mobile ? 16 : 22;

  return (
    <div style={{ flex: 1, position: 'relative', padding: `${phone ? 14 : 20}px ${pad}px 48px` }}>
      <ScenicBackdrop />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 650, letterSpacing: '-.025em', color: T.TEXT }}>Account Configuration</div>
          <div style={{ marginTop: 5, fontSize: 14, color: T.TEXT_SECONDARY }}>Manage all your shipping workspace settings in one place.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: phone ? 10 : 14 }}>
          {ITEMS.map(([title, description, destination, icon]) => {
            return (
              <motion.div
                key={title}
                onClick={() => nav(destination)}
                whileHover={{ transform: 'translateY(-3px)', boxShadow: '0 12px 26px rgba(15,31,61,.12)' }}
                whileTap={{ transform: 'scale(.985)' }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                style={{ minHeight: 178, cursor: 'pointer', position: 'relative', overflow: 'hidden', padding: '17px', borderRadius: 12, background: 'var(--nx-surface)', border: '1px solid var(--nx-glass-border)', boxShadow: '0 2px 8px rgba(15,31,61,.05)' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(0,215,195,.10)', border: '1px solid rgba(0,215,195,.16)', color: T.ACCENT, fontSize: 17, fontWeight: 700 }}>{icon}</div>
                </div>
                <div style={{ marginTop: 16, fontSize: 15, fontWeight: 700, color: T.TEXT }}>{title}</div>
                <div style={{ marginTop: 5, maxWidth: 260, fontSize: 12.5, lineHeight: 1.5, color: T.TEXT_SECONDARY }}>{description}</div>
                <div style={{ position: 'absolute', left: 17, right: 17, bottom: 13, paddingTop: 10, borderTop: `1px solid ${T.DIVIDER}`, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.TEXT_MUTED }}><span>Open settings</span><span style={{ color: T.ACCENT, fontSize: 16 }}>›</span></div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

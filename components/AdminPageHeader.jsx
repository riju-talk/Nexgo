'use client';

import { motion } from 'motion/react';
import { PAGES } from '@/lib/data';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';

const CONTEXT = {
  'a-orders': ['Order intake', 'New seller orders and return pickups are visible as soon as they are created', 'Review order intake', '#0891b2'],
  'a-sellers': ['Seller health', '218 onboarding journeys need review', 'Review onboarding', '#315F93'],
  'a-shipments': ['Network pulse', '18.6k shipments are in an exception state', 'Open exceptions', '#B23A2B'],
  'a-couriers': ['Partner health', '2 courier partners are below SLA guardrails', 'View partner health', '#8A5A00'],
  'a-zones': ['Coverage control', '9 lanes need review against their delivery promise', 'Review lane mapping', '#315F93'],
  'a-sla': ['SLA guardrails', '2 policies are currently outside their expected outcome', 'Review SLA settings', '#8A5A00'],
  'a-performance': ['Network performance', '2 courier partners are on the performance watchlist', 'View performance report', '#0891b2'],
  'a-ndr': ['Action queue', '4.2k NDRs need a seller or platform decision', 'Review NDR queue', '#B23A2B'],
  'a-cod': ['Settlement control', '₹64.2L is waiting for payout approval', 'Review payouts', '#315F93'],
  'a-jobs': ['System watch', '11 job runs require attention before the next cycle', 'Review failed jobs', '#8A5A00'],
  'a-kyc': ['Trust review', '218 seller verification files are awaiting a decision', 'Open review queue', '#315F93'],
  'a-wallets': ['Money operations', '37 seller wallet balances are below their guardrail', 'Review wallet watch', '#0891b2'],
  'a-credit': ['Exposure control', '12 credit accounts have crossed their attention threshold', 'Review credit watch', '#8A5A00'],
  'a-rto': ['Return recovery', '3,284 returns have an available next action', 'Open return queue', '#B23A2B'],
  'a-pickups': ['Collection control', '32 pickup windows need an operational decision', 'Open pickup monitor', '#8A5A00'],
  'a-invoices': ['Billing operations', '3 invoice records need a final billing review', 'Open billing ledger', '#315F93'],
  'a-gst': ['Platform reports', 'Figures are calculated live from platform data', 'Refresh from the report below', '#0891b2'],
  'a-revenue': ['Platform reports', 'Figures are calculated live from platform data', 'Refresh from the report below', '#0891b2'],
  'a-sla-report': ['Platform reports', 'Figures are calculated live from platform data', 'Refresh from the report below', '#0891b2'],
  'a-analytics': ['Platform reports', 'Figures are calculated live from platform data', 'Refresh from the report below', '#0891b2'],
  'a-tickets': ['Seller support', '46 seller requests are inside the active response clock', 'Open support queue', '#315F93'],
  'a-live-chat': ['Live support', '8 conversations currently need a platform response', 'Open live desk', '#0891b2'],
  'a-escalations': ['Incident control', 'One critical escalation is approaching its resolution target', 'Open escalation desk', '#B23A2B'],
  'a-disputes': ['Partner resolution', '29 courier charge and service cases are still open', 'Open dispute queue', '#8A5A00'],
  'a-system': ['Production controls', 'Platform policies are active and ready for review', 'Open controls', '#0891b2'],
  'a-api': ['Integration health', 'One partner integration is on a performance watch', 'Open API health', '#315F93'],
  'a-audit': ['Governance', 'Every sensitive administrative action is captured here', 'Open signed log', '#315F93'],
  'a-disputes': ['Weight management', 'Record the courier decision for each disputed weight charge', 'Open dispute queue', '#8A5A00'],
  'a-notes': ['Finance documents', 'Credit notes and TDS entries issued here appear in the seller Billing tab', 'Open finance documents', '#315F93'],
  'a-roles': ['Access governance', 'Role boundaries protect sensitive platform operations', 'Review permissions', '#315F93'],
};

export default function AdminPageHeader({ activeId, phone }) {
  const { showToast } = useAppState();
  const [, title, sub] = PAGES[activeId] || ['', 'Operations', ''];
  const [eyebrow, attention, action, color] = CONTEXT[activeId] || ['Platform operations', 'This workspace is ready for review', 'Open workspace', T.ACCENT];
  return <div style={{ position: 'relative', zIndex: 2, padding: phone ? '20px 12px 2px' : '30px 28px 4px', background: 'transparent' }}>
    <div style={{ maxWidth: 1560, margin: '0 auto', display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: T.ACCENT }}>Operations / {eyebrow}</div>
        <h1 style={{ margin: '8px 0 0', color: 'var(--ops-heading)', fontSize: 28, lineHeight: 1.04, letterSpacing: '-.035em', fontWeight: 780 }}>{title}</h1>
        <p style={{ margin: '8px 0 0', color: 'var(--ops-muted)', fontSize: 14, lineHeight: 1.45 }}>{sub}</p>
      </div>
      <motion.button whileTap={{ scale: .97 }} onClick={() => showToast(`${action} is ready`)} style={{ maxWidth: phone ? '100%' : 320, minHeight: 40, display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', cursor: 'pointer', textAlign: 'left', border: '1px solid var(--ops-border)', borderRadius: 11, background: 'var(--ops-surface)', boxShadow: 'var(--ops-shadow)' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 0 4px ${color}1C` }} />
        <span style={{ minWidth: 0 }}><b style={{ display: 'block', color: 'var(--ops-heading)', fontSize: 12.5 }}>{eyebrow}</b><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2, color: 'var(--ops-muted)', fontSize: 11.5 }}>{attention}</span></span>
        <span style={{ marginLeft: 'auto', color, fontSize: 16 }}>›</span>
      </motion.button>
    </div>
  </div>;
}

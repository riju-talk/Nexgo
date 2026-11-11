'use client';

import { useLiveQuery } from '@/lib/queryCache';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, Pill, Stat, Table, dateTime, inr0, titleCase } from './Kit';

const Head = ({ title, note }) => (
  <div>
    <div style={{ color: T.TEXT, fontWeight: 760, fontSize: 19 }}>{title}</div>
    <div style={{ color: T.TEXT_SECONDARY, marginTop: 4, fontSize: 13 }}>{note}</div>
  </div>
);
const grid = (mobile, n) => ({ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,minmax(0,1fr))' : `repeat(${n},minmax(0,1fr))`, gap: 12 });
const page = (mobile) => ({ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', display: 'grid', gap: 14 });
const num = (v) => (v === undefined || v === null ? '—' : Number(v).toLocaleString('en-IN'));
const errText = (e) => (e ? e.message || 'Could not load this screen. Try again.' : null);

// Sellers who may go below a zero wallet, and sellers already below it.
function CreditLimits({ mobile }) {
  const { data, error, loading } = useLiveQuery('/v1/admin/credit-limits', { every: 60000 });
  const t = data?.totals;
  const cols = [
    { h: 'Seller', cell: (r) => <a href={`/admin/sellers/${r.id}`} style={{ color: BLUE, fontWeight: 650, textDecoration: 'none' }}>{r.legal_name}</a> },
    { h: 'NEXGO code', cell: (r) => r.nexgo_code || '—' },
    { h: 'Wallet balance', right: true, cell: (r) => <span style={{ color: r.balance_paise < 0 ? T.RED : T.TEXT }}>{inr0(r.balance_paise)}</span> },
    { h: 'Debit limit', right: true, cell: (r) => inr0(r.limit_paise) },
    { h: 'Used', right: true, cell: (r) => inr0(r.used_paise) },
    { h: 'Still available', right: true, cell: (r) => inr0(r.available_paise) },
    { h: 'Utilisation', cell: (r) => (r.utilisation_pct === null ? <Pill color={T.RED}>No limit set</Pill> : <Pill color={r.utilisation_pct >= 90 ? T.RED : r.utilisation_pct >= 60 ? '#8A5A00' : T.GREEN}>{r.utilisation_pct}%</Pill>) },
  ];
  return (
    <div style={page(mobile)}>
      <Head title="Credit limits" note="Sellers who may spend below a zero wallet, and sellers whose wallet is already negative. The limit itself is set on the seller's profile." />
      <div style={grid(mobile, 3)}>
        <Stat label="Sellers listed" value={num(t?.sellers)} note="Limit set or wallet negative" color={BLUE} />
        <Stat label="Total limit given" value={t ? inr0(t.limitPaise) : '—'} note="Across listed sellers" color={T.GREEN} />
        <Stat label="Credit in use" value={t ? inr0(t.usedPaise) : '—'} note="Negative wallet balances" color={T.RED} />
      </div>
      <div style={{ ...CARD, padding: 4 }}><Table columns={cols} rows={data?.items || []} loading={loading} error={errText(error)} empty="No seller has a debit limit or a negative wallet." /></div>
    </div>
  );
}

// Platform administrators and what each role may change.
function Roles({ mobile }) {
  const { data, error, loading } = useLiveQuery('/v1/admin/roles', { every: 120000 });
  const label = Object.fromEntries((data?.matrix || []).map((m) => [m.role, m.label]));
  const cols = [
    { h: 'Name', cell: (r) => <b>{r.full_name}</b> }, { h: 'Email', cell: (r) => r.email },
    { h: 'Role', cell: (r) => <Pill color={BLUE}>{label[r.role] || titleCase(r.role)}</Pill> },
    { h: 'Authenticator app', cell: (r) => (r.authenticator_enrolled ? <Pill>Set up</Pill> : <span style={{ color: T.TEXT_MUTED }}>Not set up</span>) },
    { h: 'Added', cell: (r) => dateTime(r.created_at) },
  ];
  return (
    <div style={page(mobile)}>
      <Head title="Role permissions" note="Who can sign in to this panel and what each role may change. Every role can look; only the roles below can change things." />
      <div style={{ ...CARD, padding: 4 }}><Table columns={cols} rows={data?.admins || []} loading={loading} error={errText(error)} empty="No administrators found." /></div>
      <div style={grid(mobile, 3)}>
        {(data?.matrix || []).map((m) => (
          <div key={m.role} style={{ ...CARD, padding: 16 }}>
            <div style={{ fontWeight: 740, color: T.TEXT }}>{m.label}</div>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: T.TEXT_SECONDARY, fontSize: 13, display: 'grid', gap: 4 }}>{m.can.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tickets that need a person now.
function Escalations({ mobile }) {
  const { data, error, loading } = useLiveQuery('/v1/admin/escalations', { every: 60000 });
  const items = data?.items || [];
  const cols = [
    { h: 'Seller', cell: (r) => r.seller_name }, { h: 'Subject', cell: (r) => <b>{r.subject}</b> },
    { h: 'Priority', cell: (r) => <Pill color={r.priority === 'urgent' ? T.RED : '#8A5A00'}>{titleCase(r.priority)}</Pill> },
    { h: 'Status', cell: (r) => titleCase(r.state) },
    { h: 'Waiting', cell: (r) => (r.age_hours < 48 ? `${r.age_hours} h` : `${Math.floor(r.age_hours / 24)} d`) },
    { h: 'Raised', cell: (r) => dateTime(r.created_at) },
  ];
  return (
    <div style={page(mobile)}>
      <Head title="Escalations" note="Open tickets that are urgent or high priority, or have waited more than 48 hours. Answer them from Tickets." />
      <div style={grid(mobile, 3)}>
        <Stat label="Needs attention" value={loading ? '—' : num(items.length)} note="Right now" color={T.RED} />
        <Stat label="Urgent" value={loading ? '—' : num(items.filter((x) => x.priority === 'urgent').length)} note="Priority urgent" color={T.RED} />
        <Stat label="Waiting over 48 h" value={loading ? '—' : num(items.filter((x) => x.age_hours >= 48).length)} note="Any priority" color="#8A5A00" />
      </div>
      <div style={{ ...CARD, padding: 4 }}><Table columns={cols} rows={items} loading={loading} error={errText(error)} empty="Nothing is escalated. Every urgent or old ticket has been handled." /></div>
    </div>
  );
}

// Queues, failed jobs, storage and database version.
function System({ mobile }) {
  const { data, error, loading, refresh } = useLiveQuery('/v1/admin/system-status', { every: 30000 });
  const j = data?.jobsLast7Days || {};
  const row = { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' };
  return (
    <div style={page(mobile)}>
      <Head title="System status" note="Background work, file storage and database version, read live. Nothing here is changed from this screen." />
      {error && <div style={{ color: T.RED, fontSize: 13 }}>{errText(error)}</div>}
      <div style={grid(mobile, 4)}>
        <Stat label="Orders waiting for a courier" value={loading ? '—' : num(data?.assignWaiting)} note="Assign queue" color={BLUE} />
        <Stat label="Cancellations waiting" value={loading ? '—' : num(data?.cancelWaiting)} note="Cancel queue" color={BLUE} />
        <Stat label="Failed jobs (7 days)" value={loading ? '—' : num((j.failed || 0) + (j.dead_letter || 0))} note="Failed or gave up" color={T.RED} />
        <Stat label="Jobs done (7 days)" value={loading ? '—' : num(j.succeeded || 0)} note="Succeeded" color={T.GREEN} />
      </div>
      <div style={{ ...CARD, padding: 16, display: 'grid', gap: 10, fontSize: 13.5 }}>
        <div style={row}><span>File storage</span>{data ? (data.storage.ok ? <Pill>Working</Pill> : <Pill color={T.RED}>{data.storage.message || 'Not working'}</Pill>) : '—'}</div>
        <div style={row}><span>Database updates applied</span><b>{data ? `${data.migrations.applied} (latest ${data.migrations.latest})` : '—'}</b></div>
        <div style={row}><span>Last background job started</span><b>{data ? (data.lastJobAt ? dateTime(data.lastJobAt) : 'Never') : '—'}</b></div>
        <div style={row}><span>Checked at</span><b>{data ? dateTime(data.checkedAt) : '—'}</b></div>
      </div>
      <div><Btn onClick={refresh}>Check again</Btn></div>
    </div>
  );
}

export default function AdminPlatformPages({ id, mobile }) {
  if (id === 'a-credit') return <CreditLimits mobile={mobile} />;
  if (id === 'a-roles') return <Roles mobile={mobile} />;
  if (id === 'a-escalations') return <Escalations mobile={mobile} />;
  return <System mobile={mobile} />;
}

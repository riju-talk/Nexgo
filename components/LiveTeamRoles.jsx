'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import * as T from '@/lib/theme';
import { Btn, CARD, FIELD, Pill, Table, dayText, titleCase } from './Kit';

const errText = (e, fallback) => (e instanceof ApiError ? e.message : fallback);

// One tick-box per permission, grouped like the reference (Dashboard / Orders / Shipments / Weight).
function PermissionPicker({ groups, value, onChange }) {
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div style={{ border: `1px solid ${T.BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '9px 12px', background: T.SURFACE_SOFT, color: T.TEXT_LABEL, fontSize: 12, fontWeight: 700 }}>Set permissions</div>
      {groups.map((g) => (
        <div key={g.group} style={{ display: 'flex', gap: 12, padding: '10px 12px', borderTop: `1px solid ${T.DIVIDER}`, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <span style={{ width: 92, flexShrink: 0, color: T.TEXT_SECONDARY, fontSize: 12.5, fontWeight: 700, paddingTop: 6 }}>{g.group}</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 220 }}>
            {g.items.map(([key, label]) => (
              <label key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 10px', border: `1px solid ${value.includes(key) ? T.ACCENT : T.BORDER}`, borderRadius: 8, background: T.SURFACE, color: T.TEXT_LABEL, fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={value.includes(key)} onChange={() => toggle(key)} style={{ accentColor: T.ACCENT }} />{label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Modal({ heading, onClose, children }) {
  return (
    <div role="dialog" aria-label={heading} onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', background: 'rgba(15,30,45,.45)', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: 'min(680px, 100%)', maxHeight: '92vh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <b style={{ color: T.TEXT, fontSize: 16 }}>{heading}</b>
          <Btn small onClick={onClose}>Close</Btn>
        </div>
        {children}
      </div>
    </div>
  );
}

function EmployeeForm({ groups, onClose, onDone }) {
  const { showToast } = useAppState();
  const [f, setF] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [permissions, setPermissions] = useState(['dashboard']);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await apiFetch('/v1/seller/team/employees', { method: 'POST', body: { ...f, phone: f.phone || undefined, permissions } }); showToast('Employee access created'); onDone(); onClose(); }
    catch (err) { setError(errText(err, 'Employee could not be added')); } finally { setBusy(false); }
  };
  const label = { display: 'grid', gap: 5, color: T.TEXT_LABEL, fontSize: 12.5, fontWeight: 650 };
  return (
    <Modal heading="Add New employee access" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <label style={label}>Employee Name *<input style={FIELD} value={f.fullName} onChange={set('fullName')} required minLength={2} /></label>
          <label style={label}>Employee Email *<input style={FIELD} type="email" value={f.email} onChange={set('email')} required /></label>
          <label style={label}>Employee Mobile No. (Optional)<input style={FIELD} value={f.phone} onChange={set('phone')} inputMode="tel" /></label>
          <label style={label}>Set Password * (min 12 characters)<input style={FIELD} type="password" autoComplete="new-password" value={f.password} onChange={set('password')} required minLength={12} /></label>
        </div>
        <PermissionPicker groups={groups} value={permissions} onChange={setPermissions} />
        {error && <div role="alert" style={{ color: T.RED, fontSize: 13 }}>{error}</div>}
        <div><Btn primary type="submit" disabled={busy || !permissions.length}>{busy ? 'Saving…' : 'Create access'}</Btn></div>
      </form>
    </Modal>
  );
}

function PermissionEditor({ member, groups, onClose, onDone }) {
  const { showToast } = useAppState();
  const [permissions, setPermissions] = useState(member.permissions || []);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await apiFetch(`/v1/seller/team/${member.user_id}/permissions`, { method: 'PUT', body: { permissions } }); showToast('Permissions updated'); onDone(); onClose(); }
    catch (err) { setError(errText(err, 'Permissions could not be saved')); } finally { setBusy(false); }
  };
  return (
    <Modal heading={`Permissions — ${member.full_name}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: 14 }}>
        <PermissionPicker groups={groups} value={permissions} onChange={setPermissions} />
        {error && <div role="alert" style={{ color: T.RED, fontSize: 13 }}>{error}</div>}
        <div><Btn primary disabled={busy || !permissions.length} onClick={save}>{busy ? 'Saving…' : 'Save permissions'}</Btn></div>
      </div>
    </Modal>
  );
}

export default function LiveTeamRoles({ mobile }) {
  const { showToast } = useAppState();
  const [data, setData] = useState(null); const [error, setError] = useState('');
  const [adding, setAdding] = useState(false); const [editing, setEditing] = useState(null);
  const [inviteEmail, setInviteEmail] = useState(''); const [inviteRole, setInviteRole] = useState('operations');
  const load = useCallback(() => apiFetch('/v1/seller/team').then((d) => { setData(d); setError(''); }).catch((e) => setError(errText(e, 'Team could not be loaded'))), []);
  useEffect(() => { load(); }, [load]);
  const invite = async () => {
    try { await apiFetch('/v1/seller/team/invite', { method: 'POST', body: { email: inviteEmail, role: inviteRole } }); setInviteEmail(''); showToast('Invitation created and email queued'); load(); }
    catch (e) { showToast(errText(e, 'Invite could not be created'), 'error'); }
  };
  const remove = async (m) => {
    try { await apiFetch(`/v1/seller/team/${m.user_id}`, { method: 'DELETE' }); showToast(`${m.full_name} removed`); load(); }
    catch (e) { showToast(errText(e, 'Member could not be removed'), 'error'); }
  };
  const groups = data?.permissionGroups || [];
  const count = (m) => (m.permissions ? `${m.permissions.length} permission${m.permissions.length === 1 ? '' : 's'}` : 'Full role access');
  const columns = [
    { h: 'Member', wrap: true, cell: (m) => <><b>{m.full_name}</b><small style={{ display: 'block', color: T.TEXT_MUTED, marginTop: 3 }}>{m.email}{m.phone ? ` · ${m.phone}` : ''}</small></> },
    { h: 'Role', cell: (m) => <Pill color={m.role === 'owner' ? T.GREEN : T.ACCENT}>{titleCase(m.role)}</Pill> },
    { h: 'Access', cell: (m) => count(m) },
    { h: 'Joined', cell: (m) => dayText(m.created_at) },
    { h: '', right: true, cell: (m) => m.role === 'owner' ? null : <span style={{ display: 'inline-flex', gap: 6 }}>{m.permissions && <Btn small onClick={() => setEditing(m)}>Permissions</Btn>}<Btn small danger onClick={() => remove(m)}>Remove</Btn></span> },
  ];
  return (
    <main style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: '100%' }}>
      <div style={{ marginBottom: 15 }}>
        <h2 style={{ margin: 0, color: T.TEXT, fontSize: 19 }}>Teams & roles</h2>
        <p style={{ margin: '5px 0 0', color: T.TEXT_SECONDARY, fontSize: 13 }}>Give employees their own sign-in and choose exactly what each of them can do. Permissions are enforced by the server.</p>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Btn primary onClick={() => setAdding(true)} disabled={!data}>+ Add employee access</Btn>
      </div>
      <section style={{ ...CARD, overflow: 'hidden' }}>
        <Table columns={columns} rows={data?.members || []} loading={!data && !error} error={error} rowKey={(m) => m.user_id} empty="No team members yet." />
      </section>
      <section style={{ ...CARD, padding: 16, marginTop: 14 }}>
        <b style={{ color: T.TEXT, fontSize: 13.5 }}>Invite by email instead</b>
        <p style={{ margin: '4px 0 10px', color: T.TEXT_SECONDARY, fontSize: 12.5 }}>They choose their own password and get the standard role access.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="teammate@company.com" style={{ ...FIELD, flex: '1 1 240px' }} />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ ...FIELD, width: 150 }}><option value="operations">Operations</option><option value="finance">Finance</option><option value="read_only">Read only</option></select>
          <Btn disabled={!inviteEmail} onClick={invite}>Send invite</Btn>
        </div>
        {data?.pendingInvitations?.length > 0 && <div style={{ marginTop: 10, color: T.TEXT_SECONDARY, fontSize: 12.5 }}>{data.pendingInvitations.length} pending invitation{data.pendingInvitations.length > 1 ? 's' : ''}.</div>}
      </section>
      {adding && <EmployeeForm groups={groups} onClose={() => setAdding(false)} onDone={load} />}
      {editing && <PermissionEditor member={editing} groups={groups} onClose={() => setEditing(null)} onDone={load} />}
    </main>
  );
}

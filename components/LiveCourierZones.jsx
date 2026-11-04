'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAppState } from '@/lib/AppStateContext';
import { FORMATS, saveRows } from '@/lib/exportFile';
import * as T from '@/lib/theme';
import { BLUE, Btn, CARD, FIELD, Pager, Pill, Table, isoDay } from './Kit';

const ZONES = [
  ['within_city', 'Within City'],
  ['within_state', 'Within State'],
  ['metro_to_metro', 'Metro to Metro'],
  ['rest_of_india', 'Rest of India'],
  ['ne_jk', 'NE / J&K'],
  ['national', 'National']
];

const SERVICE_TYPES = [
  ['', 'All'],
  ['surface', 'Surface'],
  ['air', 'Air'],
  ['express', 'Express'],
  ['hyperlocal', 'Hyperlocal']
];

// Admin zone management: configure courier lanes (origin → destination → zone)
export default function LiveCourierZones({ mobile }) {
  const { showToast } = useAppState();
  const [courierId, setCourierId] = useState('');
  const [couriers, setCouriers] = useState([]);
  const [page, setPage] = useState(1);
  const [qOrigin, setQOrigin] = useState('');
  const [qDest, setQDest] = useState('');
  const [filterZone, setFilterZone] = useState('');
  const [filterService, setFilterService] = useState('');
  const [tick, setTick] = useState(0);
  const [data, setData] = useState({ key: '', lanes: [], total: 0, pages: 1, error: '', stats: null });
  const [dialog, setDialog] = useState(null); // 'add', 'edit', 'delete', 'import'
  const [editLane, setEditLane] = useState(null);
  const [form, setForm] = useState({ originPincode: '', destinationPincode: '', zone: 'within_city', serviceType: '', transitDays: '', isServiceable: true });
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState('csv');
  const [importText, setImportText] = useState('');

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (qOrigin.trim()) p.set('originPincode', qOrigin.trim());
    if (qDest.trim()) p.set('destinationPincode', qDest.trim());
    if (filterZone) p.set('zone', filterZone);
    if (filterService) p.set('serviceType', filterService);
    return p;
  }, [page, qOrigin, qDest, filterZone, filterService]);

  const key = `${params}#${tick}`;

  // Load couriers list
  useEffect(() => {
    apiFetch('/v1/admin/couriers')
      .then((x) => {
        const list = x.items || [];
        setCouriers(list);
        if (list.length > 0 && !courierId) {
          setCourierId(list[0].id);
        }
      })
      .catch(() => {});
    // Runs once on mount; picking a courier loads its lanes through its own handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!courierId) return;
    let live = true;
    Promise.all([
      apiFetch(`/v1/admin/couriers/${courierId}/zones/lanes?${params}`),
      apiFetch(`/v1/admin/couriers/${courierId}/zones/lanes/stats`)
    ])
      .then(([lanesData, stats]) => {
        if (live) setData({ key, error: '', lanes: lanesData.lanes || [], total: lanesData.pagination?.total || 0, pages: lanesData.pagination?.totalPages || 1, stats });
      })
      .catch((e) => {
        if (live) setData({ key, lanes: [], total: 0, pages: 1, stats: null, error: e.status === 401 || e.status === 403 ? 'Sign in as admin.' : e.message || 'Lanes could not be loaded.' });
      });
    return () => { live = false; };
  }, [courierId, params, key]);

  const loading = data.key !== key;
  const stats = data.stats || { totalLanes: 0, serviceableLanes: 0, zoneBreakdown: {}, serviceTypeBreakdown: {} };

  const openAdd = () => {
    setForm({ originPincode: '', destinationPincode: '', zone: 'within_city', serviceType: '', transitDays: '', isServiceable: true });
    setEditLane(null);
    setDialog('add');
  };

  const openEdit = (lane) => {
    setForm({
      originPincode: lane.originPincode,
      destinationPincode: lane.destinationPincode,
      zone: lane.zone,
      serviceType: lane.serviceType || '',
      transitDays: lane.transitDays !== null ? String(lane.transitDays) : '',
      isServiceable: lane.isServiceable
    });
    setEditLane(lane);
    setDialog('edit');
  };

  const openDelete = (lane) => {
    setEditLane(lane);
    setDialog('delete');
  };

  const submitLane = async () => {
    setBusy(true);
    try {
      const body = {
        courierProviderId: courierId,
        originPincode: form.originPincode.trim(),
        destinationPincode: form.destinationPincode.trim(),
        zone: form.zone,
        serviceType: form.serviceType || null,
        transitDays: form.transitDays ? parseInt(form.transitDays, 10) : null,
        isServiceable: form.isServiceable
      };

      if (dialog === 'edit') {
        await apiFetch(`/v1/admin/couriers/${courierId}/zones/lanes/${editLane.id}`, { method: 'PATCH', body: { zone: body.zone, serviceType: body.serviceType, transitDays: body.transitDays, isServiceable: body.isServiceable } });
        showToast('Lane updated successfully');
      } else {
        await apiFetch(`/v1/admin/couriers/${courierId}/zones/lanes`, { method: 'POST', body });
        showToast('Lane created successfully');
      }

      setDialog(null);
      setTick((t) => t + 1);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Operation failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await apiFetch(`/v1/admin/couriers/${courierId}/zones/lanes/${editLane.id}`, { method: 'DELETE' });
      showToast('Lane deleted successfully');
      setDialog(null);
      setTick((t) => t + 1);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Delete failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openImport = () => {
    setImportText('');
    setDialog('import');
  };

  const submitImport = async () => {
    setBusy(true);
    try {
      // Parse CSV: originPincode,destinationPincode,zone,serviceType,transitDays,isServiceable
      const lines = importText.trim().split('\n').filter(l => l.trim());
      if (lines.length === 0) {
        showToast('No data to import', 'error');
        setBusy(false);
        return;
      }

      // Skip header if exists
      const hasHeader = lines[0].toLowerCase().includes('origin');
      const dataLines = hasHeader ? lines.slice(1) : lines;

      const lanes = dataLines.map(line => {
        const [origin, dest, zone, serviceType, transitDays, serviceable] = line.split(',').map(v => v.trim());
        return {
          originPincode: origin,
          destinationPincode: dest,
          zone,
          serviceType: serviceType || null,
          transitDays: transitDays ? parseInt(transitDays, 10) : null,
          isServiceable: serviceable === 'false' ? false : true
        };
      });

      const result = await apiFetch(`/v1/admin/couriers/${courierId}/zones/lanes/bulk-import`, {
        method: 'POST',
        body: { courierProviderId: courierId, lanes }
      });

      showToast(`Import complete: ${result.success} succeeded, ${result.failed} failed`);
      setDialog(null);
      setTick((t) => t + 1);
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : 'Import failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const exportAll = async () => {
    setBusy(true);
    try {
      const p = new URLSearchParams(params);
      p.set('pageSize', '1000');
      const allData = await apiFetch(`/v1/admin/couriers/${courierId}/zones/lanes?${p}`);
      const all = allData.lanes || [];

      if (!all.length) return showToast('Nothing to export.', 'error');

      await saveRows(
        [['Origin Pincode', 'Destination Pincode', 'Zone', 'Service Type', 'Transit Days', 'Serviceable', 'Created At'],
        ...all.map((r) => [r.originPincode, r.destinationPincode, r.zone, r.serviceType || '', r.transitDays !== null ? r.transitDays : '', r.isServiceable ? 'Yes' : 'No', r.createdAt])],
        `courier-lanes-${isoDay()}`,
        format,
        'Lanes'
      );
      showToast(`Exported ${all.length} lanes`);
    } catch (e) {
      showToast(e.message || 'Export failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!courierId) {
    return (
      <div style={{ padding: mobile ? '14px 12px' : '18px 28px', maxWidth: 1560, margin: '0 auto' }}>
        <div style={{ ...CARD, padding: 22, background: 'var(--ops-surface)', color: T.TEXT_MUTED }}>
          {couriers.length === 0 ? 'Loading couriers...' : 'Select a courier to manage zones.'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: mobile ? '14px 12px 42px' : '18px 28px 48px', maxWidth: 1680, margin: '0 auto' }}>
      {/* Courier Selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: T.TEXT_MUTED, marginBottom: 6, display: 'block' }}>Select Courier Provider</label>
        <select 
          style={{ ...FIELD, maxWidth: 320 }} 
          value={courierId} 
          onChange={(e) => { setCourierId(e.target.value); setPage(1); setTick(t => t + 1); }}
        >
          {couriers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12, marginBottom: 14 }}>
        {[['Total Lanes', stats.totalLanes, BLUE], ['Serviceable', stats.serviceableLanes, T.GREEN], ['Metro to Metro', stats.zoneBreakdown.metro_to_metro || 0, '#F58220'], ['Rest of India', stats.zoneBreakdown.rest_of_india || 0, '#6D28D9']].map(([l, v, col]) => <div key={l} style={{ ...CARD, padding: 14, borderTop: `3px solid ${col}`, background: 'var(--ops-surface)' }}><span style={{ fontSize: 11.5, color: T.TEXT_MUTED }}>{l}</span><b style={{ display: 'block', fontSize: 22, color: T.TEXT, marginTop: 3 }}>{v}</b></div>)}
      </div>

      <section style={{ ...CARD, background: 'var(--ops-surface)' }}>
        <div style={{ padding: 14, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input aria-label="Origin pincode" style={{ ...FIELD, flex: '1 1 140px' }} placeholder="Origin pincode" value={qOrigin} onChange={(e) => { setQOrigin(e.target.value); setPage(1); }} />
          <input aria-label="Destination pincode" style={{ ...FIELD, flex: '1 1 140px' }} placeholder="Dest pincode" value={qDest} onChange={(e) => { setQDest(e.target.value); setPage(1); }} />
          <select aria-label="Filter zone" style={{ ...FIELD, flex: '0 0 160px' }} value={filterZone} onChange={(e) => { setFilterZone(e.target.value); setPage(1); }}>
            <option value="">All Zones</option>
            {ZONES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <select aria-label="Filter service" style={{ ...FIELD, flex: '0 0 140px' }} value={filterService} onChange={(e) => { setFilterService(e.target.value); setPage(1); }}>
            {SERVICE_TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <Btn onClick={openAdd} primary>+ Add Lane</Btn>
          <Btn onClick={openImport}>⤒ Import CSV</Btn>
          <select aria-label="Export format" style={FIELD} value={format} onChange={(e) => setFormat(e.target.value)}>{FORMATS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select>
          <Btn onClick={exportAll} disabled={busy}>⤓ Export</Btn>
        </div>

        <Table
          loading={loading}
          error={data.error}
          rows={data.lanes}
          minWidth={900}
          empty="No lanes configured. Click 'Add Lane' to start."
          columns={[
            { h: 'Origin', cell: (r) => <b style={{ fontFamily: T.MONO }}>{r.originPincode}</b> },
            { h: 'Destination', cell: (r) => <b style={{ fontFamily: T.MONO }}>{r.destinationPincode}</b> },
            { h: 'Zone', cell: (r) => <Pill color={BLUE}>{ZONES.find(z => z[0] === r.zone)?.[1] || r.zone}</Pill> },
            { h: 'Service Type', cell: (r) => r.serviceType || <span style={{ color: T.TEXT_MUTED }}>All</span> },
            { h: 'Transit Days', cell: (r) => r.transitDays !== null ? `${r.transitDays} days` : <span style={{ color: T.TEXT_MUTED }}>—</span> },
            { h: 'Status', cell: (r) => <Pill color={r.isServiceable ? T.GREEN : T.RED}>{r.isServiceable ? 'Serviceable' : 'Not serviceable'}</Pill> },
            {
              h: 'Actions', cell: (r) => <div style={{ display: 'flex', gap: 6 }}>
                <Btn small onClick={() => openEdit(r)}>Edit</Btn>
                <Btn small danger onClick={() => openDelete(r)}>Delete</Btn>
              </div>
            }
          ]}
        />
        <Pager page={page} pages={data.pages} total={data.total} pageSize={50} onPage={setPage} loading={loading} />
      </section>

      {(dialog === 'add' || dialog === 'edit') && (
        <div role="dialog" aria-modal="true" aria-label={dialog === 'add' ? 'Add lane' : 'Edit lane'} onClick={() => setDialog(null)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(8,16,30,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: 'min(100%, 520px)', padding: 22, background: 'var(--ops-surface)' }}>
            <b style={{ fontSize: 17, color: T.TEXT }}>{dialog === 'add' ? 'Add New Lane' : 'Edit Lane'}</b>
            <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
              <div><label style={{ fontSize: 12, color: T.TEXT_MUTED, marginBottom: 4, display: 'block' }}>Origin Pincode</label><input style={FIELD} type="text" maxLength={6} placeholder="110001" value={form.originPincode} onChange={(e) => setForm({ ...form, originPincode: e.target.value })} disabled={dialog === 'edit'} /></div>
              <div><label style={{ fontSize: 12, color: T.TEXT_MUTED, marginBottom: 4, display: 'block' }}>Destination Pincode</label><input style={FIELD} type="text" maxLength={6} placeholder="400001" value={form.destinationPincode} onChange={(e) => setForm({ ...form, destinationPincode: e.target.value })} disabled={dialog === 'edit'} /></div>
              <div><label style={{ fontSize: 12, color: T.TEXT_MUTED, marginBottom: 4, display: 'block' }}>Zone</label><select style={FIELD} value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })}>{ZONES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
              <div><label style={{ fontSize: 12, color: T.TEXT_MUTED, marginBottom: 4, display: 'block' }}>Service Type (optional)</label><select style={FIELD} value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })}><option value="">All service types</option><option value="surface">Surface</option><option value="air">Air</option><option value="express">Express</option><option value="hyperlocal">Hyperlocal</option></select></div>
              <div><label style={{ fontSize: 12, color: T.TEXT_MUTED, marginBottom: 4, display: 'block' }}>Transit Days</label><input style={FIELD} type="number" min="0" placeholder="3" value={form.transitDays} onChange={(e) => setForm({ ...form, transitDays: e.target.value })} /></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={form.isServiceable} onChange={(e) => setForm({ ...form, isServiceable: e.target.checked })} /><span style={{ fontSize: 13, color: T.TEXT }}>Serviceable</span></label>
            </div>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 10 }}><Btn onClick={() => setDialog(null)}>Cancel</Btn><Btn primary disabled={busy || !form.originPincode.trim() || !form.destinationPincode.trim()} onClick={submitLane}>{busy ? 'Saving…' : dialog === 'add' ? 'Add Lane' : 'Update Lane'}</Btn></div>
          </div>
        </div>
      )}

      {dialog === 'delete' && editLane && (
        <div role="dialog" aria-modal="true" aria-label="Delete lane" onClick={() => setDialog(null)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(8,16,30,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: 'min(100%, 420px)', padding: 22, background: 'var(--ops-surface)' }}>
            <b style={{ fontSize: 17, color: T.TEXT }}>Delete Lane?</b>
            <p style={{ margin: '10px 0', color: T.TEXT_SECONDARY }}>{editLane.originPincode} → {editLane.destinationPincode} · {editLane.zone}</p>
            <p style={{ color: T.TEXT_MUTED, fontSize: 13 }}>This action cannot be undone.</p>
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end', gap: 10 }}><Btn onClick={() => setDialog(null)}>Cancel</Btn><Btn danger disabled={busy} onClick={confirmDelete}>{busy ? 'Deleting…' : 'Delete Lane'}</Btn></div>
          </div>
        </div>
      )}

      {dialog === 'import' && (
        <div role="dialog" aria-modal="true" aria-label="Import lanes" onClick={() => setDialog(null)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(8,16,30,.5)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, width: 'min(100%, 640px)', padding: 22, background: 'var(--ops-surface)' }}>
            <b style={{ fontSize: 17, color: T.TEXT }}>Bulk Import Lanes (CSV)</b>
            <p style={{ margin: '6px 0 12px', color: T.TEXT_SECONDARY, fontSize: 13 }}>Format: originPincode,destinationPincode,zone,serviceType,transitDays,isServiceable</p>
            <textarea style={{ ...FIELD, width: '100%', height: 240, padding: 10, fontFamily: T.MONO, fontSize: 12 }} placeholder="110001,400001,metro_to_metro,surface,3,true&#10;110001,500001,rest_of_india,surface,5,true" value={importText} onChange={(e) => setImportText(e.target.value)} />
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10 }}><Btn onClick={() => setDialog(null)}>Cancel</Btn><Btn primary disabled={busy || !importText.trim()} onClick={submitImport}>{busy ? 'Importing…' : 'Import'}</Btn></div>
          </div>
        </div>
      )}
    </div>
  );
}

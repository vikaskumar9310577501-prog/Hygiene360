import React, { useState } from 'react';
import { api } from '../utils/api';
import { X, Save, RefreshCw } from 'lucide-react';

export const CLEANING_FREQUENCIES = [
  { value: 'HOURLY', label: 'Every hour' },
  { value: 'EVERY_2_HOURS', label: 'Every 2 hours' },
  { value: 'EVERY_4_HOURS', label: 'Every 4 hours' },
  { value: 'TWICE_A_SHIFT', label: 'Twice a shift' },
  { value: 'ONCE_A_SHIFT', label: 'Once a shift' },
  { value: 'TWICE_A_DAY', label: 'Twice a day' },
  { value: 'ONCE_A_DAY', label: 'Once a day' }
];

const SUPERVISOR_ROLES = ['SUPERVISOR', 'PLANT_ADMIN', 'SUPER_ADMIN', 'IT_ADMIN'];
export function emptyMaster() {
  return { toiletUid: '', urinalCount: 0, wcCount: 0, basinCount: 0, drinkingWaterNearby: false, supervisorId: '', cleaningFrequency: '' };
}

export function masterFromToilet(t) {
  return {
    toiletUid: t.toilet_uid || '',
    urinalCount: t.urinal_count || 0,
    wcCount: t.wc_count || 0,
    basinCount: t.basin_count || 0,
    drinkingWaterNearby: !!t.drinking_water_nearby,
    supervisorId: t.supervisor_id ? String(t.supervisor_id) : '',
    cleaningFrequency: t.cleaning_frequency || ''
  };
}

export function masterPayload(m) {
  return {
    toiletUid: m.toiletUid.trim() || undefined,
    urinalCount: Number(m.urinalCount) || 0,
    wcCount: Number(m.wcCount) || 0,
    basinCount: Number(m.basinCount) || 0,
    drinkingWaterNearby: !!m.drinkingWaterNearby,
    supervisorId: m.supervisorId ? Number(m.supervisorId) : null,
    cleaningFrequency: m.cleaningFrequency || null
  };
}

const labelStyle = { fontSize: '11.5px', fontWeight: 700, color: '#475569', marginBottom: '3px', display: 'block' };

// Master information fields: Toilet ID, fixtures, drinking water, responsible housekeeper, supervisor, cleaning frequency
export function ToiletMasterFields({ value, onChange, users, gender, uidPlaceholder, showResponsible = true }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const supervisors = users.filter(u => SUPERVISOR_ROLES.includes(u.role) && u.is_active !== 0);
  const isFemale = String(gender || '').toUpperCase() === 'FEMALE';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <label style={labelStyle}>Toilet ID (printed on the QR)</label>
        <input
          type="text"
          className="form-control"
          value={value.toiletUid}
          placeholder={uidPlaceholder || 'Auto: TOILET-PLANT-BLOCK-CODE'}
          onChange={e => set({ toiletUid: e.target.value.toUpperCase() })}
          style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
        />
        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Leave empty to generate automatically, e.g. TOILET-SUPA-BLOCK-A-01</div>
      </div>
      {!isFemale && (
        <div>
          <label style={labelStyle}>Number of urinals</label>
          <input type="number" min="0" className="form-control" value={value.urinalCount} onChange={e => set({ urinalCount: e.target.value })} />
        </div>
      )}
      <div>
        <label style={labelStyle}>Number of WC</label>
        <input type="number" min="0" className="form-control" value={value.wcCount} onChange={e => set({ wcCount: e.target.value })} />
      </div>
      <div>
        <label style={labelStyle}>Wash basins</label>
        <input type="number" min="0" className="form-control" value={value.basinCount} onChange={e => set({ basinCount: e.target.value })} />
      </div>
      <div>
        <label style={labelStyle}>Drinking water nearby</label>
        <select className="form-control" value={value.drinkingWaterNearby ? '1' : '0'} onChange={e => set({ drinkingWaterNearby: e.target.value === '1' })}>
          <option value="0">No</option>
          <option value="1">Yes</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Supervisor</label>
        <select className="form-control" value={value.supervisorId} onChange={e => set({ supervisorId: e.target.value })}>
          <option value="">Plant supervisor (default)</option>
          {supervisors.map(u => <option key={u.id} value={String(u.id)}>{u.name} ({u.employee_id}) — {u.role.replace('_', ' ')}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Cleaning frequency</label>
        <select className="form-control" value={value.cleaningFrequency} onChange={e => set({ cleaningFrequency: e.target.value })}>
          <option value="">As per slot schedule</option>
          {CLEANING_FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
    </div>
  );
}

export default function ToiletMasterModal({ toilet, users, onClose, onSaved }) {
  const [name, setName] = useState(toilet.name || '');
  const [gender, setGender] = useState(toilet.gender || 'MALE');
  const [master, setMaster] = useState(() => masterFromToilet(toilet));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    if (!name.trim()) { setError('Toilet name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = masterPayload(master);
      const res = await api.put(`/admin/qr-master/${toilet.id}/master`, {
        ...payload,
        toiletUid: master.toiletUid.trim(),
        name: name.trim(),
        gender
      });
      if (onSaved) onSaved(res);
    } catch (err) {
      setError(err.data?.error || err.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const location = [toilet.plant_name, toilet.building_name, toilet.block_name, toilet.floor_name, toilet.area_name].filter(Boolean).join(' / ');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title" style={{ margin: 0, fontSize: '15px' }}>Toilet Master — {toilet.toilet_uid || toilet.code}</h3>
            <div style={{ fontSize: '11.5px', color: '#64748b' }}>{location}</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
            <div>
              <label style={labelStyle}>Toilet name</label>
              <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Male / Female</label>
              <select className="form-control" value={gender} onChange={e => setGender(e.target.value)}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </div>
          </div>
          <ToiletMasterFields value={master} onChange={setMaster} users={users} gender={gender} />
          {error && <div style={{ padding: '8px 10px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '12.5px' }}>{error}</div>}
        </div>
        <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} className="btn btn-outline btn-sm">Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="btn btn-primary btn-sm">
            {saving ? <RefreshCw size={13} className="spin" /> : <Save size={13} />} Save Master
          </button>
        </div>
      </div>
    </div>
  );
}

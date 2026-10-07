import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { fmt12 } from '../utils/istTime';
import { Clock, Plus, Trash2, Pencil, Save, X, Wand2, Building2, Info, Loader2, CalendarClock, MapPin } from 'lucide-react';

const PAPER_SHEET_PRESET = [
  { label: '8:00 AM Round', start_time: '08:00', end_time: '09:00' },
  { label: '11:00 AM Round', start_time: '11:00', end_time: '12:00' },
  { label: '2:00 PM Round', start_time: '14:00', end_time: '15:00' },
  { label: '4:00 PM Round', start_time: '16:00', end_time: '17:00' }
];

const emptyForm = { label: '', start_time: '', end_time: '' };

function durationLabel(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (!(mins > 0)) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} hr${m ? ` ${m} min` : ''}` : `${m} min`;
}

const HOURS_12 = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

function TimePicker12({ value, onChange }) {
  let hour = '', minute = '', period = 'AM';
  if (value) {
    const [h, m] = value.split(':').map(Number);
    period = h >= 12 ? 'PM' : 'AM';
    hour = String(h % 12 === 0 ? 12 : h % 12);
    minute = String(m).padStart(2, '0');
  }
  const minuteOptions = minute && !MINUTES.includes(minute) ? [...MINUTES, minute].sort() : MINUTES;

  const emit = (next) => {
    const h12 = Number(next.hour || hour || 12);
    const min = next.minute ?? (minute || '00');
    const per = next.period || period;
    const h24 = per === 'PM' ? (h12 % 12) + 12 : h12 % 12;
    onChange(`${String(h24).padStart(2, '0')}:${min}`);
  };

  const sel = { height: '40px', minHeight: '40px', padding: '6px 4px', fontSize: '13px', fontWeight: 600, borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', cursor: 'pointer', minWidth: 0 };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.1fr', gap: '4px' }}>
      <select style={sel} value={hour} onChange={e => emit({ hour: e.target.value })} aria-label="Hour">
        {!hour && <option value="" disabled>Hr</option>}
        {HOURS_12.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <select style={sel} value={minute} onChange={e => emit({ minute: e.target.value })} aria-label="Minute">
        {!minute && <option value="" disabled>Min</option>}
        {minuteOptions.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <select style={{ ...sel, fontWeight: 800, color: period === 'PM' ? '#7c3aed' : '#0369a1' }} value={period} onChange={e => emit({ period: e.target.value })} aria-label="AM/PM">
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

const card = { background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(15,23,42,0.04)' };
const inputStyle = { height: '40px', minHeight: '40px', padding: '6px 12px', fontSize: '13px', width: '100%', boxSizing: 'border-box' };
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '5px' };

function scopeOptionsOf(plants) {
  const locations = [...new Set(plants.map(p => p.location).filter(Boolean))].sort();
  return [
    ...locations.map(loc => ({ value: `loc:${loc}`, label: loc, plants: plants.filter(p => p.location === loc) })),
    ...plants.filter(p => !p.location).map(p => ({ value: `plant:${p.id}`, label: `${p.name} (no location)`, plants: [p] }))
  ];
}

export default function SlotSettings({ plants = [], defaultLocation, plantsLoaded = true }) {
  const options = scopeOptionsOf(plants);
  const pickDefault = () => (defaultLocation && options.find(o => o.value === `loc:${defaultLocation}`)?.value) || options[0]?.value || '';
  const [scopeKey, setScopeKey] = useState(pickDefault);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!options.some(o => o.value === scopeKey)) setScopeKey(pickDefault());
  }, [plants]);

  useEffect(() => {
    if (defaultLocation && options.some(o => o.value === `loc:${defaultLocation}`)) setScopeKey(`loc:${defaultLocation}`);
  }, [defaultLocation]);

  useEffect(() => {
    setError(null);
    setSuccess(null);
    setEditingId(null);
    if (scopeKey) load();
    else setSlots([]);
  }, [scopeKey]);

  const selected = options.find(o => o.value === scopeKey);
  const scopePayload = scopeKey.startsWith('loc:') ? { location: scopeKey.slice(4) } : { plantId: scopeKey.slice(6) };
  const scopeName = selected?.label || '';
  const plantNames = (selected?.plants || []).map(p => p.name).join(', ');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin-module/slots', scopePayload);
      setSlots(res.slots || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const run = async (fn, okMsg) => {
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await fn();
      if (okMsg) setSuccess(okMsg);
      await load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.start_time || !form.end_time) { setError('Please select both Start and End time.'); return; }
    const ok = await run(() => api.post('/admin-module/slots', { ...form, ...scopePayload }), `"${form.label}" slot added for ${scopeName} (${plantNames}).`);
    if (ok) setForm(emptyForm);
  };

  const handlePreset = async () => {
    if (!window.confirm(`Add the 4 check sheet slots (8 AM, 11 AM, 2 PM, 4 PM — 1 hour each) for ${scopeName} (${plantNames})? You can edit the timings later.`)) return;
    await run(async () => {
      const failures = [];
      for (const s of PAPER_SHEET_PRESET) {
        try { await api.post('/admin-module/slots', { ...s, ...scopePayload }); } catch (err) { failures.push(`${s.label}: ${err.message}`); }
      }
      if (failures.length) throw new Error(failures.join(' | '));
    }, '4 slots added.');
  };

  const handleSaveEdit = async (slot) => {
    const ok = await run(() => api.put('/admin-module/slots', { ...editForm, ...scopePayload, slot_ids: slot.slot_ids }), `Slot updated for ${scopeName}.`);
    if (ok) setEditingId(null);
  };

  const handleDelete = (slot) => {
    if (!window.confirm(`Delete the "${slot.label}" slot from all plants of ${scopeName}?`)) return;
    run(() => api.delete('/admin-module/slots', { ...scopePayload, slot_ids: slot.slot_ids }), `"${slot.label}" deleted.`);
  };

  if (!plantsLoaded) {
    return (
      <div style={{ ...card, padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
        <Loader2 size={20} className="spin" style={{ marginBottom: '6px' }} /><div>Loading plants...</div>
      </div>
    );
  }

  if (!plants.length) {
    return (
      <div style={{ ...card, padding: '32px', textAlign: 'center' }}>
        <Building2 size={30} color="#94a3b8" />
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#334155', marginTop: '8px' }}>No plant found</div>
        <div style={{ fontSize: '12.5px', color: '#64748b' }}>First create a plant in Settings → Plants & Locations, or assign a plant to your user.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ ...card, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#334155', background: '#f0f9ff', borderColor: '#bae6fd', flexWrap: 'wrap' }}>
        <Building2 size={15} color="#0284c7" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: '200px' }}>
          Timings for <strong>{scopeName}</strong> apply to all its plants: <strong>{plantNames || '—'}</strong>
        </div>
        {options.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={15} color="#0284c7" />
            <select className="form-control" value={scopeKey} onChange={e => setScopeKey(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '200px', fontWeight: 700 }}>
              {options.map(o => <option key={o.value} value={o.value}>{o.label} — {o.plants.length} plant{o.plants.length > 1 ? 's' : ''}</option>)}
            </select>
          </div>
        )}
      </div>

      {(error || success) && (
        <div style={{ padding: '10px 14px', borderRadius: '12px', fontSize: '12.5px', fontWeight: 700, background: error ? '#fef2f2' : '#ecfdf5', color: error ? '#b91c1c' : '#065f46', border: `1px solid ${error ? '#fecaca' : '#a7f3d0'}` }}>
          {error || success}
        </div>
      )}

      <div className="slot-settings-grid">
        {/* Slot list */}
        <div style={{ ...card, padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
              Daily Cleaning Slots {slots.length > 0 && <span style={{ color: '#64748b', fontWeight: 600 }}>({slots.length})</span>}
            </div>
            {selected && <span style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', borderRadius: '8px', padding: '3px 8px' }}>{scopeName}</span>}
          </div>

          {loading ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}><Loader2 size={18} className="spin" /></div>
          ) : slots.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: '14px' }}>
              <CalendarClock size={32} color="#94a3b8" />
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#334155', marginTop: '8px' }}>
                No timings set for {scopeName}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', margin: '4px auto 14px', maxWidth: '360px' }}>
                Until slots are set, housekeepers can clean at any time. Add the check sheet timings in one click, or create your own using the form on the right.
              </div>
              <button type="button" disabled={busy} onClick={handlePreset} className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Wand2 size={14} /> Add 8 AM, 11 AM, 2 PM, 4 PM slots
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {slots.map((s, idx) => editingId === s.key ? (
                <div key={s.key} style={{ padding: '12px', borderRadius: '12px', border: '1.5px solid #38bdf8', background: '#f0f9ff', display: 'grid', gap: '8px' }}>
                  <input className="form-control" style={inputStyle} value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} placeholder="Slot name" />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <TimePicker12 value={editForm.start_time} onChange={v => setEditForm(f => ({ ...f, start_time: v }))} />
                    <TimePicker12 value={editForm.end_time} onChange={v => setEditForm(f => ({ ...f, end_time: v }))} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setEditingId(null)} className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><X size={14} /> Cancel</button>
                    <button type="button" disabled={busy} onClick={() => handleSaveEdit(s)} className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Save size={14} /> Save</button>
                  </div>
                </div>
              ) : (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#0284c7', color: '#fff', fontSize: '12px', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
                    <div style={{ fontSize: '12px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <Clock size={12} color="#0284c7" /> {fmt12(s.start_time)} – {fmt12(s.end_time)}
                      <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', borderRadius: '6px', padding: '1px 6px' }}>{durationLabel(s.start_time, s.end_time)}</span>
                    </div>
                    {s.missing_plants?.length > 0 && (
                      <div style={{ fontSize: '11px', color: '#92400e', fontWeight: 700, marginTop: '2px' }}>
                        Not in: {s.missing_plants.join(', ')} — tap Edit and Save to apply to all plants
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => { setEditingId(s.key); setEditForm({ label: s.label, start_time: s.start_time, end_time: s.end_time }); }} className="btn btn-outline btn-sm" title="Edit" style={{ padding: '6px 8px' }}><Pencil size={14} /></button>
                  <button type="button" disabled={busy} onClick={() => handleDelete(s)} className="btn btn-outline btn-sm" style={{ color: '#b91c1c', borderColor: '#fecaca', padding: '6px 8px' }} title="Delete"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <form onSubmit={handleAdd} style={{ ...card, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} color="#0284c7" /> Add New Slot
              <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', borderRadius: '8px', padding: '3px 8px', maxWidth: '55%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {scopeName}
              </span>
            </div>
            <div>
              <label style={labelStyle}>Slot name *</label>
              <input className="form-control" style={inputStyle} placeholder="e.g. Morning Round" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={labelStyle}>Start time *</label>
                <TimePicker12 value={form.start_time} onChange={v => setForm(f => ({ ...f, start_time: v }))} />
              </div>
              <div>
                <label style={labelStyle}>End time *</label>
                <TimePicker12 value={form.end_time} onChange={v => setForm(f => ({ ...f, end_time: v }))} />
              </div>
            </div>
            {form.start_time && form.end_time && (
              <div style={{ fontSize: '12px', color: durationLabel(form.start_time, form.end_time) ? '#0369a1' : '#b91c1c', fontWeight: 700 }}>
                {durationLabel(form.start_time, form.end_time)
                  ? `Duration: ${durationLabel(form.start_time, form.end_time)} (${fmt12(form.start_time)} – ${fmt12(form.end_time)})`
                  : 'End time must be after start time'}
              </div>
            )}
            <button type="submit" disabled={busy || !scopeKey} className="btn btn-primary" style={{ height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' }}>
              {busy ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Add Slot
            </button>
          </form>

          <div style={{ ...card, padding: '14px 16px', background: '#f8fafc' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}><Info size={14} color="#0284c7" /> How it works</div>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#475569', lineHeight: 1.6 }}>
              <li>Timings are set per location and apply to all toilets of every plant in that location.</li>
              <li>Housekeepers can scan the QR and clean only within the slot time.</li>
              <li>A reminder is sent when the slot starts and 15 min before it ends.</li>
              <li>If cleaning is not done on time, the slot is marked "Missed" and the Admin is alerted.</li>
              <li>Slots cannot overlap each other.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

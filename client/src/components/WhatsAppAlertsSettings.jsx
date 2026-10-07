import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { fmtDateTime } from '../utils/istTime';
import { MessageCircle, Send, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

const ALERTS = [
  { key: 'whatsapp_alert_missed', label: 'Missed cleaning', hint: 'Sent when a slot ends and a toilet was not cleaned.' },
  { key: 'whatsapp_alert_late', label: 'Late submission', hint: 'Sent when a cleaning is submitted after its slot end time.' },
  { key: 'whatsapp_alert_summary', label: 'End-of-day summary', hint: 'Daily totals: slots, on time, late and missed.' }
];

const STATUS_STYLE = {
  SENT: { bg: '#dcfce7', color: '#166534' },
  FAILED: { bg: '#fee2e2', color: '#991b1b' },
  SKIPPED: { bg: '#f1f5f9', color: '#475569' }
};

export default function WhatsAppAlertsSettings({ plants = [] }) {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [testPlant, setTestPlant] = useState('');

  const load = () => api.get('/admin/whatsapp').then(setData).catch(err => setMsg({ type: 'error', text: err.message }));
  useEffect(() => { load(); }, []);

  const save = async (patch) => {
    setSaving(true);
    setMsg(null);
    try {
      await api.put('/admin/whatsapp', patch);
      await load();
      setMsg({ type: 'ok', text: 'Saved.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setMsg(null);
    try {
      const res = await api.post('/admin/whatsapp/test', { plantId: testPlant ? Number(testPlant) : undefined });
      setMsg({ type: 'ok', text: res.message });
      setTimeout(load, 3000);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  if (!data) return <div style={{ padding: '20px', color: '#64748b' }}>Loading...</div>;
  const s = data.settings || {};
  const missingPhone = (data.recipients || []).filter(r => !r.phone || !String(r.phone).trim());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <MessageCircle size={20} color="#16a34a" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>WhatsApp Alerts</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Sent to IT Admin, Admin and Plant Head users who have a phone number.</div>
          </div>
          <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 10px', borderRadius: '10px', background: data.provider ? '#dcfce7' : '#fef3c7', color: data.provider ? '#166534' : '#92400e' }}>
            {data.provider ? `Connected: ${data.provider.toUpperCase()}` : 'Provider not configured'}
          </span>
        </div>

        {!data.provider && (
          <div style={{ fontSize: '12px', color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', padding: '10px 12px', marginBottom: '10px', lineHeight: 1.5 }}>
            Alerts are only written to the log below until a WhatsApp provider is added in the server <code>.env</code> file
            (<code>WHATSAPP_PROVIDER=meta</code> with <code>WHATSAPP_TOKEN</code> and <code>WHATSAPP_PHONE_ID</code>, or
            <code> WHATSAPP_PROVIDER=twilio</code> with <code>TWILIO_SID</code>, <code>TWILIO_TOKEN</code>, <code>TWILIO_FROM</code>), then restart the server.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {ALERTS.map(a => {
            const on = s[a.key] !== '0';
            return (
              <label key={a.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #e2e8f0', background: on ? '#f0fdf4' : '#fff', cursor: 'pointer' }}>
                <input type="checkbox" checked={on} disabled={saving} onChange={e => save({ [a.key]: e.target.checked ? '1' : '0' })} style={{ width: '18px', height: '18px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{a.label}</div>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>{a.hint}</div>
                </div>
                {a.key === 'whatsapp_alert_summary' && (
                  <input type="time" className="form-control" value={s.whatsapp_summary_time || '20:00'} disabled={saving}
                    onClick={e => e.stopPropagation()}
                    onChange={e => save({ whatsapp_summary_time: e.target.value })}
                    style={{ width: '120px', height: '34px', minHeight: '34px', fontSize: '12.5px' }} />
                )}
              </label>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
          <select className="form-control" value={testPlant} onChange={e => setTestPlant(e.target.value)} style={{ width: 'auto', height: '36px', minHeight: '36px', fontSize: '12.5px' }}>
            <option value="">My plant</option>
            {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" onClick={sendTest} className="btn btn-success btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Send size={14} /> Send test alert
          </button>
          {msg && (
            <span style={{ fontSize: '12px', fontWeight: 700, color: msg.type === 'ok' ? '#15803d' : '#b91c1c', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {msg.type === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {msg.text}
            </span>
          )}
        </div>

        {missingPhone.length > 0 && (
          <div style={{ fontSize: '12px', color: '#b45309', marginTop: '10px' }}>
            No phone number (will not get WhatsApp): {missingPhone.map(r => r.name).join(', ')}. Add it in User Management.
          </div>
        )}
      </div>

      <div className="card" style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          <div style={{ flex: 1, fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Send log (last 100)</div>
          <button type="button" onClick={load} className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><RefreshCw size={13} /> Reload</button>
        </div>
        {(data.logs || []).length === 0 ? (
          <div style={{ fontSize: '12px', color: '#94a3b8', padding: '12px 0' }}>No alerts sent yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Time</th>
                  <th style={{ padding: '6px 8px' }}>Type</th>
                  <th style={{ padding: '6px 8px' }}>Phone</th>
                  <th style={{ padding: '6px 8px' }}>Status</th>
                  <th style={{ padding: '6px 8px' }}>Message</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map(l => {
                  const st = STATUS_STYLE[l.status] || STATUS_STYLE.SKIPPED;
                  return (
                    <tr key={l.id} style={{ borderTop: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtDateTime(l.created_at)}</td>
                      <td style={{ padding: '6px 8px' }}>{l.kind}</td>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{l.phone || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, padding: '1px 7px', borderRadius: '8px', background: st.bg, color: st.color }}>{l.status}</span>
                        {l.error && <div style={{ fontSize: '10.5px', color: '#991b1b', marginTop: '2px' }}>{l.error}</div>}
                      </td>
                      <td style={{ padding: '6px 8px', color: '#334155', minWidth: '260px' }}>{l.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

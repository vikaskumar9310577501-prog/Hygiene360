import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { fmtDateTime, fmt12, istToday } from '../utils/istTime';
import SessionReviewModal from '../components/SessionReviewModal';
import EvidencePhoto from '../components/EvidencePhoto';
import SlotSettings from '../components/SlotSettings';
import ComplaintsReports from './ComplaintsReports';
import {
  LayoutDashboard, ShieldAlert, Clock, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, Hourglass, CalendarClock, Eye, Building2, MapPin, X, User, ChevronRight, Inbox, History
} from 'lucide-react';

const CELL_STYLE = {
  APPROVED: { bg: '#dcfce7', color: '#166534', border: '#86efac', label: 'Done' },
  PENDING: { bg: '#dcfce7', color: '#166534', border: '#86efac', label: 'Done' },
  REJECTED: { bg: '#ffedd5', color: '#9a3412', border: '#fdba74', label: 'Issue Raised' },
  MISSED: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', label: 'Missed' },
  DUE: { bg: '#e0f2fe', color: '#075985', border: '#7dd3fc', label: 'Due now' },
  IN_PROGRESS: { bg: '#e0f2fe', color: '#075985', border: '#38bdf8', label: 'Cleaning…' },
  UPCOMING: { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0', label: 'Upcoming' }
};

const METRICS = {
  TOTAL: { title: 'Total Slots', icon: LayoutDashboard, color: '#334155', bg: '#f1f5f9' },
  ONTIME: { title: 'Done On Time', icon: CheckCircle2, color: '#15803d', bg: '#dcfce7' },
  LATE: { title: 'Late Submitted', icon: Clock, color: '#7c3aed', bg: '#ede9fe' },
  MISSED: { title: 'Missed', icon: AlertTriangle, color: '#b91c1c', bg: '#fee2e2' },
  DUE: { title: 'Due Now', icon: CalendarClock, color: '#0369a1', bg: '#e0f2fe' },
  UPCOMING: { title: 'Upcoming', icon: Hourglass, color: '#64748b', bg: '#f1f5f9' }
};

export default function AdminModule({ tab = 'dashboard', refreshKey, onSelectToilet, onOpenComplaintPortal }) {
  const { user, activePlantId, dateFilter } = useAuth();
  const [filters, setFilters] = useState({ plants: [], locations: [], housekeepers: [], toilets: [], isGlobal: false });
  // Plant and date come from the navbar Filter
  const location = 'all';
  const plantId = activePlantId && activePlantId !== 'all' ? String(activePlantId) : 'all';
  const date = dateFilter && dateFilter <= istToday() ? dateFilter : istToday();
  const [reviewId, setReviewId] = useState(null);
  const [metric, setMetric] = useState(null);
  const selectMetric = (key) => setMetric(key);
  const [tick, setTick] = useState(0);

  const [filtersLoaded, setFiltersLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    let retryTimer = null;
    const loadFilters = (attempt = 0) => {
      api.get('/admin-module/filters').then(res => {
        if (!alive) return;
        setFilters(res);
        setFiltersLoaded(true);
      }).catch(() => {
        if (alive && attempt < 10) retryTimer = setTimeout(() => loadFilters(attempt + 1), 3000);
      });
    };
    loadFilters();
    return () => { alive = false; clearTimeout(retryTimer); };
  }, [user?.id]);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { if (refreshKey) setTick(x => x + 1); }, [refreshKey]);

  const scope = { plantId, location };
  const refreshAll = () => setTick(x => x + 1);

  const [dash, setDash] = useState(null);
  useEffect(() => {
    if (tab !== 'dashboard') return;
    let alive = true;
    api.get('/admin-module/dashboard', { plantId, location, date })
      .then(res => { if (alive) setDash(res); })
      .catch(() => {});
    return () => { alive = false; };
  }, [tab, plantId, location, date, tick]);

  // Nested sticky headers (Complaints tab) need to sit right below this header
  const headerRef = useRef(null);
  const [headerH, setHeaderH] = useState(0);
  useEffect(() => {
    if (!headerRef.current) { setHeaderH(0); return; }
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setHeaderH(Math.round(entry.target.getBoundingClientRect().height)));
    ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, [tab]);

  const k = dash?.kpis || {};

  return (
    <div className="page-wrapper" style={{ padding: '14px 16px 90px', maxWidth: '1400px', margin: '0 auto', '--admin-header-h': `${headerH}px` }}>
      {tab === 'dashboard' && (
        <div ref={headerRef} className="admin-sticky-header">
          <div className="admin-kpi-strip admin-kpi-strip-6">
            <KpiCard metricKey="TOTAL" value={k.totalSlotChecks} active={metric === 'TOTAL'} onClick={selectMetric} />
            <KpiCard metricKey="ONTIME" value={k.onTime} active={metric === 'ONTIME'} onClick={selectMetric} />
            <KpiCard metricKey="LATE" value={k.late} active={metric === 'LATE'} onClick={selectMetric} />
            <KpiCard metricKey="MISSED" value={k.missed} active={metric === 'MISSED'} onClick={selectMetric} />
            <KpiCard metricKey="DUE" value={k.due} active={metric === 'DUE'} onClick={selectMetric} />
            <KpiCard metricKey="UPCOMING" value={k.upcoming} active={metric === 'UPCOMING'} onClick={selectMetric} />
          </div>
        </div>
      )}

      {tab === 'dashboard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
          <TodayBoard dash={dash} onReview={setReviewId} />
        </div>
      )}
      {tab === 'dashboard' && metric && (
        <MetricList metricKey={metric} dash={dash} date={date} onClear={() => setMetric(null)} onReview={setReviewId} />
      )}
      {tab === 'history' && <HistoryTab scope={scope} tick={tick} filters={filters} onReview={setReviewId} />}
      {tab === 'complaints' && (
        <ComplaintsReports embedded onOpenComplaintPortal={onOpenComplaintPortal} onSelectToilet={onSelectToilet} />
      )}
      {tab === 'timings' && (
        <SlotSettings
          plants={filters.plants}
          plantsLoaded={filtersLoaded}
          defaultLocation={plantId !== 'all' ? filters.plants.find(p => String(p.id) === String(plantId))?.location : undefined}
        />
      )}

      {reviewId && (
        <SessionReviewModal sessionId={reviewId} onClose={() => setReviewId(null)} onDecided={refreshAll} />
      )}
    </div>
  );
}

const selStyle = { height: '36px', minHeight: '36px', padding: '4px 10px', fontSize: '12.5px', fontWeight: 700, width: 'auto' };

function KpiCard({ metricKey, value, active, onClick }) {
  const m = METRICS[metricKey];
  const Icon = m.icon;
  const label = m.title;
  return (
    <button type="button" className="admin-kpi-card" onClick={() => onClick(metricKey)} style={{ textAlign: 'left', padding: '8px 12px', borderRadius: '12px', border: active ? `2px solid ${m.color}` : '1px solid #e2e8f0', background: active ? m.bg : '#fff', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center', boxShadow: '0 2px 8px rgba(15,23,42,0.04)', minWidth: 0 }}>
      <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={16} /></div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>{value ?? '—'}</div>
        <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      </div>
      <ChevronRight size={14} color="#94a3b8" style={{ flexShrink: 0 }} />
    </button>
  );
}

function metricRows(dash, metricKey) {
  const rows = [];
  for (const b of dash?.board || []) {
    for (const r of b.rows) {
      r.cells.forEach(c => {
        const done = c.status === 'APPROVED' || c.status === 'PENDING';
        const match =
          metricKey === 'TOTAL' ? true
          : metricKey === 'DUE' ? (c.status === 'DUE' || c.status === 'IN_PROGRESS')
          : metricKey === 'LATE' ? (done && c.submitted_late)
          : metricKey === 'ONTIME' ? (done && !c.submitted_late)
          : c.status === metricKey;
        if (!match) return;
        const slot = b.slots.find(s => s.id === c.slot_id);
        rows.push({ plant: b.plant, toilet: r, slot, cell: c });
      });
    }
  }
  return rows.sort((a, b) => (a.slot?.start_time || '').localeCompare(b.slot?.start_time || '') || a.toilet.code.localeCompare(b.toilet.code));
}

function MetricList({ metricKey, dash, date, onClear, onReview }) {
  const m = METRICS[metricKey];
  const Icon = m.icon;
  const rows = metricRows(dash, metricKey);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !zoom) onClear(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClear, zoom]);

  const dateLabel = date ? new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  return (
    <div onClick={onClear} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(1150px, 96vw)', height: 'min(640px, 88vh)', background: '#fff', borderRadius: '16px', boxShadow: '0 24px 60px rgba(15,23,42,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: m.bg, flexShrink: 0 }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#fff', color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={17} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>{m.title} <span style={{ color: m.color }}>({rows.length})</span></div>
            <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600 }}>{dateLabel}</div>
          </div>
          <button type="button" onClick={onClear} aria-label="Close" style={{ width: '34px', height: '34px', borderRadius: '9px', border: '1px solid #e2e8f0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><X size={16} /></button>
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 12px', color: '#64748b' }}>
              <Inbox size={30} color="#94a3b8" />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', marginTop: '6px' }}>No records for this date</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                  {['#', 'Toilet', 'Plant / Area', 'Slot', 'Status', 'Housekeeper', 'Scan time', 'Submit time', 'Photos', ''].map((h, i) => (
                    <th key={i} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ plant, toilet, slot, cell }, idx) => {
                  const done = cell.status === 'APPROVED' || cell.status === 'PENDING';
                  const s = CELL_STYLE[cell.status] || CELL_STYLE.UPCOMING;
                  const late = done && cell.submitted_late;
                  return (
                    <tr key={`${toilet.id}_${cell.slot_id}`} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 ? '#fcfdfe' : '#fff' }}>
                      <td style={{ ...td, color: '#94a3b8', fontWeight: 700 }}>{idx + 1}</td>
                      <td style={{ ...td, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{toilet.code} — {toilet.name}</td>
                      <td style={{ ...td, color: '#475569' }}>{plant.name}{toilet.area_name ? ` • ${toilet.area_name}` : ''}</td>
                      <td style={{ ...td, color: '#475569', whiteSpace: 'nowrap' }}>{slot ? `${slot.label} (${fmt12(slot.start_time)}–${fmt12(slot.end_time)})` : '—'}</td>
                      <td style={td}>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, padding: '2px 8px', borderRadius: '8px', whiteSpace: 'nowrap', background: late ? '#ede9fe' : s.bg, color: late ? '#6d28d9' : s.color }}>
                          {late ? `Late${cell.minutes_late != null ? ` • ${cell.minutes_late} min` : ''}` : cell.status === 'MISSED' ? 'Missed • not submitted' : s.label}
                        </span>
                      </td>
                      <td style={{ ...td, color: '#334155' }}>
                        {cell.agent_name
                          ? `${cell.agent_name}${cell.agent_emp_id ? ` (${cell.agent_emp_id})` : ''}`
                          : cell.last_agent_name ? <span style={{ color: '#64748b' }}>Last: {cell.last_agent_name}{cell.last_agent_emp_id ? ` (${cell.last_agent_emp_id})` : ''}</span> : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ ...td, color: '#475569', whiteSpace: 'nowrap' }}>{done ? fmtDateTime(cell.start_time) : '—'}</td>
                      <td style={{ ...td, color: '#475569', whiteSpace: 'nowrap' }}>{done ? fmtDateTime(cell.submit_time) : '—'}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          {[['Live photo', cell.live_photo], ['Check sheet', cell.sheet_photo]].filter(([, src]) => src).map(([label, src]) => (
                            <button key={label} type="button" title={label} onClick={() => setZoom({ label, src })} style={{ padding: 0, border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden', background: '#f8fafc', cursor: 'pointer', width: '44px', height: '34px' }}>
                              <EvidencePhoto src={src} alt={label} maxHeight="34px" style={{ width: '44px', height: '34px', objectFit: 'cover', display: 'block', borderRadius: 0 }} />
                            </button>
                          ))}
                          {!cell.live_photo && !cell.sheet_photo && <span style={{ color: '#94a3b8' }}>—</span>}
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {cell.session_id && (
                          <button type="button" onClick={() => onReview(cell.session_id)} className="btn btn-outline btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                            <Eye size={13} /> View
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {zoom && (
        <div onClick={e => { e.stopPropagation(); setZoom(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(248,250,252,0.97)', zIndex: 1300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>{zoom.label}</div>
          <EvidencePhoto src={zoom.src} alt="" maxHeight="80vh" style={{ width: 'auto', maxWidth: 'calc(100vw - 32px)', maxHeight: '80vh', objectFit: 'contain', borderRadius: '10px' }} />
          <button type="button" onClick={() => setZoom(null)} style={{ marginTop: '12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 18px', fontWeight: 800, cursor: 'pointer' }}>Close</button>
        </div>
      )}
    </div>
  );
}

const th = { padding: '8px 10px', textAlign: 'left', fontSize: '11.5px', color: '#334155', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
const td = { padding: '6px 8px', verticalAlign: 'middle' };

const HISTORY_STATUS = {
  APPROVED: { label: 'Approved', bg: '#dcfce7', color: '#166534' },
  PENDING: { label: 'Pending Approval', bg: '#fef3c7', color: '#92400e' },
  REJECTED: { label: 'Issue Raised', bg: '#fee2e2', color: '#991b1b' },
  COMPLETED: { label: 'Completed', bg: '#e0f2fe', color: '#075985' }
};

function historyStatus(s) {
  if (s.approval_status && HISTORY_STATUS[s.approval_status]) return s.approval_status;
  return s.status === 'REJECTED' ? 'REJECTED' : 'COMPLETED';
}

function HistoryTab({ scope, tick, filters, onReview }) {
  const [from, setFrom] = useState(() => {
    const d = new Date(istToday() + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(istToday());
  const [userId, setUserId] = useState('');
  const [toiletId, setToiletId] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const inScope = (plantIdOfRow) => {
    if (scope.plantId !== 'all') return String(plantIdOfRow) === String(scope.plantId);
    if (scope.location !== 'all') return filters.plants.some(p => p.id === plantIdOfRow && p.location === scope.location);
    return true;
  };
  const housekeepers = filters.housekeepers.filter(h => inScope(h.plant_id));
  const toilets = filters.toilets.filter(t => inScope(t.plant_id));

  useEffect(() => { setUserId(''); setToiletId(''); }, [scope.plantId, scope.location]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get('/admin-module/tracking', { ...scope, from, to, userId: userId || undefined, toiletId: toiletId || undefined })
      .then(res => { if (alive) setSessions(res.sessions || []); })
      .catch(() => { if (alive) setSessions([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [scope.plantId, scope.location, from, to, userId, toiletId, tick]);

  const counts = { ALL: sessions.length, APPROVED: 0, PENDING: 0, REJECTED: 0 };
  sessions.forEach(s => { const st = historyStatus(s); if (counts[st] !== undefined) counts[st]++; });
  const list = (statusFilter === 'ALL' ? sessions : sessions.filter(s => historyStatus(s) === statusFilter))
    .slice().sort((a, b) => (b.day || '').localeCompare(a.day || ''));

  const byDay = [];
  list.forEach(s => {
    const last = byDay[byDay.length - 1];
    if (last && last.day === s.day) last.items.push(s);
    else byDay.push({ day: s.day, items: [s] });
  });
  const dayLabel = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '14px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
        <input type="date" className="form-control" value={from} max={to} onChange={e => setFrom(e.target.value || to)} style={selStyle} />
        <span style={{ fontSize: '12px', color: '#64748b' }}>to</span>
        <input type="date" className="form-control" value={to} min={from} max={istToday()} onChange={e => setTo(e.target.value || istToday())} style={selStyle} />
        <select className="form-control" value={userId} onChange={e => setUserId(e.target.value)} style={selStyle}>
          <option value="">All Housekeepers</option>
          {housekeepers.map(h => <option key={h.id} value={h.id}>{h.name}{h.employee_id ? ` (${h.employee_id})` : ''}</option>)}
        </select>
        <select className="form-control" value={toiletId} onChange={e => setToiletId(e.target.value)} style={selStyle}>
          <option value="">All Toilets</option>
          {toilets.map(t => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {[['ALL', 'All'], ['APPROVED', 'Approved'], ['PENDING', 'Pending'], ['REJECTED', 'Issue Raised']].map(([key, label]) => {
            const active = statusFilter === key;
            return (
              <button key={key} type="button" onClick={() => setStatusFilter(key)} style={{ height: '36px', padding: '0 12px', borderRadius: '999px', border: active ? '1.5px solid #0284c7' : '1px solid #e2e8f0', background: active ? '#e0f2fe' : '#fff', color: active ? '#0369a1' : '#475569', fontWeight: 800, fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {label} ({counts[key]})
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '14px', color: '#64748b', fontSize: '13px' }}>Loading...</div>
      ) : list.length === 0 ? (
        <div style={{ padding: '28px 14px', textAlign: 'center', color: '#64748b', fontSize: '12.5px', background: '#f8fafc', borderRadius: '10px' }}>
          <Inbox size={26} color="#94a3b8" />
          <div style={{ fontWeight: 700, color: '#334155', marginTop: '4px' }}>No cleaning history</div>
          <div>No submitted cleanings for this date range and filter.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {byDay.map(group => (
            <div key={group.day}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0369a1', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CalendarClock size={13} /> {dayLabel(group.day)} <span style={{ color: '#94a3b8' }}>• {group.items.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {group.items.map(s => {
                  const st = HISTORY_STATUS[historyStatus(s)];
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '12px', border: '1px solid #eef2f7', background: '#f8fafc', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                          {s.toilet_code} — {s.toilet_name}
                          {s.submitted_late ? <span style={{ marginLeft: '6px', fontSize: '10px', background: '#ede9fe', color: '#6d28d9', borderRadius: '6px', padding: '1px 6px' }}>LATE</span> : null}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#475569' }}>
                          {s.agent_name || '—'}{s.agent_emp_id ? ` (${s.agent_emp_id})` : ''} • {s.slot_label ? `${s.slot_label} (${fmt12(s.slot_start)}–${fmt12(s.slot_end)})` : 'No slot'} • {s.plant_name}
                        </div>
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#334155', minWidth: '150px' }}>
                        <div><strong>Submit:</strong> {fmtDateTime(s.submit_time)}</div>
                        <div><strong>Score:</strong> {s.checklist_score ?? '—'}{s.checklist_score != null ? '%' : ''}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', minWidth: '150px' }}>
                        <span style={{ fontSize: '10.5px', fontWeight: 800, padding: '2px 8px', borderRadius: '8px', background: st.bg, color: st.color }}>{st.label}</span>
                        {s.approved_by_name && (
                          <span style={{ fontSize: '10.5px', color: '#64748b' }}>by {s.approved_by_name}{s.approved_at ? ` • ${fmtDateTime(s.approved_at)}` : ''}</span>
                        )}
                        {s.approval_remarks && historyStatus(s) === 'REJECTED' && (
                          <span style={{ fontSize: '10.5px', color: '#991b1b' }} title={s.approval_remarks}>Remark: {s.approval_remarks}</span>
                        )}
                      </div>
                      <button type="button" onClick={() => onReview(s.id)} className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Eye size={14} /> View
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TodayBoard({ dash, onReview }) {
  const boards = (dash?.board || []).filter(b => b.rows.length && b.slots.length);
  const legend = ['APPROVED', 'PENDING', 'REJECTED', 'MISSED', 'DUE', 'IN_PROGRESS', 'UPCOMING'];
  return (
    <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>Today's Slot Board</div>
          <div style={{ fontSize: '11.5px', color: '#64748b' }}>Every toilet against every cleaning slot. Tap a submitted cell to view its photos.</div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {legend.map(k => (
            <span key={k} style={{ fontSize: '10.5px', fontWeight: 800, padding: '2px 8px', borderRadius: '8px', background: CELL_STYLE[k].bg, color: CELL_STYLE[k].color, border: `1px solid ${CELL_STYLE[k].border}` }}>{CELL_STYLE[k].label}</span>
          ))}
        </div>
      </div>
      {!dash ? (
        <div style={{ padding: '14px', color: '#64748b', fontSize: '13px' }}>Loading...</div>
      ) : boards.length === 0 ? (
        <div style={{ padding: '14px', textAlign: 'center', color: '#64748b', fontSize: '12.5px', background: '#f8fafc', borderRadius: '10px' }}>
          No cleaning slots or toilets for this plant. Add slots in the Cleaning Timings tab.
        </div>
      ) : boards.map(b => (
        <div key={b.plant.id} style={{ marginBottom: '12px' }}>
          {boards.length > 1 && <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#334155', margin: '4px 0 6px' }}>{b.plant.name}{b.plant.location ? ` • ${b.plant.location}` : ''}</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: `${220 + b.slots.length * 96}px` }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={th}>Toilet</th>
                  {b.slots.map(s => <th key={s.id} style={{ ...th, textAlign: 'center' }}>{s.label}<div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600 }}>{fmt12(s.start_time)}–{fmt12(s.end_time)}</div></th>)}
                </tr>
              </thead>
              <tbody>
                {b.rows.map(r => (
                  <tr key={r.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ ...td, fontWeight: 800, whiteSpace: 'nowrap' }}>
                      {r.code} — {r.name}
                      <div style={{ fontSize: '10.5px', color: '#94a3b8', fontWeight: 600 }}>{r.assigned_user_name || 'No housekeeper assigned'}</div>
                    </td>
                    {b.slots.map(s => {
                      const cell = r.cells.find(c => c.slot_id === s.id);
                      if (!cell) return <td key={s.id} style={{ ...td, textAlign: 'center', color: '#cbd5e1' }}>—</td>;
                      const st = CELL_STYLE[cell.status] || CELL_STYLE.UPCOMING;
                      return (
                        <td key={s.id} style={{ ...td, textAlign: 'center' }}>
                          <button
                            type="button"
                            disabled={!cell.session_id}
                            onClick={() => cell.session_id && onReview(cell.session_id)}
                            title={cell.agent_name ? `${cell.agent_name}${cell.submit_time ? ` • ${fmtDateTime(cell.submit_time)}` : ''}` : ''}
                            style={{ width: '100%', padding: '5px 4px', borderRadius: '8px', border: `1px solid ${st.border}`, background: st.bg, color: st.color, fontSize: '11px', fontWeight: 800, cursor: cell.session_id ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                          >
                            {st.label}{cell.submitted_late ? ' • Late' : ''}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

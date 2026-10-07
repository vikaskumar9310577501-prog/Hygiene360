import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { PercentBarChart, PairBarChart, PctLegend, ChartHint } from '../components/DashCharts';
import { 
  Building2, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  TrendingUp, 
  Calendar, 
  FileSpreadsheet, 
  Printer, 
  ChevronRight,
  AlertTriangle,
  Target,
  CheckCheck,
  RefreshCw,
  Award
} from 'lucide-react';

export default function ManagementDashboard({ onSelectToilet }) {
  const { activePlantId, dateFilter } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [achievements, setAchievements] = useState([]);
  const [tableFilter, setTableFilter] = useState('ALL'); // 'ALL' | 'CLEANED' | 'PENDING'

  useEffect(() => {
    loadDashboard();
  }, [activePlantId, dateFilter]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [dashRes, achRes] = await Promise.all([
        api.get('/dashboard/management', { plantId: activePlantId || 'all', date: dateFilter }),
        api.get('/reports/day-wise', { plantId: activePlantId || 'all' })
      ]);
      setData(dashRes);
      setAchievements(achRes.achievements || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleExportCSV = () => {
    window.location.href = `/api/reports/export-csv?plantId=${activePlantId || 'all'}&date=${dateFilter}`;
  };

  if (loading && !data) {
    return (
      <div className="page-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--color-primary-900)' }}>
            Loading Executive Hygiene Intelligence...
          </div>
          <div style={{ fontSize: '13px', color: 'var(--color-primary-500)', marginTop: '4px' }}>
            Compiling real-time plant KPIs, trends, and compliance metrics
          </div>
        </div>
      </div>
    );
  }

  // Consistent 7 Primary Management KPIs
  const kpis = data?.kpis || {};

  // Toilet filter for drill-down
  const allToilets = data?.toiletPerformance || [];
  const cleanedToiletsList = allToilets.filter(t => t.today_status === 'COMPLETED');
  const pendingToiletsList = allToilets.filter(t => t.today_status !== 'COMPLETED');

  const filteredToilets = tableFilter === 'CLEANED' 
    ? cleanedToiletsList 
    : (tableFilter === 'PENDING' ? pendingToiletsList : allToilets);

  // Cleaned vs Not Cleaned calculation for Donut Chart
  const totalCount = kpis.totalToilets || 1;
  const cleanedCount = kpis.cleanedToilets || 0;
  const notCleanedCount = kpis.notCleaned || 0;
  const cleanedPct = Math.round((cleanedCount / totalCount) * 100);
  const notCleanedPct = 100 - cleanedPct;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const cleanedStrokeOffset = circumference * (1 - cleanedPct / 100);

  return (
    <div className="page-wrapper" style={{ padding: '8px 16px', maxWidth: '100%', boxSizing: 'border-box' }}>
      
      {/* ============================================================== */}
      {/* 1. EXACTLY 7 MANDATORY KPI CARDS (STRICTLY IN ONE ROW, STICKY) */}
      {/* ============================================================== */}
      <div style={{
        position: 'sticky',
        top: '50px',
        zIndex: 85,
        backgroundColor: '#ffffff',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        padding: '6px 10px',
        marginBottom: '10px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <div className="header-kpi-bar">
          
          {/* KPI 1: TOTAL TOILETS */}
          <div 
            className="kpi-clickable"
            onClick={() => {
              setTableFilter('ALL');
              scrollToSection('facilities-matrix-section');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}
            title="Total number of toilets for selected plant (Click to view full list)"
          >
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a', flexShrink: 0 }}>
              <Building2 size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '9px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Total Toilets</div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#0f172a', lineHeight: 1.1 }}>
                {kpis.totalToilets || 0}
              </div>
            </div>
          </div>

          {/* KPI 2: CLEANED TOILETS */}
          <div 
            className="kpi-clickable"
            onClick={() => {
              setTableFilter('CLEANED');
              scrollToSection('facilities-matrix-section');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}
            title="Toilets successfully cleaned today (Click to view cleaned list)"
          >
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', flexShrink: 0 }}>
              <CheckCircle2 size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '9px', fontWeight: '700', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Cleaned Toilets</div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: '#16a34a', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                {kpis.cleanedToilets || 0} <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '600' }}>/{kpis.totalToilets || 0}</span>
              </div>
            </div>
          </div>

          {/* KPI 3: NOT CLEANED / PENDING */}
          <div 
            className="kpi-clickable"
            onClick={() => {
              setTableFilter('PENDING');
              scrollToSection('facilities-matrix-section');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', backgroundColor: '#fffbeb', borderRadius: '6px', border: '1px solid #fde68a' }}
            title="Toilets not yet cleaned today (Click to view pending list)"
          >
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', flexShrink: 0 }}>
              <Clock size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '9px', fontWeight: '700', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Not Cleaned / Pending</div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: (kpis.notCleaned > 0 ? '#d97706' : '#16a34a'), lineHeight: 1.1 }}>
                {kpis.notCleaned || 0}
              </div>
            </div>
          </div>

          {/* KPI 4: DAILY CLEANING % */}
          <div 
            className="kpi-clickable"
            onClick={() => scrollToSection('day-wise-achievement-table')}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', backgroundColor: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd' }}
            title="Cleaned Toilets ÷ Total Expected Toilets × 100"
          >
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7', flexShrink: 0 }}>
              <TrendingUp size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '9px', fontWeight: '700', color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Daily Cleaning %</div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: (kpis.dailyCleaningPct >= 90 ? '#16a34a' : '#0284c7'), lineHeight: 1.1 }}>
                {kpis.dailyCleaningPct || 0}%
              </div>
            </div>
          </div>

          {/* KPI 5: CLEAN TOILETS % */}
          <div 
            className="kpi-clickable"
            onClick={() => scrollToSection('day-wise-achievement-table')}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}
            title="Percentage of today's toilets successfully cleaned"
          >
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', flexShrink: 0 }}>
              <Sparkles size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '9px', fontWeight: '700', color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Clean Toilets %</div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: (kpis.cleanToiletsPct >= 90 ? '#16a34a' : '#0284c7'), lineHeight: 1.1 }}>
                {kpis.cleanToiletsPct || 0}%
              </div>
            </div>
          </div>

          {/* KPI 6: NOT CLEANED % */}
          <div 
            className="kpi-clickable"
            onClick={() => scrollToSection('day-wise-achievement-table')}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', backgroundColor: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}
            title="Not Cleaned Toilets ÷ Total Expected Toilets × 100"
          >
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', flexShrink: 0 }}>
              <AlertTriangle size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '9px', fontWeight: '700', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Not Cleaned %</div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: (kpis.notCleanedPct > 0 ? '#dc2626' : '#16a34a'), lineHeight: 1.1 }}>
                {kpis.notCleanedPct || 0}%
              </div>
            </div>
          </div>

          {/* KPI 7: DAY-WISE ACHIEVEMENT */}
          <div 
            className="kpi-clickable"
            onClick={() => scrollToSection('day-wise-achievement-table')}
            style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '6px 8px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #cbd5e1', flex: '1.4 1 0', minWidth: '160px' }}
            title="Today's target vs actual achievement"
          >
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', backgroundColor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155', flexShrink: 0 }}>
              <Award size={14} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '9px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>Today's Achievement</div>
              <div style={{ fontSize: '15px', fontWeight: '800', color: (kpis.achievementPct >= 90 ? '#16a34a' : '#0f172a'), lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                {kpis.achievementActual || 0}
                <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '600' }}> /{kpis.achievementTarget || 0} done • {kpis.achievementPct || 0}%</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. GRAPH ROW 1: Day-wise Cleaning Trend + Cleaned vs Not Cleaned*/}
      {/* ============================================================== */}
      <div className="dashboard-grid-2col">
        
        {/* GRAPH 1: DAY-WISE CLEANING TREND */}
        <div className="card compact-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="card-title" style={{ margin: 0, fontSize: '13px' }}>
              <TrendingUp size={15} color="var(--color-brand-600)" />
              <span>Day-wise Cleaning Trend (%)</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-primary-500)' }}>
              Last 7 days
            </span>
          </div>
          <ChartHint>% of toilets cleaned each day. Below each day: toilets cleaned / total toilets.</ChartHint>
          <PercentBarChart
            items={(data?.dayWiseTrend || []).map((item, idx, arr) => ({
              label: idx === arr.length - 1 ? 'Today' : item.displayDate,
              value: item.compliancePercentage,
              caption: `${item.completed}/${item.expected}`,
              highlight: idx === arr.length - 1,
              detail: `${item.displayDate}: ${item.completed} of ${item.expected} toilets cleaned (${Math.round(item.compliancePercentage)}%)`
            }))}
          />
          <PctLegend />
        </div>

        {/* GRAPH 2: CLEANED VS NOT CLEANED (Donut Chart) */}
        <div className="card compact-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="card-title" style={{ margin: 0, fontSize: '13px' }}>
              <CheckCircle2 size={15} color="#16a34a" />
              <span>Cleaned vs Not Cleaned</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-primary-500)' }}>
              {dateFilter}
            </span>
          </div>

          <ChartHint>Status of all toilets for the selected day.</ChartHint>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '16px', minHeight: '170px', flexWrap: 'wrap' }}>
            <svg width="150" height="150" viewBox="0 0 92 92">
              <circle cx="46" cy="46" r={radius} fill="transparent" stroke={totalCount > 0 ? '#fca5a5' : '#e2e8f0'} strokeWidth="12" />
              {cleanedPct > 0 && (
                <circle
                  cx="46" cy="46" r={radius}
                  fill="transparent"
                  stroke="#10b981"
                  strokeWidth="12"
                  strokeDasharray={circumference}
                  strokeDashoffset={cleanedStrokeOffset}
                  transform="rotate(-90 46 46)"
                  style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
              )}
              <text x="46" y="43" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0f172a">
                {cleanedCount}/{kpis.totalToilets || 0}
              </text>
              <text x="46" y="55" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#64748b">
                toilets cleaned
              </text>
            </svg>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '170px' }}>
              {[
                { label: 'Cleaned', count: cleanedCount, pct: cleanedPct, color: '#10b981', text: '#047857' },
                { label: 'Not cleaned', count: notCleanedCount, pct: notCleanedPct, color: '#f87171', text: '#b91c1c' }
              ].map(row => (
                <div key={row.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: row.text }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: row.color }} />
                      {row.label}
                    </span>
                    <span>{row.count} ({kpis.totalToilets ? row.pct : 0}%)</span>
                  </div>
                  <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${kpis.totalToilets ? row.pct : 0}%`, height: '100%', background: row.color }} />
                  </div>
                </div>
              ))}
              <div style={{ fontSize: '11.5px', color: '#475569', borderTop: '1px solid var(--color-border)', paddingTop: '6px' }}>
                Total toilets: <strong>{kpis.totalToilets || 0}</strong>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ============================================================== */}
      {/* 4. GRAPH ROW 2: Month-wise Trend + Day-wise Achievement       */}
      {/* ============================================================== */}
      <div className="dashboard-grid-2col">

        {/* GRAPH 3: MONTH-WISE CLEANING TREND */}
        <div className="card compact-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="card-title" style={{ margin: 0, fontSize: '13px' }}>
              <Calendar size={15} color="var(--color-brand-600)" />
              <span>Month-wise Cleaning Trend (%)</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-primary-500)' }}>
              Last 6 months
            </span>
          </div>
          <ChartHint>Average % of toilets cleaned per day in each month. Below each month: total cleanings / total expected.</ChartHint>
          <PercentBarChart
            items={(data?.monthWiseTrend || []).map((item, idx, arr) => ({
              label: item.displayMonth || String(item.month).slice(0, 3),
              value: item.compliance,
              caption: item.expected ? `${item.completed}/${item.expected}` : '',
              highlight: idx === arr.length - 1,
              detail: item.compliance == null
                ? `${item.month}: no cleaning data`
                : `${item.month}: ${item.completed} of ${item.expected} expected cleanings done over ${item.days} days (${item.compliance}%)`
            }))}
          />
          <PctLegend />
        </div>

        {/* GRAPH 4: DAY-WISE ACHIEVEMENT — EXPECTED VS ACTUAL */}
        <div className="card compact-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div className="card-title" style={{ margin: 0, fontSize: '13px' }}>
              <Target size={15} color="#6366f1" />
              <span>Day-wise Achievement — Expected vs Actual</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-primary-500)' }}>
              Last 7 days
            </span>
          </div>
          <ChartHint>Grey = toilets that should be cleaned (target). Green = toilets actually cleaned. Below: done / target.</ChartHint>
          <PairBarChart
            aLabel="Target (expected)"
            bLabel="Cleaned (actual)"
            items={(data?.dayWiseTrend || []).map((item, idx, arr) => ({
              label: idx === arr.length - 1 ? 'Today' : item.displayDate,
              a: item.expected,
              b: item.completed,
              highlight: idx === arr.length - 1
            }))}
          />
        </div>

      </div>

      {/* ============================================================== */}
      {/* 5. TOILET-WISE REAL-TIME STATUS MATRIX (Drill-down Target)     */}
      {/* ============================================================== */}
      <div id="facilities-matrix-section" className="card compact-card" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
          <div className="card-title" style={{ margin: 0, fontSize: '13px' }}>
            <Building2 size={15} color="var(--color-primary-900)" />
            <span>Toilet Cleaning Status Matrix ({filteredToilets.length} of {allToilets.length} Facilities)</span>
          </div>

          {/* Drill-down Filter Pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button 
              onClick={() => setTableFilter('ALL')}
              style={{
                border: '1px solid var(--color-border)',
                backgroundColor: tableFilter === 'ALL' ? 'var(--color-primary-900)' : '#ffffff',
                color: tableFilter === 'ALL' ? '#ffffff' : 'var(--color-primary-700)',
                padding: '3px 9px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              All Toilets ({allToilets.length})
            </button>
            <button 
              onClick={() => setTableFilter('CLEANED')}
              style={{
                border: '1px solid #bbf7d0',
                backgroundColor: tableFilter === 'CLEANED' ? '#16a34a' : '#f0fdf4',
                color: tableFilter === 'CLEANED' ? '#ffffff' : '#15803d',
                padding: '3px 9px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Cleaned ({cleanedToiletsList.length})
            </button>
            <button 
              onClick={() => setTableFilter('PENDING')}
              style={{
                border: '1px solid #fecaca',
                backgroundColor: tableFilter === 'PENDING' ? '#dc2626' : '#fef2f2',
                color: tableFilter === 'PENDING' ? '#ffffff' : '#b91c1c',
                padding: '3px 9px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Not Cleaned / Pending ({pendingToiletsList.length})
            </button>
          </div>
        </div>

        <div className="table-responsive">
          <table className="enterprise-table compact-table">
            <thead>
              <tr>
                <th>Toilet Code</th>
                <th>Facility Name</th>
                <th>Plant</th>
                <th>Building & Area</th>
                <th>Gender</th>
                <th>Status</th>
                <th>Score</th>
                <th>Cleaned Time</th>
                <th>Responsible Agent</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredToilets.map(t => {
                const isClean = t.today_status === 'COMPLETED';
                return (
                  <tr 
                    key={t.id} 
                    onClick={() => onSelectToilet(t.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <strong style={{ color: 'var(--color-primary-950)' }}>{t.code}</strong>
                    </td>
                    <td>{t.name}</td>
                    <td style={{ fontSize: '11px', color: 'var(--color-primary-600)' }}>{t.plant_name || 'Plant'}</td>
                    <td style={{ color: 'var(--color-primary-500)' }}>
                      {t.building_name} • {t.area_name}
                    </td>
                    <td>
                      <span className="badge badge-neutral" style={{ fontSize: '9px', padding: '1px 5px' }}>{t.gender}</span>
                    </td>
                    <td>
                      <span className={`badge ${isClean ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '9.5px', padding: '1px 6px' }}>
                        {isClean ? '✓ Cleaned' : '⚠ Not Cleaned / Pending'}
                      </span>
                    </td>
                    <td>
                      {isClean ? (
                        <strong style={{ color: t.checklist_score >= 90 ? '#059669' : '#d97706' }}>
                          {t.checklist_score}%
                        </strong>
                      ) : (
                        <span style={{ color: '#94a3b8' }}>--</span>
                      )}
                    </td>
                    <td style={{ fontSize: '11.5px', color: 'var(--color-primary-600)' }}>
                      {t.submit_time ? t.submit_time.slice(11, 16) : '--:--'}
                    </td>
                    <td>{t.agent_name || 'Unassigned'}</td>
                    <td>
                      <button className="btn btn-outline btn-sm" style={{ padding: '2px 6px', fontSize: '10.5px' }}>
                        View 360 <ChevronRight size={11} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 6. DAY-WISE ACHIEVEMENT & COMPLIANCE AUDIT TABLE              */}
      {/* ============================================================== */}
      <div id="day-wise-achievement-table" className="card compact-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div className="card-title" style={{ margin: 0, fontSize: '13px' }}>
            <FileSpreadsheet size={15} color="var(--color-brand-600)" />
            <span>Day-Wise Achievement & Compliance Audit Table</span>
          </div>
          <button onClick={handleExportCSV} className="btn btn-outline btn-sm" style={{ padding: '2px 8px', fontSize: '11px' }}>
            <Printer size={12} /> Export CSV
          </button>
        </div>

        <div className="table-responsive">
          <table className="enterprise-table compact-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Expected Toilets (Target)</th>
                <th>Actual Cleaned</th>
                <th>Not Cleaned / Pending</th>
                <th>Daily Cleaning %</th>
                <th>Clean Toilets %</th>
                <th>Not Cleaned %</th>
                <th>Target Achievement</th>
              </tr>
            </thead>
            <tbody>
              {achievements.map((ach, idx) => {
                const achNotCleaned = Math.max(0, ach.expected - ach.completed);
                const achNotCleanedPct = ach.expected > 0 ? Number(((achNotCleaned / ach.expected) * 100).toFixed(1)) : 0;
                return (
                  <tr key={idx}>
                    <td><strong>{ach.displayDate}</strong></td>
                    <td>{ach.expected}</td>
                    <td><strong style={{ color: '#059669' }}>{ach.completed}</strong></td>
                    <td><span style={{ color: achNotCleaned > 0 ? '#d97706' : '#94a3b8' }}>{achNotCleaned}</span></td>
                    <td>
                      <span className={`badge ${ach.compliancePercentage >= 90 ? 'badge-success' : (ach.compliancePercentage >= 80 ? 'badge-primary' : 'badge-warning')}`} style={{ fontSize: '9.5px', padding: '1px 5px' }}>
                        {ach.compliancePercentage}%
                      </span>
                    </td>
                    <td><strong style={{ color: '#059669' }}>{ach.compliancePercentage}%</strong></td>
                    <td><span style={{ color: achNotCleanedPct > 0 ? '#dc2626' : '#059669' }}>{achNotCleanedPct}%</span></td>
                    <td>
                      <strong style={{ color: ach.compliancePercentage >= 90 ? '#059669' : '#d97706' }}>
                        {ach.completed} / {ach.expected} ({ach.compliancePercentage}%)
                      </strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

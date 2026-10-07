import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { 
  ClipboardCheck, 
  AlertCircle, 
  CheckCircle2, 
  QrCode, 
  ShieldAlert, 
  Clock, 
  Flame, 
  ChevronRight,
  TrendingUp,
  RefreshCw
} from 'lucide-react';

export default function SupervisorDashboard({ onOpenQRScanner, onSelectIssue, onSelectToilet }) {
  const { user, activePlantId } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSupervisorData();
  }, [activePlantId, user]);

  const loadSupervisorData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dashboard/supervisor');
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const kpis = data?.kpis || {};
  const inspections = data?.inspections || [];
  const openIssues = data?.openIssues || [];
  const pendingVerification = data?.pendingVerification || [];

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title">Supervisor Inspection Console</h1>
            <span className="badge badge-primary">QUALITY ASSURANCE</span>
          </div>
          <div className="page-subtitle">
            Welcome, Supervisor {user?.name} ({user?.employee_id}) • Facility audits & compliance verification
          </div>
        </div>

        <button 
          onClick={onOpenQRScanner}
          className="btn btn-brand btn-lg"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          id="btn-sup-scan-qr"
        >
          <QrCode size={20} />
          <span>Scan Toilet QR to Inspect</span>
        </button>
      </div>

      {/* SUPERVISOR KPIS */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px',
        marginBottom: '20px'
      }}>
        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">INSPECTIONS TODAY</span>
            <div className="kpi-icon-wrap" style={{ backgroundColor: '#f1f5f9', color: '#0f172a' }}>
              <ClipboardCheck size={18} />
            </div>
          </div>
          <div className="kpi-value">{kpis.inspectionsToday || 0}</div>
          <div className="kpi-subtitle">Supervisor audits completed</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">OPEN ISSUES</span>
            <div className="kpi-icon-wrap" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
              <AlertCircle size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#dc2626' }}>
            {kpis.openIssues || 0}
          </div>
          <div className="kpi-subtitle">Pending agent rectification</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">NEEDS VERIFICATION</span>
            <div className="kpi-icon-wrap" style={{ backgroundColor: '#fffbeb', color: '#d97706' }}>
              <Clock size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#d97706' }}>
            {kpis.pendingVerification || 0}
          </div>
          <div className="kpi-subtitle">Resolved by agent, await closing</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-top">
            <span className="kpi-label">PLANT COMPLIANCE</span>
            <div className="kpi-icon-wrap" style={{ backgroundColor: '#ecfdf5', color: '#059669' }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="kpi-value" style={{ color: '#059669' }}>
            {kpis.plantCompliance || 0}%
          </div>
          <div className="kpi-subtitle">Active shift cleaning score</div>
        </div>
      </div>

      {/* TICKETS WAITING FOR SUPERVISOR VERIFICATION */}
      {pendingVerification.length > 0 && (
        <div style={{
          backgroundColor: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <CheckCircle2 size={18} color="#16a34a" />
            <span style={{ fontWeight: '800', fontSize: '14px', color: '#14532d' }}>
              {pendingVerification.length} Resolved Issue(s) Awaiting Your On-Site Verification
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
            {pendingVerification.map(iss => (
              <div
                key={iss.id}
                onClick={() => onSelectIssue(iss.id)}
                style={{
                  backgroundColor: '#ffffff',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  border: '1px solid #bbf7d0',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <div style={{ fontWeight: '700', fontSize: '13px', color: '#0f172a' }}>
                    {iss.ticket_no}: {iss.toilet_code}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#166534' }}>{iss.category} • Resolved by {iss.agent_name}</div>
                </div>
                <button className="btn btn-success btn-sm">
                  Verify & Close
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TODAY'S INSPECTIONS TABLE */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div className="card-title" style={{ margin: 0 }}>
            <span>Today's Inspection Audits ({inspections.length})</span>
          </div>
          <button onClick={loadSupervisorData} className="btn btn-outline btn-sm">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        <div className="table-responsive">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Inspected At</th>
                <th>Toilet Code</th>
                <th>Facility Name</th>
                <th>Overall Status</th>
                <th>Audit Score</th>
                <th>Supervisor Remarks</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((insp, idx) => {
                const isSat = insp.overall_status === 'SATISFACTORY';
                return (
                  <tr key={insp.id || idx}>
                    <td style={{ fontSize: '12px', color: 'var(--color-primary-600)' }}>
                      {insp.inspected_at?.slice(11, 16) || 'Today'}
                    </td>
                    <td><strong style={{ color: 'var(--color-primary-950)' }}>{insp.toilet_code}</strong></td>
                    <td>{insp.toilet_name}</td>
                    <td>
                      <span className={`badge ${isSat ? 'badge-success' : 'badge-warning'}`}>
                        {insp.overall_status}
                      </span>
                    </td>
                    <td>
                      <strong style={{ color: insp.score >= 90 ? '#059669' : '#d97706' }}>
                        {insp.score}%
                      </strong>
                    </td>
                    <td style={{ fontSize: '12.5px', color: 'var(--color-primary-700)' }}>
                      {insp.remarks || 'Standard audit pass'}
                    </td>
                    <td>
                      <button 
                        onClick={() => onSelectToilet(insp.toilet_id)}
                        className="btn btn-outline btn-sm"
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                      >
                        Details <ChevronRight size={12} />
                      </button>
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

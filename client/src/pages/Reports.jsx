import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { downloadXlsx } from '../utils/xlsx';

const REPORT_TABS = [
  { id: 'daily_cleaning', label: 'Daily Cleaning Report' },
  { id: 'toilet_performance', label: 'Toilet Performance Report' },
  { id: 'agent_performance', label: 'Agent Performance Report' },
  { id: 'supervisor_inspections', label: 'Supervisor Inspection Report' },
  { id: 'issues', label: 'Issues & Deficiencies Report' },
  { id: 'missed_cleaning', label: 'Missed Cleaning Report' }
];

const num = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? (v ?? '') : Number(v));

const REPORT_EXPORT = {
  daily_cleaning: [
    ['Session Code', r => r.session_code], ['Toilet Code', r => r.toilet_code], ['Facility Name', r => r.toilet_name],
    ['Agent', r => r.agent_name], ['Start Time', r => r.start_time], ['Submit Time', r => r.submit_time],
    ['Score %', r => num(r.checklist_score)], ['Passed', r => num(r.passed_items)], ['Total', r => num(r.total_items)],
    ['Status', r => r.status], ['Remarks', r => r.remarks || 'Standard Clean']
  ],
  toilet_performance: [
    ['Toilet Code', r => r.toilet_code], ['Facility Name', r => r.toilet_name], ['Area', r => r.area_name],
    ['Sessions Completed', r => num(r.sessions_completed)], ['Average Score %', r => num(r.avg_score || 0)],
    ['Total Issues Raised', r => num(r.total_issues_raised)]
  ],
  agent_performance: [
    ['Agent Name', r => r.agent_name], ['Employee ID', r => r.employee_id], ['Plant', r => r.plant_name],
    ['Cleaning Sessions Completed', r => num(r.sessions_completed)], ['Average Checklist Score %', r => num(r.avg_checklist_score || 0)],
    ['Issues Rectified', r => num(r.issues_resolved)]
  ],
  supervisor_inspections: [
    ['Inspection Time', r => r.inspected_at], ['Toilet', r => r.toilet_code], ['Supervisor', r => r.supervisor_name],
    ['Overall Status', r => r.overall_status], ['Score %', r => num(r.score)], ['Remarks', r => r.remarks]
  ],
  issues: [
    ['Ticket No', r => r.ticket_no], ['Toilet', r => r.toilet_code], ['Category', r => r.category],
    ['Priority', r => r.priority], ['Status', r => r.status], ['Reported By', r => r.supervisor_name],
    ['Assigned Agent', r => r.agent_name || 'Unassigned'], ['Created At', r => r.created_at]
  ],
  missed_cleaning: [
    ['Target Date', r => r.date], ['Toilet Code', r => r.toilet_code], ['Facility Name', r => r.toilet_name],
    ['Current Status', r => r.status], ['Checkpoint Action', r => r.compliance_impact]
  ]
};

export default function Reports() {
  const { activePlantId, plants, dateFilter } = useAuth();
  const [reportType, setReportType] = useState('daily_cleaning');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [reportType, activePlantId, dateFilter]);

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports/data', {
        reportType,
        plantId: activePlantId,
        date: dateFilter
      });
      setRecords(res.records || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onDownload = () => {
      const def = REPORT_EXPORT[reportType];
      const tab = REPORT_TABS.find(t => t.id === reportType);
      if (!def) return;
      const plantCode = plants?.find(p => String(p.id) === String(activePlantId))?.code || 'ALL';
      downloadXlsx(
        `Hygiene360_${tab?.label.replace(/[^A-Za-z]+/g, '_')}_${plantCode}_${dateFilter}`,
        tab?.label || 'Report',
        def.map(c => c[0]),
        records.map(r => def.map(c => c[1](r)))
      );
    };
    window.addEventListener('reports:download-excel', onDownload);
    return () => window.removeEventListener('reports:download-excel', onDownload);
  }, [reportType, records, plants, activePlantId, dateFilter]);

  return (
    <div className="page-wrapper">
      <div style={{
        display: 'flex',
        gap: '8px',
        overflowX: 'auto',
        paddingBottom: '8px',
        marginBottom: '12px'
      }}>
        {REPORT_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setReportType(tab.id)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid',
              borderColor: reportType === tab.id ? 'var(--color-primary-900)' : 'var(--color-border)',
              backgroundColor: reportType === tab.id ? 'var(--color-primary-900)' : '#ffffff',
              color: reportType === tab.id ? '#ffffff' : 'var(--color-primary-800)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Report Table Display */}
      <div className="card">
        <div className="table-responsive">
          {reportType === 'daily_cleaning' && (
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Session Code</th>
                  <th>Toilet Code</th>
                  <th>Facility Name</th>
                  <th>Agent</th>
                  <th>Start Time</th>
                  <th>Submit Time</th>
                  <th>Score %</th>
                  <th>Passed / Total</th>
                  <th>Status</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => (
                  <tr key={idx}>
                    <td><strong style={{ fontFamily: 'var(--font-mono)' }}>{r.session_code}</strong></td>
                    <td><strong>{r.toilet_code}</strong></td>
                    <td>{r.toilet_name}</td>
                    <td>{r.agent_name}</td>
                    <td style={{ fontSize: '12px' }}>{r.start_time?.slice(11, 16)}</td>
                    <td style={{ fontSize: '12px' }}>{r.submit_time?.slice(11, 16)}</td>
                    <td><strong style={{ color: '#059669' }}>{r.checklist_score}%</strong></td>
                    <td>{r.passed_items} / {r.total_items}</td>
                    <td><span className="badge badge-success">{r.status}</span></td>
                    <td style={{ fontSize: '12px' }}>{r.remarks || 'Standard Clean'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'toilet_performance' && (
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Toilet Code</th>
                  <th>Facility Name</th>
                  <th>Area</th>
                  <th>Sessions Completed</th>
                  <th>Average Score %</th>
                  <th>Total Issues Raised</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => (
                  <tr key={idx}>
                    <td><strong>{r.toilet_code}</strong></td>
                    <td>{r.toilet_name}</td>
                    <td>{r.area_name}</td>
                    <td><strong>{r.sessions_completed}</strong></td>
                    <td><strong style={{ color: '#0284c7' }}>{r.avg_score || 0}%</strong></td>
                    <td><span style={{ color: r.total_issues_raised > 0 ? '#dc2626' : '#059669' }}>{r.total_issues_raised}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'agent_performance' && (
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Agent Name</th>
                  <th>Employee ID</th>
                  <th>Plant</th>
                  <th>Cleaning Sessions Completed</th>
                  <th>Average Checklist Score %</th>
                  <th>Issues Rectified</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => (
                  <tr key={idx}>
                    <td><strong>{r.agent_name}</strong></td>
                    <td>{r.employee_id}</td>
                    <td>{r.plant_name}</td>
                    <td><strong>{r.sessions_completed}</strong></td>
                    <td><strong style={{ color: '#059669' }}>{r.avg_checklist_score || 0}%</strong></td>
                    <td>{r.issues_resolved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'supervisor_inspections' && (
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Inspection Time</th>
                  <th>Toilet</th>
                  <th>Supervisor</th>
                  <th>Overall Status</th>
                  <th>Score %</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => (
                  <tr key={idx}>
                    <td>{r.inspected_at}</td>
                    <td><strong>{r.toilet_code}</strong></td>
                    <td>{r.supervisor_name}</td>
                    <td><span className="badge badge-success">{r.overall_status}</span></td>
                    <td><strong>{r.score}%</strong></td>
                    <td>{r.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'issues' && (
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Ticket No</th>
                  <th>Toilet</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Reported By</th>
                  <th>Assigned Agent</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, idx) => (
                  <tr key={idx}>
                    <td><strong style={{ fontFamily: 'var(--font-mono)' }}>{r.ticket_no}</strong></td>
                    <td>{r.toilet_code}</td>
                    <td>{r.category}</td>
                    <td><span className="badge badge-danger">{r.priority}</span></td>
                    <td><span className="badge badge-neutral">{r.status}</span></td>
                    <td>{r.supervisor_name}</td>
                    <td>{r.agent_name || 'Unassigned'}</td>
                    <td>{r.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {reportType === 'missed_cleaning' && (
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Target Date</th>
                  <th>Toilet Code</th>
                  <th>Facility Name</th>
                  <th>Current Status</th>
                  <th>Checkpoint Action</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: '#059669' }}>
                      ✓ All toilets cleaned! Zero missed cleaning flags today.
                    </td>
                  </tr>
                ) : (
                  records.map((r, idx) => (
                    <tr key={idx}>
                      <td>{r.date}</td>
                      <td><strong>{r.toilet_code}</strong></td>
                      <td>{r.toilet_name}</td>
                      <td><span className="badge badge-warning">{r.status}</span></td>
                      <td>{r.compliance_impact}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}

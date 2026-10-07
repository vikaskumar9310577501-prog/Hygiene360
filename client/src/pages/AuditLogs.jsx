import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { History, Search, ShieldCheck, Filter, RefreshCw } from 'lucide-react';

export default function AuditLogs({ embedded = false }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadLogs();
  }, [actionFilter, roleFilter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get('/audit-logs', {
        action: actionFilter,
        role: roleFilter,
        search
      });
      setLogs(res.logs || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadLogs();
  };

  const mainContent = (
    <>
      {/* Filter & Search Bar */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: '14px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          
          <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
            <Search size={16} color="var(--color-primary-500)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
            <input
              type="text"
              placeholder="Search user, entity ID, or details..."
              className="form-control"
              style={{ paddingLeft: '36px' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ minWidth: '160px' }}>
            <select
              className="form-control"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
            >
              <option value="">All Actions</option>
              <option value="LOGIN">LOGIN</option>
              <option value="QR_SCAN">QR_SCAN</option>
              <option value="CLEANING_STARTED">CLEANING_STARTED</option>
              <option value="CLEANING_SUBMITTED">CLEANING_SUBMITTED</option>
              <option value="EVIDENCE_UPLOADED">EVIDENCE_UPLOADED</option>
              <option value="EVIDENCE_REJECTED">EVIDENCE_REJECTED</option>
              <option value="CHECK_SHEET_REJECTED">CHECK_SHEET_REJECTED</option>
              <option value="SUPERVISOR_INSPECTION">SUPERVISOR_INSPECTION</option>
              <option value="ISSUE_CREATED">ISSUE_CREATED</option>
              <option value="ISSUE_STATUS_UPDATED">ISSUE_STATUS_UPDATED</option>
              <option value="QR_REGENERATED">QR_REGENERATED</option>
            </select>
          </div>

          <div style={{ minWidth: '160px' }}>
            <select
              className="form-control"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="SUPER_ADMIN">SUPER_ADMIN</option>
              <option value="PLANT_ADMIN">PLANT_ADMIN</option>
              <option value="SUPERVISOR">SUPERVISOR</option>
              <option value="HOUSEKEEPING_AGENT">HOUSEKEEPING_AGENT</option>
              <option value="MANAGEMENT">MANAGEMENT</option>
            </select>
          </div>

          <button type="submit" className="btn btn-primary">
            Filter
          </button>
        </form>
      </div>

      {/* Audit Logs Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor / User</th>
                <th>Role</th>
                <th>Action</th>
                <th>Entity Target</th>
                <th>Audit Details & Metadata</th>
                <th>IP / Origin</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-primary-500)' }}>
                    No audit records found matching the criteria.
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const isRejected = log.action.includes('REJECTED');
                  const isSubmission = log.action.includes('SUBMITTED');
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: '12px', whiteSpace: 'nowrap', color: 'var(--color-primary-600)' }}>
                        {log.created_at}
                      </td>
                      <td>
                        <strong>{log.user_name || 'SYSTEM'}</strong>
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
                          {log.role}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${isRejected ? 'badge-danger' : (isSubmission ? 'badge-success' : 'badge-primary')}`}>
                          {log.action}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: '600' }}>
                          {log.entity_type}: {log.entity_id}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', maxWidth: '300px', color: 'var(--color-primary-700)' }}>
                        {log.details_json}
                      </td>
                      <td style={{ fontSize: '11px', color: 'var(--color-primary-500)', fontFamily: 'var(--font-mono)' }}>
                        {log.ip_address}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  if (embedded) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', margin: 0, color: 'var(--color-primary-950)' }}>
                Immutable Audit Trail Stream
              </h3>
              <span className="badge badge-success" style={{ fontSize: '10px' }}>TAMPER-PROOF RECORD</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--color-primary-500)', margin: '2px 0 0' }}>
              Cryptographic compliance history tracking logins, QR scans, checklist submissions, evidence validation, and issue changes
            </p>
          </div>
          <button onClick={loadLogs} className="btn btn-outline btn-sm" style={{ fontSize: '11px', padding: '4px 10px' }}>
            <RefreshCw size={13} /> Refresh Stream
          </button>
        </div>
        {mainContent}
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title">Immutable Audit Trail</h1>
            <span className="badge badge-success">TAMPER-PROOF RECORD</span>
          </div>
          <div className="page-subtitle">
            Cryptographic compliance history tracking logins, QR scans, checklist submissions, evidence validation, and issue changes
          </div>
        </div>

        <button onClick={loadLogs} className="btn btn-outline btn-sm">
          <RefreshCw size={14} /> Refresh Log Stream
        </button>
      </div>
      {mainContent}
    </div>
  );
}

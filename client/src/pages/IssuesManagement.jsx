import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import IssueDetailModal from '../components/IssueDetailModal';
import { parseUtc, fmtDateTime } from '../utils/istTime';
import { Search, ChevronRight, RefreshCw, AlertTriangle } from 'lucide-react';

const ACTIVE = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'];
const isClosed = s => s === 'CLOSED' || s === 'VERIFIED';

const STATUS_LABEL = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'Action in progress',
  REOPENED: 'Reopened',
  RESOLVED: 'Action taken — verify',
  VERIFIED: 'Closed',
  CLOSED: 'Closed'
};

const STATUS_STYLE = {
  OPEN: { bg: '#fee2e2', fg: '#b91c1c' },
  ASSIGNED: { bg: '#ffedd5', fg: '#c2410c' },
  IN_PROGRESS: { bg: '#e0f2fe', fg: '#0369a1' },
  REOPENED: { bg: '#fee2e2', fg: '#b91c1c' },
  RESOLVED: { bg: '#fef9c3', fg: '#a16207' },
  VERIFIED: { bg: '#dcfce7', fg: '#15803d' },
  CLOSED: { bg: '#dcfce7', fg: '#15803d' }
};

function isOverdue(issue) {
  if (!ACTIVE.includes(issue.status) || !issue.target_at) return false;
  const target = parseUtc(issue.target_at);
  return !!target && target.getTime() < Date.now();
}

const TABS = [
  { id: 'active', label: 'Open', match: i => ACTIVE.includes(i.status) },
  { id: 'overdue', label: 'Overdue', match: isOverdue },
  { id: 'verify', label: 'Verification Pending', match: i => i.status === 'RESOLVED' },
  { id: 'closed', label: 'Closed', match: i => isClosed(i.status) },
  { id: 'all', label: 'All', match: () => true }
];

export default function IssuesManagement() {
  const { activePlantId } = useAuth();
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState(null);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/issues', { plantId: activePlantId });
      setIssues(res.issues || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activePlantId]);

  useEffect(() => { loadIssues(); }, [loadIssues]);

  const tabDef = TABS.find(x => x.id === tab) || TABS[0];
  const q = searchQuery.trim().toLowerCase();
  const filteredIssues = issues.filter(tabDef.match).filter(i => {
    if (!q) return true;
    return [i.ticket_no, i.category, i.toilet_code, i.toilet_uid, i.description, i.agent_name]
      .some(v => v && String(v).toLowerCase().includes(q));
  });

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">Issue Tracking</h1>
          <div className="page-subtitle">
            Issue Created → Responsible Person → Target Time → Action Taken + Photo → Supervisor Verification → Closed
          </div>
        </div>
        <button onClick={loadIssues} className="btn btn-outline btn-sm">
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div className="card" style={{ padding: '14px 18px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          {TABS.map(x => {
            const count = issues.filter(x.match).length;
            const active = x.id === tab;
            const danger = x.id === 'overdue' && count > 0;
            return (
              <button
                key={x.id}
                type="button"
                onClick={() => setTab(x.id)}
                style={{
                  padding: '7px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer',
                  border: `1px solid ${active ? '#0284c7' : 'var(--color-border)'}`,
                  background: active ? '#e0f2fe' : '#ffffff',
                  color: active ? '#0369a1' : danger ? '#b91c1c' : '#475569'
                }}
              >
                {x.label} ({count})
              </button>
            );
          })}
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={16} color="var(--color-primary-500)" style={{ position: 'absolute', left: '12px', top: '12px' }} />
          <input
            type="text"
            placeholder="Search ticket no, Toilet ID, category, description or responsible person..."
            className="form-control"
            style={{ paddingLeft: '36px' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Ticket No</th>
                <th>Toilet ID</th>
                <th>Source</th>
                <th>Issue</th>
                <th>Responsible Person</th>
                <th>Target Time</th>
                <th>Status</th>
                <th>Raised</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredIssues.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--color-primary-500)' }}>
                    {loading ? 'Loading issues...' : 'No issues in this view.'}
                  </td>
                </tr>
              ) : (
                filteredIssues.map(issue => {
                  const overdue = isOverdue(issue);
                  const st = STATUS_STYLE[issue.status] || STATUS_STYLE.OPEN;
                  return (
                    <tr
                      key={issue.id}
                      onClick={() => setSelectedIssueId(issue.id)}
                      style={{ cursor: 'pointer', background: overdue ? '#fff7f7' : undefined }}
                    >
                      <td>
                        <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary-950)' }}>{issue.ticket_no}</strong>
                      </td>
                      <td>
                        <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{issue.toilet_uid || issue.toilet_code || 'General Area'}</strong>
                        {issue.area_name && <div style={{ fontSize: '11px', color: '#64748b' }}>{issue.area_name}</div>}
                      </td>
                      <td style={{ fontSize: '12px' }}>{issue.category}</td>
                      <td style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {issue.checklist_item_label || issue.description}
                      </td>
                      <td>{issue.agent_name || <span style={{ color: '#94a3b8' }}>Not assigned</span>}</td>
                      <td style={{ fontSize: '12px', whiteSpace: 'nowrap', color: overdue ? '#b91c1c' : 'var(--color-primary-700)', fontWeight: overdue ? 800 : 500 }}>
                        {issue.target_at ? fmtDateTime(issue.target_at) : '—'}
                        {overdue && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10.5px' }}>
                            <AlertTriangle size={11} /> OVERDUE
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: st.bg, color: st.fg, whiteSpace: 'nowrap' }}>
                          {STATUS_LABEL[issue.status] || issue.status}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--color-primary-600)', whiteSpace: 'nowrap' }}>
                        {fmtDateTime(issue.created_at)}
                      </td>
                      <td>
                        <button className="btn btn-outline btn-sm" style={{ padding: '3px 8px', fontSize: '11px' }}>
                          {issue.status === 'RESOLVED' ? 'Verify' : 'Open'} <ChevronRight size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedIssueId && (
        <IssueDetailModal
          isOpen={true}
          onClose={() => setSelectedIssueId(null)}
          issueId={selectedIssueId}
          onIssueUpdated={loadIssues}
        />
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import { fmtDateTime, fmt12 } from '../utils/istTime';
import EvidencePhoto from './EvidencePhoto';
import { X, CheckCircle2, XCircle, Eye, ChevronLeft, ChevronRight, Clock, User, MapPin, AlertTriangle, ShieldCheck, Loader2 } from 'lucide-react';

const APPROVAL_STYLE = {
  PENDING: { bg: '#fffbeb', color: '#92400e', border: '#fcd34d', label: 'PENDING APPROVAL' },
  APPROVED: { bg: '#ecfdf5', color: '#065f46', border: '#6ee7b7', label: 'CLEANING DONE' },
  REJECTED: { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5', label: 'ISSUE RAISED — ENTRY MARKED FAKE' }
};

export default function SessionReviewModal({ sessionId, onClose, onDecided }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewed, setViewed] = useState(() => new Set());
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [reviewMarked, setReviewMarked] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/admin-module/sessions/${sessionId}`)
      .then(res => { if (alive) { setData(res); setReviewMarked(!!res.session?.reviewed_at); } })
      .catch(err => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sessionId]);

  const photos = data?.photos || [];
  const session = data?.session;
  const [issue, setIssue] = useState(null);
  const [issueRemark, setIssueRemark] = useState('');
  const [issueBusy, setIssueBusy] = useState(false);
  const [issueError, setIssueError] = useState(null);
  const [issueZoom, setIssueZoom] = useState(false);

  const loadIssue = (id) => api.get(`/issues/${id}`).then(res => setIssue(res.issue || null)).catch(() => setIssue(null));

  useEffect(() => {
    if (session?.issue_id) loadIssue(session.issue_id);
    else setIssue(null);
  }, [session?.issue_id]);

  const updateIssue = async (toStatus) => {
    if (toStatus === 'REOPENED' && !issueRemark.trim()) {
      setIssueError('Please write a remark before rolling back.');
      return;
    }
    setIssueBusy(true);
    setIssueError(null);
    try {
      await api.patch(`/issues/${issue.id}/status`, { status: toStatus, remarks: issueRemark.trim() });
      setIssueRemark('');
      await loadIssue(issue.id);
      if (onDecided) onDecided(toStatus === 'CLOSED' ? 'approve' : 'issue');
    } catch (err) {
      setIssueError(err.data?.error || err.message || 'Update failed');
    } finally {
      setIssueBusy(false);
    }
  };
  const itemLabels = useMemo(() => {
    const map = {};
    (data?.responses || []).forEach(r => { map[`ITEM_${r.item_id}`] = r.item_label; });
    return map;
  }, [data]);

  const photoLabel = (p) => {
    if (p.photo_type === 'CHECK_SHEET') return 'Physical Check Sheet';
    if (p.photo_type === 'CLEANING_EVIDENCE') return 'Live Toilet Photo';
    return itemLabels[p.photo_type] || p.photo_type.replace(/_/g, ' ');
  };

  const allViewed = reviewMarked || (photos.length > 0 && photos.every(p => viewed.has(p.id)));
  const isPending = session?.approval_status === 'PENDING' && session?.status === 'COMPLETED';

  useEffect(() => {
    if (!session || reviewMarked || !isPending) return;
    if (photos.length > 0 && photos.every(p => viewed.has(p.id))) {
      api.post(`/admin-module/sessions/${session.id}/reviewed`).then(() => setReviewMarked(true)).catch(() => {});
    }
  }, [viewed, session, photos, reviewMarked, isPending]);

  const openPhoto = (idx) => {
    setLightboxIdx(idx);
    const p = photos[idx];
    if (p) setViewed(prev => new Set(prev).add(p.id));
  };

  const status = APPROVAL_STYLE[session?.approval_status] || null;
  const failed = (data?.responses || []).filter(r => r.status === 'FAIL');
  const sheetPhoto = photos.filter(p => p.photo_type === 'CHECK_SHEET').pop();

  return (
    <div className="modal-overlay h360-sheet-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="modal-content h360-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '860px', width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', background: 'var(--color-bg-soft)', color: 'var(--color-primary-900)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: 800, letterSpacing: '0.05em' }}>CLEANING REVIEW</div>
            <div style={{ fontSize: '16px', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {session ? `${session.toilet_code} — ${session.toilet_name}` : 'Loading...'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: '1px solid var(--color-border)', color: 'var(--color-primary-600)', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: '16px 18px', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}><Loader2 size={22} className="spin" /> Loading...</div>
          ) : !session ? (
            <div style={{ color: '#b91c1c', padding: '20px' }}>{error || 'Session not found'}</div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                <InfoTile icon={User} label="Housekeeper" value={`${session.agent_name || '—'} (${session.agent_emp_id || '—'})`} />
                <InfoTile icon={MapPin} label="Location" value={`${session.plant_name}${session.area_name ? ' • ' + session.area_name : ''}`} />
                <InfoTile icon={Clock} label="Slot" value={session.slot_label ? `${session.slot_label} (${fmt12(session.slot_start)} – ${fmt12(session.slot_end)})` : 'No slot'} />
                <InfoTile icon={Clock} label="Scan / Start" value={fmtDateTime(session.start_time)} />
                <InfoTile icon={Clock} label="Submitted" value={fmtDateTime(session.submit_time)} warn={session.submitted_late ? 'LATE' : null} />
                <InfoTile
                  icon={ShieldCheck}
                  label="Check Sheet Date / Time"
                  value={sheetPhoto?.ocr_detected_date || (sheetPhoto ? 'Not readable — check the photo' : 'No check sheet')}
                  warn={sheetPhoto && !sheetPhoto.ocr_detected_date ? 'VERIFY' : null}
                />
              </div>

              {session.redo_of && (
                <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#f0f9ff', border: '1px solid #bae6fd', color: '#075985', fontSize: '12.5px', fontWeight: 700, marginBottom: '14px' }}>
                  Redo after an issue you raised. Approve to close the issue, or raise the issue again.
                </div>
              )}

              {status && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '10px', background: status.bg, border: `1px solid ${status.border}`, color: status.color, fontSize: '12.5px', marginBottom: '14px' }}>
                  <strong>{status.label}</strong>
                  {session.approved_at && session.approved_by_name !== 'AUTO' && <span>• {session.approved_by_name} • {fmtDateTime(session.approved_at)}</span>}
                  {session.approval_remarks && <span>• "{session.approval_remarks}"</span>}
                </div>
              )}

              {issue && (
                <div style={{ padding: '12px 14px', borderRadius: '12px', border: `1.5px solid ${issue.status === 'RESOLVED' ? '#fde047' : (issue.status === 'CLOSED' || issue.status === 'VERIFIED') ? '#86efac' : '#bae6fd'}`, background: issue.status === 'RESOLVED' ? '#fefce8' : (issue.status === 'CLOSED' || issue.status === 'VERIFIED') ? '#f0fdf4' : '#f0f9ff', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                    <span>Issue {issue.ticket_no}</span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '8px', background: '#ffffff', border: '1px solid #e2e8f0', color: '#334155' }}>
                      {issue.status === 'RESOLVED' ? 'RESUBMITTED — VERIFY' : (issue.status === 'CLOSED' || issue.status === 'VERIFIED') ? 'CLOSED' : 'WAITING FOR HOUSEKEEPER'}
                    </span>
                    {(issue.reopened_count || 0) > 0 && <span style={{ fontSize: '11px', color: '#9a3412' }}>Rolled back {issue.reopened_count} time(s)</span>}
                  </div>

                  {issue.status === 'RESOLVED' ? (
                    <>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '10px' }}>
                        {issue.resolution_photo_path && (
                          <button type="button" onClick={() => setIssueZoom(true)} style={{ padding: 0, border: '2px solid #16a34a', borderRadius: '10px', overflow: 'hidden', background: '#f8fafc', cursor: 'pointer', width: '150px', flexShrink: 0 }}>
                            <EvidencePhoto src={issue.resolution_photo_path} alt="Resubmitted live photo" maxHeight="110px" style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block', borderRadius: 0 }} />
                            <div style={{ fontSize: '11px', fontWeight: 800, padding: '4px 6px', color: '#0f172a', textAlign: 'left' }}>New live photo</div>
                          </button>
                        )}
                        <div style={{ flex: 1, minWidth: '180px', fontSize: '12.5px', color: '#334155', lineHeight: 1.5 }}>
                          <div><b>Resubmitted:</b> {fmtDateTime(issue.resolved_at)}{issue.agent_name ? ` • ${issue.agent_name}` : ''}</div>
                          {issue.resolution_remarks && <div><b>Housekeeper remark:</b> {issue.resolution_remarks}</div>}
                        </div>
                      </div>
                      <textarea className="form-control" rows={2} placeholder="Remark (required for roll back)" value={issueRemark} onChange={e => setIssueRemark(e.target.value)} style={{ width: '100%', fontSize: '13px', marginBottom: '8px', background: '#ffffff' }} />
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button type="button" disabled={issueBusy} onClick={() => updateIssue('REOPENED')} className="btn btn-outline" style={{ flex: 1, borderColor: '#fca5a5', color: '#b91c1c', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <AlertTriangle size={16} /> Roll Back
                        </button>
                        <button type="button" disabled={issueBusy} onClick={() => updateIssue('CLOSED')} className="btn btn-primary" style={{ flex: 1, background: '#059669', borderColor: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <CheckCircle2 size={16} /> Approve — Close Issue
                        </button>
                      </div>
                    </>
                  ) : (issue.status === 'CLOSED' || issue.status === 'VERIFIED') ? (
                    <div style={{ fontSize: '12.5px', color: '#065f46' }}>Verified and closed{issue.verified_at ? ` • ${fmtDateTime(issue.verified_at)}` : ''}.</div>
                  ) : (
                    <div style={{ fontSize: '12.5px', color: '#075985' }}>
                      Sent to {issue.agent_name || 'the housekeeper'}. Approve / Roll Back will appear here once they resubmit with a live photo.
                    </div>
                  )}
                  {issueError && <div style={{ color: '#b91c1c', fontSize: '12.5px', fontWeight: 600, marginTop: '6px' }}>{issueError}</div>}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Evidence Photos ({photos.length})</div>
                {isPending && (
                  <div style={{ fontSize: '12px', fontWeight: 700, color: allViewed ? '#059669' : '#b45309' }}>
                    {allViewed ? '✓ All photos reviewed' : `Photos viewed: ${photos.filter(p => viewed.has(p.id)).length}/${photos.length} — tap each photo`}
                  </div>
                )}
              </div>
              {isPending && !allViewed && (
                <div style={{ height: '6px', borderRadius: '4px', background: '#fef3c7', overflow: 'hidden', marginBottom: '10px' }}>
                  <div style={{ height: '100%', width: `${photos.length ? (photos.filter(p => viewed.has(p.id)).length / photos.length) * 100 : 0}%`, background: '#f59e0b', transition: 'width 0.2s' }} />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                {photos.map((p, idx) => {
                  const seen = reviewMarked || viewed.has(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => openPhoto(idx)} style={{ position: 'relative', padding: 0, border: seen ? '2px solid #10b981' : '2px solid #f59e0b', borderRadius: '12px', overflow: 'hidden', background: '#f8fafc', cursor: 'pointer', textAlign: 'left' }}>
                      <EvidencePhoto src={p.storage_path} alt={photoLabel(p)} maxHeight="120px" style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block', borderRadius: 0 }} />
                      <div style={{ padding: '6px 8px' }}>
                        <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{photoLabel(p)}</div>
                        <div style={{ fontSize: '10.5px', color: '#64748b' }}>{fmtDateTime(p.captured_at)}</div>
                      </div>
                      <span style={{ position: 'absolute', top: '6px', right: '6px', fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '6px', background: seen ? '#10b981' : '#f59e0b', color: '#fff', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        {seen ? <><CheckCircle2 size={11} /> Viewed</> : <><Eye size={11} /> Tap</>}
                      </span>
                    </button>
                  );
                })}
              </div>

              {(data.responses || []).length > 0 && <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                Checklist {failed.length > 0 && <span style={{ color: '#dc2626', fontSize: '12px' }}>• {failed.length} item NO / fail</span>}
              </div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px', marginBottom: '14px' }}>
                {(data.responses || []).map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '6px 8px', borderRadius: '8px', background: r.status === 'PASS' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${r.status === 'PASS' ? '#bbf7d0' : '#fecaca'}`, fontSize: '12px' }}>
                    {r.status === 'PASS' ? <CheckCircle2 size={14} color="#059669" style={{ flexShrink: 0, marginTop: '1px' }} /> : <XCircle size={14} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />}
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{r.item_label}</div>
                      {r.fail_reason && <div style={{ color: '#991b1b', fontSize: '11px' }}>{r.fail_reason}</div>}
                    </div>
                  </div>
                ))}
              </div>

              {session.remarks && (
                <div style={{ fontSize: '12.5px', color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', marginBottom: '12px' }}>
                  <strong>Housekeeper remarks:</strong> {session.remarks}
                </div>
              )}

              {error && <div style={{ color: '#b91c1c', fontSize: '12.5px', fontWeight: 600 }}>{error}</div>}
            </>
          )}
        </div>

      </div>

      {issueZoom && issue?.resolution_photo_path && (
        <div onClick={e => { e.stopPropagation(); setIssueZoom(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(248,250,252,0.97)', zIndex: 1300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-primary-900)', marginBottom: '8px' }}>New live photo • {fmtDateTime(issue.resolved_at)}</div>
          <EvidencePhoto src={issue.resolution_photo_path} alt="" maxHeight="78vh" style={{ width: 'auto', maxWidth: 'calc(100vw - 40px)', maxHeight: '78vh', objectFit: 'contain', borderRadius: '10px' }} />
          <button type="button" onClick={() => setIssueZoom(false)} style={{ marginTop: '12px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '8px 18px', fontWeight: 800, cursor: 'pointer' }}>Close</button>
        </div>
      )}

      {lightboxIdx !== null && photos[lightboxIdx] && (
        <div onClick={e => { e.stopPropagation(); setLightboxIdx(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(248,250,252,0.97)', zIndex: 1300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ color: 'var(--color-primary-900)', fontSize: '14px', fontWeight: 800, marginBottom: '8px', textAlign: 'center' }}>
            {photoLabel(photos[lightboxIdx])} • {fmtDateTime(photos[lightboxIdx].captured_at)} ({lightboxIdx + 1}/{photos.length})
          </div>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '100%' }}>
            <button type="button" disabled={lightboxIdx === 0} onClick={() => openPhoto(lightboxIdx - 1)} style={navBtn(lightboxIdx === 0)}><ChevronLeft size={22} /></button>
            <EvidencePhoto src={photos[lightboxIdx].storage_path} alt="" maxHeight="78vh" style={{ width: 'auto', maxWidth: 'calc(100vw - 130px)', maxHeight: '78vh', objectFit: 'contain', borderRadius: '10px' }} />
            <button type="button" disabled={lightboxIdx === photos.length - 1} onClick={() => openPhoto(lightboxIdx + 1)} style={navBtn(lightboxIdx === photos.length - 1)}><ChevronRight size={22} /></button>
          </div>
          <button type="button" onClick={() => setLightboxIdx(null)} style={{ marginTop: '12px', background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '8px 18px', fontWeight: 800, cursor: 'pointer' }}>Close</button>
        </div>
      )}
    </div>
  );
}

function navBtn(disabled) {
  return { background: '#ffffff', border: '1px solid var(--color-border)', color: 'var(--color-primary-700)', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1, flexShrink: 0 };
}

function InfoTile({ icon: Icon, label, value, warn }) {
  return (
    <div style={{ padding: '8px 10px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
        <Icon size={12} /> {label}
        {warn && <span style={{ marginLeft: 'auto', background: '#fee2e2', color: '#b91c1c', borderRadius: '5px', padding: '0 5px', fontSize: '10px' }}>{warn}</span>}
      </div>
      <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{value}</div>
    </div>
  );
}

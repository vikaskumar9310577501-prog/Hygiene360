import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { X, CheckCircle2, AlertTriangle, Clock, User, ShieldCheck, Camera, History } from 'lucide-react';

export default function ToiletDetailModal({ isOpen, onClose, toiletId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  useEffect(() => {
    if (isOpen && toiletId) {
      setLoading(true);
      api.get(`/dashboard/toilet/${toiletId}`)
        .then(res => setData(res))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, toiletId]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '780px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={22} color="var(--color-brand-600)" />
            <div>
              <h3 className="modal-title">
                {data?.toilet?.name || 'Toilet 360 Detail View'}
              </h3>
              <div style={{ fontSize: '11.5px', color: 'var(--color-primary-500)' }}>
                {data?.toilet?.plant_name} • {data?.toilet?.building_name} • {data?.toilet?.area_name}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-primary-500)' }}>
              Loading facility records...
            </div>
          ) : !data ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-danger-600)' }}>
              Failed to load toilet details.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Quick Status Bar */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px',
                padding: '14px',
                borderRadius: '10px',
                backgroundColor: 'var(--color-primary-50)',
                border: '1px solid var(--color-border)'
              }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--color-primary-500)', fontWeight: '600' }}>CODE</div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-primary-950)' }}>{data.toilet.code}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--color-primary-500)', fontWeight: '600' }}>STATUS</div>
                  <div>
                    <span className={`badge ${data.lastCleaning?.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}`}>
                      {data.lastCleaning?.status === 'COMPLETED' ? '✓ Cleaned Today' : '⚠ Pending'}
                    </span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--color-primary-500)', fontWeight: '600' }}>LAST SCORE</div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--color-brand-600)' }}>
                    {data.lastCleaning ? `${data.lastCleaning.checklist_score}%` : 'N/A'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--color-primary-500)', fontWeight: '600' }}>ACTIVE ISSUES</div>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: data.openIssues.length > 0 ? 'var(--color-danger-600)' : 'var(--color-success-600)' }}>
                    {data.openIssues.length}
                  </div>
                </div>
              </div>

              {/* Latest Cleaning & Evidence Photos */}
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--color-primary-900)' }}>
                    Latest Cleaning Session
                  </span>
                  {data.lastCleaning && (
                    <span style={{ fontSize: '12px', color: 'var(--color-primary-500)' }}>
                      Session: {data.lastCleaning.session_code}
                    </span>
                  )}
                </div>

                {data.lastCleaning ? (
                  <div>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '14px', flexWrap: 'wrap', fontSize: '12.5px' }}>
                      <div><strong>Agent:</strong> {data.lastCleaning.agent_name} ({data.lastCleaning.agent_emp_id})</div>
                      <div><strong>Start:</strong> {data.lastCleaning.start_time}</div>
                      <div><strong>Completed:</strong> {data.lastCleaning.submit_time || 'In Progress'}</div>
                    </div>

                    {/* Photos Gallery */}
                    <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--color-primary-600)', marginBottom: '8px' }}>
                      VERIFIED EVIDENCE PHOTOS (TAMPER WATERMARKED)
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                      {data.lastCleaning.evidencePhotos && data.lastCleaning.evidencePhotos.length > 0 ? (
                        data.lastCleaning.evidencePhotos.map(p => (
                          <div 
                            key={p.id}
                            onClick={() => setSelectedPhoto(p)}
                            style={{
                              border: '1px solid var(--color-border)',
                              borderRadius: '8px',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              backgroundColor: '#f1f5f9'
                            }}
                          >
                            <img 
                              src={p.storage_path} 
                              alt={p.photo_type} 
                              style={{ width: '100%', height: '110px', objectFit: 'cover' }}
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.parentElement.innerHTML = `<div style="padding: 30px 10px; text-align: center; color: #94a3b8; font-size: 11px;">[Live Watermarked Photo: ${p.photo_type}]</div>`;
                              }}
                            />
                            <div style={{ padding: '6px 8px', fontSize: '11px', color: 'var(--color-primary-800)', backgroundColor: '#ffffff', borderTop: '1px solid var(--color-border)' }}>
                              <div style={{ fontWeight: '600' }}>{p.photo_type.replace(/_/g, ' ')}</div>
                              <div style={{ fontSize: '10px', color: '#94a3b8' }}>{p.captured_at}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--color-primary-500)', fontStyle: 'italic' }}>
                          No evidence photos recorded.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--color-primary-500)' }}>
                    No cleaning record logged for this toilet today yet.
                  </div>
                )}
              </div>

              {/* Historical Timeline */}
              <div className="card" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
                  <History size={16} color="var(--color-primary-800)" />
                  <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--color-primary-900)' }}>
                    Operational Timeline Sequence
                  </span>
                </div>

                <div style={{ position: 'relative', paddingLeft: '24px', borderLeft: '2px solid var(--color-border)' }}>
                  {data.timeline && data.timeline.length > 0 ? (
                    data.timeline.map((evt, idx) => (
                      <div key={idx} style={{ marginBottom: '16px', position: 'relative' }}>
                        <span style={{
                          position: 'absolute',
                          left: '-31px',
                          top: '2px',
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          backgroundColor: evt.type.includes('COMPLETED') ? '#10b981' : (evt.type.includes('ISSUE') ? '#ef4444' : '#0284c7'),
                          border: '2px solid #ffffff'
                        }} />
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary-950)' }}>
                            {evt.title}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--color-primary-500)' }}>
                            {evt.time}
                          </span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--color-primary-700)', marginTop: '2px' }}>
                          {evt.description}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '12px', color: 'var(--color-primary-500)' }}>
                      No events recorded in sequence.
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-outline">Close</button>
        </div>
      </div>
    </div>
  );
}

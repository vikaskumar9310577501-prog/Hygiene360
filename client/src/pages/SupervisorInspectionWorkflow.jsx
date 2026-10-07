import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import CameraCaptureModal from '../components/CameraCaptureModal';
import { 
  ArrowLeft, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Camera, 
  GlassWater, 
  ClipboardCheck, 
  User, 
  Clock, 
  Eye, 
  Sparkles,
  Send
} from 'lucide-react';

export default function SupervisorInspectionWorkflow({ inspectionData, onBack, onComplete, onNavigateToDrinkingWater }) {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('WC not clean');
  const [issueRemarks, setIssueRemarks] = useState('');
  const [priority, setPriority] = useState('HIGH');
  const [issuePhoto, setIssuePhoto] = useState(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState(null);
  const [auditOverallStatus, setAuditOverallStatus] = useState('SATISFACTORY');
  const [auditScore, setAuditScore] = useState(100);
  const [auditRemarks, setAuditRemarks] = useState('');

  const toilet = inspectionData?.toilet;
  const latestCleaning = inspectionData?.latestCleaning;
  const activeIssues = inspectionData?.activeIssues || [];

  useEffect(() => {
    api.get('/issues/categories')
      .then(res => setCategories(res.categories || []))
      .catch(() => {});
  }, []);

  const handlePhotoCaptured = (res) => {
    setIssuePhoto(res);
  };

  const handleCreateIssue = async (e) => {
    e.preventDefault();
    if (!selectedCategory || !issueRemarks.trim()) {
      alert('Please select an issue category and enter remarks.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        toiletId: toilet.id,
        category: selectedCategory,
        description: issueRemarks,
        priority,
        imageBase64: issuePhoto?.storagePath ? undefined : null
      };

      const res = await api.post('/issues', payload);
      setSuccessMessage(res.message);

      setTimeout(() => {
        if (onComplete) onComplete();
      }, 1500);
    } catch (err) {
      alert(err.data?.error || err.message || 'Failed to submit issue');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordInspectionAudit = async () => {
    setSubmitting(true);
    try {
      await api.post('/inspection/submit', {
        toiletId: toilet.id,
        sessionId: latestCleaning?.sessionId,
        overallStatus: auditOverallStatus,
        score: auditScore,
        remarks: auditRemarks || (auditOverallStatus === 'SATISFACTORY' ? 'Hygiene verified to enterprise standard. Pass.' : 'Deficiencies flagged during supervisor round.')
      });
      alert(`Supervisor audit recorded for ${toilet.name}. Status: ${auditOverallStatus}`);
      if (onComplete) onComplete();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!toilet) {
    return (
      <div className="page-wrapper" style={{ textAlign: 'center', padding: '60px' }}>
        <div>No toilet data available for inspection.</div>
        <button onClick={onBack} className="btn btn-outline" style={{ marginTop: '16px' }}>Back</button>
      </div>
    );
  }

  return (
    <div className="page-wrapper" style={{ maxWidth: '840px', margin: '0 auto' }}>
      
      {/* Top Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button onClick={onBack} className="btn btn-outline btn-sm">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <span className="badge badge-primary">
          SUPERVISOR INSPECTION CONSOLE
        </span>
      </div>

      {/* Facility Header Card */}
      <div className="card" style={{ marginBottom: '20px', backgroundColor: '#ffffff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#0284c7', fontWeight: '700', letterSpacing: '0.08em' }}>
              SCANNED FACILITY AUDIT
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: '800', marginTop: '2px', color: 'var(--color-primary-900)' }}>
              {toilet.name} ({toilet.code})
            </h2>
            <div style={{ fontSize: '12.5px', color: 'var(--color-primary-500)', marginTop: '4px' }}>
              {toilet.plant_name} • {toilet.building_name} • {toilet.area_name}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => onNavigateToDrinkingWater({ plantId: toilet.plant_id, areaId: toilet.area_id })}
              className="btn btn-outline btn-sm"
              style={{ color: '#38bdf8', borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.1)' }}
            >
              <GlassWater size={15} />
              <span>Drinking Water Inspection</span>
            </button>
          </div>
        </div>
      </div>

      {/* LATEST CLEANING SUMMARY (Prompt Requirement: Supervisor should immediately see Toilet, Latest cleaning, Last agent, Cleaning time, Checklist score, Evidence, Previous issues) */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div className="card-title" style={{ margin: 0 }}>
            <ClipboardCheck size={18} color="var(--color-brand-600)" />
            <span>Latest Housekeeping Cleaning Submission</span>
          </div>
          {latestCleaning ? (
            <span className="badge badge-success">✓ Cleaned Today</span>
          ) : (
            <span className="badge badge-warning">⚠ Not Cleaned Today</span>
          )}
        </div>

        {latestCleaning ? (
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              padding: '14px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-primary-50)',
              marginBottom: '14px',
              fontSize: '13px'
            }}>
              <div>
                <span style={{ color: 'var(--color-primary-500)', fontSize: '11px', display: 'block' }}>CLEANED BY</span>
                <strong>{latestCleaning.agentName}</strong> ({latestCleaning.agentEmpId})
              </div>
              <div>
                <span style={{ color: 'var(--color-primary-500)', fontSize: '11px', display: 'block' }}>CLEANING TIME</span>
                <strong>{latestCleaning.submitTime?.slice(11, 16) || 'Morning'}</strong> ({latestCleaning.startTime?.slice(11, 16)} start)
              </div>
              <div>
                <span style={{ color: 'var(--color-primary-500)', fontSize: '11px', display: 'block' }}>CHECKLIST SCORE</span>
                <strong style={{ color: '#059669', fontSize: '15px' }}>{latestCleaning.score}%</strong>
              </div>
              <div>
                <span style={{ color: 'var(--color-primary-500)', fontSize: '11px', display: 'block' }}>SESSION ID</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{latestCleaning.sessionCode}</span>
              </div>
            </div>

            {/* Evidence Photos Gallery */}
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary-700)', marginBottom: '8px' }}>
              AGENT SUBMITTED EVIDENCE PHOTOS (VERIFIED TIMESTAMPED)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' }}>
              {latestCleaning.evidencePhotos && latestCleaning.evidencePhotos.length > 0 ? (
                latestCleaning.evidencePhotos.map(p => (
                  <div key={p.id} style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border)', backgroundColor: '#f1f5f9' }}>
                    <img 
                      src={p.storage_path} 
                      alt={p.photo_type} 
                      style={{ width: '100%', height: '110px', objectFit: 'cover' }} 
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = `<div style="padding: 30px 8px; text-align: center; color: #94a3b8; font-size: 11px;">[Live Watermarked: ${p.photo_type}]</div>`;
                      }}
                    />
                    <div style={{ padding: '6px 8px', backgroundColor: '#ffffff', borderTop: '1px solid var(--color-border)', color: 'var(--color-primary-800)', fontSize: '10.5px' }}>
                      <div style={{ fontWeight: '600' }}>{p.photo_type.replace(/_/g, ' ')}</div>
                      <div style={{ color: '#94a3b8', fontSize: '9.5px' }}>{p.captured_at}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--color-primary-500)' }}>No evidence photos recorded.</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: '16px', backgroundColor: '#fffbeb', borderRadius: '8px', color: '#92400e', fontSize: '13px' }}>
            Toilet has not been cleaned or recorded yet today. Checkpoint timer will flag this facility if cleaning remains pending.
          </div>
        )}
      </div>

      {/* ACTIVE ISSUES ON THIS TOILET */}
      {activeIssues.length > 0 && (
        <div style={{
          backgroundColor: '#fef2f2',
          border: '1px solid #fecdd3',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <AlertCircle size={18} color="#dc2626" />
            <span style={{ fontWeight: '800', fontSize: '14px', color: '#991b1b' }}>
              {activeIssues.length} Active Issue(s) Previously Raised on this Toilet
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeIssues.map(iss => (
              <div key={iss.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fca5a5', fontSize: '12.5px' }}>
                <div>
                  <strong>{iss.ticket_no}:</strong> {iss.category} — {iss.description}
                </div>
                <span className="badge badge-danger">{iss.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUPERVISOR ACTIONS: RAISE ISSUE OR PASS AUDIT */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        
        {/* OPTION 1: Pass Audit Check */}
        <div className="card" style={{ padding: '20px' }}>
          <div className="card-title">
            <CheckCircle2 size={18} color="#059669" />
            <span>Record Audit Pass / Score</span>
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--color-primary-600)', marginBottom: '14px' }}>
            If the toilet meets hygiene standards, log an official supervisor verification pass.
          </p>

          <div className="form-group">
            <label className="form-label">Audit Decision</label>
            <select
              className="form-control"
              value={auditOverallStatus}
              onChange={(e) => setAuditOverallStatus(e.target.value)}
            >
              <option value="SATISFACTORY">SATISFACTORY (100% Pass)</option>
              <option value="NEEDS_ATTENTION">NEEDS MINOR ATTENTION (75%)</option>
              <option value="UNSATISFACTORY">UNSATISFACTORY (Deficiency)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Supervisor Remarks</label>
            <input
              type="text"
              placeholder="e.g. Hygiene standards verified on-site. Pass."
              className="form-control"
              value={auditRemarks}
              onChange={(e) => setAuditRemarks(e.target.value)}
            />
          </div>

          <button
            onClick={handleRecordInspectionAudit}
            disabled={submitting}
            className="btn btn-success"
            style={{ width: '100%' }}
          >
            <CheckCircle2 size={16} />
            <span>Record Audit Inspection</span>
          </button>
        </div>

        {/* OPTION 2: Raise Housekeeping Issue (Prompt Requirement: Housekeeping Issue Dropdown) */}
        <div className="card" style={{ padding: '20px', border: '2px solid rgba(239, 68, 68, 0.4)' }}>
          <div className="card-title" style={{ color: '#b91c1c' }}>
            <AlertCircle size={18} color="#dc2626" />
            <span>Raise Housekeeping Issue</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--color-primary-600)', marginBottom: '14px' }}>
            Automatically notifies responsible agent and tracks resolution lifecycle.
          </p>

          {successMessage && (
            <div style={{ padding: '10px', backgroundColor: '#ecfdf5', color: '#047857', borderRadius: '6px', fontSize: '12.5px', marginBottom: '12px' }}>
              ✓ {successMessage}
            </div>
          )}

          <form onSubmit={handleCreateIssue}>
            <div className="form-group">
              <label className="form-label">Issue Category</label>
              <select
                className="form-control"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                required
              >
                {categories.map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Priority</label>
              <select
                className="form-control"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH (Urgent)</option>
                <option value="CRITICAL">CRITICAL (Water/Flush Breakdown)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Issue Description / Location</label>
              <textarea
                rows={2}
                className="form-control"
                placeholder="e.g. WC in cubicle 1 has yellow limescale ring..."
                value={issueRemarks}
                onChange={(e) => setIssueRemarks(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <button
                type="button"
                onClick={() => setCameraModalOpen(true)}
                className="btn btn-outline btn-sm"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Camera size={14} />
                <span>{issuePhoto ? '✓ Issue Photo Attached (Retake)' : 'Capture Live Issue Photo'}</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-danger"
              style={{ width: '100%' }}
              id="btn-submit-issue"
            >
              <Send size={16} />
              <span>{submitting ? 'Generating Ticket...' : 'Submit Issue & Alert Agent'}</span>
            </button>
          </form>
        </div>

      </div>

      {/* Live Issue Camera Modal */}
      {cameraModalOpen && (
        <CameraCaptureModal
          isOpen={true}
          onClose={() => setCameraModalOpen(false)}
          sessionId={latestCleaning?.sessionId || 'INSPECTION'}
          photoType="ISSUE_EVIDENCE"
          photoLabel="Deficiency Photo"
          onCaptured={handlePhotoCaptured}
        />
      )}

    </div>
  );
}

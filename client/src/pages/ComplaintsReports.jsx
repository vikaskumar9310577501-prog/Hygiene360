import React, { useState, useEffect, useRef } from 'react';
import { api, photoUrl } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import EvidencePhoto from '../components/EvidencePhoto';
import IssueDetailModal from '../components/IssueDetailModal';
import { 
  ClipboardList, 
  Sparkles, 
  GlassWater, 
  ShieldAlert, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Search, 
  Filter, 
  RefreshCw, 
  Eye, 
  X, 
  User, 
  IdCard, 
  Phone, 
  Mail, 
  MapPin, 
  Building2, 
  ChevronRight,
  ExternalLink,
  PlusCircle,
  FileSpreadsheet,
  Calendar,
  AlertTriangle,
  SlidersHorizontal,
  ChevronDown,
  Camera,
  ShieldCheck
} from 'lucide-react';

// Allowed next steps: Open → Action in progress → Action taken (photo) → Supervisor verification → Closed / Reopened
function statusOptionsFor(status) {
  if (status === 'RESOLVED') {
    return [
      { value: 'CLOSED', label: 'Verify & Close' },
      { value: 'REOPENED', label: 'Reopen (action not acceptable, remarks required)' }
    ];
  }
  if (status === 'CLOSED' || status === 'VERIFIED') {
    return [{ value: 'REOPENED', label: 'Reopen (remarks required)' }];
  }
  return [
    { value: 'IN_PROGRESS', label: 'Action in progress' },
    { value: 'RESOLVED', label: 'Action taken (live photo required)' }
  ];
}

function nextStatusFor(status) {
  if (status === 'RESOLVED') return 'CLOSED';
  if (status === 'CLOSED' || status === 'VERIFIED') return 'REOPENED';
  if (status === 'IN_PROGRESS') return 'RESOLVED';
  return 'IN_PROGRESS';
}
export default function ComplaintsReports({ onOpenComplaintPortal, onSelectToilet, embedded = false }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters (moved into dedicated filter modal)
  const [typeFilter, setTypeFilter] = useState('ALL'); // ALL, HOUSEKEEPING, DRINKING_WATER
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, OPEN, IN_PROGRESS, RESOLVED
  const [fakeOnlyFilter, setFakeOnlyFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [metricFilter, setMetricFilter] = useState('TOTAL');
  const [detailComplaint, setDetailComplaint] = useState(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState(null);
  const [previewComplaint, setPreviewComplaint] = useState(null);

  // Status Update Modal & Live Camera State
  const [updatingComplaint, setUpdatingComplaint] = useState(null);
  const [newStatus, setNewStatus] = useState('IN_PROGRESS');
  const [statusRemarks, setStatusRemarks] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [issueModalId, setIssueModalId] = useState(null);

  // Live Camera states for resolution verification
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Role permissions: EMPLOYEES can NEVER update or resolve complaints
  const canVerifyRole = ['SUPER_ADMIN', 'IT_ADMIN', 'PLANT_ADMIN', 'SUPERVISOR'].includes(user?.role);
  const needsAssign = (c) => c.status === 'OPEN' && !c.assigned_agent_id && c.complaint_type !== 'CLEANING_AUDIT';
  const usesIssueFlow = (c) => needsAssign(c) || c.complaint_type === 'CLEANING_AUDIT';

  const canUpdateIssue = user && user.role !== 'EMPLOYEE' && (
    user.role === 'HOUSEKEEPING' || 
    user.role === 'HOUSEKEEPING_AGENT' || 
    ['SUPER_ADMIN', 'IT_ADMIN', 'PLANT_ADMIN', 'SUPERVISOR', 'MANAGEMENT'].includes(user.role)
  );

  useEffect(() => {
    loadComplaints();
  }, [typeFilter, statusFilter, fakeOnlyFilter, user?.plant_id]);

  const loadRef = useRef(null);
  useEffect(() => {
    if (!embedded) return;
    const t = setInterval(() => loadRef.current?.(true), 30000);
    return () => clearInterval(t);
  }, [embedded]);

  const loadComplaints = async (silent = false) => {
    if (silent !== true) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'ALL') params.append('type', typeFilter);
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (fakeOnlyFilter) params.append('fakeOnly', 'true');
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (user?.plant_id) params.append('plantId', user.plant_id);

      const res = await api.get(`/issues/complaints-report?${params.toString()}`);
      setData(res);
    } catch (err) {
      console.error('Complaints report error:', err);
      setError(err.data?.error || err.message || 'Failed to load complaints report');
    } finally {
      setLoading(false);
    }
  };
  loadRef.current = loadComplaints;

  const handleApplyFilterModal = (e) => {
    if (e) e.preventDefault();
    setIsFilterModalOpen(false);
    loadComplaints();
  };

  const handleResetFilters = () => {
    setTypeFilter('ALL');
    setStatusFilter('ALL');
    setFakeOnlyFilter(false);
    setSearchQuery('');
    setIsFilterModalOpen(false);
  };

  // Camera methods for live resolution verification
  const startCamera = async () => {
    setShowCamera(true);
    setCapturedPhoto(null);
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        setCameraStream(s);
        setTimeout(() => {
          if (videoRef.current) videoRef.current.srcObject = s;
        }, 100);
      }
    } catch (err) {
      console.warn('Camera error:', err);
      alert('Camera access denied or unavailable. Please enable camera permissions to take live photo proof.');
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Live watermark with timestamp and inspector identity
    const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`RESOLVED: ${nowStr} • ${user?.name || 'Staff'} • ${updatingComplaint?.toilet_code || ''}`, 12, canvas.height - 15);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedPhoto(dataUrl);
    stopCamera();
  };

  const retakePhoto = () => {
    setCapturedPhoto(null);
    startCamera();
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    if (!updatingComplaint) return;

    // Requirement: When marking as RESOLVED, live photo is MANDATORY!
    if (newStatus === 'RESOLVED' && !capturedPhoto) {
      alert('Live photo proof is mandatory before marking a complaint as RESOLVED. Please click "Open Camera" to take live photo proof.');
      return;
    }

    setSavingStatus(true);
    try {
      await api.patch(`/issues/${updatingComplaint.id}/status`, {
        status: newStatus,
        remarks: statusRemarks,
        resolutionPhoto: capturedPhoto,
        imageBase64: capturedPhoto
      });
      stopCamera();
      setUpdatingComplaint(null);
      setStatusRemarks('');
      setCapturedPhoto(null);
      if (detailComplaint && detailComplaint.id === updatingComplaint.id) {
        setDetailComplaint({ 
          ...detailComplaint, 
          status: newStatus, 
          resolution_remarks: statusRemarks,
          resolution_photo_path: capturedPhoto || detailComplaint.resolution_photo_path 
        });
      }
      loadComplaints();
    } catch (err) {
      alert(err.data?.error || err.message || 'Status update failed');
    } finally {
      setSavingStatus(false);
    }
  };

  const stats = data?.stats || {
    total: 0,
    housekeeping: 0,
    drinkingWater: 0,
    fakeAuditFlagged: 0,
    resolved: 0,
    open: 0
  };

  const complaints = data?.complaints || [];

  // Active filters count
  let activeFilterCount = 0;
  if (typeFilter !== 'ALL') activeFilterCount++;
  if (statusFilter !== 'ALL') activeFilterCount++;
  if (fakeOnlyFilter) activeFilterCount++;
  if (searchQuery.trim()) activeFilterCount++;

  const handleExportCSV = () => {
    if (!complaints || complaints.length === 0) {
      alert('No complaints or reports data available to export.');
      return;
    }
    const headers = [
      'ID', 'Type', 'Category/Defect', 'Status', 'Severity', 'Facility Code', 'Facility Name',
      'Plant', 'Area', 'Reported By', 'Employee ID', 'Phone', 'Fake Audit Flagged',
      'Flagged Housekeeper', 'Date Time'
    ];
    const rows = complaints.map(c => [
      c.id,
      c.complaint_type || 'HOUSEKEEPING',
      `"${(c.checklist_item_label || c.title || '').replace(/"/g, '""')}"`,
      c.status,
      c.severity || 'MEDIUM',
      c.toilet_code || '',
      `"${(c.toilet_name || '').replace(/"/g, '""')}"`,
      `"${(c.plant_name || '').replace(/"/g, '""')}"`,
      `"${(c.area_name || '').replace(/"/g, '""')}"`,
      `"${(c.reported_by_name || '').replace(/"/g, '""')}"`,
      c.reported_by_emp_id || '',
      c.reported_by_phone || '',
      c.is_fake_audit_flagged ? 'YES (FLAGGED)' : 'NO',
      `"${(c.flagged_agent_name || '').replace(/"/g, '""')}"`,
      c.created_at ? new Date(c.created_at).toLocaleString() : ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `complaints_reports_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const METRIC_LABELS = {
    AWAITING: 'Awaiting Verification',
    PENDING: 'Pending',
    FAKE_AUDIT: 'Fake Audit Flags',
    RESOLVED: 'Resolved'
  };
  const selectMetric = (type) => setMetricFilter(prev => (prev === type || type === 'TOTAL' ? 'TOTAL' : type));

  const itemsForMetric = (type) => {
    switch (type) {
      case 'HOUSEKEEPING':
        return complaints.filter(c => c.complaint_type === 'HOUSEKEEPING' || !c.complaint_type);
      case 'DRINKING_WATER':
        return complaints.filter(c => c.complaint_type === 'DRINKING_WATER');
      case 'FAKE_AUDIT':
        return complaints.filter(c => c.is_fake_audit_flagged === 1);
      case 'AWAITING':
        return complaints.filter(c => c.status === 'OPEN' && !c.assigned_agent_id && c.complaint_type !== 'CLEANING_AUDIT');
      case 'PENDING':
        return complaints.filter(c => ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'REOPENED'].includes(c.status) && c.complaint_type !== 'CLEANING_AUDIT');
      case 'RESOLVED':
        return complaints.filter(c => c.status === 'RESOLVED' || c.status === 'CLOSED' || c.status === 'VERIFIED');
      case 'TOTAL':
      default:
        return complaints;
    }
  };
  const feedComplaints = itemsForMetric(metricFilter);

  return (
    <div
      className={embedded ? 'complaints-embedded' : 'page-wrapper'}
      style={embedded
        ? { padding: '12px 0 60px', boxSizing: 'border-box' }
        : { maxWidth: '1240px', margin: '0 auto', padding: '16px 12px 60px', boxSizing: 'border-box' }}
    >
      
      {/* Sticky header: title + KPI cards stay pinned below the navbar while the feed scrolls */}
      <div className="complaints-sticky-header">

      {/* Top Header */}
      <div style={{
        display: embedded ? 'none' : 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        marginBottom: '8px'
      }}>
        <div>
          <h1 style={{ fontSize: embedded ? '15px' : '17px', fontWeight: '900', color: '#0f172a', margin: embedded ? 0 : '0 0 1px 0', letterSpacing: '-0.02em' }}>
            Complaints & Reports
          </h1>
          {!embedded && (
            <div className="complaints-subtitle" style={{ fontSize: '11px', color: '#64748b' }}>
              Tracking employee complaints, drinking water defects & anti-fraud audit flags.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            type="button"
            onClick={loadComplaints}
            className="btn btn-outline btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>

          {onOpenComplaintPortal && (
            <button 
              type="button"
              onClick={onOpenComplaintPortal}
              className="btn btn-brand btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px', backgroundColor: '#0284c7' }}
            >
              <PlusCircle size={14} />
              <span>Report Issue</span>
            </button>
          )}

          <button 
            type="button"
            onClick={handleExportCSV}
            className="btn btn-outline btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
            title="Download complaints report as CSV"
          >
            <FileSpreadsheet size={13} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* TOP KPI METRIC CARDS - ALL ARE CLICKABLE TO OPEN DETAILS POPUP */}
      <div className={embedded ? 'complaints-kpi-strip with-action' : 'complaints-kpi-strip'}>
        
        {/* 1. Total Complaints (Clickable) */}
        <div 
          onClick={() => selectMetric('TOTAL')}
          className={metricFilter === 'TOTAL' && 'TOTAL' !== 'TOTAL' ? 'kpi-active' : ''}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '16px 16px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            position: 'relative',
            userSelect: 'none'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Total Complaints</span>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
              <ClipboardList size={18} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#0f172a' }}>
            {stats.total}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>{stats.housekeeping} Housekeeping • {stats.drinkingWater} Water</span>
            <span style={{ fontSize: '10.5px', color: '#0284c7', fontWeight: '700' }}>Show ↓</span>
          </div>
        </div>

        {/* 2. Housekeeping Issues (Clickable) */}
        <div 
          onClick={() => selectMetric('AWAITING')}
          className={metricFilter === 'AWAITING' && 'AWAITING' !== 'TOTAL' ? 'kpi-active' : ''}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '16px 16px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            position: 'relative',
            userSelect: 'none'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Awaiting Verification</span>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
              <Sparkles size={18} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#0284c7' }}>
            {stats.awaitingVerification || 0}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Verify & assign housekeeper</span>
            <span style={{ fontSize: '10.5px', color: '#0284c7', fontWeight: '700' }}>Show ↓</span>
          </div>
        </div>

        {/* 3. Drinking Water Issues (Clickable) */}
        <div 
          onClick={() => selectMetric('PENDING')}
          className={metricFilter === 'PENDING' && 'PENDING' !== 'TOTAL' ? 'kpi-active' : ''}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '16px 16px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            position: 'relative',
            userSelect: 'none'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Pending</span>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
              <GlassWater size={18} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#0284c7' }}>
            {stats.pending || 0}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>With housekeeper / not resolved</span>
            <span style={{ fontSize: '10.5px', color: '#0284c7', fontWeight: '700' }}>Show ↓</span>
          </div>
        </div>

        {/* 4. Fake Audit Discrepancies (Clickable - Red Alert Highlight) */}
        <div 
          onClick={() => selectMetric('FAKE_AUDIT')}
          className={metricFilter === 'FAKE_AUDIT' && 'FAKE_AUDIT' !== 'TOTAL' ? 'kpi-active' : ''}
          style={{
            backgroundColor: '#fff5f5',
            borderRadius: '14px',
            border: '1.5px solid #fca5a5',
            padding: '16px 16px',
            boxShadow: '0 3px 12px rgba(239, 68, 68, 0.08)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            position: 'relative',
            userSelect: 'none'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '800', color: '#dc2626' }}>🚨 Fake Audit Flags</span>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
              <ShieldAlert size={19} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#dc2626' }}>
            {stats.fakeAuditFlagged}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', color: '#b91c1c', fontWeight: '600' }}>Audit Discrepancies</span>
            <span style={{ fontSize: '10.5px', color: '#dc2626', fontWeight: '800' }}>Show ↓</span>
          </div>
        </div>

        {/* 5. Resolved Count (Clickable) */}
        <div 
          onClick={() => selectMetric('RESOLVED')}
          className={metricFilter === 'RESOLVED' && 'RESOLVED' !== 'TOTAL' ? 'kpi-active' : ''}
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            border: '1px solid #e2e8f0',
            padding: '16px 16px',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            position: 'relative',
            userSelect: 'none'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#64748b' }}>Resolved</span>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', backgroundColor: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div style={{ fontSize: '26px', fontWeight: '900', color: '#10b981' }}>
            {stats.resolved}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>{stats.total > 0 ? `${Math.round((stats.resolved / stats.total) * 100)}% resolved` : '100%'}</span>
            <span style={{ fontSize: '10.5px', color: '#10b981', fontWeight: '700' }}>Show ↓</span>
          </div>
        </div>

        {embedded && (
          <button
            type="button"
            onClick={handleExportCSV}
            title="Download complaints report as CSV"
            style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', color: '#334155', fontWeight: 700, fontSize: '12px', cursor: 'pointer', gap: '6px', justifyContent: 'center', whiteSpace: 'nowrap' }}
          >
            <FileSpreadsheet size={14} color="#0284c7" />
            <span>Export CSV</span>
          </button>
        )}

      </div>

      </div>

      {/* COMPACT CLEAN TOOLBAR (Search bar, categories, fake audit, status moved to dedicated filter modal as requested) */}
      {!embedded && (
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        border: '1px solid #e2e8f0',
        padding: '8px 12px',
        marginBottom: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '13px', fontWeight: '800', color: '#0f172a' }}>
            Complaints Feed ({feedComplaints.length})
          </span>

          {metricFilter !== 'TOTAL' && (
            <span style={{ fontSize: '11px', backgroundColor: '#0284c7', color: '#ffffff', padding: '3px 9px', borderRadius: '20px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              Showing: {METRIC_LABELS[metricFilter]}
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => setMetricFilter('TOTAL')} />
            </span>
          )}

          {/* Active Filter Chips */}
          {typeFilter !== 'ALL' && (
            <span style={{
              fontSize: '11px',
              backgroundColor: '#e0f2fe',
              color: '#0284c7',
              padding: '3px 8px',
              borderRadius: '20px',
              fontWeight: '700',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {typeFilter === 'DRINKING_WATER' ? '💧 Water' : '🧹 Housekeeping'}
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => setTypeFilter('ALL')} />
            </span>
          )}

          {statusFilter !== 'ALL' && (
            <span style={{
              fontSize: '11px',
              backgroundColor: '#f1f5f9',
              color: '#334155',
              padding: '3px 8px',
              borderRadius: '20px',
              fontWeight: '700',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {statusFilter}
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => setStatusFilter('ALL')} />
            </span>
          )}

          {fakeOnlyFilter && (
            <span style={{
              fontSize: '11px',
              backgroundColor: '#fee2e2',
              color: '#dc2626',
              padding: '3px 8px',
              borderRadius: '20px',
              fontWeight: '800',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              🚨 Fake Audits Only
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => setFakeOnlyFilter(false)} />
            </span>
          )}

          {searchQuery.trim() && (
            <span style={{
              fontSize: '11px',
              backgroundColor: '#fef3c7',
              color: '#b45309',
              padding: '3px 8px',
              borderRadius: '20px',
              fontWeight: '700',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              "{searchQuery}"
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => { setSearchQuery(''); loadComplaints(); }} />
            </span>
          )}

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                fontSize: '11px',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '0 4px'
              }}
            >
              Reset all
            </button>
          )}
        </div>

        {/* Master Filter Button (Opens popup filter modal) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {embedded && (
            <>
              <button type="button" onClick={loadComplaints} className="btn btn-outline btn-sm" title="Refresh" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '6px 10px' }}>
                <RefreshCw size={13} className={loading ? 'spin' : ''} />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setIsFilterModalOpen(true)}
            className="btn btn-sm"
            style={{
              backgroundColor: activeFilterCount > 0 ? '#0284c7' : '#f8fafc',
              color: activeFilterCount > 0 ? '#ffffff' : '#334155',
              border: '1px solid #cbd5e1',
              fontWeight: '800',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '10px'
            }}
            id="btn-open-complaints-filter"
          >
            <SlidersHorizontal size={14} />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span style={{
                backgroundColor: '#ffffff',
                color: '#0284c7',
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '10px',
                fontWeight: '900'
              }}>
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>
      )}

      {/* COMPLAINTS SECTION - REDESIGNED CARDS FEED */}
      <div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b', backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '10px', color: '#0284c7' }} />
            <div style={{ fontSize: '13px' }}>Loading complaints & records...</div>
          </div>
        ) : feedComplaints.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8', backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
            <ClipboardList size={40} style={{ marginBottom: '10px', opacity: 0.6 }} />
            <div style={{ fontSize: '15px', fontWeight: '700', color: '#475569' }}>
              No Complaints Found
            </div>
            <div style={{ fontSize: '12.5px', marginTop: '4px' }}>
              {metricFilter !== 'TOTAL'
                ? `No complaints under "${METRIC_LABELS[metricFilter]}".`
                : activeFilterCount > 0 
                ? 'No tickets match your active filter settings. Try clearing some filters.'
                : 'No complaints have been reported for this plant yet.'}
            </div>
            {activeFilterCount > 0 && (
              <button 
                type="button"
                onClick={handleResetFilters}
                className="btn btn-sm btn-outline"
                style={{ marginTop: '12px', fontSize: '12px' }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '8px'
          }}>
            {feedComplaints.map((item) => {
              const isFake = item.is_fake_audit_flagged === 1;
              const isResolved = item.status === 'RESOLVED' || item.status === 'CLOSED';
              const isInProgress = item.status === 'IN_PROGRESS';

              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    border: isFake ? '1.5px solid #ef4444' : '1px solid #e2e8f0',
                    boxShadow: isFake 
                      ? '0 3px 10px rgba(239, 68, 68, 0.10)' 
                      : '0 2px 8px rgba(0, 0, 0, 0.03)',
                    padding: '8px 10px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '5px',
                    transition: 'all 0.15s ease',
                    boxSizing: 'border-box'
                  }}
                >
                  <div>
                    {/* Card Header: Ticket # & Status Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: '800',
                          color: '#0284c7',
                          fontFamily: 'var(--font-mono)',
                          backgroundColor: '#e0f2fe',
                          padding: '2px 6px',
                          borderRadius: '6px'
                        }}>
                          {item.ticket_no}
                        </span>
                        <span className={`badge ${item.complaint_type === 'DRINKING_WATER' ? 'badge-primary' : 'badge-neutral'}`} style={{ fontSize: '10px', padding: '1px 6px' }}>
                          {item.complaint_type === 'DRINKING_WATER' ? '💧 Water' : '🧹 Cleaning'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '10px',
                          fontWeight: '800',
                          padding: '1px 6px',
                          borderRadius: '20px',
                          backgroundColor: isResolved ? '#ecfdf5' : (isInProgress ? '#eff6ff' : '#fef2f2'),
                          color: isResolved ? '#059669' : (isInProgress ? '#0284c7' : '#dc2626'),
                          border: `1px solid ${isResolved ? '#a7f3d0' : (isInProgress ? '#bfdbfe' : '#fca5a5')}`
                        }}>
                          ● {item.status}
                        </span>
                      </div>
                    </div>

                    {/* Fake Audit Banner (if flagged) */}
                    {isFake && (
                      <div style={{
                        backgroundColor: '#fee2e2',
                        border: '1px solid #fecaca',
                        borderRadius: '8px',
                        padding: '5px 8px',
                        marginBottom: '6px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontWeight: '800', fontSize: '10.5px' }}>
                          <ShieldAlert size={12} />
                          <span>FAKE AUDIT DISCREPANCY</span>
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#991b1b', marginTop: '2px', lineHeight: '1.3' }}>
                          Housekeeper <strong>{item.flagged_agent_name || 'Agent'}</strong> ({item.flagged_agent_emp_id || 'ID'}) marked this clean today in Session {item.flagged_session_code}.
                        </div>
                      </div>
                    )}

                    {/* Defect Title & Description */}
                    <div style={{ marginBottom: '5px' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: '800', color: '#0f172a', lineHeight: '1.25' }}>
                        {item.checklist_item_label || item.category || 'Maintenance Defect'}
                      </div>
                      {item.description && (
                        <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px', lineHeight: '1.3', backgroundColor: '#f8fafc', padding: '3px 6px', borderRadius: '5px', borderLeft: '2px solid #cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          "{item.description}"
                        </div>
                      )}
                    </div>

                    {/* Facility / Location */}
                    <div 
                      onClick={() => onSelectToilet && item.toilet_id && onSelectToilet(item.toilet_id)}
                      style={{ 
                        fontSize: '11.5px', 
                        color: '#0284c7', 
                        fontWeight: '700', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        cursor: onSelectToilet ? 'pointer' : 'default',
                        marginBottom: '4px'
                      }}
                    >
                      <MapPin size={13} color="#0284c7" />
                      <span>{item.toilet_code || 'FACILITY'}: {item.toilet_name || item.area_name || item.plant_name}</span>
                    </div>

                    {/* Reporter Info & Time */}
                    <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '1px', borderTop: '1px solid #f1f5f9', paddingTop: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontWeight: '700', color: '#334155' }}>👤 {item.reported_by_name || 'Staff Member'} ({item.reported_by_emp_id || 'EMP'})</span>
                        {item.reported_by_phone && <span>📞 {item.reported_by_phone}</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '11px' }}>
                        <Clock size={11} />
                        <span>{item.created_at ? new Date(item.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Recent'}</span>
                      </div>
                    </div>

                    {/* Resolution Remarks (if resolved) */}
                    {item.resolution_remarks && (
                      <div style={{ marginTop: '8px', fontSize: '11.5px', backgroundColor: '#ecfdf5', color: '#065f46', padding: '6px 8px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                        <strong>Action Taken:</strong> {item.resolution_remarks}
                      </div>
                    )}
                  </div>

                  {/* Card Actions Footer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
                    {item.evidence_photo_path && (
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewPhotoUrl(item.evidence_photo_path);
                          setPreviewComplaint(item);
                        }}
                        className="btn btn-sm btn-outline"
                        style={{ flex: 1, fontSize: '10.5px', padding: '2px 6px', minHeight: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                      >
                        <Eye size={13} />
                        <span>Photo</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDetailComplaint(item)}
                      className="btn btn-sm btn-outline"
                      style={{ flex: 1, fontSize: '10.5px', padding: '2px 6px', minHeight: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    >
                      <ClipboardList size={13} />
                      <span>Details</span>
                    </button>

                    {canVerifyRole && usesIssueFlow(item) ? (
                      <button
                        type="button"
                        onClick={() => setIssueModalId(item.id)}
                        className="btn btn-sm btn-brand"
                        style={{ flex: 1, fontSize: '10.5px', padding: '2px 6px', minHeight: '26px', backgroundColor: needsAssign(item) ? '#d97706' : '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                      >
                        <span>{needsAssign(item) ? 'Verify & Assign' : 'Open'}</span>
                      </button>
                    ) : canUpdateIssue && (
                      <button
                        type="button"
                        onClick={() => {
                          setUpdatingComplaint(item);
                          setNewStatus(nextStatusFor(item.status));
                          setStatusRemarks(item.resolution_remarks || '');
                          setCapturedPhoto(null);
                          setShowCamera(false);
                        }}
                        className="btn btn-sm btn-brand"
                        style={{ flex: 1, fontSize: '10.5px', padding: '2px 6px', minHeight: '26px', backgroundColor: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                      >
                        <span>Update</span>
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 1. FILTER POPUP MODAL (Clean popup containing categories, fake audit, status, search bar) */}
      {isFilterModalOpen && (
        <div className="modal-overlay" onClick={() => setIsFilterModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '480px', width: '92%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SlidersHorizontal size={18} color="#0284c7" />
                <h3 className="modal-title" style={{ margin: 0, fontSize: '16px' }}>
                  Filter Complaints & Reports
                </h3>
              </div>
              <button 
                onClick={() => setIsFilterModalOpen(false)} 
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleApplyFilterModal}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
                
                {/* Search Keyword */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '6px' }}>
                    🔍 Search Text
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Ticket #, employee name, emp id, toilet..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="form-control"
                      style={{ paddingLeft: '32px', fontSize: '13px', width: '100%', boxSizing: 'border-box' }}
                    />
                    <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                  </div>
                </div>

                {/* Category Selection */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '6px' }}>
                    🏷️ Category
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                    {[
                      { id: 'ALL', label: 'All' },
                      { id: 'HOUSEKEEPING', label: '🧹 Cleaning' },
                      { id: 'DRINKING_WATER', label: '💧 Water' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setTypeFilter(tab.id)}
                        className={`btn btn-sm ${typeFilter === tab.id ? 'btn-primary' : 'btn-outline'}`}
                        style={{ fontSize: '11.5px', padding: '8px 4px', fontWeight: '700' }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Anti-Fraud / Fake Audit Toggle */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '6px' }}>
                    🚨 Anti-Fraud & Audits
                  </label>
                  <button
                    type="button"
                    onClick={() => setFakeOnlyFilter(!fakeOnlyFilter)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: fakeOnlyFilter ? '2px solid #ef4444' : '1px solid #cbd5e1',
                      backgroundColor: fakeOnlyFilter ? '#fee2e2' : '#f8fafc',
                      color: fakeOnlyFilter ? '#dc2626' : '#475569',
                      fontWeight: '800',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ShieldAlert size={16} />
                      <span>Fake Audit Discrepancies Only</span>
                    </div>
                    <span>{fakeOnlyFilter ? '✓ ON' : 'OFF'}</span>
                  </button>
                </div>

                {/* Status Selection */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '6px' }}>
                    📊 Resolution Status
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                    {[
                      { id: 'ALL', label: 'All Statuses' },
                      { id: 'OPEN', label: '🔴 Open Only' },
                      { id: 'IN_PROGRESS', label: '🟡 In Progress' },
                      { id: 'RESOLVED', label: '🟢 Resolved' }
                    ].map(st => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setStatusFilter(st.id)}
                        className={`btn btn-sm ${statusFilter === st.id ? 'btn-primary' : 'btn-outline'}`}
                        style={{ fontSize: '11.5px', padding: '8px 6px', fontWeight: '700' }}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              <div className="modal-footer" style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                >
                  Reset All
                </button>
                <button
                  type="submit"
                  className="btn btn-brand"
                  style={{ flex: 2, backgroundColor: '#0284c7' }}
                >
                  Apply Filters
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. COMPLAINT FULL DETAIL MODAL (Responsive popup for all details) */}
      {detailComplaint && (
        <div className="modal-overlay" onClick={() => setDetailComplaint(null)}>
          <div className="modal-content" style={{ maxWidth: '580px', width: '92%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={20} color="#0284c7" />
                <div>
                  <h3 className="modal-title" style={{ margin: 0, fontSize: '16px' }}>
                    {detailComplaint.ticket_no}: {detailComplaint.checklist_item_label || detailComplaint.category}
                  </h3>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {detailComplaint.toilet_code} • {detailComplaint.plant_name}
                  </div>
                </div>
              </div>
              <button onClick={() => setDetailComplaint(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '16px' }}>
              
              {/* Status Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '700' }}>CURRENT STATUS</div>
                  <div style={{ fontSize: '14px', fontWeight: '900', color: detailComplaint.status === 'RESOLVED' ? '#10b981' : '#dc2626' }}>
                    {detailComplaint.status}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '10.5px', color: '#64748b', fontWeight: '700' }}>CATEGORY</div>
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#0284c7' }}>
                    {detailComplaint.complaint_type === 'DRINKING_WATER' ? '💧 Drinking Water' : '🧹 Housekeeping'}
                  </div>
                </div>
              </div>

              {/* Fake Audit Banner (if flagged) */}
              {detailComplaint.is_fake_audit_flagged === 1 && (
                <div style={{ backgroundColor: '#fee2e2', border: '1.5px solid #fca5a5', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontWeight: '800', fontSize: '12px' }}>
                    <ShieldAlert size={16} />
                    <span>🚨 FAKE AUDIT DISCREPANCY DETECTED</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#991b1b', marginTop: '4px', lineHeight: '1.4' }}>
                    Housekeeper <strong>{detailComplaint.flagged_agent_name}</strong> ({detailComplaint.flagged_agent_emp_id}) declared this facility clean in Session <strong>{detailComplaint.flagged_session_code}</strong>, but employee reported defect immediately afterwards.
                  </div>
                </div>
              )}

              {/* Issue Description */}
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>ISSUE DESCRIPTION</div>
                <div style={{ fontSize: '13px', color: '#1e293b', backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', lineHeight: '1.4' }}>
                  {detailComplaint.description || 'No detailed written description provided.'}
                </div>
              </div>

              {/* Facility & Location Details */}
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>FACILITY & LOCATION</div>
                <div style={{ fontSize: '12.5px', color: '#334155', backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div><strong>Facility Code:</strong> {detailComplaint.toilet_code || 'N/A'} ({detailComplaint.toilet_name || 'Washroom'})</div>
                  <div><strong>Plant:</strong> {detailComplaint.plant_name || 'N/A'} • <strong>Area:</strong> {detailComplaint.area_name || 'General Area'}</div>
                </div>
              </div>

              {/* Reporter Details */}
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>REPORTED BY (EMPLOYEE)</div>
                <div style={{ fontSize: '12.5px', color: '#334155', backgroundColor: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div><strong>Name:</strong> {detailComplaint.reported_by_name || 'Staff Member'}</div>
                  <div><strong>Employee ID:</strong> {detailComplaint.reported_by_emp_id || 'N/A'}</div>
                  <div><strong>Phone:</strong> {detailComplaint.reported_by_phone || 'N/A'}</div>
                  <div><strong>Date & Time:</strong> {detailComplaint.created_at ? new Date(detailComplaint.created_at).toLocaleString() : 'N/A'}</div>
                </div>
              </div>

              {/* Evidence Photo Preview */}
              <div>
                <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#475569', marginBottom: '6px' }}>PHOTO EVIDENCE</div>
                {detailComplaint.evidence_photo_path ? (
                  <EvidencePhoto
                    src={detailComplaint.evidence_photo_path}
                    alt="Defect Evidence"
                    onClick={() => { setPreviewPhotoUrl(detailComplaint.evidence_photo_path); setPreviewComplaint(detailComplaint); }}
                  />
                ) : (
                  <div style={{ fontSize: '12px', color: '#94a3b8', backgroundColor: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px dashed #cbd5e1', textAlign: 'center' }}>
                    No photo was attached with this complaint.
                  </div>
                )}
              </div>

              {detailComplaint.resolution_photo_path && (
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: '800', color: '#15803d', marginBottom: '6px' }}>✅ RESOLUTION PROOF</div>
                  <EvidencePhoto
                    src={detailComplaint.resolution_photo_path}
                    alt="Resolution Proof"
                    onClick={() => { setPreviewPhotoUrl(detailComplaint.resolution_photo_path); setPreviewComplaint(detailComplaint); }}
                  />
                </div>
              )}

              {/* Resolution Remarks (if any) */}
              {detailComplaint.resolution_remarks && (
                <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', padding: '10px 12px', color: '#065f46', fontSize: '12.5px' }}>
                  <strong>Resolution Remarks:</strong> {detailComplaint.resolution_remarks}
                </div>
              )}

            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setDetailComplaint(null)}
                className="btn btn-outline"
                style={{ flex: 1 }}
              >
                Close
              </button>
              {canVerifyRole && usesIssueFlow(detailComplaint) ? (
              <button
                type="button"
                onClick={() => { setIssueModalId(detailComplaint.id); setDetailComplaint(null); }}
                className="btn btn-brand"
                style={{ flex: 2, backgroundColor: needsAssign(detailComplaint) ? '#d97706' : '#0284c7' }}
              >
                {needsAssign(detailComplaint) ? 'Verify & Assign Housekeeper' : 'Open Issue'}
              </button>
              ) : (
              <button
                type="button"
                onClick={() => {
                  setUpdatingComplaint(detailComplaint);
                  setNewStatus(nextStatusFor(detailComplaint.status));
                  setStatusRemarks(detailComplaint.resolution_remarks || '');
                }}
                className="btn btn-brand"
                style={{ flex: 2, backgroundColor: '#0284c7' }}
              >
                Update Status
              </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. PHOTO PREVIEW MODAL */}
      {previewPhotoUrl && (
        <div className="modal-overlay" onClick={() => setPreviewPhotoUrl(null)}>
          <div className="modal-content" style={{ maxWidth: '640px', width: '92%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={18} color="#0284c7" />
                <h3 className="modal-title" style={{ margin: 0, fontSize: '15px' }}>
                  Complaint Evidence ({previewComplaint?.ticket_no})
                </h3>
              </div>
              <button onClick={() => setPreviewPhotoUrl(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '16px' }}>
              <EvidencePhoto src={previewPhotoUrl} alt="Defect Evidence" maxHeight="440px" />
              {previewComplaint && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: '#64748b', textAlign: 'left' }}>
                  <strong>Defect:</strong> {previewComplaint.checklist_item_label} • <strong>Reported By:</strong> {previewComplaint.reported_by_name} ({previewComplaint.reported_by_emp_id})
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. UPDATE STATUS MODAL WITH LIVE CAMERA PHOTO PROOF */}
      {updatingComplaint && (
        <div className="modal-overlay" onClick={() => { stopCamera(); setUpdatingComplaint(null); }}>
          <div className="modal-content" style={{ maxWidth: '520px', width: '92%', maxHeight: '92vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title" style={{ margin: 0, fontSize: '16px' }}>
                  Update Ticket: {updatingComplaint.ticket_no}
                </h3>
                <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                  {updatingComplaint.toilet_code} • {updatingComplaint.checklist_item_label || updatingComplaint.category}
                </div>
              </div>
              <button 
                onClick={() => { stopCamera(); setUpdatingComplaint(null); }} 
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUpdateStatus}>
              <div className="modal-body" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                
                {/* Status Selection */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Complaint Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => {
                      setNewStatus(e.target.value);
                      if (e.target.value !== 'RESOLVED') {
                        stopCamera();
                      }
                    }}
                    className="form-control"
                    style={{ fontSize: '13px', fontWeight: '700', width: '100%', boxSizing: 'border-box' }}
                  >
                    {statusOptionsFor(updatingComplaint?.status).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* MANDATORY LIVE PHOTO SECTION WHEN STATUS IS RESOLVED */}
                {newStatus === 'RESOLVED' && (
                  <div style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                    borderRadius: '14px',
                    border: '1.5px solid #86efac',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff'
                      }}>
                        <ShieldCheck size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '800', color: '#065f46' }}>
                          Live Photo Proof (Mandatory to Resolve)
                        </div>
                        <div style={{ fontSize: '11px', color: '#059669' }}>
                          Software requires live camera proof with timestamp
                        </div>
                      </div>
                    </div>

                    {/* Camera Not Active & No Photo Yet */}
                    {!showCamera && !capturedPhoto && (
                      <div style={{ textAlign: 'center', padding: '12px 8px', background: '#ffffff', borderRadius: '10px', border: '1px dashed #86efac' }}>
                        <div style={{ fontSize: '12px', color: '#991b1b', fontWeight: '700', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <AlertTriangle size={15} color="#dc2626" />
                          <span>Live photo proof is mandatory to resolve this issue</span>
                        </div>
                        <button
                          type="button"
                          onClick={startCamera}
                          style={{
                            background: 'linear-gradient(135deg, #0284c7, #0ea5e9)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '10px 18px',
                            fontSize: '13px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
                          }}
                        >
                          <Camera size={16} />
                          <span>Open Camera to Take Live Photo</span>
                        </button>
                      </div>
                    )}

                    {/* Camera Active Preview */}
                    {showCamera && !capturedPhoto && (
                      <div>
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          style={{
                            width: '100%',
                            height: '200px',
                            objectFit: 'cover',
                            borderRadius: '10px',
                            backgroundColor: '#f1f5f9',
                            border: '2px solid #10b981'
                          }}
                        />
                        <canvas ref={canvasRef} style={{ display: 'none' }} />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                          <button
                            type="button"
                            onClick={capturePhoto}
                            style={{
                              flex: 1,
                              height: '42px',
                              background: 'linear-gradient(135deg, #10b981, #059669)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '10px',
                              fontSize: '13px',
                              fontWeight: '800',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                          >
                            <Camera size={16} />
                            <span>Capture Photo</span>
                          </button>
                          <button
                            type="button"
                            onClick={stopCamera}
                            style={{
                              padding: '0 14px',
                              height: '42px',
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '10px',
                              fontSize: '12px',
                              fontWeight: '600',
                              color: '#64748b',
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Photo Captured Preview */}
                    {capturedPhoto && (
                      <div>
                        <div style={{ position: 'relative' }}>
                          <img
                            src={capturedPhoto}
                            alt="Resolution proof"
                            style={{
                              width: '100%',
                              maxHeight: '190px',
                              objectFit: 'cover',
                              borderRadius: '10px',
                              border: '2px solid #10b981'
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#15803d', fontSize: '11.5px', fontWeight: '700' }}>
                            <CheckCircle2 size={15} color="#10b981" />
                            <span>Live resolution photo captured with watermark</span>
                          </div>
                          <button
                            type="button"
                            onClick={retakePhoto}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: '#0284c7',
                              fontSize: '11.5px',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <RefreshCw size={12} />
                            <span>Retake</span>
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* Corrective Action Remarks */}
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Corrective Action Remarks
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter action taken by housekeeping or maintenance staff..."
                    value={statusRemarks}
                    onChange={(e) => setStatusRemarks(e.target.value)}
                    className="form-control"
                    style={{ fontSize: '12.5px', width: '100%', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => { stopCamera(); setUpdatingComplaint(null); }}
                  className="btn btn-outline"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStatus || (newStatus === 'RESOLVED' && !capturedPhoto)}
                  className="btn btn-brand"
                  style={{
                    flex: 2,
                    backgroundColor: (newStatus === 'RESOLVED' && !capturedPhoto) ? '#94a3b8' : (newStatus === 'RESOLVED' ? '#10b981' : '#0284c7'),
                    cursor: (newStatus === 'RESOLVED' && !capturedPhoto) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {savingStatus ? (
                    'Saving...'
                  ) : (newStatus === 'RESOLVED' && !capturedPhoto) ? (
                    '📸 Live Photo Required to Resolve'
                  ) : (newStatus === 'RESOLVED') ? (
                    '✅ Mark as RESOLVED with Photo'
                  ) : (
                    'Save Status Update'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {issueModalId && (
        <IssueDetailModal
          isOpen={true}
          issueId={issueModalId}
          onClose={() => setIssueModalId(null)}
          onIssueUpdated={loadComplaints}
        />
      )}

    </div>
  );
}

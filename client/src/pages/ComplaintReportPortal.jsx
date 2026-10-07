import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { fmtDateTime } from '../utils/istTime';
import {
  AlertCircle,
  CheckCircle2,
  Camera,
  RefreshCw,
  Building2,
  GlassWater,
  ShieldAlert,
  ArrowLeft,
  Send,
  Sparkles
} from 'lucide-react';

const MAX_PHOTO_AGE_MS = 2 * 60 * 1000;
const MAX_PHOTO_WIDTH = 1600;

const HOUSEKEEPING_GROUPS = [
  { category: 'Cleaning', items: ['Floor not clean', 'WC not clean', 'Urinal not clean', 'Washbasin not clean', 'Mirror not clean', 'Door / partition not clean'] },
  { category: 'Consumables', items: ['Handwash not available', 'Tissue not available', 'Toilet paper not available', 'Dustbin full / not available', 'Air freshener not available'] },
  { category: 'Equipment', items: ['Water supply problem', 'Flush not working', 'Tap not working', 'Exhaust fan not working', 'Light not working', 'Door lock not working'] }
];

const DRINKING_WATER_ITEMS = [
  'Water cooler not working',
  'No glass available',
  'Cleaning issue in surroundings'
];

function categoryOf(item) {
  const g = HOUSEKEEPING_GROUPS.find(x => x.items.includes(item));
  return g ? g.category : 'Housekeeping';
}

function locationText(t) {
  if (!t) return '';
  return [t.plant_name, t.building_name, t.block_name, t.floor_name, t.area_name].filter(Boolean).join(' / ');
}

// Live camera with a native-camera fallback; the server stamps user, Toilet ID, date, location and time on the photo
function LivePhotoCapture({ photo, onPhoto, label }) {
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const nativeRef = useRef(null);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(tr => tr.stop());
      streamRef.current = null;
    }
    setActive(false);
    setReady(false);
    setSlow(false);
  }, []);

  useEffect(() => stop, [stop]);

  useEffect(() => {
    if (!active) return undefined;
    const v = videoRef.current;
    const s = streamRef.current;
    if (!v || !s) return undefined;
    v.srcObject = s;
    const markReady = () => { if (v.videoWidth > 0) setReady(true); };
    v.addEventListener('loadedmetadata', markReady);
    v.addEventListener('playing', markReady);
    v.play().catch(() => {});
    const poll = setInterval(markReady, 300);
    const slowTimer = setTimeout(() => setSlow(true), 6000);
    return () => {
      v.removeEventListener('loadedmetadata', markReady);
      v.removeEventListener('playing', markReady);
      clearInterval(poll);
      clearTimeout(slowTimer);
    };
  }, [active]);

  useEffect(() => {
    if (ready) setSlow(false);
  }, [ready]);

  const toJpeg = (source, w, h) => {
    const scale = w > MAX_PHOTO_WIDTH ? MAX_PHOTO_WIDTH / w : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.88);
  };

  const start = async () => {
    setError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      nativeRef.current?.click();
      return;
    }
    try {
      let s;
      try {
        s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) {
        s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = s;
      setReady(false);
      setSlow(false);
      setActive(true);
    } catch (err) {
      setError('Camera permission denied or unavailable. Allow camera access in the browser and try again.');
    }
  };

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setError('Camera is still starting, please wait a moment.'); return; }
    onPhoto({ dataUrl: toJpeg(v, v.videoWidth, v.videoHeight), at: new Date() });
    stop();
  };

  const handleNative = (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (file.lastModified && Date.now() - file.lastModified > MAX_PHOTO_AGE_MS) {
      setError('Old or gallery photos are not accepted. Please take a fresh live photo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new window.Image();
      img.onload = () => onPhoto({ dataUrl: toJpeg(img, img.width, img.height), at: new Date() });
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <input type="file" accept="image/*" capture="environment" ref={nativeRef} style={{ display: 'none' }} onChange={handleNative} />
      {active ? (
        <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#f1f5f9', border: '1px solid var(--color-border)' }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '260px', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', bottom: '12px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '10px' }}>
            <button type="button" onClick={capture} disabled={!ready} className="btn btn-primary" style={{ fontWeight: 800, opacity: ready ? 1 : 0.6 }}>
              <Camera size={16} /> {ready ? 'Capture Live Photo' : 'Starting camera...'}
            </button>
            <button type="button" onClick={stop} className="btn btn-outline" style={{ background: '#ffffff' }}>Cancel</button>
          </div>
          {slow && !ready && (
            <div style={{ position: 'absolute', top: '10px', left: '10px', right: '10px', background: 'rgba(255,255,255,0.95)', borderRadius: '10px', padding: '10px', textAlign: 'center', fontSize: '12px', color: '#0f172a' }}>
              Camera preview is taking too long.
              <button type="button" onClick={() => { stop(); nativeRef.current?.click(); }} className="btn btn-primary btn-sm" style={{ marginTop: '8px', width: '100%' }}>
                <Camera size={14} /> Use Phone Camera Instead
              </button>
            </div>
          )}
        </div>
      ) : photo ? (
        <div style={{ borderRadius: '12px', border: '1.5px solid #86efac', background: '#f8fafc', padding: '8px' }}>
          <img src={photo.dataUrl} alt="Live evidence" style={{ width: '100%', maxHeight: '240px', objectFit: 'contain', borderRadius: '8px' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 4px 2px', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', color: '#15803d', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={14} /> Live photo captured {photo.at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button type="button" onClick={() => { onPhoto(null); start(); }} className="btn btn-outline btn-sm" style={{ fontSize: '11px' }}>
              <RefreshCw size={12} /> Retake
            </button>
          </div>
        </div>
      ) : (
        <div style={{ border: '2px dashed #cbd5e1', borderRadius: '14px', padding: '20px 16px', textAlign: 'center', background: '#f8fafc' }}>
          <Camera size={32} color="#0284c7" style={{ marginBottom: '6px' }} />
          <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>{label}</div>
          <p style={{ fontSize: '12px', color: '#64748b', margin: '4px auto 12px', maxWidth: '340px' }}>
            Live camera only. Your name, Toilet ID, date, location and submission time are stamped on the photo.
          </p>
          <button type="button" onClick={start} className="btn btn-primary" style={{ fontWeight: 800 }}>
            <Camera size={16} /> Open Live Camera
          </button>
        </div>
      )}
      {error && <div style={{ marginTop: '8px', fontSize: '12px', color: '#b91c1c', fontWeight: 600 }}>{error}</div>}
    </div>
  );
}

const REPORTER_KEY = 'h360_reporter';
const REPORTER_FIELDS = [
  { key: 'name', label: 'Employee Name', placeholder: 'FULL NAME' },
  { key: 'empId', label: 'Employee ID', placeholder: 'EMPLOYEE ID' },
  { key: 'phone', label: 'Mobile Number', placeholder: '10-DIGIT MOBILE', inputMode: 'numeric' },
  { key: 'department', label: 'Department', placeholder: 'DEPARTMENT' },
  { key: 'designation', label: 'Designation', placeholder: 'DESIGNATION' }
];

function initialReporter(user) {
  try {
    const saved = JSON.parse(localStorage.getItem(REPORTER_KEY) || 'null');
    if (saved && saved.name) return saved;
  } catch (e) { /* ignore corrupt saved details */ }
  const up = (v) => String(v || '').toUpperCase();
  return { name: up(user?.name), empId: up(user?.employee_id), phone: String(user?.phone || ''), department: '', designation: '' };
}

export default function ComplaintReportPortal({ initialToilet, publicToken, onBack, onComplete }) {
  const { user } = useAuth();
  const [toilet, setToilet] = useState(initialToilet || null);
  const [reporter, setReporter] = useState(() => initialReporter(user));
  const [loadError, setLoadError] = useState(null);
  const [allToilets, setAllToilets] = useState([]);
  const [mode, setMode] = useState(null);
  const [problem, setProblem] = useState('');
  const [remarks, setRemarks] = useState('');
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const errorRef = useRef(null);

  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  useEffect(() => {
    if (!publicToken) return;
    api.get(`/qr/facility/${encodeURIComponent(publicToken)}`)
      .then(res => setToilet(res.toilet))
      .catch(err => setLoadError(err.data?.error || err.message || 'This QR code is not valid.'));
  }, [publicToken]);

  useEffect(() => {
    if (initialToilet || publicToken) return;
    api.get('/qr/list')
      .then(res => {
        const list = res.qrCodes || [];
        setAllToilets(list);
        setToilet(prev => prev || list[0] || null);
      })
      .catch(err => console.warn('Could not load toilets list:', err));
  }, [initialToilet, publicToken]);

  const chooseMode = (m) => {
    setMode(m);
    setProblem('');
    setPhoto(null);
    setError(null);
  };

  const resetForm = () => {
    setResult(null);
    setMode(null);
    setProblem('');
    setPhoto(null);
    setRemarks('');
    setError(null);
  };

  const setField = (key, value) => setReporter(prev => ({
    ...prev,
    [key]: key === 'phone' ? value.replace(/\D/g, '').slice(0, 10) : value.toUpperCase()
  }));
  const missingField = REPORTER_FIELDS.find(f => !String(reporter[f.key] || '').trim());
  const phoneValid = /^\d{10}$/.test(reporter.phone || '');
  const reporterOk = !missingField && phoneValid;
  const canSubmit = reporterOk && !!toilet && !!mode && !!problem && !!photo;

  const submitComplaint = async () => {
    setError(null);
    if (missingField) { setError(`Please enter your ${missingField.label.toLowerCase()}.`); return; }
    if (!phoneValid) { setError('Please enter a valid 10-digit mobile number.'); return; }
    if (!toilet) { setError('Please scan or select a toilet.'); return; }
    if (!problem) { setError('Please select the problem.'); return; }
    if (!photo) { setError('A live photo of the problem is required.'); return; }
    const isWater = mode === 'DRINKING_WATER';
    setSubmitting(true);
    try {
      const res = await api.post('/issues/employee-complaint', {
        toiletId: toilet.id,
        qrToken: toilet.qr_token,
        complaintType: mode,
        employeeName: reporter.name.trim(),
        employeeId: reporter.empId.trim(),
        employeeEmail: user?.email || '',
        employeePhone: reporter.phone,
        employeeDepartment: reporter.department.trim(),
        employeeDesignation: reporter.designation.trim(),
        category: isWater ? 'Drinking Water' : categoryOf(problem),
        checklistItemLabel: problem,
        description: remarks.trim() || `${problem} at ${toilet.toilet_uid || toilet.code}`,
        imageBase64: photo.dataUrl
      });
      localStorage.setItem(REPORTER_KEY, JSON.stringify(reporter));
      setResult(res);
      if (onComplete) onComplete(res);
    } catch (err) {
      setError(err.data?.error || err.message || 'Submission failed. Please check the connection.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="page-wrapper" style={{ maxWidth: '620px', margin: '24px auto', padding: '16px' }}>
        <div className="card" style={{ padding: '28px 22px', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 14px', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={36} />
          </div>
          <h1 style={{ fontSize: '21px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Complaint Submitted</h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 18px' }}>
            Your complaint has been sent to the admin. After verification it will be assigned to a housekeeper to fix.
          </p>
          <div style={{ background: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: '12px', padding: '14px', textAlign: 'left', marginBottom: '16px', fontSize: '13px' }}>
            {[
              ['Ticket No', result.ticketNo],
              ['Toilet ID', toilet?.toilet_uid || toilet?.code],
              ['Type', mode === 'DRINKING_WATER' ? 'Drinking Water' : 'Housekeeping'],
              ['Problem', problem],
              ['Reported By', `${reporter.name} (${reporter.empId})`],
              ['Department', `${reporter.department} • ${reporter.designation}`],
              ['Submitted At', fmtDateTime(new Date().toISOString().replace('T', ' ').slice(0, 19))]
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '4px 0' }}>
                <span style={{ color: '#64748b', fontWeight: 600 }}>{k}</span>
                <span style={{ fontWeight: 800, color: '#0f172a', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
          </div>
          {result.isFakeAuditFlagged && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 14px', textAlign: 'left', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#dc2626', fontWeight: 800, fontSize: '13px' }}>
                <ShieldAlert size={17} /> Cleaning discrepancy flagged
              </div>
              <p style={{ fontSize: '12px', color: '#991b1b', margin: '4px 0 0', lineHeight: 1.5 }}>
                This toilet was marked clean by housekeeping today. The cleaning entry has been flagged for admin review.
              </p>
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={resetForm} className="btn btn-outline" style={{ flex: 1, fontWeight: 700 }}>New Complaint</button>
            {onBack && (
              <button onClick={onBack} className="btn btn-primary" style={{ flex: 1, fontWeight: 800 }}>
                {user?.role === 'EMPLOYEE' ? 'View My Complaints' : 'Back'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const label = { fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'block', marginBottom: '6px' };

  return (
    <div className="page-wrapper" style={{ maxWidth: '720px', margin: '0 auto', padding: '16px' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        {onBack ? (
          <button onClick={onBack} className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={14} /> <span>Back</span>
          </button>
        ) : <span />}
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 700, letterSpacing: '0.03em' }}>HYGIENE360 • COMPLAINT</div>
      </div>

      <h1 style={{ fontSize: '19px', fontWeight: 900, color: '#0f172a', margin: '0 0 10px' }}>Raise a Complaint</h1>

      {loadError && (
        <div style={{ padding: '12px 14px', borderRadius: '10px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', marginBottom: '14px', fontSize: '13px', display: 'flex', gap: '8px' }}>
          <AlertCircle size={17} style={{ flexShrink: 0 }} /> <span>{loadError}</span>
        </div>
      )}

      {/* Employee details — stored in capitals and remembered on this phone */}
      <div className="card" style={{ padding: '16px 18px', marginBottom: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '8px' }}>YOUR DETAILS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          {REPORTER_FIELDS.map(f => (
            <div key={f.key}>
              <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
                {f.label} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                className="form-control"
                value={reporter[f.key] || ''}
                onChange={e => setField(f.key, e.target.value)}
                placeholder={f.placeholder}
                inputMode={f.inputMode}
                autoCapitalize="characters"
                style={{ textTransform: 'uppercase', fontWeight: 700, height: '42px' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 1. Toilet area from the scanned QR */}
      <div className="card" style={{ padding: '16px 18px', marginBottom: '14px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>TOILET AREA{initialToilet || publicToken ? ' (SCANNED)' : ''}</div>
        <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
          {toilet?.toilet_uid || toilet?.code || '—'}
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
          <Building2 size={13} color="#94a3b8" style={{ flexShrink: 0 }} />
          <span>{toilet?.name}{toilet?.gender ? ` • ${String(toilet.gender).toUpperCase() === 'FEMALE' ? 'Female' : 'Male'}` : ''}{locationText(toilet) ? ` • ${locationText(toilet)}` : ''}</span>
        </div>
        {!initialToilet && allToilets.length > 0 && (
          <select
            value={toilet?.id || ''}
            onChange={(e) => { const found = allToilets.find(x => String(x.id) === e.target.value); if (found) { setToilet(found); setPhoto(null); } }}
            className="form-control"
            style={{ marginTop: '10px', fontSize: '13px' }}
          >
            {allToilets.map(x => <option key={x.id} value={x.id}>{x.toilet_uid || x.code} — {x.name}</option>)}
          </select>
        )}
      </div>

      {/* 2. Complaint type */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
        {[
          { id: 'HOUSEKEEPING', icon: Sparkles, title: 'Housekeeping', sub: 'Cleaning, consumables, equipment' },
          { id: 'DRINKING_WATER', icon: GlassWater, title: 'Drinking Water', sub: 'Water cooler / glass / surroundings' }
        ].map(m => {
          const active = mode === m.id;
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => chooseMode(m.id)}
              style={{ textAlign: 'left', padding: '14px', borderRadius: '12px', cursor: 'pointer', border: active ? '2px solid #0284c7' : '1px solid var(--color-border)', background: active ? '#f0f9ff' : '#ffffff', display: 'flex', gap: '10px', alignItems: 'center', touchAction: 'manipulation' }}
            >
              <Icon size={24} color={active ? '#0284c7' : '#64748b'} style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: active ? '#0369a1' : '#0f172a' }}>{m.title}</div>
                <div style={{ fontSize: '11.5px', color: '#64748b' }}>{m.sub}</div>
              </div>
            </button>
          );
        })}
      </div>

      {mode && (
        <div className="card" style={{ padding: '18px' }}>
          {/* 3. Problem */}
          <label style={label}>Problem <span style={{ color: '#ef4444' }}>*</span></label>
          <select value={problem} onChange={e => setProblem(e.target.value)} className="form-control" style={{ marginBottom: '16px', height: '46px', fontSize: '14px', fontWeight: 700 }}>
            <option value="">— Select the problem —</option>
            {mode === 'HOUSEKEEPING'
              ? HOUSEKEEPING_GROUPS.map(g => (
                  <optgroup key={g.category} label={g.category}>
                    {g.items.map(item => <option key={item} value={item}>{item}</option>)}
                  </optgroup>
                ))
              : DRINKING_WATER_ITEMS.map(item => <option key={item} value={item}>{item}</option>)}
          </select>

          {/* 4. Live photo */}
          <label style={label}>Live photo evidence <span style={{ color: '#ef4444' }}>*</span></label>
          <LivePhotoCapture photo={photo} onPhoto={setPhoto} label="Photograph the problem" />

          {/* 5. Remark */}
          <div style={{ marginTop: '16px' }}>
            <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Remark (optional)</label>
            <textarea rows={2} className="form-control" placeholder="Describe the problem..." value={remarks} onChange={e => setRemarks(e.target.value)} />
          </div>

          {error && (
            <div ref={errorRef} style={{ padding: '10px 12px', borderRadius: '10px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', marginTop: '14px', fontSize: '13px', display: 'flex', gap: '8px' }}>
              <AlertCircle size={17} style={{ flexShrink: 0 }} /> <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={submitComplaint}
            disabled={submitting || !canSubmit}
            className="btn btn-lg"
            style={{ width: '100%', marginTop: '16px', fontWeight: 800, color: '#ffffff', border: 'none', background: canSubmit ? '#dc2626' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            id="btn-submit-complaint"
          >
            {submitting ? <><RefreshCw size={17} className="spin" /> Submitting...</>
              : !reporterOk ? (missingField ? `Enter your ${missingField.label.toLowerCase()} above` : 'Enter a valid 10-digit mobile number')
              : !toilet ? 'Toilet not found — scan the QR again'
              : !problem ? 'Select the problem'
              : !photo ? 'Capture the live photo to submit'
              : <><Send size={17} /> Submit Complaint</>}
          </button>
        </div>
      )}
    </div>
  );
}
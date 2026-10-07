import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LanguageContext';
import { X, Camera, RefreshCw, CheckCircle2, CalendarClock, MapPin, AlertCircle } from 'lucide-react';

const MAX_PHOTO_WIDTH = 1600;

function formatStamp(d) {
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  return { date, time };
}

export default function ResolveEvidenceModal({ isOpen, issue, onClose, onResolved }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [stream, setStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [capturedAt, setCapturedAt] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(new Date());

  const videoRef = useRef(null);
  const nativeInputRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setCapturedPhoto(null);
    setCapturedAt(null);
    setRemarks('');
    setError(null);
    startCamera();
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(clock);
      stopCamera();
    };
  }, [isOpen]);

  useEffect(() => {
    if (videoRef.current && stream && videoRef.current.srcObject !== stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, capturedPhoto]);

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t('res.errHttps'));
      return;
    }
    try {
      let s;
      try {
        s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (e) {
        s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = s;
      setStream(s);
    } catch (err) {
      setCameraError(t('res.errDenied'));
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStream(null);
  };

  const stampCanvas = (source, srcW, srcH) => {
    const scale = srcW > MAX_PHOTO_WIDTH ? MAX_PHOTO_WIDTH / srcW : 1;
    const w = Math.round(srcW * scale);
    const h = Math.round(srcH * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source, 0, 0, w, h);

    const at = new Date();
    const { date, time } = formatStamp(at);
    const fs = Math.max(14, Math.round(w / 42));
    const bandH = fs * 3.6;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, h - bandH, w, bandH);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, h - bandH, w, Math.max(3, fs / 5));

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fs}px sans-serif`;
    ctx.fillText(`ACTION TAKEN • ${date} • ${time}`, fs * 0.7, h - bandH + fs * 1.5);

    ctx.fillStyle = '#7dd3fc';
    ctx.font = `${Math.round(fs * 0.78)}px sans-serif`;
    const loc = `${issue?.ticket_no || ''} | ${issue?.toilet_code || 'FACILITY'} | ${user?.name || 'Housekeeper'} (${user?.employee_id || ''})`;
    ctx.fillText(loc, fs * 0.7, h - bandH + fs * 2.8);

    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.85));
    setCapturedAt(at);
  };

  const captureFromVideo = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) {
      setError(t('res.errCameraStarting'));
      return;
    }
    setError(null);
    stampCanvas(v, v.videoWidth, v.videoHeight);
  };

  const handleNativeFile = (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new window.Image();
      img.onload = () => stampCanvas(img, img.width, img.height);
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleDone = async () => {
    if (!capturedPhoto) {
      setError(t('res.errNoPhoto'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/issues/${issue.id}/status`, {
        status: 'RESOLVED',
        remarks: remarks.trim() || 'Action taken. After photo attached.',
        imageBase64: capturedPhoto
      });
      stopCamera();
      if (onResolved) onResolved();
    } catch (err) {
      setError(err.data?.error || err.message || 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !issue) return null;

  const live = formatStamp(now);

  return (
    <div className="modal-overlay h360-sheet-overlay" style={{ zIndex: 1100 }} onClick={() => !submitting && onClose()}>
      <div className="modal-content h360-sheet" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Camera size={18} color="#ffffff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 className="modal-title" style={{ margin: 0, fontSize: '15px' }}>{t('res.title')}</h3>
              <div style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {issue.ticket_no} • {issue.toilet_code || 'Facility'}
              </div>
            </div>
          </div>
          <button onClick={() => !submitting && onClose()} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', maxHeight: '52vh', backgroundColor: '#f1f5f9', border: '1px solid var(--color-border)', borderRadius: '14px', overflow: 'hidden' }}>
            {!capturedPhoto && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: stream ? 'block' : 'none' }}
              />
            )}

            {capturedPhoto && (
              <img src={capturedPhoto} alt="Cleaning evidence" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}

            {!capturedPhoto && !stream && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '16px', textAlign: 'center', color: 'var(--color-primary-600)' }}>
                <Camera size={40} color="#0284c7" />
                <div style={{ fontSize: '13px', lineHeight: 1.4, maxWidth: '280px' }}>
                  {cameraError || t('res.starting')}
                </div>
              </div>
            )}

            {!capturedPhoto && (
              <div style={{ position: 'absolute', left: '10px', right: '10px', bottom: '10px', background: 'rgba(255,255,255,0.92)', color: 'var(--color-primary-900)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 700 }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', boxShadow: '0 0 8px #ef4444', flexShrink: 0 }} />
                <CalendarClock size={14} color="#0284c7" />
                <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{live.date} • {live.time}</span>
              </div>
            )}
          </div>

          {capturedPhoto && capturedAt && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#065f46', fontSize: '12px', fontWeight: 700 }}>
                <CheckCircle2 size={16} color="#10b981" />
                <span>{t('res.captured', { date: formatStamp(capturedAt).date, time: formatStamp(capturedAt).time })}</span>
              </div>
              <button
                type="button"
                onClick={() => { setCapturedPhoto(null); setCapturedAt(null); if (!streamRef.current) startCamera(); }}
                disabled={submitting}
                style={{ border: 'none', background: 'transparent', color: '#0284c7', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <RefreshCw size={13} /> {t('common.retake')}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#475569' }}>
            <MapPin size={13} color="#0284c7" />
            <span>{issue.toilet_code || 'Facility'}{issue.toilet_name ? ` — ${issue.toilet_name}` : ''}</span>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '6px' }}>
              {t('res.remarks')}
            </label>
            <textarea
              rows={2}
              className="form-control"
              placeholder={t('res.remarksPlaceholder')}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: '13px', resize: 'vertical' }}
            />
          </div>

          {error && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '12.5px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>{error}</span>
            </div>
          )}

          <input type="file" accept="image/*" capture="environment" ref={nativeInputRef} style={{ display: 'none' }} onChange={handleNativeFile} />
        </div>

        <div className="modal-footer" style={{ display: 'flex', gap: '10px' }}>
          {!capturedPhoto ? (
            <button
              type="button"
              onClick={stream ? captureFromVideo : () => nativeInputRef.current?.click()}
              disabled={!stream && !cameraError}
              className="btn btn-brand"
              style={{ flex: 1, height: '46px', fontSize: '14px', fontWeight: 800, backgroundColor: '#0284c7', color: '#ffffff', opacity: !stream && !cameraError ? 0.6 : 1 }}
            >
              <Camera size={17} /> {stream ? t('res.capture') : cameraError ? t('res.openCamera') : t('res.starting')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDone}
              disabled={submitting}
              className="btn btn-success"
              style={{ flex: 1, height: '48px', fontSize: '15px', fontWeight: 800, opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? <RefreshCw size={16} className="spin" /> : <CheckCircle2 size={17} />}
              <span>{submitting ? t('res.submitting') : t('res.submit')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

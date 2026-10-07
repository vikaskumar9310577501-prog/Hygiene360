import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LanguageContext';
import { X, QrCode, Camera, AlertCircle, Sparkles, CheckCircle2, RefreshCw } from 'lucide-react';

// Toilet placards encode "H360://TOILET/H360-QR-<16 hex>" (older cards) or the Toilet ID "TOILET-<PLANT>-<BLOCK>-<CODE>"
const H360_TOKEN_RE = /H360-QR-[A-F0-9]{16}/i;
const TOILET_ID_RE = /^\s*(TOILET-[A-Z0-9]+(?:-[A-Z0-9]+)*)\s*$/i;
const CONFIRM_FRAMES = 2;
const SCAN_INTERVAL_MS = 100;
const REJECT_COOLDOWN_MS = 4000;
const MAX_PHOTO_AGE_MS = 2 * 60 * 1000;
// The server also serves the app over HTTPS on this port; browsers allow the live camera only on HTTPS
const HTTPS_PORT = 5443;
const SECURE_URL = typeof window !== 'undefined'
  ? `https://${window.location.hostname}${/^\d{1,3}(\.\d{1,3}){3}$/.test(window.location.hostname) ? `:${HTTPS_PORT}` : ''}/`
  : '';

function extractH360Token(raw) {
  const text = String(raw || '');
  const m = text.match(H360_TOKEN_RE);
  if (m) return m[0].toUpperCase();
  const link = text.match(/[?&]t=([^&#\s]+)/);
  const id = (link ? decodeURIComponent(link[1]) : text).match(TOILET_ID_RE);
  return id ? id[1].toUpperCase() : null;
}

export default function QRScannerModal({ isOpen, onClose, onValidated }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [manualToken, setManualToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanningImage, setScanningImage] = useState(false);
  const [scannedSuccess, setScannedSuccess] = useState(false);
  const [detectedToken, setDetectedToken] = useState(null);
  const [httpFallback, setHttpFallback] = useState(false);
  const [liveError, setLiveError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(null);
  const [checking, setChecking] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const isScanningRef = useRef(false);
  const candidateRef = useRef({ token: null, count: 0, at: 0 });
  const rejectedRef = useRef({ token: null, until: 0 });
  const foreignNoticeAtRef = useRef(0);
  const fileInputRef = useRef(null);
  const barcodeDetectorRef = useRef(null);
  const cameraGenRef = useRef(0);

  // Initialize BarcodeDetector if supported in browser
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch (e) {
        barcodeDetectorRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setManualToken('');
      setScanningImage(false);
      setScannedSuccess(false);
      setDetectedToken(null);
      setHttpFallback(false);
      setLiveError(null);
      setPermissionDenied(null);
      setChecking(false);
      candidateRef.current = { token: null, count: 0, at: 0 };
      rejectedRef.current = { token: null, until: 0 };

      // Start live camera stream immediately
      const timer = setTimeout(() => {
        startLiveCamera();
      }, 150);

      return () => {
        clearTimeout(timer);
        stopLiveCamera();
      };
    } else {
      stopLiveCamera();
    }
  }, [isOpen]);

  const startLiveCamera = async (attempt = 0) => {
    if (streamRef.current) {
      startScanningLoop();
      return;
    }
    const gen = ++cameraGenRef.current;
    setError(null);
    setHttpFallback(false);
    setLiveError(null);

    // Live stream is only possible on HTTPS / localhost; otherwise use the phone camera snapshot
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHttpFallback(true);
      setCameraActive(false);
      return;
    }

    try {

      let mediaStream = null;
      // 1. Try environment / back camera
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (err1) {
        // 2. Fallback to front / user camera
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'user' } },
            audio: false
          });
        } catch (err2) {
          // 3. Fallback to any camera device
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }
      }

      // Modal closed or camera restarted while waiting for permission: release this stream
      if (gen !== cameraGenRef.current) {
        mediaStream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = mediaStream;
      // The phone can end the camera track (screen lock, another app); bring the live camera back instead of leaving it dead
      mediaStream.getVideoTracks().forEach(track => {
        track.onended = () => {
          if (streamRef.current !== mediaStream || gen !== cameraGenRef.current) return;
          streamRef.current = null;
          isScanningRef.current = false;
          setCameraActive(false);
          setTimeout(() => { if (gen === cameraGenRef.current) startLiveCamera(); }, 400);
        };
      });
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.warn('Play error:', e));
          startScanningLoop();
        };
        videoRef.current.play().catch(() => {});
        startScanningLoop();
      }
    } catch (err) {
      if (gen !== cameraGenRef.current) return;
      console.warn('Live camera could not start:', err);
      setCameraActive(false);
      // Camera is often still being released by the previous screen — retry before giving up
      if (attempt < 2 && err?.name !== 'NotAllowedError') {
        setTimeout(() => { if (gen === cameraGenRef.current) startLiveCamera(attempt + 1); }, 700);
        return;
      }
      setLiveError(err?.name === 'NotAllowedError'
        ? 'Camera permission is blocked. Allow camera access for this site in browser settings, then tap Retry.'
        : 'Live camera could not start. Close other apps using the camera and tap Retry.');
    }
  };

  // Ensure video element plays as soon as stream or cameraActive updates
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.setAttribute('playsinline', 'true');
      }
      videoRef.current.play().catch(() => {});
      startScanningLoop();
    }
  }, [cameraActive]);

  const stopLiveCamera = () => {
    cameraGenRef.current++;
    isScanningRef.current = false;
    if (animFrameRef.current) {
      clearTimeout(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  // Decode one video frame; returns the QR text or null. Tries the centre square first, then the whole frame.
  const decodeVideoFrame = async (video, canvas, ctx) => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    if (barcodeDetectorRef.current) {
      try {
        const barcodes = await barcodeDetectorRef.current.detect(video);
        const hit = barcodes?.find(b => b.rawValue);
        if (hit) return hit.rawValue;
      } catch (e) {}
    }

    const side = Math.round(Math.min(vw, vh) * 0.8);
    const cropSize = Math.min(side, 640);
    canvas.width = cropSize;
    canvas.height = cropSize;
    ctx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, cropSize, cropSize);
    const crop = ctx.getImageData(0, 0, cropSize, cropSize);
    const centreCode = jsQR(crop.data, cropSize, cropSize, { inversionAttempts: 'attemptBoth' });
    if (centreCode?.data) return centreCode.data;

    const scale = Math.min(1, 800 / Math.max(vw, vh));
    const fw = Math.round(vw * scale);
    const fh = Math.round(vh * scale);
    canvas.width = fw;
    canvas.height = fh;
    ctx.drawImage(video, 0, 0, fw, fh);
    const full = ctx.getImageData(0, 0, fw, fh);
    const fullCode = jsQR(full.data, fw, fh, { inversionAttempts: 'attemptBoth' });
    return fullCode?.data || null;
  };

  // Accept a toilet QR once it is read the same in consecutive frames
  const considerDecoded = (raw) => {
    const now = Date.now();
    const token = extractH360Token(raw);
    if (!token) {
      candidateRef.current = { token: null, count: 0, at: 0 };
      if (now - foreignNoticeAtRef.current > 2500) {
        foreignNoticeAtRef.current = now;
        setError(t('qr.notOurs'));
      }
      return null;
    }
    if (rejectedRef.current.token === token && now < rejectedRef.current.until) return null;

    const c = candidateRef.current;
    candidateRef.current = c.token === token && now - c.at < 1000
      ? { token, count: c.count + 1, at: now }
      : { token, count: 1, at: now };
    return candidateRef.current.count >= CONFIRM_FRAMES ? token : null;
  };

  const startScanningLoop = () => {
    if (isScanningRef.current) return;
    isScanningRef.current = true;
    candidateRef.current = { token: null, count: 0, at: 0 };
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const scanFrame = async () => {
      if (!isScanningRef.current || !videoRef.current) return;
      const video = videoRef.current;

      // Some phones pause the preview (e.g. after a permission prompt or app switch); resume it
      if (video.paused && video.srcObject) video.play().catch(() => {});

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        try {
          const raw = await decodeVideoFrame(video, canvas, ctx);
          if (raw) {
            const token = considerDecoded(raw);
            if (token) {
              handleRecognizedToken(token);
              return;
            }
          }
        } catch (e) {
          // Keep loop alive
        }
      }

      if (isScanningRef.current) {
        animFrameRef.current = setTimeout(scanFrame, SCAN_INTERVAL_MS);
      }
    };

    animFrameRef.current = setTimeout(scanFrame, SCAN_INTERVAL_MS);
  };

  // Pause scanning but keep the camera stream alive, so a failed check never re-opens the camera
  const pauseScanning = () => {
    isScanningRef.current = false;
    if (animFrameRef.current) {
      clearTimeout(animFrameRef.current);
      animFrameRef.current = null;
    }
  };

  const handleRecognizedToken = (token) => {
    pauseScanning();
    setError(null);
    setDetectedToken(token);
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(60);
    } catch (e) {}
    validateToken(token);
  };

  // Decode QR from direct camera photo snapshot; returns the QR text
  const decodeQRFromFile = async (file) => {
    // 1. Hardware ML BarcodeDetector
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        if (typeof createImageBitmap === 'function') {
          const bitmap = await createImageBitmap(file);
          const barcodes = await detector.detect(bitmap);
          const hit = barcodes?.find(b => b.rawValue);
          if (hit) return hit.rawValue;
        }
      } catch (e) {}
    }

    // 2. Canvas + jsQR multi-crop decoding
    const img = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const image = new window.Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const maxDim = 1200;
    let w = img.width;
    let h = img.height;
    if (w > maxDim || h > maxDim) {
      if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
      else { w = Math.round((w * maxDim) / h); h = maxDim; }
    }
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    const fullImg = ctx.getImageData(0, 0, w, h);
    const codeFull = jsQR(fullImg.data, w, h, { inversionAttempts: 'attemptBoth' });
    if (codeFull && codeFull.data) return codeFull.data;

    const cropSize = Math.round(Math.min(w, h) * 0.75);
    const cropX = Math.round((w - cropSize) / 2);
    const cropY = Math.round((h - cropSize) / 2);
    const cropImg = ctx.getImageData(cropX, cropY, cropSize, cropSize);
    const codeCrop = jsQR(cropImg.data, cropSize, cropSize, { inversionAttempts: 'attemptBoth' });
    if (codeCrop && codeCrop.data) return codeCrop.data;

    throw new Error('QR code could not be read clearly. Please hold the camera a little closer.');
  };

  const handleNativeCameraCapture = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.lastModified && Date.now() - file.lastModified > MAX_PHOTO_AGE_MS) {
      setError('Old or gallery images are not allowed. Please take a fresh photo of the QR placard on the toilet door.');
      if (e.target) e.target.value = '';
      return;
    }

    setScanningImage(true);
    setError(null);
    try {
      const decoded = await decodeQRFromFile(file);
      setScanningImage(false);
      const token = extractH360Token(decoded);
      if (!token) {
        setError(t('qr.notOurs'));
        return;
      }
      setDetectedToken(token);
      validateToken(token);
    } catch (err) {
      setScanningImage(false);
      setError(err.message || 'No QR code detected in the photo. Please retake the photo from a little closer.');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const validateToken = async (tokenToTest) => {
    let token = (tokenToTest || manualToken).trim();
    if (!token) {
      setError('Please provide a QR token to scan.');
      return;
    }

    token = extractH360Token(token) || token;

    setLoading(true);
    setChecking(true);
    setError(null);
    try {
      const res = await api.post('/qr/validate', { token });
      setChecking(false);
      stopLiveCamera();
      setScannedSuccess(true);
      await new Promise(r => setTimeout(r, 450));
      onClose();
      if (onValidated) {
        onValidated(res);
      }
    } catch (err) {
      setChecking(false);
      setScannedSuccess(false);
      // Server rejected this QR: ignore it for the rest of this scan; network errors may retry after a short pause
      rejectedRef.current = { token, until: err.status ? Infinity : Date.now() + REJECT_COOLDOWN_MS };
      if (err.status === 403 && err.data?.code === 'NOT_ASSIGNED') {
        try { if (navigator.vibrate) navigator.vibrate([200, 80, 200]); } catch (e) {}
        setPermissionDenied({ title: 'You Do Not Have Permission', message: err.data.error, tone: 'red' });
        return;
      }
      setError(err.data?.error || err.message || 'QR validation failed');
      // Resume scanning on the same open camera (only a different QR will be checked)
      if (videoRef.current && streamRef.current) startScanningLoop();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ zIndex: 9999, padding: '10px' }}>
      <div 
        className="modal-content" 
        style={{ maxWidth: '430px', maxHeight: '96vh', overflow: 'hidden', padding: '14px', borderRadius: '16px' }} 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              backgroundColor: '#e0f2fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <QrCode size={16} color="#0284c7" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>{t('qr.title')}</h3>
              <p style={{ margin: 0, fontSize: '10.5px', color: '#64748b' }}>Operator: <strong style={{ color: '#0284c7' }}>{user?.name}</strong></p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: '#f1f5f9', 
              border: 'none', 
              borderRadius: '50%', 
              width: '28px', 
              height: '28px', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={15} color="#64748b" />
          </button>
        </div>

        {error && (
          <div style={{
            padding: '8px 12px',
            borderRadius: '8px',
            backgroundColor: '#fef2f2',
            color: '#b91c1c',
            border: '1px solid #fecaca',
            marginBottom: '10px',
            fontSize: '11.5px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Hidden Camera Input for Instant Native Snap on HTTP mobile */}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleNativeCameraCapture}
        />

        {/* Live Camera Viewfinder */}
        <div style={{
          backgroundColor: '#f1f5f9',
          borderRadius: '14px',
          overflow: 'hidden',
          position: 'relative',
          minHeight: '270px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          border: scannedSuccess ? '3px solid #10b981' : '1px solid var(--color-border)'
        }}>
          {/* Continuous Video Feed (Always in DOM so ref is always immediately available) */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '270px',
              objectFit: 'cover',
              display: cameraActive ? 'block' : 'none'
            }}
          />

          {/* Server verification in progress */}
          {checking && (
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(255, 255, 255, 0.94)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0284c7',
              zIndex: 12
            }}>
              <RefreshCw size={36} style={{ animation: 'spin 0.8s linear infinite' }} />
              <div style={{ marginTop: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--color-primary-900)' }}>
                Verifying QR code...
              </div>
            </div>
          )}

          {/* Active Live Scanner Overlay */}
          {cameraActive && !scannedSuccess && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px',
              pointerEvents: 'none'
            }}>
              {/* Top Status Pill */}
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.92)',
                backdropFilter: 'blur(6px)',
                color: '#0369a1',
                borderRadius: '20px',
                padding: '4px 12px',
                fontSize: '11px',
                fontWeight: '800',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                letterSpacing: '0.4px',
                border: '1px solid rgba(56, 189, 248, 0.25)'
              }}>
                <span style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  boxShadow: '0 0 8px #ef4444',
                  animation: 'pulse 1.2s infinite'
                }} />
                <span>LIVE CAMERA SCANNING</span>
              </div>

              {/* Central Target Square with Laser */}
              <div style={{
                width: '210px',
                height: '210px',
                position: 'relative',
                borderRadius: '16px',
                border: '2px dashed rgba(255, 255, 255, 0.7)',
                boxShadow: '0 0 0 9999px rgba(255, 255, 255, 0.18)'
              }}>
                {/* 4 Corner Crosshairs */}
                <div style={{ position: 'absolute', top: '-2px', left: '-2px', width: '22px', height: '22px', borderTop: '3px solid #38bdf8', borderLeft: '3px solid #38bdf8', borderTopLeftRadius: '6px' }} />
                <div style={{ position: 'absolute', top: '-2px', right: '-2px', width: '22px', height: '22px', borderTop: '3px solid #38bdf8', borderRight: '3px solid #38bdf8', borderTopRightRadius: '6px' }} />
                <div style={{ position: 'absolute', bottom: '-2px', left: '-2px', width: '22px', height: '22px', borderBottom: '3px solid #38bdf8', borderLeft: '3px solid #38bdf8', borderBottomLeftRadius: '6px' }} />
                <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '22px', height: '22px', borderBottom: '3px solid #38bdf8', borderRight: '3px solid #38bdf8', borderBottomRightRadius: '6px' }} />

                {/* Sweeping Laser Beam Animation */}
                <div style={{
                  position: 'absolute',
                  left: '4px',
                  right: '4px',
                  height: '2px',
                  backgroundColor: '#38bdf8',
                  boxShadow: '0 0 12px 2px #0284c7, 0 0 4px #38bdf8',
                  animation: 'scanLaser 2s ease-in-out infinite'
                }} />
              </div>

              {/* Bottom Instructions */}
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.92)',
                backdropFilter: 'blur(6px)',
                color: 'var(--color-primary-900)',
                borderRadius: '12px',
                padding: '6px 14px',
                fontSize: '11.5px',
                fontWeight: '600',
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.1)'
              }}>
                {t('qr.hint')}
              </div>
            </div>
          )}

          {/* Success Flash State */}
          {scannedSuccess && (
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(16, 185, 129, 0.92)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              padding: '20px',
              textAlign: 'center',
              zIndex: 10
            }}>
              <CheckCircle2 size={56} style={{ animation: 'bounce 0.6s ease' }} />
              <div style={{ fontSize: '18px', fontWeight: '800', marginTop: '10px' }}>QR Code Verified!</div>
              <p style={{ fontSize: '12.5px', opacity: 0.9, margin: '4px 0 0' }}>Opening form...</p>
            </div>
          )}

          {/* Scanned toilet belongs to another housekeeper */}
          {permissionDenied && (
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: permissionDenied.tone === 'amber' ? '#fffbeb' : '#fef2f2',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: permissionDenied.tone === 'amber' ? '#92400e' : '#991b1b',
              padding: '20px',
              textAlign: 'center',
              zIndex: 15
            }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: permissionDenied.tone === 'amber' ? '#fef3c7' : '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px' }}>
                <AlertCircle size={34} />
              </div>
              <div style={{ fontSize: '17px', fontWeight: '900' }}>{permissionDenied.title}</div>
              <p style={{ fontSize: '12.5px', opacity: 0.92, margin: '6px 0 14px', lineHeight: '1.45', maxWidth: '300px' }}>
                {permissionDenied.message}
              </p>
              <button
                type="button"
                onClick={() => { setPermissionDenied(null); setDetectedToken(null); setError(null); rejectedRef.current = { token: null, until: 0 }; if (!httpFallback) startLiveCamera(); }}
                style={{ background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '10px', padding: '10px 18px', fontSize: '13px', fontWeight: '800', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={15} /> Scan Again
              </button>
            </div>
          )}

          {!cameraActive && !liveError && !httpFallback && !scannedSuccess && !permissionDenied && !checking && (
            <div style={{ color: '#94a3b8', fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RefreshCw size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Starting live camera...
            </div>
          )}

          {/* Live camera failed on HTTPS: retry the live stream instead of jumping to the phone camera app */}
          {liveError && !cameraActive && !scannedSuccess && !httpFallback && (
            <div style={{ padding: '24px 20px', textAlign: 'center', width: '100%' }}>
              <Camera size={34} color="#0284c7" style={{ marginBottom: '10px' }} />
              <p style={{ color: 'var(--color-primary-700)', fontSize: '12.5px', margin: '0 0 16px', lineHeight: '1.45' }}>{liveError}</p>
              <button
                type="button"
                onClick={() => startLiveCamera()}
                className="btn btn-brand"
                style={{ width: '100%', maxWidth: '280px', backgroundColor: '#0284c7', color: '#fff', fontWeight: 800, fontSize: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '11px 18px', borderRadius: '12px' }}
              >
                <RefreshCw size={17} /> Retry Live Camera
              </button>
              <div>
                <button type="button" onClick={() => fileInputRef.current?.click()} style={{ marginTop: '12px', background: 'none', border: 'none', color: '#94a3b8', fontSize: '11.5px', textDecoration: 'underline', cursor: 'pointer' }}>
                  Still not working? Take a photo of the QR instead
                </button>
              </div>
            </div>
          )}

          {/* Direct Camera Button (When browser blocks getUserMedia on HTTP IP) */}
          {httpFallback && !cameraActive && !scannedSuccess && (
            <div style={{ padding: '24px 20px', textAlign: 'center', width: '100%' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'rgba(2, 132, 199, 0.15)',
                border: '1px solid rgba(2, 132, 199, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 14px'
              }}>
                <Camera size={32} color="#0284c7" />
              </div>
              <h4 style={{ color: 'var(--color-primary-900)', fontSize: '16px', fontWeight: '800', margin: '0 0 6px' }}>
                Live Camera QR Scanner
              </h4>
              <p style={{ color: 'var(--color-primary-500)', fontSize: '12px', margin: '0 0 18px', lineHeight: '1.4' }}>
                Tap the button below and scan the toilet QR placard live.
              </p>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-brand btn-lg"
                style={{
                  width: '100%',
                  maxWidth: '300px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  fontWeight: '800',
                  fontSize: '14px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 20px',
                  borderRadius: '12px',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)'
                }}
              >
                <Camera size={20} />
                <span>Open Camera to Scan QR</span>
              </button>
              <a
                href={SECURE_URL}
                style={{ display: 'block', marginTop: '12px', fontSize: '11.5px', color: '#0369a1', fontWeight: 700, lineHeight: 1.4 }}
              >
                Live scanner needs the secure link — tap here to open {SECURE_URL.replace(/\/$/, '')}
              </a>
            </div>
          )}

          {/* Loading / Decoding Spinner */}
          {scanningImage && (
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(255, 255, 255, 0.94)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0284c7',
              zIndex: 20
            }}>
              <RefreshCw size={36} className="spin" style={{ animation: 'spin 0.8s linear infinite' }} />
              <div style={{ marginTop: '12px', fontSize: '13px', fontWeight: '800', color: 'var(--color-primary-900)' }}>
                Decoding QR Code...
              </div>
            </div>
          )}
        </div>

        {/* IT Admin Test Console */}
        {(user?.role === 'SUPER_ADMIN' || user?.role === 'IT_ADMIN') && (
          <div style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: '#f8fafc',
            borderRadius: '10px',
            border: '1px dashed #cbd5e1'
          }}>
            <div style={{ fontSize: '10.5px', fontWeight: '800', color: '#475569', marginBottom: '4px' }}>
              🔧 IT ADMIN DIRECT TOKEN TEST:
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                type="text"
                placeholder="QR token or Toilet ID (e.g. TOILET-SUPA-BLOCK-A-01)"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="form-control"
                style={{ fontSize: '11.5px', height: '32px', flex: 1 }}
              />
              <button
                type="button"
                onClick={() => validateToken(manualToken)}
                className="btn btn-outline btn-sm"
                style={{ fontSize: '11.5px', whiteSpace: 'nowrap', padding: '0 12px', height: '32px' }}
              >
                Test
              </button>
            </div>
          </div>
        )}

        <style>{`
          @keyframes scanLaser {
            0% { top: 6px; }
            50% { top: calc(100% - 8px); }
            100% { top: 6px; }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes bounce {
            0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
            40% { transform: translateY(-10px); }
            60% { transform: translateY(-5px); }
          }
        `}</style>
      </div>
    </div>
  );
}

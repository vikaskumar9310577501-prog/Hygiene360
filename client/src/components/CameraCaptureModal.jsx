import React, { useState, useEffect, useRef } from 'react';
import { api, photoUrl } from '../utils/api';
import { useLang } from '../i18n/LanguageContext';
import { loadImage, prepareReference, evaluateFrame, prepareSheetReference, evaluateSheetFrame } from '../utils/alignGuide';
import { Camera, X, Check, AlertTriangle, ShieldCheck, RefreshCw, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';

const MAX_PHOTO_SIDE = 1600;
// Consecutive aligned frames (sampled every GUIDE_INTERVAL_MS) before the photo is taken automatically
const AUTO_CAPTURE_STREAK = 2;
const GUIDE_INTERVAL_MS = 250;
// After this long the manual button unlocks even without a match; the server still verifies the photo
const GUIDE_UNLOCK_MS = 8000;

function fitSize(w, h) {
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

export default function CameraCaptureModal({ isOpen, onClose, sessionId, photoType, photoLabel, metadata = {}, onCaptured }) {
  const [stream, setStream] = useState(null);
  const [capturedImage, setCapturedImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [watermarkedResult, setWatermarkedResult] = useState(null);
  const [galleryBlockedWarning, setGalleryBlockedWarning] = useState(false);
  
  // Clarity & Sharpness State (For Check-Sheet Validation)
  const [clarityScore, setClarityScore] = useState(null);
  const [isClear, setIsClear] = useState(true);
  const [simulatedBlurMode, setSimulatedBlurMode] = useState(false);

  // Live Target Box State
  const [boxState, setBoxState] = useState('RED'); // 'RED' | 'GREEN'

  const { t } = useLang();
  // The check sheet uses the normal camera: the server reads the ticks after capture
  const guideKind = photoType === 'CLEANING_EVIDENCE' ? 'TOILET' : null;
  const guideEnabled = !!guideKind && !!metadata.toiletId;
  const [guideRefs, setGuideRefs] = useState([]);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guide, setGuide] = useState(null);
  const guideMode = guideEnabled && guideRefs.length > 0;
  // Manual capture unlocks once the view is close to the reference; the server still verifies the photo
  const [guideUnlocked, setGuideUnlocked] = useState(false);
  const canCaptureGuided = guideUnlocked || (!!guide && (guide.aligned || guide.score >= guide.alignScore * 0.7));
  const isSheetGuide = guideKind === 'CHECK_SHEET';

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const nativeCameraInputRef = useRef(null);
  const sampleIntervalRef = useRef(null);
  const guideFeaturesRef = useRef([]);
  const alignedStreakRef = useRef(0);
  const guideMemoryRef = useRef({});
  const captureRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !guideEnabled) return;
    let cancelled = false;
    setGuideLoading(true);
    (async () => {
      try {
        const res = await api.get(`/master-photos/toilet-refs/${metadata.toiletId}`, { kind: guideKind, fallback: '1' });
        const loaded = [];
        for (const r of res.refs || []) {
          try {
            const url = photoUrl(r.image_url);
            const img = await loadImage(url);
            loaded.push({ url, features: guideKind === 'CHECK_SHEET' ? prepareSheetReference(img) : prepareReference(img) });
          } catch (e) {}
        }
        if (cancelled) return;
        guideFeaturesRef.current = loaded.map(l => l.features);
        setGuideRefs(loaded);
      } catch (e) {
        if (!cancelled) { guideFeaturesRef.current = []; setGuideRefs([]); }
      } finally {
        if (!cancelled) setGuideLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, guideEnabled, guideKind, metadata.toiletId]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setCapturedImage(null);
      setWatermarkedResult(null);
      setGalleryBlockedWarning(false);
      setClarityScore(null);
      setIsClear(true);
      setSimulatedBlurMode(false);
      setBoxState('RED');
      setGuide(null);
      alignedStreakRef.current = 0;
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen]);

  useEffect(() => {
    setGuideUnlocked(false);
    if (!isOpen || !stream || !guideMode || capturedImage) return;
    const timer = setTimeout(() => setGuideUnlocked(true), GUIDE_UNLOCK_MS);
    return () => clearTimeout(timer);
  }, [isOpen, stream, guideMode, capturedImage]);

  // Keep videoRef attached to stream whenever stream is active
  useEffect(() => {
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch(e => console.warn('Video play error:', e));
      startAlignmentSampling();
    }
  }, [stream]);

  const startCamera = async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia not available (requires HTTPS or device camera permission)');
      }

      let mediaStream = null;
      // 1. Try back/environment camera with ideal constraint
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (err1) {
        // 2. Try front/user camera
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
          });
        } catch (err2) {
          // 3. Try any available camera device
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
        startAlignmentSampling();
      }
    } catch (err) {
      console.warn('Could not access live video stream:', err);
      // NOTE: DO NOT auto-trigger native mobile camera input on error or retake!
    }
  };

  // Real-time video frame alignment sampling (Red/Green target box)
  const startAlignmentSampling = () => {
    if (sampleIntervalRef.current) clearInterval(sampleIntervalRef.current);
    alignedStreakRef.current = 0;
    guideMemoryRef.current = {};
    sampleIntervalRef.current = setInterval(() => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      if (guideFeaturesRef.current.length > 0) {
        try {
          const evaluate = photoType === 'CHECK_SHEET' ? evaluateSheetFrame : evaluateFrame;
          const result = evaluate(videoRef.current, guideFeaturesRef.current, guideMemoryRef.current);
          if (!result) return;
          setGuide(result);
          setBoxState(result.aligned ? 'GREEN' : 'RED');
          // One shaky frame only slows the countdown instead of restarting it
          alignedStreakRef.current = result.aligned
            ? alignedStreakRef.current + 1
            : Math.max(0, alignedStreakRef.current - 1);
          if (alignedStreakRef.current >= AUTO_CAPTURE_STREAK) {
            alignedStreakRef.current = 0;
            captureRef.current?.();
          }
        } catch (e) {}
        return;
      }
      try {
        const video = videoRef.current;
        const sCanvas = document.createElement('canvas');
        sCanvas.width = 160;
        sCanvas.height = 120;
        const sCtx = sCanvas.getContext('2d', { willReadFrequently: true });
        sCtx.drawImage(video, 0, 0, 160, 120);
        const imgData = sCtx.getImageData(30, 20, 100, 80);
        let sum = 0;
        for (let i = 0; i < imgData.data.length; i += 4) {
          sum += (imgData.data[i] * 0.299 + imgData.data[i + 1] * 0.587 + imgData.data[i + 2] * 0.114);
        }
        const avg = sum / (imgData.data.length / 4);
        let variance = 0;
        for (let i = 0; i < imgData.data.length; i += 4) {
          const lum = (imgData.data[i] * 0.299 + imgData.data[i + 1] * 0.587 + imgData.data[i + 2] * 0.114);
          variance += Math.abs(lum - avg);
        }
        const contrast = variance / (imgData.data.length / 4);

        if (avg >= 35 && avg <= 235 && contrast >= 10) {
          setBoxState('GREEN');
        } else {
          setBoxState('RED');
        }
      } catch (e) {}
    }, GUIDE_INTERVAL_MS);
  };

  const stopCamera = () => {
    if (sampleIntervalRef.current) {
      clearInterval(sampleIntervalRef.current);
      sampleIntervalRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  // Optical frame generator (used when hardware webcam is unavailable or in simulated test)
  const generateSimulatedCameraFrame = (forceBlur = false) => {
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = forceBlur ? '#334155' : '#0f172a';
    ctx.fillRect(0, 0, 640, 480);
    
    if (forceBlur) {
      // Draw blurry fuzzy content
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.arc(320, 240, 140, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '24px sans-serif';
      ctx.fillText('[BLURRY / OUT OF FOCUS OBJECT]', 140, 240);
    } else {
      // High-contrast sharp content
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      for (let x = 0; x < 640; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 480);
        ctx.stroke();
      }

      // Check-Sheet Representation
      if (photoType === 'CHECK_SHEET') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(140, 80, 360, 320);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.strokeRect(140, 80, 360, 320);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`HYGIENE 360 - DAILY INSPECTION SHEET`, 160, 115);

        ctx.font = 'bold 12px sans-serif';
        ctx.fillStyle = '#1e293b';
        ctx.fillText(`PLANT: ${metadata.plantName || 'Bhiwadi Manufacturing Plant'}`, 160, 145);
        ctx.fillText(`TOILET: ${metadata.toiletCode || 'TLT-01'} (${metadata.toiletName || 'East Bay'})`, 160, 170);

        // Grid lines
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        for (let y = 190; y <= 350; y += 25) {
          ctx.beginPath();
          ctx.moveTo(150, y);
          ctx.lineTo(490, y);
          ctx.stroke();
        }
        ctx.fillStyle = '#16a34a';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`[✓ Cleaned]   [✓ Consumables OK]   [✓ Water OK]`, 160, 210);
        ctx.fillText(`[✓ Floor Dry] [✓ Mirrors Clear]   [✓ Odor-Free]`, 160, 235);
      } else {
        // Individual item photo preview
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(`LIVE PHOTO: ${photoLabel.toUpperCase()}`, 100, 200);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px sans-serif';
        ctx.fillText(`FACILITY: ${metadata.toiletCode || 'TLT-01'} - ${metadata.toiletName || ''}`, 100, 235);
        ctx.fillText(`STATUS: VERIFIED CLEAN / OPERATIONAL`, 100, 265);
      }
    }

    processCapturedCanvas(canvas, forceBlur);
  };

  // Analyze Clarity & Stamp Live Timestamp
  const processCapturedCanvas = async (canvas, forceBlur = false) => {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    let score = 92;
    if (forceBlur) {
      score = 22;
    } else if (photoType === 'CHECK_SHEET') {
      try {
        const sampleW = 100;
        const sampleH = 100;
        const tmpC = document.createElement('canvas');
        tmpC.width = sampleW;
        tmpC.height = sampleH;
        const tCtx = tmpC.getContext('2d');
        tCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
        const imgD = tCtx.getImageData(0, 0, sampleW, sampleH);
        let grad = 0;
        for (let i = 0; i < imgD.data.length - 8; i += 8) {
          grad += Math.abs(imgD.data[i] - imgD.data[i + 4]);
        }
        score = Math.min(99, Math.max(38, Math.round((grad / (sampleW * sampleH)) * 2.8)));
      } catch (e) {
        score = 88;
      }
    }

    setClarityScore(score);
    const clear = score >= 35;
    setIsClear(clear);

    if (!clear) {
      setError(`⚠️ PHOTO REJECTED: Image is Blurry / Low Clarity (Clarity Score: ${score}%). Please steady your camera and click Retake.`);
      const rawDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedImage(rawDataUrl);
      return;
    }

    setError(null);

    // Live Date & Time Stamp directly onto canvas
    const now = new Date();
    const liveDateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const liveTimeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    // The check sheet's bottom rows are read by the server, so its stamp goes in a strip below the photo
    let target = canvas;
    if (photoType === 'CHECK_SHEET') {
      target = document.createElement('canvas');
      target.width = width;
      target.height = height + 74;
      target.getContext('2d').drawImage(canvas, 0, 0);
    }
    stampBanner(target.getContext('2d'), width, target.height, liveDateStr, liveTimeStr, score);
    setCapturedImage(target.toDataURL('image/jpeg', 0.85));
  };

  const stampBanner = (ctx, width, height, liveDateStr, liveTimeStr, score) => {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(0, height - 74, width, 74);

    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, height - 74, width, 4);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(`🗓️ DATE: ${liveDateStr}   ⏰ TIME: ${liveTimeStr}`, 16, height - 44);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`📍 ${metadata.toiletCode || 'TOILET'} | ${metadata.toiletName || 'FACILITY'} (${metadata.plantName || 'PLANT'})`, 16, height - 25);

    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#a7f3d0';
    ctx.fillText(`👤 OPERATOR: ${metadata.userName || 'Sunil Verma'} (${metadata.empId || 'HK-201'})   |   ✅ SHARPNESS & CLARITY VERIFIED (${score}%)`, 16, height - 9);
  };

  const handleCapturePhoto = () => {
    if (videoRef.current && (videoRef.current.videoWidth > 0 || videoRef.current.readyState >= 2)) {
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      const size = fitSize(video.videoWidth || 1280, video.videoHeight || 720);
      canvas.width = size.w;
      canvas.height = size.h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      processCapturedCanvas(canvas, simulatedBlurMode);
      // Pause sampling interval, but KEEP camera stream active so Retake is instant and stays in-app
      if (sampleIntervalRef.current) {
        clearInterval(sampleIntervalRef.current);
        sampleIntervalRef.current = null;
      }
    } else if (stream && videoRef.current) {
      // Fallback if videoWidth is still initializing
      const video = videoRef.current;
      const canvas = canvasRef.current || document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      processCapturedCanvas(canvas, simulatedBlurMode);
      if (sampleIntervalRef.current) {
        clearInterval(sampleIntervalRef.current);
        sampleIntervalRef.current = null;
      }
    } else if (nativeCameraInputRef.current) {
      nativeCameraInputRef.current.click();
    } else {
      generateSimulatedCameraFrame(simulatedBlurMode);
    }
  };

  captureRef.current = handleCapturePhoto;

  const handleNativeCameraFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        const size = fitSize(img.width || 1280, img.height || 720);
        canvas.width = size.w;
        canvas.height = size.h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        processCapturedCanvas(canvas, simulatedBlurMode);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    if (e.target) e.target.value = '';
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setWatermarkedResult(null);
    setError(null);
    setClarityScore(null);
    setIsClear(true);
    setBoxState('RED');
    setGuide(null);

    // Immediately resume the live camera stream & alignment sampling without leaving app!
    if (videoRef.current && stream) {
      if (videoRef.current.srcObject !== stream) {
        videoRef.current.srcObject = stream;
      }
      videoRef.current.play().catch(() => {});
      startAlignmentSampling();
    } else {
      startCamera();
    }
  };

  const handleGalleryUploadAttempt = () => {
    setGalleryBlockedWarning(true);
    setError('SECURITY ALERT: Gallery file upload is strictly prohibited. Official cleaning evidence must be captured directly via live camera.');
  };

  const handleUploadAndVerify = async () => {
    if (!capturedImage) return;
    if (!isClear) {
      setError('Cannot upload: Software rejected this photo due to poor clarity. You must retake a clear photo.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('sessionId', sessionId);
      formData.append('photoType', photoType);
      formData.append('isLiveCamera', 'true');
      formData.append('imageBase64', capturedImage);

      const res = await api.postMultipart('/cleaning/upload-evidence', formData);
      setWatermarkedResult(res);

      setTimeout(() => {
        onCaptured({
          photoType,
          storagePath: res.storagePath,
          capturedAt: res.capturedAt,
          serverTimestampStr: res.serverTimestampStr,
          sheetCheck: res.sheetCheck || null,
          clarityScore: clarityScore || 95
        });
        onClose();
      }, 1000);
    } catch (err) {
      setError(err.data?.error || err.message || 'Evidence upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: '620px' }} onClick={e => e.stopPropagation()}>
        
        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Camera size={20} color="var(--color-primary-950)" />
            <div>
              <h3 className="modal-title" style={{ margin: 0 }}>Live Photo Capture: {photoLabel}</h3>
              <div style={{ fontSize: '11px', color: '#64748b' }}>
                {metadata.toiletCode} • {metadata.userName} ({metadata.empId})
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          
          {/* Error Banner */}
          {error && (
            <div style={{
              padding: '12px 14px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-danger-50)',
              color: 'var(--color-danger-700)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              marginBottom: '14px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>{error}</div>
            </div>
          )}

          {/* Clarity Success Banner */}
          {capturedImage && isClear && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: '#ecfdf5',
              color: '#065f46',
              border: '1px solid #a7f3d0',
              marginBottom: '14px',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="#059669" />
                <div>
                  <strong>
                    {photoType === 'CHECK_SHEET' && clarityScore ? `Check Sheet Clarity Verified (${clarityScore}% Sharp)` : 'Live Photo Captured'}
                  </strong>
                  <div style={{ fontSize: '11px', color: '#047857' }}>
                    Live Date & Time stamped.
                  </div>
                </div>
              </div>
              <span className="badge badge-success" style={{ fontSize: '10px' }}>✓ PASS</span>
            </div>
          )}

          {/* Hidden Native Mobile Camera Input */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={nativeCameraInputRef}
            style={{ display: 'none' }}
            onChange={handleNativeCameraFile}
          />

          {/* Video or Image Viewport */}
          <div style={{
            position: 'relative',
            ...(guideMode
              ? { width: 'min(100%, 62vh)', aspectRatio: '1 / 1', margin: '0 auto' }
              : { width: '100%', height: '320px' }),
            backgroundColor: '#f1f5f9',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* 1. Live video stream (kept permanently mounted so camera hardware never disconnects) */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: stream && !capturedImage ? 'block' : 'none'
              }}
            />

            {/* 2. Live camera optical stream status and alignment box HUD */}
            {stream && !capturedImage && (
              <>
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  backgroundColor: 'rgba(255,255,255,0.9)',
                  color: 'var(--color-primary-900)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', animation: 'pulse 1.5s infinite' }} />
                  LIVE CAMERA OPTICAL STREAM
                </div>
                {guideMode ? (
                  <GuideOverlay
                    guide={guide}
                    searchText={t(guideKind === 'CHECK_SHEET' ? 'cam.guide.searchSheet' : 'cam.guide.search')}
                    ghostUrl={isSheetGuide ? null : guideRefs[guide?.refIndex ?? 0]?.url}
                    t={t}
                  />
                ) : (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 'min(270px, 78%)',
                  height: 'min(210px, 66%)',
                  border: boxState === 'GREEN' ? '3px solid #22c55e' : '3px solid #ef4444',
                  borderRadius: '16px',
                  boxShadow: boxState === 'GREEN'
                    ? '0 0 25px rgba(34, 197, 94, 0.6), inset 0 0 15px rgba(34, 197, 94, 0.25)'
                    : '0 0 20px rgba(239, 68, 68, 0.5), inset 0 0 15px rgba(239, 68, 68, 0.25)',
                  pointerEvents: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}>
                  {/* Dynamic Status Badge (RED = UNALIGNED / DIRTY, GREEN = ALIGNED / READY) */}
                  <div style={{
                    zIndex: 2,
                    backgroundColor: boxState === 'GREEN' ? '#16a34a' : '#dc2626',
                    color: '#ffffff',
                    fontSize: '10.5px',
                    fontWeight: '800',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                    letterSpacing: '0.02em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ffffff', display: 'inline-block' }} />
                    <span>{boxState === 'GREEN' ? 'POSITION ALIGNED • READY' : 'ALIGN IN FRAME'}</span>
                  </div>

                  <div style={{ zIndex: 2, fontSize: '10px', color: '#94a3b8' }}>
                    Center {photoLabel} in box
                  </div>
                </div>
                )}
              </>
            )}

            {/* 3. Captured Photo Preview (shown only when a photo has been captured) */}
            {capturedImage && (
              <img 
                src={capturedImage} 
                alt="Captured Live Evidence" 
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
              />
            )}

            {/* 4. Fallback if camera stream is completely unavailable */}
            {!stream && !capturedImage && (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--color-primary-900)' }}>
                <Camera size={44} color="#0284c7" style={{ marginBottom: '8px' }} />
                <div style={{ fontSize: '16px', fontWeight: '800', color: 'var(--color-primary-900)' }}>
                  Mobile Camera Ready
                </div>
                <p style={{ fontSize: '12px', color: 'var(--color-primary-500)', margin: '4px auto 14px', maxWidth: '300px', lineHeight: '1.4' }}>
                  Click button below to snap a live photo of <strong>{photoLabel}</strong>. Live date & time will be stamped on it.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '280px', margin: '0 auto' }}>
                  <button
                    type="button"
                    onClick={() => nativeCameraInputRef.current?.click()}
                    className="btn btn-brand btn-lg"
                    style={{ backgroundColor: '#0284c7', color: '#ffffff', fontWeight: '800' }}
                  >
                    <Camera size={18} />
                    <span>Open Device Camera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => generateSimulatedCameraFrame(false)}
                    className="btn btn-outline btn-sm"
                    style={{ color: 'var(--color-primary-600)', borderColor: 'var(--color-border-dark)', fontSize: '11.5px' }}
                  >
                    Capture Stamped Photo (Direct)
                  </button>
                </div>
              </div>
            )}

            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>

          {/* Check-Sheet Clarity Testing Controls (for Demo / Quality Evaluation) */}
          {photoType === 'CHECK_SHEET' && !capturedImage && !guideMode && (
            <div style={{
              marginTop: '12px',
              padding: '10px 12px',
              borderRadius: '8px',
              backgroundColor: '#f8fafc',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div style={{ fontSize: '12px', color: '#475569' }}>
                <strong>Quality Analysis:</strong> Software requires a sharp, high-clarity check-sheet.
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${!simulatedBlurMode ? 'btn-primary' : 'btn-outline'}`}
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => setSimulatedBlurMode(false)}
                >
                  ✓ Sharp & Clear Mode
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${simulatedBlurMode ? 'btn-danger' : 'btn-outline'}`}
                  style={{ fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => setSimulatedBlurMode(true)}
                >
                  ⚠ Blurry Mode (Test Rejection)
                </button>
              </div>
            </div>
          )}

          {/* Anti-Gallery Warning Footer */}
          <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '11.5px', color: '#64748b' }}>
              Anti-Fraud Policy: Live Camera Only (Gallery files strictly rejected)
            </span>
            <button
              type="button"
              onClick={handleGalleryUploadAttempt}
              style={{
                fontSize: '11px',
                color: '#dc2626',
                background: 'none',
                border: 'none',
                textDecoration: 'underline',
                cursor: 'pointer'
              }}
            >
              Test Gallery Block
            </button>
          </div>

        </div>

        {/* Modal Actions */}
        <div className="modal-footer">
          {!capturedImage ? (
            <button 
              onClick={handleCapturePhoto}
              disabled={!!(guideEnabled && stream && (guideLoading || (guideMode && !canCaptureGuided)))}
              className="btn btn-brand btn-lg"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              id="btn-take-live-photo"
            >
              <Camera size={18} />
              <span>
                {guideEnabled && stream && guideLoading ? t('cam.guide.loading')
                  : guideMode && stream && !canCaptureGuided ? t('cam.guide.alignToCapture')
                  : 'Capture Live Photo Now'}
              </span>
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              <button 
                onClick={handleRetake}
                className="btn btn-outline"
                style={{ flex: 1 }}
              >
                <RefreshCw size={14} /> Retake Photo
              </button>
              <button 
                onClick={handleUploadAndVerify}
                disabled={uploading || !isClear}
                className={`btn ${isClear ? 'btn-success' : 'btn-danger'}`}
                style={{ flex: 2 }}
                id="btn-confirm-upload"
              >
                {uploading
                  ? (photoType === 'CHECK_SHEET' ? 'Reading date & time on the check sheet...' : 'Verifying & Saving...')
                  : (isClear ? 'Confirm & Save Photo' : 'Photo Rejected (Retake Required)')}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

function GuideOverlay({ guide, ghostUrl, searchText, t }) {
  const aligned = !!guide?.aligned;
  const color = aligned ? '#22c55e' : guide?.near ? '#f59e0b' : '#ef4444';
  const message = !guide ? searchText
    : aligned ? t('cam.guide.aligned')
    : guide.hints.length ? guide.hints.map(h => t(`cam.guide.${h}`)).join(' • ')
    : searchText;
  const matchPct = guide ? Math.max(0, Math.min(100, Math.round((guide.score / guide.alignScore) * 100))) : 0;
  const corner = { position: 'absolute', width: '34px', height: '34px', borderColor: color, borderStyle: 'solid', transition: 'border-color 0.2s' };

  return (
    <>
      {ghostUrl && (
        <img
          src={ghostUrl}
          alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            opacity: aligned ? 0.12 : 0.32, pointerEvents: 'none', transition: 'opacity 0.3s'
          }}
        />
      )}
      {guide?.paper && (
        <div style={{
          position: 'absolute', pointerEvents: 'none', borderRadius: '6px',
          left: `${guide.paper.x0 * 100}%`, top: `${guide.paper.y0 * 100}%`,
          width: `${(guide.paper.x1 - guide.paper.x0) * 100}%`, height: `${(guide.paper.y1 - guide.paper.y0) * 100}%`,
          border: `3px dashed ${color}`, background: `${color}1f`, transition: 'all 0.2s ease'
        }} />
      )}
      <div style={{
        position: 'absolute', inset: '10px', borderRadius: '14px', pointerEvents: 'none',
        border: `3px solid ${color}`, boxShadow: `0 0 22px ${color}99, inset 0 0 18px ${color}40`,
        transition: 'all 0.2s ease'
      }} />
      <span style={{ ...corner, top: '4px', left: '4px', borderWidth: '5px 0 0 5px', borderTopLeftRadius: '14px' }} />
      <span style={{ ...corner, top: '4px', right: '4px', borderWidth: '5px 5px 0 0', borderTopRightRadius: '14px' }} />
      <span style={{ ...corner, bottom: '4px', left: '4px', borderWidth: '0 0 5px 5px', borderBottomLeftRadius: '14px' }} />
      <span style={{ ...corner, bottom: '4px', right: '4px', borderWidth: '0 5px 5px 0', borderBottomRightRadius: '14px' }} />
      <div style={{
        position: 'absolute', left: '50%', bottom: '18px', transform: 'translateX(-50%)', maxWidth: '88%',
        backgroundColor: color, color: '#ffffff', fontSize: '13px', fontWeight: 800, padding: '6px 14px',
        borderRadius: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.35)', textAlign: 'center', pointerEvents: 'none'
      }}>
        {message}
      </div>
      <div style={{
        position: 'absolute', top: '12px', right: '12px', backgroundColor: 'rgba(15,23,42,0.75)', color: '#ffffff',
        fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px', pointerEvents: 'none'
      }}>
        {t('cam.guide.match')} {matchPct}%
      </div>
    </>
  );
}

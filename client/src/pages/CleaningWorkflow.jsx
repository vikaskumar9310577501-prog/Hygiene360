import React, { useState, useRef, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LanguageContext';
import CameraCaptureModal from '../components/CameraCaptureModal';
import { fmtDateTime, fmtTime } from '../utils/istTime';
import {
  CheckCircle2,
  Camera,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Lock,
  Check,
  MapPin,
  FileCheck2,
  RefreshCw,
  QrCode,
  Clock,
  Sparkles,
  AlertTriangle,
  Send
} from 'lucide-react';

function locationText(t) {
  return [t.plant_name, t.building_name, t.block_name, t.floor_name, t.area_name].filter(Boolean).join(' / ');
}

function areaKey(o) {
  return o.area_id ? String(o.area_id) : (o.area_name || '—');
}

function StepCard({ num, title, state, summary, children }) {
  const done = state === 'done';
  const locked = state === 'locked';
  const color = done ? '#15803d' : locked ? '#94a3b8' : '#0284c7';
  return (
    <div style={{
      background: '#ffffff',
      border: `1px solid ${state === 'active' ? '#7dd3fc' : 'var(--color-border)'}`,
      borderRadius: '14px',
      padding: '14px 16px',
      marginBottom: '12px',
      opacity: locked ? 0.6 : 1,
      boxShadow: state === 'active' ? '0 2px 12px rgba(2,132,199,0.08)' : 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0,
          background: done ? '#dcfce7' : locked ? '#f1f5f9' : '#e0f2fe',
          color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px'
        }}>
          {done ? <Check size={16} strokeWidth={3} /> : locked ? <Lock size={13} /> : num}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--color-primary-900)' }}>{title}</div>
          {summary && <div style={{ fontSize: '12px', color: done ? '#15803d' : 'var(--color-primary-500)', marginTop: '1px' }}>{summary}</div>}
        </div>
      </div>
      {state === 'active' && children && <div style={{ marginTop: '12px' }}>{children}</div>}
    </div>
  );
}

function PhotoRow({ photo, onRetake, retakeLabel, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '-6px', marginBottom: '12px', padding: '8px 10px', background: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
      <img src={photo.storagePath} alt="" style={{ width: '84px', height: '64px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #bbf7d0' }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: '12px', color: '#475569' }}>
        <div>{photo.serverTimestampStr || fmtDateTime(photo.capturedAt)}</div>
        {children}
      </div>
      {onRetake && (
        <button type="button" onClick={onRetake} className="btn btn-outline btn-sm" style={{ fontSize: '11.5px', flexShrink: 0 }}>
          <RefreshCw size={12} /> {retakeLabel}
        </button>
      )}
    </div>
  );
}

export default function CleaningWorkflow({ toilet, onBack, onComplete }) {
  const { user } = useAuth();
  const { t } = useLang();

  const isRedo = !!toilet.redoOf;
  const list = toilet.areaToilets || [];
  const options = isRedo ? [toilet] : (list.some(o => o.id === toilet.id) ? list : [toilet, ...list]);
  const area = areaKey(toilet);
  const [selectedId, setSelectedId] = useState(toilet.id);
  const selected = options.find(o => o.id === selectedId) || toilet;
  const areaOptions = options.filter(o => areaKey(o) === area);

  const [session, setSession] = useState(null);
  const [slot, setSlot] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(null);
  const [livePhoto, setLivePhoto] = useState(null);
  const [checkSheetPhoto, setCheckSheetPhoto] = useState(null);
  const [cameraFor, setCameraFor] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [result, setResult] = useState(null);
  const startingRef = useRef(false);
  const [slotBlock, setSlotBlock] = useState(null);
  const [previewSlot, setPreviewSlot] = useState(null);

  useEffect(() => {
    if (isRedo || session) return undefined;
    let cancelled = false;
    setSlotBlock(null);
    setPreviewSlot(null);
    api.get(`/cleaning/slot-status/${selectedId}`)
      .then(res => {
        if (cancelled) return;
        setSlotBlock(res.blocked ? res : null);
        setPreviewSlot(res.blocked ? null : (res.slot || null));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId, isRedo, session]);

  const handleNext = async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setStartError(null);
    try {
      const res = await api.post('/cleaning/start', isRedo ? { toiletId: selected.id, redoOf: toilet.redoOf } : { toiletId: selected.id });
      setSession(res.session);
      setSlot(res.slot || null);
    } catch (err) {
      startingRef.current = false;
      if (err.data?.code === 'SLOT_ALREADY_FILLED' || err.data?.code === 'SLOT_NOT_STARTED') setSlotBlock(err.data);
      else setStartError(err.data?.error || err.message || 'Failed to start cleaning');
    } finally {
      setStarting(false);
    }
  };

  const handlePhotoCaptured = (photo) => {
    if (photo.photoType === 'CHECK_SHEET') setCheckSheetPhoto(photo);
    else if (photo.photoType === 'CLEANING_EVIDENCE') setLivePhoto(photo);
  };

  const stepState = {
    select: session ? 'done' : 'active',
    cleaning: livePhoto ? 'done' : session ? 'active' : 'locked',
    checksheet: checkSheetPhoto ? 'done' : livePhoto ? 'active' : 'locked'
  };
  const canSubmit = !!session && !!livePhoto && !!checkSheetPhoto;

  const handleSubmit = async () => {
    if (!livePhoto) { setSubmitError(t('cw.errLivePhoto')); return; }
    if (!checkSheetPhoto) { setSubmitError(t('cw.errChecksheet')); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.post('/cleaning/submit', { sessionId: session.id, remarks });
      setResult(res);
      confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
    } catch (err) {
      setSubmitError(err.data?.error || err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const slotSummary = slot
    ? `${slot.label} • ${slot.range}${slot.late ? ` • ${t('cw.late')}` : ''}`
    : t('cw.noSlot');

  // RESULT SCREEN
  if (result) {
    const s = result.session || {};
    return (
      <div className="page-wrapper" style={{ maxWidth: '600px', margin: '0 auto', paddingTop: '28px' }}>
        <div className="card" style={{ padding: '28px 22px', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', margin: '0 auto 14px', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={38} />
          </div>
          <h2 style={{ fontSize: '21px', fontWeight: 800, color: 'var(--color-primary-900)', margin: '0 0 4px' }}>{t('cw.doneTitle')}</h2>
          <div style={{ fontSize: '13px', color: 'var(--color-primary-500)', marginBottom: '16px' }}>
            {selected.toilet_uid || selected.code} • {selected.name}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'left', marginBottom: '12px' }}>
            <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{t('cw.slotLabel')}</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{s.slotLabel ? `${s.slotLabel} (${s.slotRange})` : t('cw.noSlot')}</div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: '10px', background: s.submittedLate ? '#fef2f2' : '#f8fafc', border: `1px solid ${s.submittedLate ? '#fecaca' : 'var(--color-border)'}` }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>{t('cw.uploadedAt')}</div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: s.submittedLate ? '#b91c1c' : '#0f172a' }}>
                {fmtDateTime(s.submitTime)}{s.submittedLate ? ` • ${t('cw.late')}` : ''}
              </div>
            </div>
          </div>

          <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: '12.5px', fontWeight: 700, marginBottom: '8px' }}>
            {t('cw.sentToAdmin')}
          </div>
          {result.redoIssue && (
            <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#f0f9ff', border: '1px solid #bae6fd', color: '#075985', fontSize: '12.5px', fontWeight: 700, marginBottom: '8px' }}>
              {t('cw.redoIssueSent', { ticket: result.redoIssue.ticketNo })}
            </div>
          )}
          <div style={{ padding: '10px 12px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: '12.5px', fontWeight: 700, marginBottom: '18px' }}>
            {result.nextSlot ? t('cw.nextCleaning', { label: result.nextSlot.label, range: result.nextSlot.range }) : t('cw.noMoreSlots')}
          </div>

          <button onClick={onComplete} className="btn btn-primary btn-lg" style={{ width: '100%' }}>{t('cw.returnDashboard')}</button>
        </div>
      </div>
    );
  }

  const sheet = checkSheetPhoto?.sheetCheck;

  return (
    <div className="page-wrapper" style={{ maxWidth: '760px', margin: '0 auto', padding: '12px 16px' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', gap: '8px' }}>
        <button onClick={onBack} className="btn btn-outline btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={16} /> <span>{t('common.back')}</span>
        </button>
        {session && (
          <span className="badge badge-primary" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{session.session_code}</span>
        )}
      </div>

      {/* Scanned toilet */}
      <div style={{ background: '#ffffff', border: '1px solid var(--color-border)', borderRadius: '14px', padding: '14px 16px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <QrCode size={22} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803d', letterSpacing: '0.04em' }}>{t('flow.scan').toUpperCase()} ✓ • {t('cw.scannedId')}</div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--color-primary-900)', textTransform: 'uppercase', wordBreak: 'break-word' }}>{toilet.name || toilet.code}</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{toilet.toilet_uid || toilet.code}</div>
            <div style={{ fontSize: '12px', color: 'var(--color-primary-500)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={12} color="#0284c7" style={{ flexShrink: 0 }} />
              <span>{locationText(toilet) || toilet.name}</span>
            </div>
          </div>
        </div>
      </div>

      {isRedo && (
        <div style={{ backgroundColor: '#fff7ed', border: '1px solid #fdba74', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px', color: '#7c2d12', fontSize: '12.5px' }}>
          <div style={{ fontWeight: 800, color: '#9a3412', marginBottom: '2px' }}>
            {t('cw.redoBanner')}{toilet.redoTicket ? ` • ${toilet.redoTicket}` : ''}{toilet.redoSlot ? ` • ${toilet.redoSlot}` : ''}
          </div>
          <div><b>{t('cw.adminRemark')}:</b> {toilet.redoRemark || t('cw.noReason')}</div>
        </div>
      )}

      {startError && (
        <div style={{ padding: '12px 14px', borderRadius: '10px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', marginBottom: '12px', fontSize: '13px', display: 'flex', gap: '8px' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 800 }}>{t('cw.cannotStart')}</div>
            <div>{startError}</div>
          </div>
        </div>
      )}

      {/* 1. Select Area / Toilet */}
      <StepCard
        num={1}
        title={t('flow.selectToilet')}
        state={stepState.select}
        summary={session ? `${selected.name || selected.toilet_uid || selected.code} • ${slotSummary}` : t('cw.selectHint')}
      >
        <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>{t('cw.toiletLabel')}</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {areaOptions.map(o => {
            const active = o.id === selectedId;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedId(o.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', padding: '10px 12px',
                  borderRadius: '10px', cursor: 'pointer', touchAction: 'manipulation',
                  border: active ? '1.5px solid #0284c7' : '1px solid var(--color-border)',
                  background: active ? '#f0f9ff' : '#ffffff'
                }}
              >
                <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: `2px solid ${active ? '#0284c7' : '#cbd5e1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {active && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0284c7' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>{o.toilet_uid || o.code}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    {o.name} • {String(o.gender).toUpperCase() === 'FEMALE' ? t('cw.female') : t('cw.male')}
                  </div>
                </div>
                {o.id === toilet.id && <span style={{ fontSize: '10px', fontWeight: 800, color: '#15803d', background: '#dcfce7', borderRadius: '8px', padding: '2px 7px', flexShrink: 0 }}>{t('cw.scanned')}</span>}
              </button>
            );
          })}
        </div>
        {slotBlock ? (
          <div style={{ padding: '14px', borderRadius: '12px', background: slotBlock.code === 'SLOT_NOT_STARTED' ? '#f0f9ff' : '#f0fdf4', border: `1.5px solid ${slotBlock.code === 'SLOT_NOT_STARTED' ? '#7dd3fc' : '#86efac'}`, color: slotBlock.code === 'SLOT_NOT_STARTED' ? '#075985' : '#065f46' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 800 }}>
              {slotBlock.code === 'SLOT_NOT_STARTED'
                ? <Clock size={20} color="#0284c7" style={{ flexShrink: 0 }} />
                : <CheckCircle2 size={20} color="#16a34a" style={{ flexShrink: 0 }} />}
              <span>{t(slotBlock.code === 'SLOT_NOT_STARTED' ? 'cw.slotNotStartedTitle' : 'cw.slotFilledTitle')}</span>
            </div>
            {slotBlock.filledSlot && (
              <div style={{ fontSize: '13px', marginTop: '6px', lineHeight: 1.5 }}>
                <b>{slotBlock.filledSlot.label}</b> ({slotBlock.filledSlot.range})
                {slotBlock.filledBy && <> • {slotBlock.filledBy}</>}
                {slotBlock.filledAt && <> • {fmtDateTime(slotBlock.filledAt)}</>}
              </div>
            )}
            <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '10px', background: '#ffffff', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
              <Clock size={16} color="#0284c7" style={{ flexShrink: 0 }} />
              <span>
                {slotBlock.nextSlot
                  ? t('cw.nextSlotAt', { label: slotBlock.nextSlot.label, range: slotBlock.nextSlot.range })
                  : t('cw.allSlotsFilled')}
              </span>
            </div>
            <button onClick={onBack} className="btn btn-outline" style={{ width: '100%', height: '44px', marginTop: '10px', background: '#ffffff' }}>
              <ArrowLeft size={16} /> <span>{t('cw.backHome')}</span>
            </button>
          </div>
        ) : (
          <>
          {!isRedo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '10px 12px', borderRadius: '10px', background: previewSlot?.late ? '#fef2f2' : '#f0f9ff', border: `1px solid ${previewSlot?.late ? '#fecaca' : '#bae6fd'}`, color: previewSlot?.late ? '#991b1b' : '#075985', fontSize: '13px', fontWeight: 700 }}>
              <Clock size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>
                {t('cw.slotLabel')}: {previewSlot ? `${previewSlot.label} • ${previewSlot.range}${previewSlot.late ? ` • ${t('cw.late')}` : ''}` : t('cw.noSlot')}
              </span>
            </div>
          )}
          {isRedo && toilet.redoSlot && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '10px 12px', borderRadius: '10px', background: '#f0f9ff', border: '1px solid #bae6fd', color: '#075985', fontSize: '13px', fontWeight: 700 }}>
              <Clock size={16} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{t('cw.slotLabel')}: {toilet.redoSlot}</span>
            </div>
          )}
          <button onClick={handleNext} disabled={starting} className="btn btn-primary" style={{ width: '100%', height: '48px', fontSize: '15px', fontWeight: 800 }} id="btn-confirm-toilet">
            {starting ? <RefreshCw size={16} className="spin" /> : <ArrowRight size={18} />} <span>{starting ? t('common.loading') : t('cw.next')}</span>
          </button>
          </>
        )}
      </StepCard>

      {session && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '-6px', marginBottom: '12px', padding: '10px 12px', borderRadius: '12px', background: slot?.late ? '#fef2f2' : '#f0f9ff', border: `1px solid ${slot?.late ? '#fecaca' : '#bae6fd'}`, color: slot?.late ? '#991b1b' : '#075985', fontSize: '12.5px', fontWeight: 700 }}>
          <Clock size={15} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            {t('cw.slotLabel')}: {slotSummary}
            {slot?.late && <span style={{ display: 'block', fontWeight: 600 }}>{t('cw.lateHint')}</span>}
          </span>
        </div>
      )}

      {/* 2. Cleaning → Cleaning Done (live photo) */}
      <StepCard
        num={2}
        title={t('cw.cleaningStep')}
        state={stepState.cleaning}
        summary={livePhoto ? `${t('cw.photoCaptured')} • ${livePhoto.serverTimestampStr || fmtDateTime(livePhoto.capturedAt)}` : (session ? t('cw.startedAt', { time: fmtTime(session.start_time) }) : t('cw.cleaningHint'))}
      >
        <div style={{ fontSize: '12.5px', color: '#475569', marginBottom: '10px', display: 'flex', gap: '6px' }}>
          <Sparkles size={15} color="#0284c7" style={{ flexShrink: 0, marginTop: '1px' }} /> {t('cw.cleaningHint')}
        </div>
        <button onClick={() => setCameraFor('CLEANING_EVIDENCE')} className="btn btn-success" style={{ width: '100%', height: '50px', fontSize: '15.5px', fontWeight: 800 }} id="btn-cleaning-done">
          <Camera size={19} /> <span>{t('cw.cleaningDone')}</span>
        </button>
      </StepCard>
      {livePhoto && <PhotoRow photo={livePhoto} onRetake={() => setCameraFor('CLEANING_EVIDENCE')} retakeLabel={t('cw.retakePhoto')} />}

      {/* 3. Check sheet photo */}
      <StepCard
        num={3}
        title={t('cw.checksheetStep')}
        state={stepState.checksheet}
        summary={checkSheetPhoto ? t('cw.checksheetUploaded') : t('cw.checksheetHint')}
      >
        <div style={{ fontSize: '12.5px', color: '#475569', marginBottom: '10px' }}>{t('cw.checksheetHint')}</div>
        <button type="button" onClick={() => setCameraFor('CHECK_SHEET')} className="btn btn-primary" style={{ width: '100%', height: '48px', fontWeight: 800 }} id="btn-capture-checksheet">
          <FileCheck2 size={17} /> <span>{t('cw.captureChecksheet')}</span>
        </button>
      </StepCard>
      {checkSheetPhoto && (
        <PhotoRow photo={checkSheetPhoto} onRetake={() => setCameraFor('CHECK_SHEET')} retakeLabel={t('cw.retakeChecksheet')}>
          {sheet?.dateVerified ? (
            <div style={{ color: '#15803d', fontWeight: 800, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={13} /> {t('cw.sheetVerified', {
                date: sheet.detectedDate,
                time: `${sheet.detectedTime ? ` • ${sheet.detectedTime}` : ''}${sheet.itemsTotal ? ` • ${sheet.itemsTicked}/${sheet.itemsTotal} ✓` : ''}`
              })}
            </div>
          ) : (
            <div style={{ color: '#b45309', fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <AlertTriangle size={13} style={{ flexShrink: 0 }} /> {t('cw.sheetUnread')}
            </div>
          )}
        </PhotoRow>
      )}

      {canSubmit && (
        <div style={{ marginBottom: '12px' }}>
          <label className="form-label" style={{ fontSize: '12px', fontWeight: 700 }}>{t('cw.remarks')}</label>
          <textarea rows={2} className="form-control" placeholder={t('cw.remarksPlaceholder')} value={remarks} onChange={e => setRemarks(e.target.value)} />
        </div>
      )}

      {submitError && (
        <div style={{ padding: '12px 14px', borderRadius: '10px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', marginBottom: '12px', fontSize: '13px', display: 'flex', gap: '8px' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} /> <span>{submitError}</span>
        </div>
      )}

      {/* 4. Submit to admin */}
      <div style={{
        position: 'sticky', bottom: 0, background: '#ffffff', padding: '12px 16px', borderTop: '1px solid var(--color-border)',
        boxShadow: '0 -4px 16px rgba(15,23,42,0.06)', zIndex: 90, margin: '0 -16px -16px', borderRadius: '14px 14px 0 0'
      }}>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          style={{
            width: '100%', padding: '15px 20px', fontSize: '15.5px', fontWeight: 800, border: 'none', borderRadius: '12px',
            color: '#ffffff', background: canSubmit ? '#16a34a' : '#94a3b8',
            cursor: canSubmit ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
          }}
          id="btn-submit-cleaning"
        >
          {submitting ? <span>{t('cw.submitting')}</span>
            : !session ? <><Lock size={17} /><span>{t('cw.lockSelect')}</span></>
            : !livePhoto ? <><Lock size={17} /><span>{t('cw.lockPhoto')}</span></>
            : !checkSheetPhoto ? <><Lock size={17} /><span>{t('cw.lockChecksheet')}</span></>
            : <><Send size={18} /><span>{t('cw.submitBtn')}</span></>}
        </button>
      </div>

      {cameraFor && session && (
        <CameraCaptureModal
          isOpen={true}
          onClose={() => setCameraFor(null)}
          sessionId={session.id}
          photoType={cameraFor}
          photoLabel={cameraFor === 'CHECK_SHEET' ? t('cw.checksheetStep') : t('flow.livePhoto')}
          metadata={{
            toiletId: selected.id,
            toiletCode: selected.toilet_uid || selected.code,
            toiletName: selected.name,
            plantId: selected.plant_id,
            plantName: selected.plant_name,
            userName: user?.name,
            empId: user?.employee_id
          }}
          onCaptured={handlePhotoCaptured}
        />
      )}

      <div style={{ height: '8px' }} />
    </div>
  );
}

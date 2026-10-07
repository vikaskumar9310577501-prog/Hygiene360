import React, { useState, useEffect, useRef } from 'react';
import { api, photoUrl } from '../utils/api';
import { Camera, Upload, Trash2, AlertCircle, CheckCircle2, Info } from 'lucide-react';

const MAX_SIDE = 1280;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ToiletReferencePhotos({ plants = [] }) {
  const [plantId, setPlantId] = useState(plants?.[0]?.id ? String(plants[0].id) : '');
  const [toilets, setToilets] = useState([]);
  const [toiletId, setToiletId] = useState('');
  const [kind, setKind] = useState('TOILET');
  const [refs, setRefs] = useState([]);
  const [max, setMax] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [preview, setPreview] = useState(null);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!plantId && plants?.length) setPlantId(String(plants[0].id));
  }, [plants, plantId]);

  useEffect(() => {
    if (!plantId) return;
    api.get('/admin/toilets', { plantId })
      .then(res => {
        const list = res.toilets || [];
        setToilets(list);
        setToiletId(list.length ? String(list[0].id) : '');
      })
      .catch(err => setError(err.message));
  }, [plantId]);

  const loadRefs = async (id = toiletId) => {
    if (!id) { setRefs([]); return; }
    try {
      const res = await api.get(`/master-photos/toilet-refs/${id}`, { kind });
      setRefs(res.refs || []);
      setMax(res.max || 4);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { setError(null); setNotice(null); loadRefs(toiletId); }, [toiletId, kind]);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file || !toiletId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const fd = new FormData();
      fd.append('kind', kind);
      fd.append('dataUrl', dataUrl);
      await api.postMultipart(`/master-photos/toilet-refs/${toiletId}`, fd);
      setNotice('Reference photo saved.');
      await loadRefs();
    } catch (err) {
      setError(err.data?.error || err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const removeRef = async (id) => {
    if (!window.confirm('Delete this reference photo?')) return;
    try {
      await api.delete(`/master-photos/toilet-refs/ref/${id}`);
      await loadRefs();
    } catch (err) {
      setError(err.data?.error || err.message || 'Delete failed');
    }
  };

  const selectedToilet = toilets.find(t => String(t.id) === String(toiletId));
  const canAdd = !!toiletId && refs.length < max && !busy;

  return (
    <div className="card" style={{ padding: '18px' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: '17px' }}>Toilet Reference Photos (Smart Camera)</h3>
      <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: '#64748b', lineHeight: 1.5 }}>
        Add 3–4 photos of each toilet when it is fully clean. The housekeeper's live camera guides them to the same angle,
        captures automatically when it matches, and rejects the photo if the toilet does not look clean.
      </p>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <select className="form-control" style={{ maxWidth: '240px' }} value={plantId} onChange={e => setPlantId(e.target.value)}>
          {plants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: '320px' }} value={toiletId} onChange={e => setToiletId(e.target.value)}>
          {toilets.length === 0 && <option value="">No toilets</option>}
          {toilets.map(t => <option key={t.id} value={t.id}>{t.name} ({t.toilet_uid || t.code})</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
        {[{ id: 'TOILET', label: 'Toilet Photos' }, { id: 'CHECK_SHEET', label: 'Check Sheet Photos' }].map(k => (
          <button
            key={k.id}
            type="button"
            className={`btn btn-sm ${kind === k.id ? 'btn-brand' : 'btn-outline'}`}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div style={{
        display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 12px', borderRadius: '8px',
        backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: '12px', marginBottom: '14px', lineHeight: 1.5
      }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
        {kind === 'TOILET' ? (
          <div>
            Stand where the housekeeper should stand and hold the phone the same way (portrait). Keep the toilet seat,
            floor and walls in view. Take one photo in daylight and one with lights on, so matching works at any time of day.
          </div>
        ) : (
          <div>
            Photograph the blank printed check sheet so it fills the frame, holding the phone in portrait. Add 3–4 photos
            (on a table, held in hand, different light). Sheet photos added to any one toilet are used for every toilet in
            this plant that has no sheet photos of its own.
          </div>
        )}
      </div>

      {error && (
        <div style={{ display: 'flex', gap: '8px', padding: '10px 12px', borderRadius: '8px', backgroundColor: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', fontSize: '12.5px', marginBottom: '12px' }}>
          <AlertCircle size={16} style={{ flexShrink: 0 }} /> <span>{error}</span>
        </div>
      )}
      {notice && (
        <div style={{ display: 'flex', gap: '8px', padding: '10px 12px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', fontSize: '12.5px', marginBottom: '12px' }}>
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} /> <span>{notice}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '14px' }}>
        {refs.map((r, i) => (
          <div key={r.id} style={{ border: '1px solid var(--color-border)', borderRadius: '10px', overflow: 'hidden', background: '#f8fafc' }}>
            <img
              src={photoUrl(r.image_url)}
              alt={`Reference ${i + 1}`}
              onClick={() => setPreview(photoUrl(r.image_url))}
              style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', fontSize: '11.5px' }}>
              <span style={{ color: '#475569' }}>Photo {i + 1}{r.uploaded_by_name ? ` • ${r.uploaded_by_name}` : ''}</span>
              <button type="button" onClick={() => removeRef(r.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
        {refs.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '12.5px', border: '1px dashed var(--color-border)', borderRadius: '10px' }}>
            {kind === 'TOILET'
              ? `No toilet photos for ${selectedToilet ? selectedToilet.name : 'this toilet'} yet. Without them the camera works as before (no guide, no clean check).`
              : `No check sheet photos for ${selectedToilet ? selectedToilet.name : 'this toilet'}. Sheet photos from another toilet of this plant will be used if available.`}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn-brand" disabled={!canAdd} onClick={() => cameraInputRef.current?.click()}>
          <Camera size={16} /> <span>{busy ? 'Saving...' : 'Take Photo'}</span>
        </button>
        <button type="button" className="btn btn-outline" disabled={!canAdd} onClick={() => fileInputRef.current?.click()}>
          <Upload size={16} /> <span>Upload File</span>
        </button>
        <span style={{ fontSize: '12px', color: '#64748b' }}>{refs.length} / {max} photos</span>
      </div>

      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFile} />
      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

      {preview && (
        <div className="modal-overlay" onClick={() => setPreview(null)}>
          <img src={preview} alt="Reference" style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: '10px' }} />
        </div>
      )}
    </div>
  );
}

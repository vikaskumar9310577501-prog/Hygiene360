import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { 
  Camera, 
  Upload, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Sparkles, 
  Eye, 
  X, 
  Building2, 
  MapPin, 
  ShieldCheck,
  RotateCcw,
  Maximize2,
  Plus
} from 'lucide-react';

export default function MasterPhotosAdmin({ plants = [] }) {
  const { user } = useAuth();
  const [selectedPlantId, setSelectedPlantId] = useState(plants?.[0]?.id ? String(plants[0].id) : '');
  const [toilets, setToilets] = useState([]);
  const [selectedToiletId, setSelectedToiletId] = useState('all'); // 'all' = plant standard template
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadingItemId, setUploadingItemId] = useState(null);

  // Live Camera Snap Modal for IT Admin
  const [cameraModalItem, setCameraModalItem] = useState(null);
  const [cameraStreamActive, setCameraStreamActive] = useState(false);
  const [capturedDataUrl, setCapturedDataUrl] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const itCameraInputRef = useRef(null);

  // Preview full size image modal
  const [previewImage, setPreviewImage] = useState(null);

  // New Area Modal State
  const [showAddAreaModal, setShowAddAreaModal] = useState(false);
  const [newAreaName, setNewAreaName] = useState('');
  const [newToiletCode, setNewToiletCode] = useState('');
  const [newToiletName, setNewToiletName] = useState('');
  const [newToiletGender, setNewToiletGender] = useState('MALE');
  const [creatingArea, setCreatingArea] = useState(false);
  const [addAreaError, setAddAreaError] = useState(null);

  // File input ref map
  const fileInputRefs = useRef({});

  // Keep selectedPlantId synced with plants prop
  useEffect(() => {
    if ((!selectedPlantId || selectedPlantId === '') && plants && plants.length > 0) {
      setSelectedPlantId(String(plants[0].id));
    }
  }, [plants, selectedPlantId]);

  // 1. Load toilets when plant changes
  useEffect(() => {
    if (selectedPlantId) {
      loadToilets();
    }
  }, [selectedPlantId]);

  const loadToilets = async () => {
    const targetPlant = selectedPlantId || (plants?.[0]?.id ? String(plants[0].id) : '');
    if (!targetPlant) return;
    try {
      const res = await api.get(`/admin/toilets?plantId=${targetPlant}`);
      setToilets(res.toilets || []);
    } catch (err) {
      console.error(err);
    }
  };

  // 2. Load master items & photos
  useEffect(() => {
    if (selectedPlantId) {
      loadMasterPhotos();
    }
  }, [selectedPlantId, selectedToiletId]);

  const loadMasterPhotos = async () => {
    const targetPlant = selectedPlantId || (plants?.[0]?.id ? String(plants[0].id) : '');
    if (!targetPlant) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/master-photos?plantId=${targetPlant}&toiletId=${selectedToiletId}`);
      setItems(res.items || []);
    } catch (err) {
      console.error('Failed to load master photos:', err);
      setError(err.message || 'Failed to load master photos');
    } finally {
      setLoading(false);
    }
  };

  // Handle File Upload from disk
  const handleFileUpload = async (itemId, file) => {
    if (!file) return;
    const targetPlantId = selectedPlantId || (plants?.[0]?.id ? String(plants[0].id) : '');
    if (!targetPlantId) {
      alert('Please select a plant from the dropdown first.');
      return;
    }
    setUploadingItemId(itemId);
    try {
      const formData = new FormData();
      formData.append('imageFile', file);
      formData.append('plantId', String(targetPlantId));
      formData.append('toiletId', selectedToiletId || 'all');
      formData.append('itemId', String(itemId));

      await api.postMultipart('/master-photos/upload', formData);
      loadMasterPhotos();
    } catch (err) {
      alert(err.data?.error || err.message || 'Failed to upload master photo');
    } finally {
      setUploadingItemId(null);
    }
  };

  // Open Live Camera Modal for IT Admin
  const handleOpenLiveCamera = (item) => {
    setCameraModalItem(item);
    setCapturedDataUrl(null);
    setCameraError(null);
    setCameraStreamActive(true);

    setTimeout(() => {
      startCamera();
    }, 150);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Insecure HTTP origin. To take a snap with the mobile camera, tap "Take Camera Snapshot" below.');
      }
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch (e1) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } }
          });
        } catch (e2) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true });
        }
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('IT Admin camera start error:', err);
      setCameraError(err.message || 'Camera permission required.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraStreamActive(false);
  };

  const handleCloseCameraModal = () => {
    stopCamera();
    setCameraModalItem(null);
    setCapturedDataUrl(null);
  };

  // Snap photo from video stream
  const handleSnapPhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedDataUrl(dataUrl);
    stopCamera();
  };

  // Handle Mobile Camera Snap Fallback for IT Admin
  const handleMobileCameraSnap = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCapturedDataUrl(ev.target.result);
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  // Save Snapped Live Camera Photo as Master
  const handleSaveSnappedPhoto = async () => {
    if (!capturedDataUrl || !cameraModalItem) return;
    const targetPlantId = selectedPlantId || (plants?.[0]?.id ? String(plants[0].id) : '');
    if (!targetPlantId) {
      alert('Please select a plant from the dropdown first.');
      return;
    }
    setUploadingItemId(cameraModalItem.id);
    try {
      await api.post('/master-photos/upload', {
        plantId: String(targetPlantId),
        toiletId: selectedToiletId || 'all',
        itemId: cameraModalItem.id,
        dataUrl: capturedDataUrl
      });
      handleCloseCameraModal();
      loadMasterPhotos();
    } catch (err) {
      alert(err.data?.error || err.message || 'Failed to save master photo');
    } finally {
      setUploadingItemId(null);
    }
  };

  // Delete Master Photo
  const handleDeleteMaster = async (photoId, itemLabel) => {
    if (!window.confirm(`Are you sure you want to delete the Master Photo for "${itemLabel}"?\n\nThe housekeeping AI validation will reset for this item until a new photo is uploaded.`)) {
      return;
    }
    try {
      await api.delete(`/master-photos/${photoId}`);
      loadMasterPhotos();
    } catch (err) {
      alert(err.message || 'Failed to delete master photo');
    }
  };

  // Handle Quick Add Toilet Area
  const handleCreateToiletArea = async (e) => {
    e.preventDefault();
    if (!newAreaName.trim() || !newToiletCode.trim() || !newToiletName.trim()) {
      setAddAreaError('Area Name, Code and Toilet Name are required.');
      return;
    }

    setCreatingArea(true);
    setAddAreaError(null);
    try {
      const res = await api.post('/admin/toilets', {
        plantId: selectedPlantId,
        areaName: newAreaName.trim(),
        code: newToiletCode.trim().toUpperCase(),
        name: newToiletName.trim(),
        gender: newToiletGender
      });

      // Reload toilets list and select the newly created toilet area
      await loadToilets();
      if (res.toiletId) {
        setSelectedToiletId(String(res.toiletId));
      }
      setShowAddAreaModal(false);
      setNewAreaName('');
      setNewToiletCode('');
      setNewToiletName('');
    } catch (err) {
      setAddAreaError(err.data?.error || err.message || 'Failed to create toilet area');
    } finally {
      setCreatingArea(false);
    }
  };

  const handleRefreshAll = () => {
    loadToilets();
    loadMasterPhotos();
  };

  const activeToilet = toilets.find(t => String(t.id) === String(selectedToiletId));

  return (
    <div className="card" style={{ padding: '16px 20px' }}>
      
      {/* Top Header & Context */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
              Master Clean Reference Photos
            </h2>
            <span className="badge badge-primary" style={{ fontSize: '10px' }}>IT ADMIN EXCLUSIVE</span>
          </div>
          <p style={{ fontSize: '12.5px', color: '#64748b', margin: '4px 0 0 0' }}>
            Set a 100% clean company-standard photo for each checklist item. These are for reference only; housekeeper photos are not auto-compared — the Admin reviews and approves them.
          </p>
        </div>

        <button 
          onClick={handleRefreshAll}
          className="btn btn-outline btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          title="Reload toilets & master photos"
        >
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Row: Select Plant & Toilet Area */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        backgroundColor: '#f8fafc',
        padding: '12px 16px',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        marginBottom: '10px'
      }}>
        {/* Plant Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Building2 size={15} color="#0284c7" />
          <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#334155' }}>Plant:</span>
          <select 
            className="form-control"
            style={{ height: '34px', fontSize: '12.5px', fontWeight: '600', minWidth: '160px' }}
            value={selectedPlantId}
            onChange={(e) => setSelectedPlantId(e.target.value)}
          >
            {plants.map(p => (
              <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
            ))}
          </select>
        </div>

        {/* Toilet Area Selector (Replaces raw facility text) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <MapPin size={15} color="#0284c7" />
          <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#334155' }}>Toilet Area:</span>
          <select 
            className="form-control"
            style={{ height: '34px', fontSize: '12.5px', fontWeight: '600', minWidth: '260px' }}
            value={selectedToiletId}
            onChange={(e) => setSelectedToiletId(e.target.value)}
          >
            <option value="all">★ All Toilet Areas (Default Benchmark Template)</option>
            {toilets.map(t => (
              <option key={t.id} value={t.id}>
                📍 {t.area_name ? t.area_name : t.name} ({t.code})
              </option>
            ))}
          </select>

          {/* Quick Button to Add New Toilet Area / Location */}
          <button
            type="button"
            onClick={() => setShowAddAreaModal(true)}
            className="btn btn-outline btn-sm"
            style={{ 
              height: '34px', 
              fontSize: '11.5px', 
              fontWeight: '700', 
              color: '#0284c7', 
              borderColor: '#bae6fd',
              backgroundColor: '#f0f9ff',
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px' 
            }}
          >
            <Plus size={14} />
            <span>+ Add Toilet Area</span>
          </button>
        </div>

        <div style={{ fontSize: '11.5px', color: '#64748b', marginLeft: 'auto' }}>
          Configured: <strong style={{ color: '#0284c7' }}>{items.filter(i => i.hasMaster).length}</strong> / {items.length} Checklist Items
        </div>
      </div>

      {/* Grid of Checklist Items */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
        {items.map(item => {
          const isConfigured = item.hasMaster && item.masterPhoto;
          const isBusy = uploadingItemId === item.id;

          return (
            <div 
              key={item.id}
              style={{
                backgroundColor: '#ffffff',
                border: isConfigured ? '1.5px solid #0284c7' : '1px dashed #cbd5e1',
                borderRadius: '14px',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                boxShadow: isConfigured ? '0 4px 12px rgba(2, 132, 199, 0.08)' : 'none',
                position: 'relative',
                transition: 'all 0.2s ease'
              }}
            >
              {/* Header */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ 
                    fontSize: '10px', 
                    fontWeight: '800', 
                    color: isConfigured ? '#0369a1' : '#64748b',
                    backgroundColor: isConfigured ? '#e0f2fe' : '#f1f5f9',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    textTransform: 'uppercase'
                  }}>
                    {item.category} • Item #{item.order_num}
                  </span>
                  
                  {isConfigured ? (
                    <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <CheckCircle2 size={13} />
                      <span>MASTER ACTIVE</span>
                    </span>
                  ) : (
                    <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '700' }}>
                      ● No Master Set
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a', marginBottom: '3px' }}>
                  {item.label}
                </div>

                <div style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '12px', minHeight: '32px' }}>
                  {item.description || 'Standard clean hygiene condition'}
                </div>

                {/* Master Photo Preview Area */}
                <div style={{
                  width: '100%',
                  height: '160px',
                  borderRadius: '10px',
                  backgroundColor: '#0f172a',
                  overflow: 'hidden',
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                  border: '1px solid #e2e8f0'
                }}>
                  {isConfigured ? (
                    <>
                      <img 
                        src={item.masterPhoto.image_url} 
                        alt={item.label}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <button
                        onClick={() => setPreviewImage(item.masterPhoto.image_url)}
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          backgroundColor: 'rgba(15, 23, 42, 0.75)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '5px',
                          cursor: 'pointer'
                        }}
                        title="View Full Size"
                      >
                        <Maximize2 size={13} />
                      </button>

                      <div style={{
                        position: 'absolute',
                        bottom: '0',
                        left: '0',
                        right: '0',
                        backgroundColor: 'rgba(15, 23, 42, 0.85)',
                        padding: '4px 8px',
                        fontSize: '10px',
                        color: '#94a3b8',
                        display: 'flex',
                        justifyContent: 'space-between'
                      }}>
                        <span>By: {item.masterPhoto.uploaded_by_name || 'IT Admin'}</span>
                        <span>{new Date(item.masterPhoto.updated_at).toLocaleDateString()}</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#64748b', padding: '10px' }}>
                      <Camera size={32} style={{ opacity: 0.35, marginBottom: '6px' }} />
                      <div style={{ fontSize: '11.5px', fontWeight: '700' }}>No Reference Photo Set</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>Upload standard clean photo below</div>
                    </div>
                  )}

                  {isBusy && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundColor: 'rgba(15, 23, 42, 0.85)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#38bdf8'
                    }}>
                      <RefreshCw size={24} className="spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* Upload & Camera Actions */}
              <div>
                {/* Hidden File Input for Direct Disk Upload */}
                <input 
                  type="file" 
                  accept="image/*"
                  ref={el => fileInputRefs.current[item.id] = el}
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileUpload(item.id, e.target.files?.[0])}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {/* Mode 1: File Upload */}
                  <button
                    onClick={() => fileInputRefs.current[item.id]?.click()}
                    disabled={isBusy}
                    className="btn btn-outline btn-sm"
                    style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      padding: '8px 4px'
                    }}
                  >
                    <Upload size={13} />
                    <span>Upload File</span>
                  </button>

                  {/* Mode 2: Live Camera Snap */}
                  <button
                    onClick={() => handleOpenLiveCamera(item)}
                    disabled={isBusy}
                    className="btn btn-brand btn-sm"
                    style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      padding: '8px 4px'
                    }}
                  >
                    <Camera size={13} />
                    <span>Live Camera</span>
                  </button>
                </div>

                {/* Delete Master Photo Button if Active */}
                {isConfigured && (
                  <button
                    onClick={() => handleDeleteMaster(item.masterPhoto.id, item.label)}
                    style={{
                      width: '100%',
                      marginTop: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: '#ef4444',
                      fontSize: '11px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      padding: '4px 0'
                    }}
                  >
                    <Trash2 size={12} />
                    <span>Delete Reference</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Live Camera Snap for IT Admin */}
      {cameraModalItem && (
        <div className="modal-overlay" onClick={handleCloseCameraModal} style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '520px', padding: '16px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Camera size={18} color="#0284c7" />
                <h3 className="modal-title" style={{ fontSize: '15px' }}>
                  Live Camera Snap: {cameraModalItem.label}
                </h3>
              </div>
              <button onClick={handleCloseCameraModal} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: 0 }}>
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
                Place the fixture in 100% clean condition in front of the camera and tap <strong>"Click Master Photo"</strong>.
              </p>

              {cameraError && (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: '#fef2f2',
                  color: '#dc2626',
                  fontSize: '12px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <AlertCircle size={15} />
                  <span>{cameraError}</span>
                </div>
              )}

              {/* Viewfinder or Captured Preview */}
              <div style={{
                width: '100%',
                height: '280px',
                borderRadius: '12px',
                backgroundColor: '#000000',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '14px'
              }}>
                {!capturedDataUrl ? (
                  <>
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                    {/* Guidance Overlay Frame */}
                    <div style={{
                      position: 'absolute',
                      top: '20px',
                      bottom: '20px',
                      left: '20px',
                      right: '20px',
                      border: '2px dashed #38bdf8',
                      borderRadius: '8px',
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'center',
                      padding: '8px'
                    }}>
                      <span style={{ backgroundColor: 'rgba(2, 132, 199, 0.85)', color: '#ffffff', fontSize: '10px', fontWeight: '800', padding: '2px 8px', borderRadius: '4px' }}>
                        ALIGN CLEAN FIXTURE IN CENTER
                      </span>
                    </div>
                  </>
                ) : (
                  <img 
                    src={capturedDataUrl} 
                    alt="Captured Master Preview" 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                )}
              </div>

              {/* Native Mobile Camera Snap Input (Fallback for Mobile HTTP) */}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={itCameraInputRef}
                style={{ display: 'none' }}
                onChange={handleMobileCameraSnap}
              />

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {!capturedDataUrl ? (
                  <>
                    <button
                      onClick={handleSnapPhoto}
                      className="btn btn-brand"
                      style={{
                        flex: 1,
                        backgroundColor: '#0284c7',
                        color: '#ffffff',
                        fontWeight: '800',
                        padding: '10px 0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      <Camera size={16} />
                      <span>Click Master Photo</span>
                    </button>
                    <button
                      onClick={() => itCameraInputRef.current?.click()}
                      className="btn btn-outline"
                      style={{
                        padding: '10px 14px',
                        fontSize: '12px',
                        fontWeight: '700'
                      }}
                      title="Use Phone Camera Native App"
                    >
                      Phone Camera
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setCapturedDataUrl(null);
                        setCameraStreamActive(true);
                        setTimeout(startCamera, 100);
                      }}
                      className="btn btn-outline"
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <RotateCcw size={14} />
                      <span>Retake</span>
                    </button>
                    <button
                      onClick={handleSaveSnappedPhoto}
                      className="btn btn-brand"
                      style={{
                        flex: 1,
                        backgroundColor: '#16a34a',
                        color: '#ffffff',
                        fontWeight: '800',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      <CheckCircle2 size={16} />
                      <span>Confirm & Save</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Quick Add Toilet Area */}
      {showAddAreaModal && (
        <div className="modal-overlay" onClick={() => setShowAddAreaModal(false)} style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ maxWidth: '440px', padding: '18px', borderRadius: '16px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={18} color="#0284c7" />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#0f172a' }}>
                  Add New Toilet Area / Location
                </h3>
              </div>
              <button onClick={() => setShowAddAreaModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
                <X size={18} color="#64748b" />
              </button>
            </div>

            {addAreaError && (
              <div style={{
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: '#fef2f2',
                color: '#dc2626',
                fontSize: '12px',
                marginBottom: '12px'
              }}>
                {addAreaError}
              </div>
            )}

            <form onSubmit={handleCreateToiletArea}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                  Toilet Area / Department Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Assembly Line, Molding Shop, Canteen, R&D Lab"
                  value={newAreaName}
                  onChange={e => setNewAreaName(e.target.value)}
                  className="form-control"
                  style={{ height: '36px', fontSize: '12.5px' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    Toilet Code:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TLT-09, AL-01"
                    value={newToiletCode}
                    onChange={e => setNewToiletCode(e.target.value)}
                    className="form-control"
                    style={{ height: '36px', fontSize: '12.5px', textTransform: 'uppercase' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11.5px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                    Gender Type:
                  </label>
                  <select
                    value={newToiletGender}
                    onChange={e => setNewToiletGender(e.target.value)}
                    className="form-control"
                    style={{ height: '36px', fontSize: '12.5px' }}
                  >
                    <option value="MALE">MALE</option>
                    <option value="FEMALE">FEMALE</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                  Washroom Display Name:
                </label>
                <input
                  type="text"
                  placeholder="e.g. Assembly Floor Washroom"
                  value={newToiletName}
                  onChange={e => setNewToiletName(e.target.value)}
                  className="form-control"
                  style={{ height: '36px', fontSize: '12.5px' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowAddAreaModal(false)}
                  className="btn btn-outline btn-sm"
                  style={{ padding: '8px 14px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingArea}
                  className="btn btn-brand btn-sm"
                  style={{
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    fontWeight: '800',
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {creatingArea && <RefreshCw size={13} className="spin" />}
                  <span>Save Area & Set Master Photos</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full Size Preview Modal */}
      {previewImage && (
        <div className="modal-overlay" onClick={() => setPreviewImage(null)} style={{ zIndex: 10000 }}>
          <div className="modal-content" style={{ maxWidth: '640px', padding: '10px', backgroundColor: '#0f172a' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
              <button onClick={() => setPreviewImage(null)} style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <img src={previewImage} alt="Master Full Size" style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: '8px' }} />
          </div>
        </div>
      )}

    </div>
  );
}

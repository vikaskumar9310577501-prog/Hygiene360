import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import CameraCaptureModal from '../components/CameraCaptureModal';
import { GlassWater, Check, XCircle, Camera, CheckCircle2, ArrowLeft, Send, History } from 'lucide-react';

export default function DrinkingWaterWorkflow({ initialParams, onBack, onComplete }) {
  const { user, activePlantId } = useAuth();
  const [pointName, setPointName] = useState('Main Floor RO Water Dispenser #1');
  const [waterAvailable, setWaterAvailable] = useState(1);
  const [dispenserClean, setDispenserClean] = useState(1);
  const [drinkingAreaClean, setDrinkingAreaClean] = useState(1);
  const [glassesAvailable, setGlassesAvailable] = useState(1);
  const [roFunctioning, setRoFunctioning] = useState(1);
  const [waterLeakage, setWaterLeakage] = useState(0);
  const [areaCleanliness, setAreaCleanliness] = useState(1);
  const [remarks, setRemarks] = useState('');
  const [photo, setPhoto] = useState(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pastChecks, setPastChecks] = useState([]);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadPastChecks();
  }, [activePlantId]);

  const loadPastChecks = async () => {
    try {
      const res = await api.get('/drinking-water');
      setPastChecks(res.checks || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/drinking-water/check', {
        plantId: initialParams?.plantId || activePlantId,
        areaId: initialParams?.areaId || null,
        pointName,
        waterAvailable,
        dispenserClean,
        drinkingAreaClean,
        glassesAvailable,
        roFunctioning,
        waterLeakage,
        areaCleanliness,
        remarks,
        imageBase64: photo?.storagePath ? undefined : null
      });

      setSuccess(true);
      setTimeout(() => {
        if (onComplete) onComplete();
        else loadPastChecks();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-wrapper" style={{ maxWidth: '820px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <button onClick={onBack} className="btn btn-outline btn-sm">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <span className="badge badge-primary">
          DRINKING WATER HYGIENE MODULE
        </span>
      </div>

      <div className="card" style={{ marginBottom: '20px', backgroundColor: '#0284c7', color: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', backgroundColor: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GlassWater size={26} color="#ffffff" />
          </div>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#ffffff' }}>
              Drinking Water Hygiene & RO Audit
            </h2>
            <div style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.9)' }}>
              Independent audit checkpoint for worker hydration and RO water quality
            </div>
          </div>
        </div>
      </div>

      {success && (
        <div style={{ padding: '14px', backgroundColor: '#ecfdf5', color: '#047857', borderRadius: '8px', marginBottom: '16px', fontWeight: '700' }}>
          ✓ Drinking water inspection successfully verified and recorded!
        </div>
      )}

      {/* 7-POINT CHECKLIST FORM (Prompt Requirement) */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Water Dispenser Hub Location / Point Name</label>
            <input
              type="text"
              className="form-control"
              value={pointName}
              onChange={(e) => setPointName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', margin: '20px 0' }}>
            
            {/* Point 1: Water available */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: waterAvailable ? '#ffffff' : '#fef2f2' }}>
              <span style={{ fontWeight: '600', fontSize: '13.5px' }}>1. Water Available & Flowing</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => setWaterAvailable(1)} className={`btn btn-sm ${waterAvailable ? 'btn-success' : 'btn-outline'}`}>PASS</button>
                <button type="button" onClick={() => setWaterAvailable(0)} className={`btn btn-sm ${!waterAvailable ? 'btn-danger' : 'btn-outline'}`}>FAIL</button>
              </div>
            </div>

            {/* Point 2: Dispenser clean */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: dispenserClean ? '#ffffff' : '#fef2f2' }}>
              <span style={{ fontWeight: '600', fontSize: '13.5px' }}>2. Water Dispenser Exterior & Nozzles Clean</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => setDispenserClean(1)} className={`btn btn-sm ${dispenserClean ? 'btn-success' : 'btn-outline'}`}>PASS</button>
                <button type="button" onClick={() => setDispenserClean(0)} className={`btn btn-sm ${!dispenserClean ? 'btn-danger' : 'btn-outline'}`}>FAIL</button>
              </div>
            </div>

            {/* Point 3: Drinking area clean */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: drinkingAreaClean ? '#ffffff' : '#fef2f2' }}>
              <span style={{ fontWeight: '600', fontSize: '13.5px' }}>3. Drinking Area & Surroundings Clean</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => setDrinkingAreaClean(1)} className={`btn btn-sm ${drinkingAreaClean ? 'btn-success' : 'btn-outline'}`}>PASS</button>
                <button type="button" onClick={() => setDrinkingAreaClean(0)} className={`btn btn-sm ${!drinkingAreaClean ? 'btn-danger' : 'btn-outline'}`}>FAIL</button>
              </div>
            </div>

            {/* Point 4: Glasses available */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: glassesAvailable ? '#ffffff' : '#fef2f2' }}>
              <span style={{ fontWeight: '600', fontSize: '13.5px' }}>4. Glasses / Paper Cups Available</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => setGlassesAvailable(1)} className={`btn btn-sm ${glassesAvailable ? 'btn-success' : 'btn-outline'}`}>PASS</button>
                <button type="button" onClick={() => setGlassesAvailable(0)} className={`btn btn-sm ${!glassesAvailable ? 'btn-danger' : 'btn-outline'}`}>FAIL</button>
              </div>
            </div>

            {/* Point 5: RO functioning */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: roFunctioning ? '#ffffff' : '#fef2f2' }}>
              <span style={{ fontWeight: '600', fontSize: '13.5px' }}>5. RO Purifier / UV System Functioning</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => setRoFunctioning(1)} className={`btn btn-sm ${roFunctioning ? 'btn-success' : 'btn-outline'}`}>PASS</button>
                <button type="button" onClick={() => setRoFunctioning(0)} className={`btn btn-sm ${!roFunctioning ? 'btn-danger' : 'btn-outline'}`}>FAIL</button>
              </div>
            </div>

            {/* Point 6: Water leakage */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: waterLeakage === 0 ? '#ffffff' : '#fef2f2' }}>
              <span style={{ fontWeight: '600', fontSize: '13.5px' }}>6. No Water Leakage or Pooling</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => setWaterLeakage(0)} className={`btn btn-sm ${waterLeakage === 0 ? 'btn-success' : 'btn-outline'}`}>NO LEAK (PASS)</button>
                <button type="button" onClick={() => setWaterLeakage(1)} className={`btn btn-sm ${waterLeakage === 1 ? 'btn-danger' : 'btn-outline'}`}>LEAKAGE FOUND</button>
              </div>
            </div>

            {/* Point 7: Area cleanliness */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--color-border)', backgroundColor: areaCleanliness ? '#ffffff' : '#fef2f2' }}>
              <span style={{ fontWeight: '600', fontSize: '13.5px' }}>7. Drainage Tray Clean & Sanitized</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="button" onClick={() => setAreaCleanliness(1)} className={`btn btn-sm ${areaCleanliness ? 'btn-success' : 'btn-outline'}`}>PASS</button>
                <button type="button" onClick={() => setAreaCleanliness(0)} className={`btn btn-sm ${!areaCleanliness ? 'btn-danger' : 'btn-outline'}`}>FAIL</button>
              </div>
            </div>

          </div>

          <div className="form-group">
            <label className="form-label">Supervisor Remarks / TDS Reading</label>
            <input
              type="text"
              placeholder="e.g. TDS measured at 85 ppm, drain line clear."
              className="form-control"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <button
              type="button"
              onClick={() => setCameraModalOpen(true)}
              className="btn btn-outline"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Camera size={16} />
              <span>{photo ? '✓ Water Hub Photo Attached (Retake)' : 'Capture Live Evidence Photo'}</span>
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
          >
            <Send size={18} />
            <span>{submitting ? 'Submitting Inspection...' : 'Submit Drinking Water Audit'}</span>
          </button>
        </form>
      </div>

      {/* PAST DRINKING WATER AUDITS */}
      <div className="card">
        <div className="card-title">
          <History size={16} />
          <span>Recent Water Hygiene Audits ({pastChecks.length})</span>
        </div>
        <div className="table-responsive">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Water Dispenser Point</th>
                <th>Overall Status</th>
                <th>Auditor</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {pastChecks.map(c => (
                <tr key={c.id}>
                  <td style={{ fontSize: '12px' }}>{new Date(c.created_at).toLocaleString()}</td>
                  <td><strong>{c.point_name}</strong></td>
                  <td>
                    <span className={`badge ${c.status === 'PASS' ? 'badge-success' : 'badge-danger'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>{c.supervisor_name}</td>
                  <td style={{ fontSize: '12.5px' }}>{c.remarks || 'Standard pass'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {cameraModalOpen && (
        <CameraCaptureModal
          isOpen={true}
          onClose={() => setCameraModalOpen(false)}
          sessionId="DW_AUDIT"
          photoType="DRINKING_WATER"
          photoLabel="Drinking Water Point"
          onCaptured={(p) => setPhoto(p)}
        />
      )}

    </div>
  );
}

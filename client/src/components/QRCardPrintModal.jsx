import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { X, Printer, ShieldCheck } from 'lucide-react';

export default function QRCardPrintModal({ isOpen, onClose, toilet }) {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && toilet?.id) {
      setLoading(true);
      api.get(`/qr/image/${toilet.id}`)
        .then(res => setQrData(res))
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, toilet]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ padding: '10px', zIndex: 9999 }}>
      <div 
        className="modal-content" 
        style={{ 
          maxWidth: '390px', 
          maxHeight: '96vh', 
          overflow: 'hidden',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)'
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header no-print" style={{ padding: '10px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} color="var(--color-brand-600)" />
            <h3 className="modal-title" style={{ fontSize: '15px', fontWeight: '800' }}>
              Toilet QR Placard: {toilet?.toilet_uid || toilet?.code}
            </h3>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: '#f1f5f9', 
              border: 'none', 
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer' 
            }}
          >
            <X size={15} color="#64748b" />
          </button>
        </div>

        {/* Body - Scaled to fit screen without ANY vertical scroll */}
        <div className="modal-body" style={{ textAlign: 'center', padding: '12px 16px', overflowY: 'visible' }}>
          {loading ? (
            <div style={{ padding: '30px 20px', color: '#64748b', fontSize: '13px' }}>
              Generating branded QR placard...
            </div>
          ) : (
            /* Printable Placard Card */
            <div 
              id="qr-print-card"
              style={{
                backgroundColor: '#ffffff',
                border: '2.5px solid #0f172a',
                borderRadius: '14px',
                padding: '14px 16px',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                width: '100%',
                boxSizing: 'border-box'
              }}
            >
              {/* Brand Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '16px', fontWeight: '900', letterSpacing: '-0.02em', color: '#0f172a' }}>
                  HYGIENE360
                </span>
              </div>
              <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
                {qrData?.toilet?.plantName || 'MANUFACTURING PLANT'}
              </div>

              {/* Large Toilet Identifier */}
              <div style={{
                fontSize: '17px',
                fontFamily: 'var(--font-mono, monospace)',
                wordBreak: 'break-all',
                fontWeight: '900',
                color: '#0f172a',
                padding: '2px 18px',
                backgroundColor: '#f1f5f9',
                borderRadius: '8px',
                letterSpacing: '-0.02em',
                margin: '2px 0'
              }}>
                {qrData?.toilet?.toiletUid || toilet?.toilet_uid || qrData?.toilet?.code || toilet?.code}
              </div>
              <div style={{ fontSize: '11px', fontWeight: '700', color: '#334155' }}>
                {toilet?.name}{(qrData?.toilet?.gender || toilet?.gender) ? ` • ${String(qrData?.toilet?.gender || toilet?.gender).toUpperCase() === 'FEMALE' ? 'Female' : 'Male'}` : ''}
              </div>
              {(qrData?.toilet?.location || toilet?.area_name) && (
                <div style={{ fontSize: '10px', color: '#64748b', maxWidth: '280px', lineHeight: '1.3' }}>
                  {qrData?.toilet?.location || [toilet?.building_name, toilet?.block_name, toilet?.floor_name, toilet?.area_name].filter(Boolean).join(' / ')}
                </div>
              )}

              {/* QR Image */}
              {qrData?.qrDataUrl && (
                <div style={{
                  padding: '8px',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #e2e8f0',
                  borderRadius: '10px',
                  lineHeight: 0
                }}>
                  <img 
                    src={qrData.qrDataUrl} 
                    alt="Toilet QR" 
                    style={{ width: '155px', height: '155px', display: 'block' }} 
                  />
                </div>
              )}

              {/* Scan Text */}
              <div style={{ fontSize: '11px', fontWeight: '800', color: '#0f172a', letterSpacing: '0.03em', marginTop: '2px' }}>
                SCAN TO CLEAN OR EVALUATE THIS TOILET
              </div>

              <div style={{ fontSize: '9px', color: '#94a3b8', maxWidth: '270px', lineHeight: '1.3' }}>
                Housekeeping: cleaning checksheet • Employees: toilet evaluation
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer no-print" style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onClose} className="btn btn-outline btn-sm" style={{ padding: '6px 14px', fontSize: '12px' }}>
            Close
          </button>
          <button 
            onClick={handlePrint} 
            className="btn btn-primary btn-sm" 
            style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '6px',
              padding: '6px 16px',
              fontSize: '12px'
            }}
          >
            <Printer size={14} />
            <span>Print Placard</span>
          </button>
        </div>

        <style>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            #qr-print-card, #qr-print-card * {
              visibility: visible !important;
            }
            #qr-print-card {
              position: fixed !important;
              left: 50% !important;
              top: 50% !important;
              transform: translate(-50%, -50%) !important;
              width: 360px !important;
              border: 3px solid #000000 !important;
              box-shadow: none !important;
              padding: 24px !important;
            }
            #qr-print-card img {
              width: 220px !important;
              height: 220px !important;
            }
            .no-print {
              display: none !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}

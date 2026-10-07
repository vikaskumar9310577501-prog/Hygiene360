import React, { useState, useEffect } from 'react';
import { ImageOff } from 'lucide-react';
import { photoUrl } from '../utils/api';

export default function EvidencePhoto({ src, alt = 'Evidence', maxHeight = '320px', onClick, style }) {
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  // Try /api/uploads first, then the raw /uploads path as fallback
  const candidates = [photoUrl(src), src].filter((v, i, arr) => v && arr.indexOf(v) === i);

  useEffect(() => {
    setCandidateIdx(0);
    setFailed(false);
  }, [src]);

  if (!src || failed || candidates.length === 0) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px',
        padding: '24px 12px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px dashed #cbd5e1',
        color: '#94a3b8', fontSize: '12px', ...style
      }}>
        <ImageOff size={22} />
        <span>Photo could not be loaded</span>
      </div>
    );
  }

  return (
    <img
      src={candidates[candidateIdx]}
      alt={alt}
      loading="lazy"
      onClick={onClick}
      onError={() => {
        if (candidateIdx < candidates.length - 1) setCandidateIdx(candidateIdx + 1);
        else setFailed(true);
      }}
      style={{
        width: '100%',
        maxHeight,
        objectFit: 'contain',
        borderRadius: '10px',
        backgroundColor: '#f1f5f9',
        display: 'block',
        cursor: onClick ? 'zoom-in' : 'default',
        ...style
      }}
    />
  );
}

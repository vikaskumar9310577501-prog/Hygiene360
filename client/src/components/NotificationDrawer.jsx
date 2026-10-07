import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { appleSound } from '../utils/appleSound';
import { X, Bell, CheckCheck, AlertTriangle, Info, CheckCircle2, Volume2 } from 'lucide-react';

export default function NotificationDrawer({ isOpen, onClose }) {
  const { refreshNotifications } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications');
      setNotifications(res.notifications || []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
      refreshNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const markSingleRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      refreshNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" style={{ justifyContent: 'flex-end', padding: 0 }} onClick={onClose}>
      <div 
        style={{
          width: '100%',
          maxWidth: '420px',
          height: '100%',
          backgroundColor: '#ffffff',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideInRight 0.2s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '18px 20px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--color-primary-50)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={20} color="var(--color-primary-800)" />
            <span style={{ fontWeight: '800', fontSize: '16px', color: 'var(--color-primary-950)' }}>
              Notifications & Alerts
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              onClick={() => appleSound.playAppleChime()} 
              className="btn btn-outline btn-sm"
              style={{ fontSize: '11px', padding: '4px 8px', color: '#0284c7', borderColor: '#bae6fd' }}
              title="Test Apple Notification Chime"
            >
              <Volume2 size={13} />
              <span>Apple Sound</span>
            </button>
            <button 
              onClick={markAllRead} 
              className="btn btn-outline btn-sm"
              style={{ fontSize: '11px', padding: '4px 8px' }}
              title="Mark all as read"
            >
              <CheckCheck size={14} />
              <span>Mark All Read</span>
            </button>
            <button 
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
            >
              <X size={20} color="var(--color-primary-600)" />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-primary-500)' }}>
              Loading alerts...
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-primary-500)' }}>
              No notifications at this time.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {notifications.map(n => {
                const isUnread = !n.is_read;
                return (
                  <div
                    key={n.id}
                    onClick={() => markSingleRead(n.id)}
                    style={{
                      padding: '14px',
                      borderRadius: '10px',
                      border: '1px solid',
                      borderColor: isUnread ? '#38bdf8' : 'var(--color-border)',
                      backgroundColor: isUnread ? '#f0f9ff' : '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {n.type === 'ALERT' || n.type === 'MISSED_CLEANING' ? (
                          <AlertTriangle size={16} color="#dc2626" />
                        ) : n.type === 'ISSUE_RESOLVED' ? (
                          <CheckCircle2 size={16} color="#059669" />
                        ) : (
                          <Info size={16} color="#0284c7" />
                        )}
                        <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--color-primary-950)' }}>
                          {n.title}
                        </span>
                      </div>
                      {isUnread && (
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0284c7' }} />
                      )}
                    </div>
                    <p style={{ fontSize: '12.5px', color: 'var(--color-primary-700)', lineHeight: '1.4' }}>
                      {n.message}
                    </p>
                    <span style={{ fontSize: '10.5px', color: 'var(--color-primary-500)', marginTop: '6px', display: 'block' }}>
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LanguageContext';
import {
  LayoutDashboard,
  Sparkles,
  ClipboardCheck,
  AlertCircle,
  FileSpreadsheet,
  Settings,
  X,
  ShieldCheck,
  LogOut,
  History
} from 'lucide-react';

const ADMINS = ['SUPER_ADMIN', 'IT_ADMIN', 'PLANT_ADMIN'];
const HOUSEKEEPERS = ['HOUSEKEEPING_AGENT', 'HOUSEKEEPING'];

const NAV_SECTIONS = [
  {
    title: 'Dashboard',
    titleKey: 'nav.section.dashboard',
    items: [
      { id: 'management', label: 'Management Dashboard', icon: LayoutDashboard, roles: [...ADMINS, 'MANAGEMENT'] },
      { id: 'admin_module', label: 'Admin Module', icon: ClipboardCheck, roles: [...ADMINS, 'PLANT_HEAD'] },
      { id: 'agent', label: 'My Dashboard', labelKey: 'nav.dashboard', icon: Sparkles, roles: HOUSEKEEPERS, housekeeperOnly: true },
      { id: 'hk_history', label: 'My Cleaning History', labelKey: 'dash.historyTitle', icon: History, roles: HOUSEKEEPERS, housekeeperOnly: true },
      { id: 'agent', label: 'Housekeeping Portal', icon: Sparkles, roles: ADMINS }
    ]
  },
  {
    title: 'Issues',
    titleKey: 'nav.section.issues',
    items: [
      { id: 'hk_complaints', label: 'My Issues', labelKey: 'nav.myIssues', icon: AlertCircle, roles: HOUSEKEEPERS, housekeeperOnly: true }
    ]
  },
  {
    title: 'Reports',
    items: [
      { id: 'reports', label: 'Inspection Reports', icon: FileSpreadsheet, roles: [...ADMINS, 'MANAGEMENT'] }
    ]
  },
  {
    title: 'Settings',
    items: [
      { id: 'admin', label: 'Settings', icon: Settings, roles: ADMINS }
    ]
  }
];

export default function Sidebar({ activeTab, onSelectTab, isOpen, onMouseEnter, onMouseLeave, onClose }) {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const role = user?.role || 'MANAGEMENT';
  const isHousekeeper = HOUSEKEEPERS.includes(role);
  const isSuperOrIT = role === 'SUPER_ADMIN' || role === 'IT_ADMIN';

  const canSee = (item) => {
    if (item.housekeeperOnly) return isHousekeeper;
    if (isSuperOrIT) return true; // IT Admin has universal access
    return item.roles.includes(role) || (isHousekeeper && item.roles.some(r => HOUSEKEEPERS.includes(r)));
  };

  const sections = NAV_SECTIONS
    .map(s => ({ ...s, items: s.items.filter(canSee) }))
    .filter(s => s.items.length > 0);

  return (
    <>
      {/* Backdrop (closes on click) */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(100, 116, 139, 0.25)',
            backdropFilter: 'blur(2px)',
            zIndex: 498,
            transition: 'opacity 0.2s ease',
            touchAction: 'none'
          }}
        />
      )}

      {/* Flyout Sidebar */}
      <aside
        id="hygiene360-sidebar"
        className="sidebar no-print"
        style={{
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          width: 'min(280px, 85vw)',
          backgroundColor: '#ffffff',
          borderRight: '1px solid var(--color-border)',
          color: 'var(--color-primary-900)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 500,
          boxShadow: isOpen ? '8px 0 30px rgba(15, 23, 42, 0.08)' : 'none',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.26s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.26s ease',
          pointerEvents: isOpen ? 'auto' : 'none'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '16px 18px',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'var(--color-bg-soft)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '9px', backgroundColor: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={18} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-primary-900)', letterSpacing: '-0.01em' }}>Hygiene360</div>
              <div style={{ fontSize: '11px', color: 'var(--color-primary-500)' }}>{user?.name}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--color-primary-500)', cursor: 'pointer', padding: '4px', borderRadius: '6px' }}
            title="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Menu Items */}
        <nav style={{ flex: 1, padding: '10px 10px 16px', overflowY: 'auto' }}>
          {sections.map(section => (
            <div key={section.title} style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', padding: '4px 10px 6px' }}>
                {section.titleKey ? t(section.titleKey) : section.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {section.items.map(item => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={`${item.id}-${item.label}`}
                      type="button"
                      onClick={() => {
                        onSelectTab(item.id);
                        if (onClose) onClose();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '11px',
                        padding: '10px 12px',
                        minHeight: '42px',
                        borderRadius: '9px',
                        border: 'none',
                        background: isActive ? '#f0f9ff' : 'transparent',
                        boxShadow: isActive ? 'inset 3px 0 0 #0284c7' : 'none',
                        color: isActive ? '#0369a1' : 'var(--color-primary-700)',
                        fontSize: '13.5px',
                        fontWeight: isActive ? 700 : 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s ease',
                        WebkitTapHighlightColor: 'transparent',
                        touchAction: 'manipulation'
                      }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = '#f8fafc'; }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <Icon size={18} color={isActive ? '#0284c7' : '#94a3b8'} strokeWidth={isActive ? 2.2 : 1.8} />
                      <span style={{ flex: 1 }}>{item.labelKey ? t(item.labelKey) : item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div style={{ padding: '10px', borderTop: '1px solid var(--color-border)' }}>
          <button
            type="button"
            onClick={() => { if (onClose) onClose(); logout(); }}
            style={{ display: 'flex', alignItems: 'center', gap: '11px', width: '100%', padding: '10px 12px', minHeight: '42px', borderRadius: '9px', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: '13.5px', fontWeight: 700, cursor: 'pointer', touchAction: 'manipulation' }}
          >
            <LogOut size={18} />
            <span>{t('nav.logout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}

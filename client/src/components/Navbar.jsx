import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../i18n/LanguageContext';
import { 
  Languages,
  ShieldCheck, 
  Bell, 
  LogOut, 
  Building2, 
  ChevronDown, 
  Menu,
  Calendar,
  FileSpreadsheet,
  Filter,
  MapPin,
  X,
  LayoutDashboard,
  History,
  ShieldAlert,
  Clock,
  Download
} from 'lucide-react';

const ADMIN_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'history', label: 'History', icon: History },
  { id: 'complaints', label: 'Complaints', icon: ShieldAlert },
  { id: 'timings', label: 'Cleaning Timings', icon: Clock }
];

export default function Navbar({ activeTab, adminTab, onAdminTabChange, onOpenQRScanner, onOpenNotifications, onToggleSidebar, onOpenSidebar }) {
  const { 
    user, 
    logout, 
    plants, 
    activePlantId, 
    changePlant, 
    dateFilter, 
    setDateFilter, 
    unreadCount 
  } = useAuth();
  const { lang, canChoose, setLang, t } = useLang();

  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExportCSV = () => {
    window.location.href = `/api/reports/export-csv?plantId=${activePlantId || 'all'}&date=${dateFilter}`;
  };

  const activePlant = plants?.find(p => String(p.id) === String(activePlantId));
  const activePlantLabel = activePlant ? activePlant.name.replace('Manufacturing Plant', 'Plant') : 'All Plants';
  const isAdminModule = activeTab === 'admin_module';
  const isHousekeeper = user?.role === 'HOUSEKEEPING_AGENT' || user?.role === 'HOUSEKEEPING';
  const MODULE_NAMES = {
    management: 'Management Dashboard',
    admin_module: 'Admin Module',
    agent: isHousekeeper ? null : 'Housekeeping Portal',
    cleaning_workflow: t('cw.title'),
    complaint_portal: 'Raise Complaint',
    'complaint-portal': 'Raise Complaint',
    'complaints-reports': 'My Complaints',
    hk_complaints: t('nav.myIssues'),
    hk_history: t('dash.historyTitle'),
    issues: 'Issue Tracking',
    'drinking-water': 'Drinking Water',
    reports: 'Inspection Reports',
    admin: 'Settings',
    'audit-logs': 'Settings'
  };
  const moduleName = MODULE_NAMES[activeTab]
    || (String(activeTab || '').startsWith('admin_') ? 'Settings' : null)
    || (user?.role === 'EMPLOYEE' ? 'My Complaints' : null);
  const locations = [...new Set((plants || []).map(p => p.location).filter(Boolean))].sort();
  const activeLocation = activePlant?.location || 'all';
  const plantsInLocation = (plants || []).filter(p => activeLocation === 'all' || p.location === activeLocation);

  const handleLocationChange = (loc) => {
    if (loc === 'all') { changePlant('all'); return; }
    const first = (plants || []).find(p => p.location === loc);
    if (first) changePlant(first.id);
  };

  const filterBlock = (
    <div ref={filterRef} style={{ position: 'relative' }} className="navbar-desktop-only">
      <button 
        onClick={() => setFilterOpen(!filterOpen)}
        className="btn btn-outline btn-sm"
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '6px', 
          padding: '5px 12px', 
          fontSize: '12px', 
          borderRadius: '6px',
          backgroundColor: (activePlantId && activePlantId !== 'all') ? '#f0f9ff' : '#ffffff',
          borderColor: (activePlantId && activePlantId !== 'all') ? '#38bdf8' : 'var(--color-border)',
          fontWeight: '600'
        }}
        title={`Filter by Plant and Date (${activePlantLabel} • ${dateFilter})`}
      >
        <Filter size={13} color="#0284c7" />
        <span style={{ color: 'var(--color-primary-900)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activePlant ? `${activePlant.location ? `${activePlant.location} • ` : ''}${activePlantLabel}` : 'All Plants'}
        </span>
        <ChevronDown size={12} color="#64748b" />
      </button>

      {/* Filter Dropdown Popup */}
      {filterOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '6px',
          width: '290px',
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--color-border)',
          padding: '14px',
          zIndex: 300
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--color-border)', paddingBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={14} color="#0284c7" />
              <strong style={{ fontSize: '13px', color: 'var(--color-primary-950)' }}>Filter</strong>
            </div>
            <button 
              onClick={() => setFilterOpen(false)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Location */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: '700', color: 'var(--color-primary-800)', marginBottom: '5px' }}>
              <MapPin size={13} color="#0284c7" />
              <span>Location</span>
            </label>
            <select
              value={activeLocation}
              onChange={(e) => handleLocationChange(e.target.value)}
              className="form-control"
              style={{ fontSize: '12px', height: '32px', width: '100%', padding: '4px 8px' }}
            >
              <option value="all">All Locations</option>
              {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </div>

          {/* Plant */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: '700', color: 'var(--color-primary-800)', marginBottom: '5px' }}>
              <Building2 size={13} color="#0284c7" />
              <span>Plant</span>
            </label>
            <select
              value={activePlantId || 'all'}
              onChange={(e) => changePlant(e.target.value)}
              className="form-control"
              style={{ fontSize: '12px', height: '32px', width: '100%', padding: '4px 8px' }}
            >
              {activeLocation === 'all' && <option value="all">All Plants</option>}
              {plantsInLocation.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.name} {p.code ? `(${p.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Inspection Date */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', fontWeight: '700', color: 'var(--color-primary-800)', marginBottom: '5px' }}>
              <Calendar size={13} color="#0284c7" />
              <span>Date</span>
            </label>
            <input 
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="form-control"
              style={{ fontSize: '12px', height: '32px', width: '100%', padding: '4px 8px' }}
            />
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', borderTop: '1px solid var(--color-border)', paddingTop: '10px' }}>
            <button
              onClick={() => {
                changePlant('all');
                setDateFilter(new Date().toLocaleDateString('en-CA'));
              }}
              className="btn btn-outline btn-sm"
              style={{ fontSize: '11px', padding: '3px 8px' }}
            >
              Reset All
            </button>
            <button
              onClick={() => setFilterOpen(false)}
              className="btn btn-primary btn-sm"
              style={{ fontSize: '11px', padding: '3px 12px' }}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <header className="navbar no-print" style={{
      height: '50px',
      backgroundColor: '#ffffff',
      borderBottom: '1px solid var(--color-border)',
      padding: '0 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Left: Brand & Mobile Sidebar Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 1, minWidth: 0 }}>
        <button 
          onClick={onToggleSidebar}
          onMouseEnter={onOpenSidebar}
          className="btn btn-outline btn-sm navbar-menu-btn"
          style={{ padding: '4px 6px', border: 'none' }}
          title="Menu (Hover or click to open navigation)"
        >
          <Menu size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
          <div style={{
            flexShrink: 0,
            width: '28px',
            height: '28px',
            borderRadius: '7px',
            backgroundColor: '#e0f2fe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0284c7'
          }}>
            <ShieldCheck size={17} strokeWidth={2.4} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
            <span className="navbar-desktop-only" style={{ fontSize: '15px', fontWeight: '800', letterSpacing: '-0.02em', color: 'var(--color-primary-900)', whiteSpace: 'nowrap' }}>
              Hygiene360
            </span>
            {moduleName && (
              <>
                <span className="navbar-desktop-only" style={{ color: '#cbd5e1', fontWeight: 700 }}>/</span>
                <span className={`navbar-module-name${isAdminModule ? ' navbar-desktop-only' : ''}`} style={{ fontSize: '14px', fontWeight: '800', color: '#0284c7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                  {moduleName}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {isAdminModule ? (
        <nav className="navbar-admin-tabs" style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', alignItems: 'stretch', justifyContent: 'center', gap: '2px', overflowX: 'auto', margin: '0 10px', scrollbarWidth: 'none' }}>
          {ADMIN_TABS.map(t => {
            const Icon = t.icon;
            const active = (adminTab || 'dashboard') === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onAdminTabChange?.(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px', border: 'none',
                  borderBottom: active ? '3px solid #0284c7' : '3px solid transparent', borderTop: '3px solid transparent',
                  background: 'none', color: active ? '#0284c7' : '#475569', fontWeight: active ? 800 : 600,
                  fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0
                }}
              >
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </nav>
      ) : (
        <div style={{ flex: 1, minWidth: '6px' }} />
      )}

      {/* Right: Filter (+ Export CSV / Download Excel outside Admin Module), Notifications, User Profile, Logout */}
      <div className="navbar-right" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {filterBlock}
        {activeTab === 'reports' ? (
          <button
            onClick={() => window.dispatchEvent(new Event('reports:download-excel'))}
            className="btn btn-primary btn-sm"
            style={{ fontSize: '11.5px', padding: '5px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
            title="Download the selected report as an Excel file"
          >
            <Download size={13} />
            <span>Download Excel</span>
          </button>
        ) : !isAdminModule && (
          <button 
            onClick={handleExportCSV}
            className="btn btn-outline btn-sm navbar-desktop-only"
            style={{ fontSize: '11.5px', padding: '5px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}
            title="Export CSV data"
          >
            <FileSpreadsheet size={13} />
            <span>Export CSV</span>
          </button>
        )}
        
        {canChoose && (
          <button
            type="button"
            onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')}
            title={t('lang.switchTitle')}
            id="btn-language-toggle"
            className="navbar-lang-btn"
            style={{
              border: '1px solid #bae6fd',
              background: '#f0f9ff',
              color: '#0369a1',
              borderRadius: '999px',
              padding: '4px 11px',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              touchAction: 'manipulation'
            }}
          >
            <Languages size={14} />
            <span>{t('lang.switch')}</span>
          </button>
        )}

        {/* Notification Bell */}
        <button 
          onClick={onOpenNotifications}
          style={{
            position: 'relative',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '6px',
            color: 'var(--color-primary-700)',
            display: 'flex',
            alignItems: 'center'
          }}
          title="Notifications & Alerts"
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '0px',
              right: '0px',
              width: '15px',
              height: '15px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-danger-600)',
              color: '#ffffff',
              fontSize: '9px',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {unreadCount}
            </span>
          )}
        </button>

        {/* User Info */}
        {user && (
          <div className="navbar-desktop-only" style={{ position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '3px 6px',
                borderRadius: '6px'
              }}
            >
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: '#e0f2fe',
                color: '#0369a1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '11px',
                flexShrink: 0
              }}>
                {user.name.charAt(0)}
              </div>
              <div className="navbar-desktop-only" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary-950)', whiteSpace: 'nowrap' }}>
                  {user.name}
                </span>
                <span style={{ fontSize: '9.5px', fontWeight: '700', color: '#0284c7', whiteSpace: 'nowrap' }}>
                  {user.role === 'SUPER_ADMIN' || user.role === 'IT_ADMIN' 
                    ? 'IT ADMIN' 
                    : user.role === 'HOUSEKEEPING_AGENT' 
                      ? 'HOUSEKEEPING' 
                      : user.role === 'PLANT_ADMIN'
                        ? 'ADMIN'
                        : user.role.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Logout Button */}
        <button 
          onClick={logout}
          className="btn btn-outline btn-sm"
          style={{ padding: '5px 8px', flexShrink: 0, color: '#b91c1c', borderColor: '#fecaca' }}
          title="Logout"
          aria-label="Logout"
        >
          <LogOut size={15} />
        </button>

      </div>
    </header>
  );
}

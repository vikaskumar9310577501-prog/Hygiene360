import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLang } from './i18n/LanguageContext';
import { api } from './utils/api';
import { appleSound } from './utils/appleSound';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import NotificationDrawer from './components/NotificationDrawer';
import NotificationToast from './components/NotificationToast';
import QRScannerModal from './components/QRScannerModal';
import ToiletDetailModal from './components/ToiletDetailModal';
import IssueDetailModal from './components/IssueDetailModal';

import Login from './pages/Login';
import ManagementDashboard from './pages/ManagementDashboard';
import AgentDashboard from './pages/AgentDashboard';
import HousekeeperHistory from './pages/HousekeeperHistory';
import CleaningWorkflow from './pages/CleaningWorkflow';
import DrinkingWaterWorkflow from './pages/DrinkingWaterWorkflow';
import IssuesManagement from './pages/IssuesManagement';
import Reports from './pages/Reports';
import AuditLogs from './pages/AuditLogs';
import AdminSettings from './pages/AdminSettings';
import ComplaintReportPortal from './pages/ComplaintReportPortal';
import ComplaintsReports from './pages/ComplaintsReports';
import AdminModule from './pages/AdminModule';
import HousekeeperComplaints from './pages/HousekeeperComplaints';

import { ChevronRight, Sparkles, Camera, ShieldAlert, Menu, ClipboardList } from 'lucide-react';

// Sidebar entries that open a specific tab of the Settings page
const ADMIN_SETTINGS_TABS = { admin: 'qr_master', admin_qr: 'qr_master', admin_plants: 'plants', admin_users: 'users' };

function AppContent() {
  const { user, loading, changePlant } = useAuth();
  const { t } = useLang();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('management');
  const [adminTab, setAdminTab] = useState('dashboard');
  
  // Modals state
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [detailToiletId, setDetailToiletId] = useState(null);
  const [selectedIssueId, setSelectedIssueId] = useState(null);

  // Active Workflows
  const [activeCleaningToilet, setActiveCleaningToilet] = useState(null);
  const [activeComplaintToilet, setActiveComplaintToilet] = useState(null);
  const [drinkingWaterParams, setDrinkingWaterParams] = useState(null);

  // Global In-App Notification Toast state & Apple Chime
  const [latestNotification, setLatestNotification] = useState(null);
  const lastKnownNotifIdRef = React.useRef(null);
  const [issuesRefreshKey, setIssuesRefreshKey] = useState(0);

  // Mobile browsers block audio until the first user gesture; unlock the chime context on first tap
  React.useEffect(() => {
    const unlock = () => {
      appleSound.getAudioContext();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  // Auto-switch initial tab based on role
  React.useEffect(() => {
    setActiveCleaningToilet(null);
    setSelectedIssueId(null);
    if (user) {
      if (user.role === 'HOUSEKEEPING_AGENT' || user.role === 'HOUSEKEEPING') {
        setActiveTab('agent');
      } else if (user.role === 'PLANT_ADMIN' || user.role === 'PLANT_HEAD') {
        setActiveTab('admin_module');
      } else if (user.role === 'EMPLOYEE') {
        setActiveTab('complaints-reports');
      } else if (user.role === 'SUPERVISOR') {
        setActiveTab('issues');
      } else {
        setActiveTab('management');
      }
    }
  }, [user?.id, user?.role]);

  // Live polling for incoming complaints to notify Housekeeping staff with Apple notification sound
  React.useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const pollNotifications = async () => {
      try {
        const res = await api.get('/notifications');
        const notifs = res.notifications || [];
        if (!isMounted) return;

        if (notifs.length > 0) {
          const newest = notifs[0];
          if (lastKnownNotifIdRef.current === null) {
            lastKnownNotifIdRef.current = newest.id;
          } else if (newest.id > lastKnownNotifIdRef.current) {
            lastKnownNotifIdRef.current = newest.id;
            // Trigger in-app toast & Apple notification sound!
            setLatestNotification(newest);
            setIssuesRefreshKey(k => k + 1);
          }
        }
      } catch (e) {}
    };

    pollNotifications();
    const interval = setInterval(pollNotifications, 3500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user?.id]);

  const handleToastAction = (notif) => {
    let meta = {};
    try {
      meta = typeof notif.metadata_json === 'string' ? JSON.parse(notif.metadata_json) : (notif.metadata_json || {});
    } catch (e) {}

    const isAdminRole = ['SUPER_ADMIN', 'IT_ADMIN', 'PLANT_ADMIN', 'PLANT_HEAD'].includes(user?.role);
    const isHousekeeperRole = user?.role === 'HOUSEKEEPING_AGENT' || user?.role === 'HOUSEKEEPING';

    if (meta.issue_id) {
      setSelectedIssueId(meta.issue_id);
    } else if (isAdminRole && (notif.type === 'APPROVAL_REQUEST' || notif.type === 'LATE_SUBMIT' || String(notif.type || '').startsWith('SLOT_'))) {
      setActiveCleaningToilet(null);
      setActiveComplaintToilet(null);
      setActiveTab('admin_module');
    } else if (isHousekeeperRole && notif.type === 'CLEANING_REJECTED') {
      setActiveCleaningToilet(null);
      setActiveTab('hk_complaints');
    } else if (isHousekeeperRole && (String(notif.type || '').startsWith('SLOT_') || String(notif.type || '').startsWith('CLEANING_'))) {
      setActiveCleaningToilet(null);
      setActiveTab('agent');
    } else {
      setActiveTab('complaints-reports');
    }
  };

  // 1. Mouse movement tracking (Desktop only): Left edge hover opens sidebar, moving far away closes it
  React.useEffect(() => {
    // Only enable on desktop screens
    if (typeof window === 'undefined' || window.innerWidth <= 768) return;

    const handleMouseMove = (e) => {
      // When cursor moves to the extreme left edge (<= 20px) -> open sidebar
      if (!sidebarOpen && e.clientX <= 20) {
        setSidebarOpen(true);
      } 
      // When cursor moves far away past sidebar boundary (> 360px) -> close sidebar
      else if (sidebarOpen && e.clientX > 360) {
        setSidebarOpen(false);
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [sidebarOpen]);

  // 2. Auto-close sidebar on screen scroll (Desktop only - keep open on mobile touch)
  React.useEffect(() => {
    if (!sidebarOpen || window.innerWidth <= 768) return;

    const handleScrollClose = (e) => {
      // If user scrolls inside the sidebar itself, keep it open
      const sidebarEl = document.getElementById('hygiene360-sidebar');
      if (sidebarEl && e.target && sidebarEl.contains(e.target)) {
        return;
      }
      setSidebarOpen(false);
    };

    window.addEventListener('scroll', handleScrollClose, { capture: true, passive: true });
    window.addEventListener('wheel', handleScrollClose, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScrollClose, { capture: true });
      window.removeEventListener('wheel', handleScrollClose);
    };
  }, [sidebarOpen]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-bg-app)', color: 'var(--color-primary-900)' }}>
        <div style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em' }}>
          Hygiene360
        </div>
      </div>
    );
  }

  // A QR scanned with any phone scanner opens /complaint?t=<Toilet ID> — no login needed
  if (window.location.pathname.startsWith('/complaint')) {
    const publicToken = new URLSearchParams(window.location.search).get('t') || '';
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-bg-app)' }}>
        <ComplaintReportPortal publicToken={publicToken} />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  // Scanning inside the app always opens the housekeeping cleaning form
  const handleQRValidated = (validationResult) => {
    setActiveCleaningToilet({ ...validationResult.toilet, areaToilets: validationResult.areaToilets || [] });
    setActiveTab('cleaning_workflow');
    setSidebarOpen(false);
  };

  const handleStartCleaning = (toilet) => {
    setActiveCleaningToilet(toilet);
    setActiveTab('cleaning_workflow');
    setSidebarOpen(false);
  };

  const handleCleanCompleted = () => {
    setActiveCleaningToilet(null);
    if (user.role === 'EMPLOYEE') {
      setActiveTab('complaints-reports');
    } else {
      setActiveTab((user.role === 'HOUSEKEEPING_AGENT' || user.role === 'HOUSEKEEPING') ? 'agent' : 'management');
    }
    setSidebarOpen(false);
  };

  return (
    <div className="app-container">
      {/* Left Edge Mouse Zone: When mouse moves to left side, auto-open sidebar */}
      <div
        className="sidebar-edge-sensor"
        onMouseEnter={() => setSidebarOpen(true)}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          width: '24px',
          zIndex: 490,
          cursor: 'pointer'
        }}
        title="Hover to open navigation"
      />

      {/* Edge Indicator Tab for intuitive affordance */}
      {!sidebarOpen && (
        <div
          className="sidebar-edge-sensor"
          onMouseEnter={() => setSidebarOpen(true)}
          onClick={() => setSidebarOpen(true)}
          style={{
            position: 'fixed',
            left: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: '18px',
            height: '64px',
            backgroundColor: '#ffffff',
            border: '1px solid var(--color-border)',
            borderLeft: 'none',
            borderTopRightRadius: '8px',
            borderBottomRightRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0284c7',
            cursor: 'pointer',
            zIndex: 492,
            boxShadow: '2px 0 8px rgba(15,23,42,0.06)',
            transition: 'width 0.15s ease'
          }}
          title="Hover to open menu"
        >
          <ChevronRight size={14} />
        </div>
      )}

      {/* Flyout Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        onSelectTab={(tab) => {
          setActiveCleaningToilet(null);
          setActiveComplaintToilet(null);
          setActiveTab(tab);
          setSidebarOpen(false);
        }}
        isOpen={sidebarOpen}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="main-content">
        {/* Top Navbar */}
        <Navbar 
          activeTab={activeTab}
          adminTab={adminTab}
          onAdminTabChange={setAdminTab}
          onOpenQRScanner={() => setQrModalOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onOpenSidebar={() => setSidebarOpen(true)}
        />

        {/* Dynamic Main Body Content */}
        <main style={{ flex: 1 }}>
          {activeTab === 'cleaning_workflow' && activeCleaningToilet ? (
            <CleaningWorkflow
              toilet={activeCleaningToilet}
              onBack={() => {
                const wasRedo = !!activeCleaningToilet.redoOf;
                setActiveCleaningToilet(null);
                setActiveTab(wasRedo ? 'hk_complaints' : (user.role === 'HOUSEKEEPING_AGENT' || user.role === 'HOUSEKEEPING') ? 'agent' : 'management');
              }}
              onComplete={handleCleanCompleted}
            />
          ) : activeTab === 'complaint_portal' || activeTab === 'complaint-portal' ? (
            <ComplaintReportPortal
              initialToilet={activeComplaintToilet}
              onBack={() => {
                setActiveComplaintToilet(null);
                if (user.role === 'EMPLOYEE') {
                  setActiveTab('complaints-reports');
                } else {
                  setActiveTab((user.role === 'HOUSEKEEPING_AGENT' || user.role === 'HOUSEKEEPING') ? 'agent' : 'complaints-reports');
                }
              }}
              onComplete={() => {
                setActiveComplaintToilet(null);
                if (user.role === 'EMPLOYEE') {
                  setActiveTab('complaints-reports');
                }
              }}
            />
          ) : activeTab === 'complaints-reports' ? (
            <ComplaintsReports
              onOpenComplaintPortal={() => setActiveTab('complaint_portal')}
              onSelectToilet={(id) => setDetailToiletId(id)}
            />
          ) : user.role === 'EMPLOYEE' ? (
            /* Complainant / Employee MUST NOT see Housekeeper Dashboard or Management Dashboard */
            <ComplaintsReports
              onOpenComplaintPortal={() => setActiveTab('complaint_portal')}
              onSelectToilet={(id) => setDetailToiletId(id)}
            />
          ) : activeTab === 'admin_module' && ['SUPER_ADMIN', 'IT_ADMIN', 'PLANT_ADMIN', 'PLANT_HEAD'].includes(user.role) ? (
            <AdminModule
              tab={adminTab}
              refreshKey={issuesRefreshKey}
              onSelectToilet={(id) => setDetailToiletId(id)}
              onOpenComplaintPortal={() => setActiveTab('complaint_portal')}
            />
          ) : activeTab === 'hk_complaints' ? (
            <HousekeeperComplaints
              onSelectIssue={(id) => setSelectedIssueId(id)}
              refreshKey={issuesRefreshKey}
            />
          ) : activeTab === 'hk_history' ? (
            <HousekeeperHistory
              onSelectIssue={(id) => setSelectedIssueId(id)}
              refreshKey={issuesRefreshKey}
            />
          ) : activeTab === 'agent' ? (
            <AgentDashboard
              onOpenQRScanner={() => setQrModalOpen(true)}
              onOpenComplaints={() => setActiveTab('hk_complaints')}
              onSelectIssue={(id) => setSelectedIssueId(id)}
              refreshKey={issuesRefreshKey}
            />
          ) : activeTab === 'issues' ? (
            <IssuesManagement
              onSelectToilet={(id) => setDetailToiletId(id)}
            />
          ) : activeTab === 'drinking-water' ? (
            <DrinkingWaterWorkflow
              initialParams={drinkingWaterParams}
              onBack={() => setActiveTab('management')}
              onComplete={() => setActiveTab('management')}
            />
          ) : activeTab === 'reports' ? (
            <Reports />
          ) : activeTab === 'audit-logs' ? (
            <AdminSettings initialTab="audit_logs" />
          ) : ADMIN_SETTINGS_TABS[activeTab] ? (
            <AdminSettings initialTab={ADMIN_SETTINGS_TABS[activeTab]} />
          ) : (user.role === 'HOUSEKEEPING_AGENT' || user.role === 'HOUSEKEEPING') ? (
            <AgentDashboard
              onOpenQRScanner={() => setQrModalOpen(true)}
              onOpenComplaints={() => setActiveTab('hk_complaints')}
              onSelectIssue={(id) => setSelectedIssueId(id)}
              refreshKey={issuesRefreshKey}
            />
          ) : (
            <ManagementDashboard
              onSelectToilet={(id) => setDetailToiletId(id)}
            />
          )}
        </main>

        {/* Mobile App Bottom Navigation Bar (Visible only on mobile screens <= 768px) */}
        <div 
          className="mobile-bottom-nav no-print"
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: '62px',
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            boxShadow: '0 -4px 15px rgba(0,0,0,0.06)',
            zIndex: 480,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            padding: '0 12px',
            boxSizing: 'border-box'
          }}
        >
          {/* 1. Camera / Scan QR on the LEFT */}
          <button
            type="button"
            onClick={() => setQrModalOpen(true)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              color: '#0284c7',
              cursor: 'pointer',
              padding: '4px 0',
              fontSize: '11px',
              fontWeight: '800',
              touchAction: 'manipulation'
            }}
            title="Scan Toilet QR Code"
            id="btn-bottom-camera-scan"
          >
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 3px 10px rgba(2, 132, 199, 0.35)',
              marginBottom: '2px'
            }}>
              <Camera size={20} />
            </div>
            <span>{t('nav.scan')}</span>
          </button>

          {/* 2. Cleaning / Home / Complaints Tab in Center */}
          <button
            type="button"
            onClick={() => {
              setActiveCleaningToilet(null);
              setActiveComplaintToilet(null);
              if (user.role === 'EMPLOYEE') {
                setActiveTab('complaints-reports');
              } else if (user.role === 'HOUSEKEEPING_AGENT' || user.role === 'HOUSEKEEPING') {
                setActiveTab('agent');
              } else if (user.role === 'PLANT_ADMIN' || user.role === 'PLANT_HEAD') {
                setActiveTab('admin_module');
              } else if (user.role === 'SUPERVISOR') {
                setActiveTab('issues');
              } else {
                setActiveTab('management');
              }
            }}
            className={(
              (user.role === 'EMPLOYEE' && (activeTab === 'complaints-reports' || activeTab === 'complaint_portal')) ||
              (user.role !== 'EMPLOYEE' && (activeTab === 'agent' || activeTab === 'cleaning_workflow' || activeTab === 'management' || activeTab === 'admin_module'))
            ) ? 'bottom-nav-btn-active' : ''}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: (
                (user.role === 'EMPLOYEE' && (activeTab === 'complaints-reports' || activeTab === 'complaint_portal')) ||
                (user.role !== 'EMPLOYEE' && (activeTab === 'agent' || activeTab === 'cleaning_workflow' || activeTab === 'management'))
              ) 
                ? 'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%)' 
                : 'none',
              border: 'none',
              borderRadius: '12px',
              color: (
                (user.role === 'EMPLOYEE' && (activeTab === 'complaints-reports' || activeTab === 'complaint_portal')) ||
                (user.role !== 'EMPLOYEE' && (activeTab === 'agent' || activeTab === 'cleaning_workflow' || activeTab === 'management'))
              ) ? '#0284c7' : '#64748b',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: '700',
              touchAction: 'manipulation',
              transition: 'all 0.15s ease'
            }}
            id="btn-bottom-cleaning-home"
          >
            {user.role === 'EMPLOYEE' ? <ClipboardList size={22} /> : <Sparkles size={22} />}
            <span style={{ marginTop: '3px' }}>
              {user.role === 'EMPLOYEE' ? 'Complaints' : (user.role === 'HOUSEKEEPING_AGENT' || user.role === 'HOUSEKEEPING') ? t('nav.cleaning') : user.role === 'SUPERVISOR' ? 'Issues' : 'Home'}
            </span>
          </button>

          {/* 3. Menu Drawer Toggle on the RIGHT */}
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={sidebarOpen ? 'bottom-nav-btn-active' : ''}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: sidebarOpen ? 'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%)' : 'none',
              border: 'none',
              borderRadius: '12px',
              color: sidebarOpen ? '#0284c7' : '#64748b',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: '700',
              touchAction: 'manipulation',
              transition: 'all 0.15s ease'
            }}
            id="btn-bottom-menu"
          >
            <Menu size={22} />
            <span style={{ marginTop: '3px' }}>{t('nav.menu')}</span>
          </button>
        </div>
      </div>

      {/* Global Modals */}
      <QRScannerModal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        onValidated={handleQRValidated}
      />

      <NotificationDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
      />

      {detailToiletId && (
        <ToiletDetailModal
          isOpen={true}
          onClose={() => setDetailToiletId(null)}
          toiletId={detailToiletId}
        />
      )}

      {selectedIssueId && (
        <IssueDetailModal
          isOpen={true}
          onClose={() => setSelectedIssueId(null)}
          issueId={selectedIssueId}
          onIssueUpdated={() => setIssuesRefreshKey(k => k + 1)}
          onRedoCleaning={handleStartCleaning}
        />
      )}

      {/* Floating Apple-Style In-App Notification Toast */}
      <NotificationToast
        latestNotification={latestNotification}
        onActionClick={handleToastAction}
        onDismiss={() => setLatestNotification(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </AuthProvider>
  );
}

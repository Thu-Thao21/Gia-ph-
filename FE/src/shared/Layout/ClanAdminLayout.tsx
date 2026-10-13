import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { TopBar } from '../dashboard/TopBar/TopBar';
import Sidebar from '../dashboard/Sidebar/Sidebar';
import "./SystemAdminLayout.css";

// Import ảnh nền
import nenanImg from '../../assets/nenan.png';

// Mapping router path to sidebar tab ids
const ROUTE_TO_TAB: Record<string, string> = {
  '/clan-admin/dashboard': 'dashboard',
  // Dòng họ
  '/clan-admin/family-profile': 'family-profile',
  '/clan-admin/ancestors': 'ancestors',
  '/clan-admin/branches': 'branches',
  '/clan-admin/genealogy-tree': 'genealogy-tree',
  '/clan-admin/search': 'search',
  // Thành viên
  '/clan-admin/persons': 'persons',
  '/clan-admin/members': 'members',
  '/clan-admin/family-admins': 'family-admins',
  '/clan-admin/approvals': 'approvals',
  // Liên họ
  '/clan-admin/inter-family': 'inter-family',
  // Hoạt động
  '/clan-admin/memorial-days': 'memorial-days',
  '/clan-admin/events': 'events',
  '/clan-admin/funds': 'funds',
  // Tư liệu
  '/clan-admin/archives': 'archives',
  '/clan-admin/3d-library': '3d-library',
  // AI
  '/clan-admin/ai': 'ai',
  // Không gian thờ
  '/clan-admin/worship-space': 'worship-space',
  // Dữ liệu
  '/clan-admin/import-export': 'import-export',
  '/clan-admin/backup': 'backup',
  '/clan-admin/audit-logs': 'audit-logs',
  // Quản trị
  '/clan-admin/business': 'business',
  '/clan-admin/privacy': 'privacy',
  '/clan-admin/profile': 'my-profile',
  '/clan-admin/settings': 'account-settings',
};

const TAB_TO_ROUTE: Record<string, string> = {
  'dashboard': '/clan-admin/dashboard',
  'family-profile': '/clan-admin/family-profile',
  'ancestors': '/clan-admin/ancestors',
  'branches': '/clan-admin/branches',
  'genealogy-tree': '/clan-admin/genealogy-tree',
  'search': '/clan-admin/search',
  'persons': '/clan-admin/persons',
  'members': '/clan-admin/members',
  'family-admins': '/clan-admin/family-admins',
  'approvals': '/clan-admin/approvals',
  'inter-family': '/clan-admin/inter-family',
  'memorial-days': '/clan-admin/memorial-days',
  'events': '/clan-admin/events',
  'funds': '/clan-admin/funds',
  'archives': '/clan-admin/archives',
  '3d-library': '/clan-admin/3d-library',
  'ai': '/clan-admin/ai',
  'worship-space': '/clan-admin/worship-space',
  'import-export': '/clan-admin/import-export',
  'backup': '/clan-admin/backup',
  'audit-logs': '/clan-admin/audit-logs',
  'business': '/clan-admin/business',
  'privacy': '/clan-admin/privacy',
  'my-profile': '/clan-admin/profile',
  'account-settings': '/clan-admin/settings',
};

export const ClanAdminLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Sync route -> tab
  useEffect(() => {
    const tabId = ROUTE_TO_TAB[location.pathname] || 'dashboard';
    setActiveTab(tabId);
  }, [location.pathname]);

  // Sync tab -> route
  const handleSelectTab = (tabId: string) => {
    setActiveTab(tabId);
    const route = TAB_TO_ROUTE[tabId];
    if (route) {
      navigate(route);
    } else {
      console.log('No route mapped for tab:', tabId);
    }
  };

  const handleLogout = () => {
    console.log('Logout clicked');
  };

  if (location.pathname === '/') {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="dashboard-page-container">
      <TopBar
        userName="Trưởng tộc"
        userRole="Admin"
        onLogout={handleLogout}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onNavigateTab={handleSelectTab}
      />

      <div className="dashboard-body-row">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          isCollapsed={isSidebarCollapsed}
          userRole="Admin"
          variant="clan"
        />

        <main
          className={`dashboard-main-content ${
            isSidebarCollapsed ? 'collapsed-sidebar' : 'expanded-sidebar'
          }`}
          style={{ position: 'relative' }}
        >
          {/* Ảnh nền chìm (Watermark) */}
          <div 
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${nenanImg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              backgroundAttachment: 'fixed',
              opacity: 0.15, // Độ mờ của ảnh chìm
              pointerEvents: 'none',
              zIndex: 0
            }}
          />
          <div className="main-content-inner" style={{ position: 'relative', zIndex: 1, height: '100%' }}>
            <Outlet />
          </div>
        </main>
      </div>

      <footer className="dashboard-footer">
        <div className="dashboard-footer-inner">
          <strong className="dashboard-footer-brand">MULTI-FAMILY GENEALOGY SYSTEM</strong> © 2026 •
          Số hóa & Gắn kết các dòng họ Việt Nam.
        </div>
      </footer>
    </div>
  );
};

export default ClanAdminLayout;

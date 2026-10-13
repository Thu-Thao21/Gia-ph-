import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { TopBar } from '../dashboard/TopBar/TopBar';
import { Sidebar } from '../dashboard/Sidebar/Sidebar';
import { useAuth } from '../../hooks/useAuth';
import nenanImg from '../../assets/nenan.png';
import './SystemAdminLayout.css';
import { ROUTES } from '../../config/routes';

const ROUTE_TO_TAB: Array<[string, string]> = [
  [ROUTES.ADMIN.BUSINESS_REQUESTS, 'admin-business-requests'],
  [ROUTES.ADMIN.BUSINESSES,        'admin-businesses'],
  [ROUTES.ADMIN.MANAGER_TRANSFER,  'admin-manager-transfer'],
  [ROUTES.ADMIN.PLANS,             'admin-plans'],
  [ROUTES.ADMIN.PAYMENTS,          'admin-payments'],
  [ROUTES.ADMIN.ACCOUNTS,          'admin-accounts'],
  [ROUTES.ADMIN.REPORTS,           'admin-reports'],
  [ROUTES.ADMIN.AUDIT_LOGS,        'admin-audit-logs'],
  [ROUTES.ADMIN.BACKUP,            'admin-data-backup'],
  [ROUTES.ADMIN.SUPPORT_ACCESS,    'admin-support-access'],
  [ROUTES.ADMIN.SECURITY,          'admin-security'],
  [ROUTES.ADMIN.ROOT + '/profile', 'my-profile'],
  [ROUTES.ADMIN.ROOT + '/settings','account-settings'],
];

const TAB_TO_ROUTE: Record<string, string> = {
  'dashboard':               '',
  'admin-business-requests': ROUTES.ADMIN.BUSINESS_REQUESTS,
  'admin-businesses':        ROUTES.ADMIN.BUSINESSES,
  'admin-manager-transfer':  ROUTES.ADMIN.MANAGER_TRANSFER,
  'admin-plans':             ROUTES.ADMIN.PLANS,
  'admin-payments':          ROUTES.ADMIN.PAYMENTS,
  'admin-accounts':          ROUTES.ADMIN.ACCOUNTS,
  'admin-reports':           ROUTES.ADMIN.REPORTS,
  'admin-audit-logs':        ROUTES.ADMIN.AUDIT_LOGS,
  'admin-data-backup':       ROUTES.ADMIN.BACKUP,
  'admin-support-access':    ROUTES.ADMIN.SUPPORT_ACCESS,
  'admin-security':          ROUTES.ADMIN.SECURITY,
  'my-profile':              ROUTES.ADMIN.ROOT + '/profile',
  'account-settings':        ROUTES.ADMIN.ROOT + '/settings',
};

export const SystemAdminLayout: React.FC = () => {
  const { account, firebaseUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const displayUserName = account?.display_name || account?.username || firebaseUser?.displayName || 'Quản Trị Viên (Demo)';
  const userRole = 'Admin';
  const basePath = ROUTES.ADMIN.ROOT;

  useEffect(() => {
    const path = location.pathname;
    let matchedTab = 'dashboard';
    for (const [route, tabId] of ROUTE_TO_TAB) {
      if (path === route || path.startsWith(route + '/')) {
        matchedTab = tabId;
        break;
      }
    }
    setActiveTab(matchedTab);
  }, [location.pathname]);

  const handleSelectTab = (tabId: string) => {
    const route = TAB_TO_ROUTE[tabId];
    if (route) {
      navigate(route, { replace: false });
    } else if (tabId === 'dashboard') {
      navigate(basePath, { replace: false });
    }
  };

  const handleLogout = () => {
    console.log('Logout clicked');
  };

  return (
    <div className="dashboard-page-container">
      <TopBar
        userName={displayUserName}
        userRole={userRole}
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
          userRole="admin"
          variant="system"
        />
        <main
          className="dashboard-main-content"
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
              opacity: 0.15,
              pointerEvents: 'none',
              zIndex: 0
            }}
          />
          <div className="main-content-inner" style={{ position: 'relative', zIndex: 1, height: '100%' }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
export default SystemAdminLayout;

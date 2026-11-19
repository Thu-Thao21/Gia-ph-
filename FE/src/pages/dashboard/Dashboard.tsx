import { LoadingState } from '../../shared/Feedback/LoadingState';
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TopBar } from '../../components/dashboard/TopBar';
import { Sidebar } from '../../components/dashboard/Sidebar';
import { MemberList } from '../../components/profile/MemberList';
import { ProfileLayout } from '../../components/profile/ProfileLayout';
import { ClanProfilePage } from '../../components/clan/ClanProfilePage';
import { MyClans } from '../../components/profile/MyClans/MyClans';
import { fetchMembers } from '../../services/member.service';
import { PrivacySettingsTab } from '../../components/profile/PrivacySettingsTab';
import { RelationshipFinder } from '../../components/member/RelationshipFinder';
import { MyProposalsModule } from '../../components/member/MyProposalsModule';
import { AnniversariesModule } from '../../components/member/AnniversariesModule';
import { ClanEventsModule } from '../../components/member/ClanEventsModule';
import { ClanFundsModule } from '../../components/member/ClanFundsModule';
import { ClanDocumentsModule } from '../../components/member/ClanDocumentsModule';
import { ClanAIAssistantModule } from '../../components/member/ClanAIAssistantModule';
import { FloatingAIAssistant } from '../../components/member/FloatingAIAssistant';
import { DigitalAncestralHallModule } from '../../components/member/DigitalAncestralHallModule';
import { ClanLocationsModule } from '../../components/clan/ClanLocationsModule';
import { NotificationCenterModule } from '../../components/member/NotificationCenterModule';
import { AIConsentModule } from '../../components/member/AIConsentModule';
import { DataExchangeModule } from '../../components/member/DataExchangeModule';
import { NotificationModal } from '../../components/common/NotificationModal';
import { FamilyPaternalTab } from '../../components/network/FamilyPaternalTab';
import { FamilyMaternalTab } from '../../components/network/FamilyMaternalTab';
import { InLawMarriagesTab } from '../../components/network/InLawMarriagesTab';
import { AffiliatedFamiliesTab } from '../../components/network/AffiliatedFamiliesTab';
import { MyFamilyNetworkView } from '../../components/network/MyFamilyNetwork';
import { TreeLayout } from '../../shared/tree/TreeLayout';
import { MemberDashboard, AdminDashboard } from '../../components/roles';

import AdminAccountMgmt from '../../components/admin/AdminAccountMgmt/AdminAccountMgmt';
import AdminFamiliesMgmt from '../../components/admin/AdminFamiliesMgmt/AdminFamiliesMgmt';
import AdminMembersMgmt from '../../components/admin/AdminMembersMgmt/AdminMembersMgmt';
import AdminFamilyLinksMgmt from '../../components/admin/AdminFamilyLinksMgmt/AdminFamilyLinksMgmt';
import AdminApprovalsMgmt from '../../components/admin/AdminApprovalsMgmt/AdminApprovalsMgmt';
import AdminAuditLogsMgmt from '../../components/admin/AdminAuditLogsMgmt/AdminAuditLogsMgmt';
import AdminDataBackupMgmt from '../../components/admin/AdminDataBackupMgmt/AdminDataBackupMgmt';
import { FamilyAdminModule, type FamilyAdminView } from '../../features/familyAdmin/FamilyAdminModule';
import { ClanAISettingsPage } from '../../components/clan/ClanAISettingsPage';
import { ClanDataQualityModule } from '../../components/clan/ClanDataQualityModule';
import {
  ServicePackageManagement,
  PaymentTransactionManagement,
  ModerationManagement,
  RolePermissionManagement,
  AdminProfileView
} from '../../components/admin/PlatformAdmin';

import { useAuth } from '../../hooks/useAuth';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MobileTabBar } from '../../components/mobile/MobileTabBar';
import { MobileMoreSheet } from '../../components/mobile/MobileMoreSheet';
import { useClanContext } from '../../context/ClanContext';
import { ROUTES } from '../../config/routes';
import type { TreeViewMode } from '../../types/tree';
import './Dashboard.css';

// ===== Tab ID ↔ URL Route Mapping =====
const TAB_TO_ROUTE: Record<string, string> = {
  'dashboard':            '',
  'notifications':        ROUTES.USER.NOTIFICATIONS,
  'tree':                 ROUTES.USER.TREE_HORIZONTAL,
  'tree-vertical':        ROUTES.USER.TREE_VERTICAL,
  'tree-horizontal':      ROUTES.USER.TREE_HORIZONTAL,
  'tree-focus':           ROUTES.USER.TREE_FOCUS,
  'my-family-network':    ROUTES.USER.NETWORK_MY_FAMILY,
  'net-noi':              ROUTES.USER.NETWORK_NOI,
  'net-ngoai':            ROUTES.USER.NETWORK_NGOAI,
  'net-dau-re':           ROUTES.USER.NETWORK_DAU_RE,
  'net-thong-gia':        ROUTES.USER.NETWORK_THONG_GIA,
  'member-list':          ROUTES.USER.MEMBERS,
  'member-profile':       ROUTES.USER.MEMBER_PROFILE,
  'my-profile':           ROUTES.USER.MY_PROFILE,
  'clan-profile':         ROUTES.USER.CLAN_PROFILE,
  'my-proposals':         ROUTES.USER.PROPOSALS,
  'relationship-finder': ROUTES.USER.RELATIONSHIP,
  'anniversaries':        ROUTES.USER.ANNIVERSARIES,
  'events':               ROUTES.USER.EVENTS,
  'funds':                ROUTES.USER.FUNDS,
  'documents':            ROUTES.USER.DOCUMENTS,
  'ai-assistant':         ROUTES.USER.AI_ASSISTANT,
  'ai-consent':           ROUTES.USER.AI_CONSENT,
  'ancestral-hall':       ROUTES.USER.ANCESTRAL_HALL,
  'privacy-settings':     ROUTES.USER.PRIVACY_SETTINGS,
  'privacy-preview':      ROUTES.USER.PRIVACY_PREVIEW,
  'family-members':       ROUTES.USER.FAMILY_MANAGEMENT,
  'family-relations':     ROUTES.USER.FAMILY_RELATIONS,
  'family-tree':          ROUTES.USER.FAMILY_TREE,
  'family-search':        ROUTES.USER.FAMILY_SEARCH,
  'family-branches':      ROUTES.USER.FAMILY_BRANCHES,
  'family-approvals':     ROUTES.USER.FAMILY_APPROVALS,
  'family-accounts':      ROUTES.USER.FAMILY_ACCOUNTS,
  'family-links':         ROUTES.USER.FAMILY_LINKS,
  'family-privacy':       ROUTES.USER.PRIVACY_SETTINGS,
  'family-ai-settings':   ROUTES.CLAN_ADMIN.AI_SETTINGS,
  'family-quality':       ROUTES.CLAN_ADMIN.DATA_QUALITY,
  'family-import-export': ROUTES.USER.FAMILY_IMPORT_EXPORT,
  'family-statistics':    ROUTES.USER.FAMILY_MANAGEMENT,
  'family-logs':          ROUTES.USER.FAMILY_LOGS,
  // Admin tabs
  'admin-profile':        ROUTES.ADMIN.PROFILE,
  'admin-tree':           ROUTES.ADMIN.TREE,
  'admin-permissions':    ROUTES.ADMIN.ACCOUNTS,
  'admin-approval':       ROUTES.ADMIN.APPROVALS,
  'admin-logs':           ROUTES.ADMIN.SECURITY_LOGS,
  'admin-account-mgmt':   ROUTES.ADMIN.ACCOUNTS,
  'admin-families-mgmt':  ROUTES.ADMIN.FAMILIES,
  'admin-members-mgmt':   ROUTES.ADMIN.MEMBERS,
  'admin-family-links':   ROUTES.ADMIN.FAMILY_LINKS,
  'admin-approvals':      ROUTES.ADMIN.APPROVALS,
  'admin-security-logs':  ROUTES.ADMIN.SECURITY_LOGS,
  'admin-data-backup':    ROUTES.ADMIN.BACKUP,
  'admin-packages':       ROUTES.ADMIN.PACKAGES,
  'admin-payments':       ROUTES.ADMIN.PAYMENTS,
  'admin-moderation':     ROUTES.ADMIN.MODERATION,
  'admin-roles':          ROUTES.ADMIN.ROLES,
};

const CLAN_ADMIN_TAB_TO_ROUTE: Record<string, string> = {
  'dashboard': ROUTES.CLAN_ADMIN.DASHBOARD,
  'family-locations': ROUTES.CLAN_ADMIN.LOCATIONS,
  'family-members': ROUTES.CLAN_ADMIN.MEMBERS,
  'family-approvals': ROUTES.CLAN_ADMIN.APPROVALS,
  'family-branches': ROUTES.CLAN_ADMIN.BRANCHES,
  'family-accounts': ROUTES.CLAN_ADMIN.ACCOUNTS,
  'family-relations': ROUTES.CLAN_ADMIN.RELATIONS,
  'family-tree': ROUTES.CLAN_ADMIN.TREE,
  'family-import-export': ROUTES.CLAN_ADMIN.IMPORT_EXPORT,
  'family-logs': ROUTES.CLAN_ADMIN.LOGS,
  'family-ai-settings': ROUTES.CLAN_ADMIN.AI_SETTINGS,
  'family-quality': ROUTES.CLAN_ADMIN.DATA_QUALITY,
};

const ROUTE_TO_TAB: Array<[string, string]> = [
  [ROUTES.CLAN_ADMIN.LOCATIONS,     'family-locations'],
  [ROUTES.CLAN_ADMIN.MEMBERS,       'family-members'],
  [ROUTES.CLAN_ADMIN.APPROVALS,     'family-approvals'],
  [ROUTES.CLAN_ADMIN.BRANCHES,      'family-branches'],
  [ROUTES.CLAN_ADMIN.ACCOUNTS,      'family-accounts'],
  [ROUTES.CLAN_ADMIN.RELATIONS,     'family-relations'],
  [ROUTES.CLAN_ADMIN.TREE,          'family-tree'],
  [ROUTES.CLAN_ADMIN.IMPORT_EXPORT, 'family-import-export'],
  [ROUTES.CLAN_ADMIN.LOGS,          'family-logs'],
  [ROUTES.CLAN_ADMIN.AI_SETTINGS,   'family-ai-settings'],
  [ROUTES.CLAN_ADMIN.DATA_QUALITY, 'family-quality'],
  [ROUTES.USER.DATA_QUALITY,       'family-quality'],
  [ROUTES.CLAN_ADMIN.DASHBOARD,     'dashboard'],
  [ROUTES.CLAN_ADMIN.ROOT,          'dashboard'],
  [ROUTES.ADMIN.PROFILE,           'admin-profile'],
  [ROUTES.ADMIN.TREE,              'admin-tree'],
  [ROUTES.ADMIN.ACCOUNTS,          'admin-permissions'],
  [ROUTES.ADMIN.FAMILIES,          'admin-families-mgmt'],
  [ROUTES.ADMIN.MEMBERS,           'admin-members-mgmt'],
  [ROUTES.ADMIN.FAMILY_LINKS,      'admin-family-links'],
  [ROUTES.ADMIN.APPROVALS,         'admin-approval'],
  [ROUTES.ADMIN.SECURITY_LOGS,     'admin-logs'],
  [ROUTES.ADMIN.BACKUP,            'admin-data-backup'],
  [ROUTES.ADMIN.PACKAGES,          'admin-packages'],
  [ROUTES.ADMIN.PAYMENTS,          'admin-payments'],
  [ROUTES.ADMIN.MODERATION,        'admin-moderation'],
  [ROUTES.ADMIN.ROLES,             'admin-roles'],
  [ROUTES.USER.NOTIFICATIONS,      'notifications'],
  [ROUTES.USER.TREE_VERTICAL,      'tree'],
  [ROUTES.USER.TREE_HORIZONTAL,    'tree'],
  [ROUTES.USER.TREE_FOCUS,         'tree'],
  [ROUTES.USER.TREE,               'tree'],
  [ROUTES.USER.NETWORK_MY_FAMILY,  'my-family-network'],
  [ROUTES.USER.NETWORK_NOI,        'net-noi'],
  [ROUTES.USER.NETWORK_NGOAI,      'net-ngoai'],
  [ROUTES.USER.NETWORK_DAU_RE,     'net-dau-re'],
  [ROUTES.USER.NETWORK_THONG_GIA,  'net-thong-gia'],
  [ROUTES.USER.MY_PROFILE,         'my-profile'],
  [ROUTES.USER.CLAN_PROFILE,       'clan-profile'],
  [ROUTES.USER.MEMBER_PROFILE,     'member-profile'],
  [ROUTES.USER.MEMBERS,            'member-list'],
  [ROUTES.USER.RELATIONSHIP,       'relationship-finder'],
  [ROUTES.USER.PROPOSALS,          'my-proposals'],
  [ROUTES.USER.ANNIVERSARIES,      'anniversaries'],
  [ROUTES.USER.EVENTS,             'events'],
  [ROUTES.USER.FUNDS,              'funds'],
  [ROUTES.USER.DOCUMENTS,          'documents'],
  [ROUTES.USER.AI_ASSISTANT,       'ai-assistant'],
  [ROUTES.USER.AI_CONSENT,         'ai-consent'],
  [ROUTES.USER.ANCESTRAL_HALL,     'ancestral-hall'],
  [ROUTES.USER.PRIVACY_SETTINGS,   'privacy-settings'],
  [ROUTES.USER.PRIVACY_PREVIEW,    'privacy-preview'],
  [ROUTES.USER.FAMILY_BRANCHES,    'family-branches'],
  [ROUTES.USER.FAMILY_RELATIONS,   'family-relations'],
  [ROUTES.USER.FAMILY_TREE,        'family-tree'],
  [ROUTES.USER.FAMILY_SEARCH,      'family-search'],
  [ROUTES.USER.FAMILY_APPROVALS,   'family-approvals'],
  [ROUTES.USER.FAMILY_ACCOUNTS,    'family-accounts'],
  [ROUTES.USER.FAMILY_LINKS,       'family-links'],
  [ROUTES.USER.FAMILY_IMPORT_EXPORT, 'family-import-export'],
  [ROUTES.USER.FAMILY_LOGS,        'family-logs'],
  [ROUTES.USER.FAMILY_MANAGEMENT,  'family-members'],
];

export interface DashboardProps {
  userName: string;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ userName, onLogout }) => {
  const { account } = useAuth();
  const {
    activeClanId,
    activeClanName,
    activeMembership,
    activeClanRole,
    activeClanRoleLabel,
    clanSwitchCount,
  } = useClanContext();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState('dashboard');
  const isMobile = useIsMobile();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [isProcessingToastOpen, setIsProcessingToastOpen] = useState(false);
  const [isFloatingAIChatOpen, setIsFloatingAIChatOpen] = useState(false);
  const [adminSelectedFamilyId, setAdminSelectedFamilyId] = useState<string | undefined>();

  const primaryRole = account?.primary_role || 'member';
  const isSystemAdmin = primaryRole === 'admin';

  // Vai trò tại cây đang chọn (hoặc System Admin nếu là admin)
  const isClanAdminRole = !isSystemAdmin && activeClanRole === 'clan_admin';
  const isFamilyManager = !isSystemAdmin && activeClanRole === 'family_admin';
  const userRole = isSystemAdmin ? 'Admin' : (activeClanRoleLabel || 'Thành viên');
  const displayUserName = (isClanAdminRole && activeClanName)
    ? activeClanName
    : (account?.display_name || account?.username || userName || 'Người dùng');
  const basePath = isSystemAdmin ? ROUTES.ADMIN.ROOT : (isClanAdminRole ? ROUTES.CLAN_ADMIN.ROOT : ROUTES.USER.ROOT);
  const effectiveClanId = isSystemAdmin ? (adminSelectedFamilyId || account?.clan_id || null) : activeClanId;
  const [resolvedMyMemberId, setResolvedMyMemberId] = useState<string | null>(null);

  // Khi chuyển cây: reset thành viên đang xem và đưa về màn hợp lệ nếu mất quyền
  useEffect(() => {
    setSelectedMemberId(null);
    setResolvedMyMemberId(null);

    if (isSystemAdmin) return;

    const isFamilyHead = activeClanRole === 'clan_admin';
    const canManageFamily = isFamilyHead || activeClanRole === 'family_admin';

    // Nếu đang ở màn quản lý nhưng cây mới chỉ có quyền Thành viên -> chuyển về màn hợp lệ
    if (activeTab.startsWith('family-') && !canManageFamily) {
      setActiveTab('dashboard');
      navigate(ROUTES.USER.ROOT, { replace: false });
    } else if ((activeTab === 'family-accounts' || activeTab === 'family-ai-settings') && !isFamilyHead) {
      setActiveTab('dashboard');
      navigate(ROUTES.USER.ROOT, { replace: false });
    }
  }, [activeClanId, clanSwitchCount, activeClanRole, isSystemAdmin]);

  useEffect(() => {
    if (!effectiveClanId) return;
    let isCancelled = false;

    fetchMembers({ familyId: effectiveClanId, limit: 1000 })
      .then((res) => {
        if (isCancelled) return;
        if (res?.items && res.items.length > 0) {
          const myName = (displayUserName || '').trim().toLowerCase();
          const me = res.items.find(
            (m) =>
              ((m as any).userId && (m as any).userId === account?.id) ||
              m.fullName.trim().toLowerCase() === myName
          );
          const personExists = Boolean(activeMembership?.person_id && res.items.some((m) => m.id === activeMembership.person_id));
          if (personExists && activeMembership?.person_id) {
            setResolvedMyMemberId(activeMembership.person_id);
          } else if (me) {
            setResolvedMyMemberId(me.id);
          } else if (activeMembership?.person_id) {
            setResolvedMyMemberId(activeMembership.person_id);
          } else {
            setResolvedMyMemberId(null);
          }
        }
      })
      .catch((err) => {
        if (!isCancelled) console.error(err);
      });

    return () => {
      isCancelled = true;
    };
  }, [effectiveClanId, displayUserName, account?.id]);

  // [L-17] A restricted session never reaches the dashboard: ProtectedRoute sends it to /change-password.

  // Sync URL → activeTab
  useEffect(() => {
    const path = location.pathname;
    for (const [route, tabId] of ROUTE_TO_TAB) {
      if (path === route || path.startsWith(route + '/')) {
        setActiveTab(tabId);
        return;
      }
    }
    setActiveTab('dashboard');
  }, [location.pathname]);

  // Navigate tab
  const handleSelectTab = useCallback((tabId: string) => {
    if (tabId === 'ai-assistant') {
      setIsFloatingAIChatOpen(true);
      return;
    }
    setActiveTab(tabId);

    // Clear selectedMemberId overlay when switching to non-profile tabs
    if (tabId !== 'member-profile' && tabId !== 'my-profile') {
      setSelectedMemberId(null);
    }

    const route = isClanAdminRole && CLAN_ADMIN_TAB_TO_ROUTE[tabId]
      ? CLAN_ADMIN_TAB_TO_ROUTE[tabId]
      : TAB_TO_ROUTE[tabId];
    if (route) {
      navigate(route, { replace: false });
    } else if (tabId === 'dashboard') {
      navigate(basePath, { replace: false });
    }
  }, [navigate, basePath, isClanAdminRole]);

  const handleSelectMember = (memberId: string) => {
    setSelectedMemberId(memberId);
    setActiveTab('member-profile');
    navigate(ROUTES.USER.MEMBER_PROFILE, { replace: false });
  };

  const renderMainContent = () => {
    // ===== Branch for System Admin =====
    if (primaryRole === 'admin') {
      if (activeTab === 'admin-profile' || activeTab === 'my-profile') {
        return <AdminProfileView onNavigateTab={handleSelectTab} />;
      }
      if (activeTab === 'admin-tree') {
        return (
          <TreeLayout
            familyId={adminSelectedFamilyId}
            initialMode="horizontal"
            onSelectMemberProfile={(memberId) => {
              setSelectedMemberId(memberId);
              handleSelectTab('admin-members-mgmt');
            }}
          />
        );
      }
      if (activeTab === 'admin-permissions' || activeTab === 'admin-account-mgmt') return <AdminAccountMgmt />;
      if (activeTab === 'admin-families-mgmt') {
        return (
          <AdminFamiliesMgmt
            onViewTree={(familyId) => {
              setAdminSelectedFamilyId(familyId);
              handleSelectTab('admin-tree');
            }}
          />
        );
      }
      if (activeTab === 'admin-members-mgmt') return <AdminMembersMgmt />;
      if (activeTab === 'admin-family-links') return <AdminFamilyLinksMgmt />;
      if (activeTab === 'admin-approval' || activeTab === 'admin-approvals') return <AdminApprovalsMgmt />;
      if (activeTab === 'admin-logs' || activeTab === 'admin-security-logs') return <AdminAuditLogsMgmt />;
      if (activeTab === 'admin-data-backup') return <AdminDataBackupMgmt />;
      if (activeTab === 'admin-packages') return <ServicePackageManagement />;
      if (activeTab === 'admin-payments') return <PaymentTransactionManagement />;
      if (activeTab === 'admin-moderation') return <ModerationManagement />;
      if (activeTab === 'admin-roles') return <RolePermissionManagement />;

      return (
        <AdminDashboard
          userName={displayUserName}
          onNavigateTab={handleSelectTab}
        />
      );
    }

    // ===== Branch for Clan Member / Family Admin / Clan Admin =====
    const isClanAdminRoute = location.pathname.startsWith('/clan-admin');
    const isFamilyHead = isClanAdminRole || isClanAdminRoute;
    const canManageFamily = isFamilyHead || isFamilyManager;

    if (activeTab === 'notifications') {
      return (
        <NotificationCenterModule
          canManage={canManageFamily}
          clanName={activeClanName || account?.clan_name || 'Dòng họ'}
          userRole={userRole}
        />
      );
    }
    if (activeTab === 'relationship-finder') {
      return (
        <RelationshipFinder
          key={effectiveClanId || 'default-clan'}
          familyId={effectiveClanId || undefined}
          canManage={canManageFamily}
          onNavigateTab={handleSelectTab}
        />
      );
    }
    if (activeTab === 'my-proposals') return <MyProposalsModule />;
    if (activeTab === 'anniversaries') return <ClanEventsModule canManage={canManageFamily} initialTab="memorials" />;
    if (activeTab === 'events') return <ClanEventsModule canManage={canManageFamily} initialTab="events" />;
    if (activeTab === 'funds') {
      return (
        <ClanFundsModule
          canManage={canManageFamily}
          clanId={effectiveClanId || undefined}
          isClanLeader={isClanAdminRole || isSystemAdmin}
          isFamilyAdmin={isFamilyManager}
        />
      );
    }
    if (activeTab === 'documents') return <ClanDocumentsModule canManage={canManageFamily} />;
    if (activeTab === 'ai-assistant') {
      return (
        <section
          style={{
            padding: '48px 32px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            borderRadius: '24px',
            border: '1px solid #e2e8f0',
            textAlign: 'center',
            maxWidth: '680px',
            margin: '36px auto',
            boxShadow: '0 10px 30px rgba(15, 23, 42, 0.04)',
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #2563eb, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              boxShadow: '0 8px 24px rgba(37, 99, 235, 0.35)',
            }}
          >
            <svg width="44" height="44" viewBox="0 0 48 48" fill="none">
              <line x1="24" y1="8" x2="24" y2="15" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
              <circle cx="24" cy="6" r="3.5" fill="#38bdf8" />
              <rect x="9.5" y="14" width="29" height="25" rx="8" fill="#ffffff" />
              <rect x="13.5" y="17.5" width="21" height="12.5" rx="4" fill="#0f172a" />
              <circle cx="18.5" cy="23.5" r="2.8" fill="#38bdf8" />
              <circle cx="29.5" cy="23.5" r="2.8" fill="#38bdf8" />
              <path d="M19.5 33.5C22 35.8 26 35.8 28.5 33.5" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '10px' }}>
            Trợ Lý AI Gia Phả Thông Minh
          </h2>
          <p style={{ fontSize: '14.5px', color: '#64748b', lineHeight: 1.6, marginBottom: '24px' }}>
            Trợ lý AI đã được tinh gọn thành <strong>biểu tượng Robot thông minh ở góc phải dưới màn hình</strong>.
            Bạn có thể dễ dàng tra cứu thông tin phả hệ, thế hệ và vai vế họ hàng trên bất kỳ màn hình nào!
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setIsFloatingAIChatOpen(true)}
              style={{
                padding: '12px 24px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #1d4ed8, #1e40af)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(30, 58, 138, 0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>Mở Trò chuyện AI</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectTab('dashboard')}
              style={{
                padding: '12px 20px',
                borderRadius: '12px',
                background: '#ffffff',
                color: '#475569',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Quay lại Trang chủ
            </button>
          </div>
        </section>
      );
    }
    if (activeTab === 'ai-consent') return <AIConsentModule />;
    if (activeTab === 'ancestral-hall') return <DigitalAncestralHallModule />;
    if (activeTab === 'clan-locations' || activeTab === 'family-locations') return <ClanLocationsModule clanId={effectiveClanId || undefined} canManage={canManageFamily} />;
    if (activeTab === 'privacy-settings' || activeTab === 'privacy-preview' || activeTab === 'family-privacy') return <PrivacySettingsTab />;

    // Chặn quyền nếu là Thành viên thông thường cố vào các tab quản lý dòng họ
    if (activeTab.startsWith('family-') && !canManageFamily) {
      return (
        <section className="dashboard-permission-page">
          <div className="dashboard-permission-icon">!</div>
          <span>QUYỀN TRUY CẬP DỮ LIỆU</span>
          <h1>Chức năng dành cho Quản trị viên dòng họ</h1>
          <p>Tài khoản Thành viên có thể xem dữ liệu được chia sẻ nhưng không thể mở khu vực quản lý, phê duyệt hoặc xuất nhập dữ liệu.</p>
          <button type="button" onClick={() => handleSelectTab('dashboard')}>Quay lại Trang chủ</button>
        </section>
      );
    }

    // Chặn quyền độc quyền của Trưởng tộc nếu Family Admin cố truy cập vào phân quyền tài khoản
    if (activeTab === 'family-quality' || activeTab === 'clan-quality') {
      return (
        <ClanDataQualityModule
          clanId={effectiveClanId || undefined}
          canManage={canManageFamily}
          onNavigateTab={handleSelectTab}
        />
      );
    }

    if (activeTab === 'family-ai-settings') {
      if (!isFamilyHead) {
        return (
          <section className="dashboard-permission-page">
            <div className="dashboard-permission-icon">!</div>
            <span>QUYỀN HẠN TRƯỞNG TỘC</span>
            <h1>Chức năng dành riêng cho Trưởng tộc (Clan Admin)</h1>
            <p>Chỉ Trưởng tộc mới có quyền cấu hình tính năng AI và quản lý quyền gửi dữ liệu của toàn dòng họ.</p>
            <button type="button" onClick={() => handleSelectTab('dashboard')}>Quay lại Trang chủ</button>
          </section>
        );
      }
      return <ClanAISettingsPage clanId={effectiveClanId || ''} />;
    }



    if (activeTab === 'family-accounts' && !isFamilyHead) {
      return (
        <section className="dashboard-permission-page">
          <div className="dashboard-permission-icon">!</div>
          <span>QUYỀN HẠN TRƯỞNG TỘC</span>
          <h1>Chức năng dành riêng cho Trưởng tộc (Clan Admin)</h1>
          <p>Chỉ Trưởng tộc mới có quyền phân quyền, nâng cấp hoặc thu hồi quyền của Family Admin và quản lý tài khoản thành viên.</p>
          <button type="button" onClick={() => handleSelectTab('dashboard')}>Quay lại Trang chủ</button>
        </section>
      );
    }

    const familyViews: Record<string, FamilyAdminView> = {
      'family-relations': 'relations', 'family-tree': 'tree',
      'family-search': 'search', 'family-branches': 'branches', 'family-approvals': 'approvals',
      'family-accounts': 'accounts', 'family-links': 'links',
      'family-import-export': 'exchange', 'family-logs': 'audit',
      'family-statistics': 'overview',
      'family-locations': 'locations',
    };
    if (familyViews[activeTab]) {
      if (familyViews[activeTab] === 'tree') {
        return (
          <TreeLayout
            familyId={effectiveClanId || undefined}
            onSelectMemberProfile={(memberId) => {
              setSelectedMemberId(memberId);
              setActiveTab('member-profile');
              navigate(ROUTES.USER.MEMBER_PROFILE, { replace: false });
            }}
          />
        );
      }
      const tabs: Record<FamilyAdminView, string> = {
        overview: 'dashboard', members: 'member-list', relations: 'family-relations',
        tree: 'tree', search: 'family-search', branches: 'family-branches',
        approvals: 'family-approvals', accounts: 'family-accounts', links: 'family-links',
        exchange: 'family-import-export', audit: 'family-logs', locations: 'clan-locations',
      };
      return <FamilyAdminModule view={familyViews[activeTab]} onNavigate={(view) => handleSelectTab(tabs[view])} />;
    }

    // Network tabs
    if (activeTab === 'my-family-network') {
      return (
        <TreeLayout
          familyId={effectiveClanId || undefined}
          initialScope="network"
          onSelectMemberProfile={(memberId) => {
            setSelectedMemberId(memberId);
            setActiveTab('member-profile');
            navigate(ROUTES.USER.MEMBER_PROFILE, { replace: false });
          }}
        />
      );
    }
    if (activeTab === 'net-noi') return <FamilyPaternalTab />;
    if (activeTab === 'net-ngoai') return <FamilyMaternalTab onNavigateToLinks={() => handleSelectTab('family-links')} />;
    if (activeTab === 'net-dau-re') return <InLawMarriagesTab />;
    if (activeTab === 'net-thong-gia') return <AffiliatedFamiliesTab />;

    // Tree Layout
    if (activeTab.startsWith('tree')) {
      const mode: TreeViewMode =
        activeTab === 'tree-horizontal'
          ? 'horizontal'
          : activeTab === 'tree-focus'
          ? 'focus'
          : 'vertical';
      return (
        <TreeLayout
          familyId={effectiveClanId || undefined}
          initialMode={mode}
          onSelectMemberProfile={(memberId) => {
            setSelectedMemberId(memberId);
            setActiveTab('member-profile');
            navigate(ROUTES.USER.MEMBER_PROFILE, { replace: false });
          }}
        />
      );
    }

    if (activeTab === 'clan-profile') {
      return <ClanProfilePage clanId={effectiveClanId || undefined} />;
    }

    if (activeTab === 'my-clans') {
      return <MyClans />;
    }

    // Profile & Member List
    if (activeTab === 'my-profile') {
      const targetMemberId = resolvedMyMemberId || activeMembership?.person_id || (account as any)?.person_id;
      if (!targetMemberId) {
        return (
          <section className="dashboard-permission-page">
            <div className="dashboard-permission-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg></div>
            <span>HỒ SƠ CÁ NHÂN GIA TỘC</span>
            <h1>Chưa liên kết hồ sơ thành viên</h1>
            <p>
              Tài khoản của bạn chưa được liên kết với hồ sơ Person cụ thể nào trong cây gia phả{' '}
              <strong>{activeClanName || 'đang chọn'}</strong>.
            </p>
            <p style={{ fontSize: '13.5px', color: '#64748b', marginTop: '6px' }}>
              Mỗi dòng họ có hồ sơ thành viên riêng biệt. Vui lòng liên hệ Trưởng tộc hoặc Family Admin để được gắn hồ sơ.
            </p>
            <button type="button" onClick={() => handleSelectTab('dashboard')} style={{ marginTop: '16px' }}>
              Quay lại Trang chủ
            </button>
          </section>
        );
      }
      return (
        <ProfileLayout
          memberId={targetMemberId}
          onBack={() => {
            setActiveTab('dashboard');
            navigate(ROUTES.USER.ROOT, { replace: false });
          }}
          onNavigateTab={handleSelectTab}
        />
      );
    }

    if (activeTab === 'member-profile') {
      const targetMemberId = selectedMemberId || resolvedMyMemberId;
      if (!targetMemberId) {
        return (
          <div style={{ padding: '40px', background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
            <LoadingState
              message="Đang truy xuất dữ liệu hồ sơ nhân khẩu..."
              subMessage="Hệ thống đang chuẩn bị thông tin phả ký chi tiết từ máy chủ gia tộc."
            />
          </div>
        );
      }
      return (
        <ProfileLayout
          memberId={targetMemberId}
          onBack={() => {
            setSelectedMemberId(null);
            setActiveTab('member-list');
            navigate(ROUTES.USER.MEMBERS, { replace: false });
          }}
          onNavigateTab={handleSelectTab}
        />
      );
    }

    if (activeTab === 'member-list' || activeTab === 'family-members') {
      if (canManageFamily) {
        const tabs: Record<FamilyAdminView, string> = {
          overview: 'dashboard', members: 'member-list', relations: 'family-relations',
          tree: 'tree', search: 'family-search', branches: 'family-branches',
          approvals: 'family-approvals', accounts: 'family-accounts', links: 'family-links',
          exchange: 'family-import-export', audit: 'family-logs', locations: 'clan-locations',
        };
        return <FamilyAdminModule view="members" onNavigate={(view) => handleSelectTab(tabs[view])} />;
      }
      return <MemberList onSelectMember={handleSelectMember} />;
    }



    // Default Member Dashboard
    return (
      <MemberDashboard
        userName={displayUserName}
        userRole={userRole}
        onNavigateTab={handleSelectTab}
      />
    );
  };

  return (
    <div className={`dashboard-page-container ${isMobile ? 'is-mobile' : ''}`}>
      <TopBar
        userName={displayUserName}
        userRole={userRole}
        onLogout={onLogout}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onNavigateTab={handleSelectTab}
      />

      <div className="dashboard-body-row">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={handleSelectTab}
          isCollapsed={isSidebarCollapsed}
          userRole={userRole}
        />

        <main
          className={`dashboard-main-content ${
            isSidebarCollapsed ? 'collapsed-sidebar' : 'expanded-sidebar'
          }`}
        >
          {renderMainContent()}
        </main>
      </div>

      <footer className="dashboard-footer">
        <div className="dashboard-footer-inner">
          <strong className="dashboard-footer-brand">MULTI-FAMILY GENEALOGY SYSTEM</strong> © 2026 •
          Số hóa & Gắn kết các dòng họ Việt Nam.
        </div>
      </footer>

      {isMobile && (
        <>
          <MobileTabBar
            activeTab={activeTab}
            isMoreOpen={isMoreOpen}
            isSystemAdmin={isSystemAdmin}
            onSelectTab={(id) => { setIsMoreOpen(false); handleSelectTab(id); }}
            onOpenMore={() => setIsMoreOpen(true)}
          />
          <MobileMoreSheet
            isOpen={isMoreOpen}
            onClose={() => setIsMoreOpen(false)}
            activeTab={activeTab}
            userName={displayUserName}
            userRole={userRole}
            onSelectTab={handleSelectTab}
            onLogout={onLogout}
          />
        </>
      )}

      {/* Global Floating Robot AI Assistant */}
      <FloatingAIAssistant
        clanId={effectiveClanId || undefined}
        isOpenExternal={isFloatingAIChatOpen}
        onCloseExternal={() => setIsFloatingAIChatOpen(false)}
      />

      <NotificationModal
        isOpen={isProcessingToastOpen}
        onClose={() => setIsProcessingToastOpen(false)}
      />
    </div>
  );
};

export default Dashboard;

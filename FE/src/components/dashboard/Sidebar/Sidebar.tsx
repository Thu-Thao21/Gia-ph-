import React, { useState } from 'react';
import './Sidebar.css';

export interface SidebarProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  isCollapsed: boolean;
  userRole?: string;
}

const AdminNavIcon = ({ name }: { name: string }) => {
  const paths: Record<string, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    tree: <><path d="M12 3v5" /><path d="M5 13V9h14v4" /><rect x="2" y="13" width="6" height="7" rx="1.5" /><rect x="9" y="13" width="6" height="7" rx="1.5" /><rect x="16" y="13" width="6" height="7" rx="1.5" /></>,
    people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
    relation: <><circle cx="6" cy="12" r="3" /><circle cx="18" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="m8.7 10.6 6.6-3.2" /><path d="m8.7 13.4 6.6 3.2" /></>,
    branch: <><path d="M6 3v12" /><path d="M6 8h7a4 4 0 0 0 4-4" /><path d="M6 14h7a4 4 0 0 1 4 4v3" /><circle cx="6" cy="19" r="2" /></>,
    approval: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /><path d="M19 8h3" /><path d="M20.5 6.5v3" /></>,
    package: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
    payment: <><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></>,
    moderation: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></>,
    logs: <><path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h8M8 17h5" /></>,
    backup: <><path d="M4 7v5h5" /><path d="M6.2 17a8 8 0 1 0 .2-10.2L4 9" /><path d="M12 8v5l3 2" /></>,
  };
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  userRole = 'Thành viên',
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    overview: true,
    tree_rel: true,
    network: true,
    profile_prop: true,
    life: true,
    docs_ai: true,
    settings: true,
    admin: true,
  });

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isAdmin = (userRole || '').toLowerCase() === 'admin';

  const memberGroups = [
    {
      id: 'overview',
      label: 'TỔNG QUAN',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
      items: [
        { id: 'dashboard', label: 'Trang chủ' },
        { id: 'notifications', label: 'Thông báo & Cài đặt' },
      ],
    },
    {
      id: 'tree_rel',
      label: 'GIA PHẢ & QUAN HỆ',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
      items: [
        { id: 'tree', label: 'Cây Gia Phả' },
        { id: 'member-list', label: 'Danh sách thành viên' },
        { id: 'relationship-finder', label: 'Tra cứu & Xưng hô' },
      ],
    },
    {
      id: 'network',
      label: 'MẠNG LƯỚI LIÊN HỌ',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
      items: [
        { id: 'net-noi', label: 'Dòng họ Nội' },
        { id: 'net-ngoai', label: 'Dòng họ Ngoại' },
        { id: 'net-dau-re', label: 'Dâu & Rể liên họ' },
        { id: 'net-thong-gia', label: 'Họ Thông gia' },
      ],
    },
    {
      id: 'profile_prop',
      label: 'HỒ SƠ & ĐỀ XUẤT',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
      items: [
        { id: 'clan-profile', label: 'Hồ sơ gia tộc' },
        { id: 'my-profile', label: 'Hồ sơ của tôi' },
        { id: 'my-proposals', label: 'Đề xuất của tôi' },
      ],
    },
    {
      id: 'life',
      label: 'ĐỜI SỐNG DÒNG HỌ',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
      items: [
        { id: 'anniversaries', label: 'Lịch ngày giỗ' },
        { id: 'events', label: 'Sự kiện dòng họ' },
        { id: 'funds', label: 'Quỹ & Đóng góp' },
        { id: 'ancestral-hall', label: 'Phòng thờ số' },
      ],
    },
    {
      id: 'docs_ai',
      label: 'TƯ LIỆU & AI',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
      items: [
        { id: 'documents', label: 'Tư liệu lịch sử' },
        { id: 'ai-assistant', label: 'Trợ lý AI dòng họ' },
        { id: 'ai-consent', label: 'Đồng ý sử dụng AI' },
        { id: 'ancestral-library', label: 'Thư viện 3D/360' },
      ],
    },
    {
      id: 'settings',
      label: 'CÀI ĐẶT & BẢO MẬT',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      items: [
        { id: 'privacy-settings', label: 'Quyền riêng tư' },
        { id: 'privacy-preview', label: 'Xem trước góc nhìn' },
      ],
    },
  ];

  const adminMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'admin-tree', label: 'Cây Gia Phả', icon: 'tree' },
    { id: 'admin-members-mgmt', label: 'Quản lý Nhân Khẩu', icon: 'people' },
    { id: 'admin-family-links', label: 'Quản lý Quan Hệ', icon: 'relation' },
    { id: 'admin-families-mgmt', label: 'Quản lý Chi Nhánh', icon: 'branch' },
    { id: 'admin-approval', label: 'Phê duyệt', icon: 'approval' },
    { id: 'admin-packages', label: 'Gói Dịch Vụ', icon: 'package' },
    { id: 'admin-payments', label: 'Thanh Toán', icon: 'payment' },
    { id: 'admin-moderation', label: 'Kiểm Duyệt', icon: 'moderation' },
    { id: 'admin-roles', label: 'Phân Quyền & Role', icon: 'account' },
    { id: 'admin-permissions', label: 'Quản Lý Tài Khoản', icon: 'account' },
    { id: 'admin-logs', label: 'Nhật Ký Hệ Thống', icon: 'logs' },
    { id: 'admin-data-backup', label: 'Sao Lưu & Khôi Phục', icon: 'backup' },
  ];

  const roleLower = (userRole || '').toLowerCase();
  const isClanAdmin = ['trưởng tộc', 'chủ dòng họ', 'clan admin', 'clan_admin', 'family_head'].includes(roleLower);
  const isFamilyAdmin = ['family admin', 'family_admin', 'manager'].includes(roleLower);

  // Nhóm chức năng Quản lý dòng họ được phân quyền chi tiết
  const clanAdminManagementItems = [
    { id: 'family-members', label: 'Quản lý thành viên' },
    { id: 'family-relations', label: 'Quan hệ gia phả' },
    { id: 'family-tree', label: 'Cây theo quan hệ' },
    { id: 'family-search', label: 'Tìm đường quan hệ' },
    { id: 'family-branches', label: 'Quản lý Chi & Nhánh' },
    { id: 'family-approvals', label: 'Phê duyệt đề xuất' },
    { id: 'family-accounts', label: 'Phân quyền & Tài khoản' },
    { id: 'family-links', label: 'Yêu cầu liên họ' },
    { id: 'family-privacy', label: 'Quyền riêng tư dòng tộc' },
    { id: 'family-import-export', label: 'Nhập xuất dữ liệu' },
    { id: 'family-statistics', label: 'Thống kê dân số & thế hệ' },
    { id: 'family-logs', label: 'Nhật ký hoạt động' },
  ];

  const familyAdminManagementItems = [
    { id: 'family-members', label: 'Quản lý thành viên' },
    { id: 'family-relations', label: 'Quan hệ gia phả' },
    { id: 'family-tree', label: 'Cây theo quan hệ' },
    { id: 'family-search', label: 'Tìm đường quan hệ' },
    { id: 'family-branches', label: 'Quản lý Chi & Nhánh' },
    { id: 'family-approvals', label: 'Phê duyệt đề xuất' },
    { id: 'family-links', label: 'Yêu cầu liên họ' },
    { id: 'family-import-export', label: 'Nhập xuất dữ liệu' },
    { id: 'family-logs', label: 'Nhật ký thao tác' },
  ];

  const currentManagementItems = isClanAdmin
    ? clanAdminManagementItems
    : isFamilyAdmin
    ? familyAdminManagementItems
    : [];

  const familyManagementGroup = currentManagementItems.length > 0 ? {
    id: 'family_management',
    label: 'QUẢN LÝ DÒNG HỌ',
    icon: <AdminNavIcon name="branch" />,
    items: currentManagementItems,
  } : null;

  const visibleMemberGroups = familyManagementGroup
    ? memberGroups.flatMap((group) => group.id === 'network' ? [group, familyManagementGroup] : [group])
    : memberGroups;

  return (
    <aside className={`sidebar-container ${isCollapsed ? 'collapsed' : 'expanded'}`}>
      {!isCollapsed && <div className="sidebar-section-title">{isAdmin ? 'QUẢN LÝ GIA PHẢ' : 'DANH MỤC DÒNG HỌ'}</div>}

      {isAdmin && (
        <nav className="sidebar-admin-menu" aria-label="Điều hướng Family Admin">
          {adminMenuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              title={isCollapsed ? item.label : undefined}
              className={`sidebar-admin-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <span className="sidebar-admin-icon"><AdminNavIcon name={item.icon} /></span>
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>
      )}

      {!isAdmin && visibleMemberGroups.map((group) => {
        const isGroupActive = group.items.some((item) => item.id === activeTab);
        const isExpanded = expandedGroups[group.id] !== false;

        return (
          <div key={group.id} className="sidebar-group-wrapper">
            <button
              onClick={() => toggleGroup(group.id)}
              className={`sidebar-group-btn ${isCollapsed ? 'collapsed' : 'expanded'} ${
                isGroupActive ? 'active' : ''
              }`}
              title={isCollapsed ? group.label : undefined}
            >
              <div className="sidebar-group-left">
                <span className="sidebar-group-icon">{group.icon}</span>
                {!isCollapsed && <span className="sidebar-group-label">{group.label}</span>}
              </div>

              {!isCollapsed && (
                <div className="sidebar-group-right">
                  <span className={`sidebar-arrow ${isExpanded ? 'open' : ''}`}>▼</span>
                </div>
              )}
            </button>

            {!isCollapsed && isExpanded && (
              <div className="sidebar-subitem-list">
                {group.items.map((subItem) => {
                  const isSubActive = activeTab === subItem.id;
                  return (
                    <button
                      key={subItem.id}
                      onClick={() => onSelectTab(subItem.id)}
                      className={`sidebar-subitem-btn ${isSubActive ? 'active' : ''}`}
                    >
                      {subItem.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
};

export default Sidebar;

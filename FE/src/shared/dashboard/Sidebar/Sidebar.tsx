import React, { useState } from 'react';
import './Sidebar.css';

export interface SidebarProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  isCollapsed: boolean;
  userRole?: string;
  variant?: 'system' | 'clan' | 'user';
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  userRole = 'Thành viên',
  variant,
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    tree: true,
    network: true,
    members: false,
    finder: false,
    reports: false,
    admin: true,
    'admin-business-group': true,
    'admin-plans-group': true,
    'admin-accounts-group': true,
    'admin-ops-group': true,
  });

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isSystemAdmin = variant === 'system' || ((userRole || '').toLowerCase() === 'admin' && variant !== 'clan');
  const isClanAdmin = variant === 'clan';

  const menuGroups = [];

  // Group Trang Chủ (Common for both Admin and Member)
  menuGroups.push({
    id: 'dashboard',
    label: 'Trang chủ',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
    singleTab: 'dashboard',
  });

  if (isSystemAdmin) {
    // Nhóm 1: Doanh nghiệp & Dòng họ
    menuGroups.push({
      id: 'admin-business-group',
      label: 'Dòng họ & Business',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M3 7v14M21 7v14M6 11h4M6 15h4M14 11h4M14 15h4M9 3h6v4H9z" />
        </svg>
      ),
      items: [
        { id: 'admin-business-requests', label: 'Yêu cầu mở Business' },
        { id: 'admin-businesses', label: 'Quản lý Business & Vòng đời' },
        { id: 'admin-manager-transfer', label: 'Chuyển Trưởng tộc đặc biệt' },
      ],
    });

    // Nhóm 2: Gói dịch vụ & Doanh thu
    menuGroups.push({
      id: 'admin-plans-group',
      label: 'Gói dịch vụ & Tài chính',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
      items: [
        { id: 'admin-plans', label: 'Gói dịch vụ & Hạn mức' },
        { id: 'admin-payments', label: 'Giao dịch & Hóa đơn' },
      ],
    });

    // Nhóm 3: Tài khoản & Kiểm duyệt
    menuGroups.push({
      id: 'admin-accounts-group',
      label: 'Tài khoản & Kiểm duyệt',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      items: [
        { id: 'admin-accounts', label: 'Quản lý tài khoản' },
        { id: 'admin-reports', label: 'Kiểm duyệt báo cáo vi phạm' },
      ],
    });

    // Nhóm 4: Vận hành & Kỹ thuật
    menuGroups.push({
      id: 'admin-ops-group',
      label: 'Vận hành & Kỹ thuật',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      items: [
        { id: 'admin-audit-logs', label: 'Nhật ký hệ thống' },
        { id: 'admin-data-backup', label: 'Sao lưu & Khôi phục' },
        { id: 'admin-support-access', label: 'Hỗ trợ có kiểm soát' },
        { id: 'admin-security', label: 'Bảo mật tài khoản' },
      ],
    });
  } else if (isClanAdmin) {
    menuGroups.push({
      id: 'clan-family-group',
      label: 'Dòng họ',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      items: [
        { id: 'family-profile', label: 'Hồ sơ dòng họ' },
        { id: 'ancestors', label: 'Thủy tổ & Đời thứ' },
        { id: 'branches', label: 'Chi phái' },
      ],
    });

    menuGroups.push({
      id: 'clan-tree-group',
      label: 'Gia phả',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
      items: [
        { id: 'genealogy-tree', label: 'Cây gia phả' },
        { id: 'search', label: 'Tra cứu' },
        { id: 'relationships', label: 'Quan hệ' },
      ],
    });

    menuGroups.push({
      id: 'clan-members-group',
      label: 'Thành viên & Phân quyền',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
      items: [
        { id: 'persons', label: 'Nhân khẩu' },
        { id: 'members', label: 'Tài khoản hệ thống' },
        { id: 'family-admins', label: 'Phân quyền quản trị' },
      ],
    });

    menuGroups.push({
      id: 'clan-activities-group',
      label: 'Hoạt động & Tài chính',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      items: [
        { id: 'memorial-days', label: 'Ngày giỗ & Kỷ niệm' },
        { id: 'events', label: 'Sự kiện dòng họ' },
        { id: 'funds', label: 'Quỹ dòng họ' },
        { id: 'approvals', label: 'Xét duyệt yêu cầu' },
      ],
    });

    menuGroups.push({
      id: 'clan-worship-group',
      label: 'Không gian thờ cúng',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      ),
      items: [
        { id: 'worship-space', label: 'Phòng thờ ảo' },
        { id: '3d-library', label: 'Thư viện 3D' },
      ],
    });

    menuGroups.push({
      id: 'clan-archives-group',
      label: 'Tư liệu & AI',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M2 15h10" />
          <path d="M9 18l3-3-3-3" />
        </svg>
      ),
      items: [
        { id: 'archives', label: 'Lưu trữ tư liệu' },
        { id: 'import-export', label: 'Nhập/Xuất dữ liệu' },
        { id: 'ai', label: 'Trợ lý AI' },
      ],
    });

    menuGroups.push({
      id: 'clan-settings-group',
      label: 'Hệ thống & Cài đặt',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      ),
      items: [
        { id: 'inter-family', label: 'Kết nối liên họ' },
        { id: 'business', label: 'Không gian Business' },
        { id: 'privacy', label: 'Quyền riêng tư' },
        { id: 'audit-logs', label: 'Nhật ký hoạt động' },
        { id: 'backup', label: 'Sao lưu dữ liệu' },
      ],
    });
  } else {
    // Member-only groups
    menuGroups.push(
      {
        id: 'tree',
        label: 'Cây Gia Phả',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        ),
        singleTab: 'tree',
      },
      {
        id: 'network',
        label: 'Mạng lưới Liên họ',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        ),
        badge: 'Mạng lưới',
        items: [
          { id: 'net-noi', label: 'Dòng họ Nội' },
          { id: 'net-ngoai', label: 'Dòng họ Ngoại' },
          { id: 'net-dau-re', label: 'Dâu & Rể liên họ' },
          { id: 'net-thong-gia', label: 'Họ Thông gia' },
        ],
      },
      {
        id: 'members',
        label: 'Hồ sơ & Thành viên',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        ),
        items: [
          { id: 'member-list', label: 'Danh sách thành viên' },
          { id: 'member-add', label: 'Thêm thành viên mới' },
          { id: 'member-profile', label: 'Hồ sơ cá nhân gia tộc' },
        ],
      },
      {
        id: 'finder',
        label: 'Tra cứu & Xưng hô',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        ),
        items: [
          { id: 'finder-auto', label: 'Tính quan hệ/xưng hô tự động' },
          { id: 'finder-path', label: 'Tìm đường đi quan hệ' },
        ],
      },
      {
        id: 'reports',
        label: 'Báo cáo & Xuất nhập',
        icon: (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        ),
        items: [
          { id: 'export-pdf', label: 'Xuất PDF / Sơ đồ PNG' },
          { id: 'export-excel', label: 'Xuất danh sách Excel' },
          { id: 'import-data', label: 'Nhập dữ liệu gia phả' },
        ],
      }
    );
  }

  return (
    <aside className={`sidebar-container ${isCollapsed ? 'collapsed' : 'expanded'}`}>
      {!isCollapsed && <div className="sidebar-section-title">{isSystemAdmin ? 'HỆ THỐNG QUẢN TRỊ' : (isClanAdmin ? 'QUẢN TRỊ DÒNG HỌ' : 'QUẢN LÝ GIA PHẢ')}</div>}

      {menuGroups.map((group) => {
        const isSingle = Boolean(group.singleTab);
        const isGroupActive = isSingle
          ? activeTab === group.singleTab
          : group.items?.some((item) => item.id === activeTab);
        const isExpanded = expandedGroups[group.id];

        return (
          <div key={group.id} className="sidebar-group-wrapper">
            <button
              onClick={() => {
                if (isSingle) {
                  onSelectTab(group.singleTab!);
                } else {
                  toggleGroup(group.id);
                }
              }}
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
                  {group.badge && (
                    <span className={`sidebar-badge ${group.id === 'admin' ? 'admin-badge' : ''}`}>
                      {group.badge}
                    </span>
                  )}
                  {!isSingle && (
                    <span className={`sidebar-arrow ${isExpanded ? 'open' : ''}`}>▼</span>
                  )}
                </div>
              )}
            </button>

            {!isCollapsed && !isSingle && isExpanded && group.items && (
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

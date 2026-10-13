import React, { useState } from 'react';
import './Sidebar.css';

export interface SidebarProps {
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  isCollapsed: boolean;
  userRole?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  userRole = 'Admin Trưởng tộc',
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    overview: true,
    family: false,
    members: false,
    interfamily: false,
    activities: false,
    archives: false,
    ai: false,
    worship: false,
    data: false,
    settings: false,
  });

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const menuGroups = [
    {
      id: 'overview',
      label: 'Tổng quan',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
      ),
      singleTab: 'dashboard',
    },
    {
      id: 'family',
      label: 'Dòng họ',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>
      ),
      items: [
        { id: 'family-profile', label: 'Hồ sơ dòng họ' },
        { id: 'ancestors', label: 'Quản lý Thủy tổ' },
        { id: 'branches', label: 'Chi / Nhánh' },
        { id: 'genealogy-tree', label: 'Cây gia phả' },
        { id: 'search', label: 'Tra cứu quan hệ' },
      ],
    },
    {
      id: 'members',
      label: 'Thành viên',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
      ),
      items: [
        { id: 'persons', label: 'Person (Nhân khẩu)' },
        { id: 'members', label: 'Tài khoản thành viên' },
        { id: 'family-admins', label: 'Family Admin' },
        { id: 'approvals', label: 'Phê duyệt' },
      ],
    },
    {
      id: 'interfamily',
      label: 'Liên họ',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>
      ),
      items: [
        { id: 'inter-family', label: 'Dòng họ liên kết' },
      ],
    },
    {
      id: 'activities',
      label: 'Hoạt động',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
      ),
      items: [
        { id: 'memorial-days', label: 'Ngày giỗ' },
        { id: 'events', label: 'Sự kiện' },
        { id: 'funds', label: 'Quỹ dòng họ' },
      ],
    },
    {
      id: 'archives',
      label: 'Tư liệu',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
      ),
      items: [
        { id: 'archives', label: 'Kho tư liệu số' },
        { id: '3d-library', label: 'Thư viện 3D/360' },
      ],
    },
    {
      id: 'ai',
      label: 'AI Trợ lý',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
      ),
      items: [
        { id: 'ai', label: 'Phân tích & Gợi ý' },
      ],
    },
    {
      id: 'worship',
      label: 'Không gian thờ',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8a2 2 0 012-2h10a2 2 0 012 2v13M10 10h4v4h-4v-4z" /></svg>
      ),
      singleTab: 'worship-space',
    },
    {
      id: 'data',
      label: 'Dữ liệu',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
      ),
      items: [
        { id: 'import-export', label: 'Import / Export' },
        { id: 'backup', label: 'Backup' },
        { id: 'audit-logs', label: 'Audit Log' },
      ],
    },
    {
      id: 'settings',
      label: 'Quản trị',
      icon: (
        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
      ),
      items: [
        { id: 'business', label: 'Business / Gói dịch vụ' },
        { id: 'privacy', label: 'Quyền riêng tư & Bảo mật' },
      ],
    },
  ];

  // Auto-expand group if active tab belongs to it
  React.useEffect(() => {
    const activeGroup = menuGroups.find(
      (group) =>
        group.singleTab === activeTab ||
        group.items?.some((item) => item.id === activeTab)
    );
    if (activeGroup && !expandedGroups[activeGroup.id]) {
      setExpandedGroups((prev) => ({ ...prev, [activeGroup.id]: true }));
    }
  }, [activeTab]);

  return (
    <aside className={`sidebar-container ${isCollapsed ? 'collapsed' : 'expanded'}`}>
      {!isCollapsed && <div className="sidebar-section-title">ADMIN TRƯỞNG TỘC</div>}

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

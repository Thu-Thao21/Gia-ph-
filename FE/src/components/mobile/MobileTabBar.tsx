import React from 'react';
import './MobileNav.css';

export interface MobileTabBarProps {
  activeTab: string;
  isMoreOpen: boolean;
  isSystemAdmin: boolean;
  onSelectTab: (tabId: string) => void;
  onOpenMore: () => void;
  /** Số thông báo chưa đọc (tuỳ chọn) – hiện badge trên tab Thông báo. */
  unreadCount?: number;
}

type TabIcon = 'home' | 'tree' | 'fund' | 'hall' | 'people' | 'approval' | 'more';

interface TabDef {
  id: string;
  label: string;
  icon: TabIcon;
  /** Các tab con cũng được coi là đang ở mục này. */
  matches?: string[];
}

// Cây gia phả ở giữa (vị trí 3/5). Sự kiện và Thông báo vẫn có trong "Thêm" (thông báo còn có chuông trên TopBar).
const MEMBER_TABS: TabDef[] = [
  { id: 'dashboard', label: 'Trang chủ', icon: 'home' },
  { id: 'funds', label: 'Quỹ', icon: 'fund' },
  { id: 'tree', label: 'Cây phả', icon: 'tree', matches: ['tree-vertical', 'tree-horizontal', 'tree-focus'] },
  { id: 'ancestral-hall', label: 'Phòng thờ', icon: 'hall' },
];

const ADMIN_TABS: TabDef[] = [
  { id: 'dashboard', label: 'Tổng quan', icon: 'home' },
  { id: 'admin-tree', label: 'Cây phả', icon: 'tree' },
  { id: 'admin-members-mgmt', label: 'Nhân khẩu', icon: 'people' },
  { id: 'admin-approval', label: 'Phê duyệt', icon: 'approval', matches: ['admin-approvals'] },
];

const ICON_PATHS: Record<TabIcon, React.ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></>,
  tree: <><path d="M12 3v5" /><path d="M5 13V9h14v4" /><rect x="2" y="13" width="6" height="7" rx="1.5" /><rect x="9" y="13" width="6" height="7" rx="1.5" /><rect x="16" y="13" width="6" height="7" rx="1.5" /></>,
  fund: <><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M16 12.5h2" /><path d="M2 10h20" /><path d="M6 3h12" /></>,
  hall: <><path d="M3 21h18" /><path d="M5 21V11" /><path d="M19 21V11" /><path d="M2 11 12 4l10 7" /><path d="M10 21v-5h4v5" /></>,
  people: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>,
  approval: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
};

const Icon: React.FC<{ name: TabIcon }> = ({ name }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ICON_PATHS[name]}
  </svg>
);

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  activeTab,
  isMoreOpen,
  isSystemAdmin,
  onSelectTab,
  onOpenMore,
  unreadCount = 0,
}) => {
  const tabs = isSystemAdmin ? ADMIN_TABS : MEMBER_TABS;
  const isPrimaryTab = tabs.some((t) => t.id === activeTab || t.matches?.includes(activeTab));

  return (
    <nav className="mobile-tabbar" aria-label="Điều hướng chính">
      {tabs.map((tab) => {
        const isActive = !isMoreOpen && (tab.id === activeTab || Boolean(tab.matches?.includes(activeTab)));
        const showBadge = tab.id === 'notifications' && unreadCount > 0;
        return (
          <button
            key={tab.id}
            type="button"
            className={`mobile-tabbar-item ${isActive ? 'active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="mobile-tabbar-icon">
              <Icon name={tab.icon} />
              {showBadge && (
                <span className="mobile-tabbar-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </span>
            <span className="mobile-tabbar-label">{tab.label}</span>
          </button>
        );
      })}

      <button
        type="button"
        className={`mobile-tabbar-item ${isMoreOpen || !isPrimaryTab ? 'active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={isMoreOpen}
        onClick={onOpenMore}
      >
        <span className="mobile-tabbar-icon"><Icon name="more" /></span>
        <span className="mobile-tabbar-label">Thêm</span>
      </button>
    </nav>
  );
};

export default MobileTabBar;

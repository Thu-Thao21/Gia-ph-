import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../../config/routes';
import circularEmblemLogo from '../../../assets/logo/logo_circular_emblem.png';
import './TopBar.css';

export interface TopBarProps {
  userName: string;
  userRole?: string;
  onLogout: () => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onNavigateTab?: (tabId: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  userName,
  userRole = 'Thành viên',
  onLogout,
  isSidebarCollapsed,
  onToggleSidebar,
  onNavigateTab,
}) => {
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  // [L-30]: Lắng nghe sự kiện Escape và Click Outside để tự động đóng dropdown menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowProfileMenu(false);
        setShowNotifications(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
      if (notifMenuRef.current && !notifMenuRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };

    if (showProfileMenu || showNotifications) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileMenu, showNotifications]);

  const [notifications, setNotifications] = useState<Array<{ id: number; title: string; desc: string; time: string; unread: boolean }>>([
    {
      id: 1,
      title: 'Lịch giỗ sắp tới',
      desc: 'Giỗ Cụ Nguyễn Văn A (Đời thứ 3) sẽ diễn ra vào ngày 15/08 Âm lịch.',
      time: '10 phút trước',
      unread: true,
    },
    {
      id: 2,
      title: 'Đề xuất thay đổi',
      desc: 'Yêu cầu cập nhật thông tin học vấn đã được gửi cho Quản trị viên duyệt.',
      time: '2 giờ trước',
      unread: true,
    },
    {
      id: 3,
      title: 'Sự kiện gia tộc',
      desc: 'Lễ giỗ tổ dòng họ năm 2026 đã mở đăng ký tham dự.',
      time: '1 ngày trước',
      unread: false,
    },
  ]);

  const unreadCount = notifications.filter((n) => n.unread).length;
  const roleClass = userRole === 'Admin' ? 'admin' : 'member';

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      if (onNavigateTab) {
        onNavigateTab('member-list');
      } else {
        navigate(`${ROUTES.USER.MEMBERS}?search=${encodeURIComponent(searchQuery)}`);
      }
    }
  };

  const handleNavToProfile = () => {
    setShowProfileMenu(false);
    if (userRole === 'Admin') {
      if (onNavigateTab) onNavigateTab('admin-permissions');
      else navigate(ROUTES.ADMIN.ACCOUNTS);
    } else if (onNavigateTab) onNavigateTab('my-profile');
    else navigate(ROUTES.USER.MY_PROFILE);
  };

  const handleNavToSettings = () => {
    setShowProfileMenu(false);
    if (userRole === 'Admin') {
      if (onNavigateTab) onNavigateTab('admin-roles');
      else navigate(ROUTES.ADMIN.ROLES);
    } else if (onNavigateTab) onNavigateTab('privacy-settings');
    else navigate(ROUTES.USER.PRIVACY_SETTINGS);
  };

  const handleNavToAIConsent = () => {
    setShowProfileMenu(false);
    if (onNavigateTab) onNavigateTab('ai-consent');
    else navigate(ROUTES.USER.AI_CONSENT);
  };

  return (
    <header className="topbar-header">
      <div className="topbar-left-group">
        <button
          onClick={onToggleSidebar}
          className="topbar-toggle-btn"
          title={isSidebarCollapsed ? 'Mở rộng Menu' : 'Thu gọn Menu'}
        >
          {isSidebarCollapsed ? '☰' : '✕'}
        </button>

        <div className="topbar-brand-box" onClick={() => navigate(userRole === 'Admin' ? ROUTES.ADMIN.ROOT : ROUTES.USER.ROOT)} style={{ cursor: 'pointer' }}>
          <img src={circularEmblemLogo} alt="Gia Phả Việt Logo" className="topbar-logo-icon" />
          <div>
            <div className="topbar-system-tag">HỆ THỐNG GIA PHẢ LIÊN HỌ</div>
            <div className="topbar-brand-title">Gia Phả Việt</div>
          </div>
        </div>
      </div>

      <form className="topbar-search-container" onSubmit={handleSearchSubmit}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm kiếm nhanh tên thành viên, biệt hiệu, dòng họ hoặc ngày giỗ..."
          className="topbar-search-input"
        />
        <button type="submit" className="topbar-search-icon-wrapper" style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </form>

      <div className="topbar-right-group">
        <div className="topbar-notif-wrapper" ref={notifMenuRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="topbar-notif-btn"
            title="Trung tâm thông báo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="topbar-notif-badge">{unreadCount}</span>
            )}
          </button>

          {showNotifications && (
            <div className="topbar-notif-dropdown">
              <div className="topbar-notif-dropdown-header">
                <div className="topbar-notif-dropdown-title-row">
                  <span className="topbar-notif-dropdown-title">
                    Trung Tâm Thông Báo
                  </span>
                </div>
                <button
                  type="button"
                  className="topbar-notif-mark-read"
                  onClick={handleMarkAllRead}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Đánh dấu đã đọc
                </button>
              </div>

              <div className="topbar-notif-list">
                {notifications.length === 0 ? (
                  <div className="topbar-notif-empty">
                    Không có thông báo mới nào.
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      className={`topbar-notif-item ${item.unread ? 'unread' : 'read'}`}
                    >
                      <div className="topbar-notif-item-title">{item.title}</div>
                      <div className="topbar-notif-item-desc">{item.desc}</div>
                      <div className="topbar-notif-item-time">{item.time}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="topbar-profile-wrapper" ref={profileMenuRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="topbar-user-btn"
            data-testid="btn-topbar-profile"
          >
            <div className="topbar-user-avatar">{userName.charAt(0).toUpperCase()}</div>

            <div className="topbar-user-info">
              <div className="topbar-user-name">{userName}</div>
              <div className="topbar-user-role-row">
                <span className={`topbar-user-role-badge ${roleClass}`}>{userRole}</span>
              </div>
            </div>

            <span className="topbar-user-arrow">▼</span>
          </button>

          {showProfileMenu && (
            <div className="topbar-profile-dropdown" data-testid="dropdown-profile-menu">
              <div className="topbar-profile-header">
                <div className="topbar-profile-name">{userName}</div>
                <div className="topbar-profile-role">{userRole}</div>
              </div>

              <button className="topbar-menu-item" onClick={handleNavToProfile}>
                Hồ sơ cá nhân gia tộc
              </button>

              <button className="topbar-menu-item" onClick={handleNavToSettings}>
                Cài đặt & Quyền riêng tư
              </button>

              {userRole !== 'Admin' && (
                <button className="topbar-menu-item" onClick={handleNavToAIConsent}>
                  Quyền sử dụng AI
                </button>
              )}

              <div className="topbar-profile-divider" />

              <button
                onClick={onLogout}
                className="topbar-menu-item-logout"
                data-testid="btn-topbar-logout"
              >
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;

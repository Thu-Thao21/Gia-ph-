import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from '../../common/Toast';
import logoImage from '../../../assets/logo.jpg';
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
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const toast = useToast();

  const notifications: Array<{ id: number; title: string; desc: string; time: string; unread: boolean }> = [];

  const roleClass =
    userRole === 'Admin' ? 'admin' : 'member';

  return (
    <header className="topbar-header">
      <div className="topbar-left-group">
        <button
          onClick={onToggleSidebar}
          className="topbar-toggle-btn"
          title={isSidebarCollapsed ? 'Mở rộng Menu' : 'Thu gọn Menu'}
        >
          {isSidebarCollapsed ? '☰' : ''}
        </button>

        <div
          className="topbar-brand-box"
          onClick={() => {
            if (onNavigateTab) {
              onNavigateTab('dashboard');
            } else {
              window.location.href = '/';
            }
          }}
          title="Về Trang chủ"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              if (onNavigateTab) {
                onNavigateTab('dashboard');
              } else {
                window.location.href = '/';
              }
            }
          }}
        >
          <img src={logoImage} alt="Logo" className="topbar-logo-image" />
          <div>
            <div className="topbar-system-tag">HỆ THỐNG GIA PHẢ LIÊN HỌ</div>
            <div className="topbar-brand-title">Gia Phả Dòng Tộc</div>
          </div>
        </div>
      </div>

      <div className="topbar-search-container">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm kiếm nhanh tên thành viên, biệt hiệu, dòng họ hoặc ngày giỗ..."
          className="topbar-search-input"
        />
        <span className="topbar-search-icon-wrapper">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
      </div>

      <div className="topbar-right-group">
        <div className="topbar-notif-wrapper">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="topbar-notif-btn"
            title="Trung tâm thông báo"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {notifications.length > 0 && (
              <span className="topbar-notif-badge">{notifications.length}</span>
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
                <span className="topbar-notif-mark-read">
                  Đánh dấu đã đọc
                </span>
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

        <div className="topbar-profile-wrapper">
          <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="topbar-user-btn">
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
            <div className="topbar-profile-dropdown">
              <div className="topbar-profile-header">
                <div className="topbar-profile-name">{userName}</div>
                <div className="topbar-profile-role">{userRole}</div>
              </div>

              <button
                className="topbar-menu-item"
                onClick={() => {
                  setShowProfileMenu(false);
                  if (onNavigateTab) {
                    onNavigateTab('my-profile');
                  } else {
                    toast.info('Hồ sơ cá nhân', 'Đang mở trang hồ sơ cá nhân...');
                  }
                }}
              >
                Hồ sơ cá nhân
              </button>

              <button
                className="topbar-menu-item"
                onClick={() => {
                  setShowProfileMenu(false);
                  if (onNavigateTab) {
                    onNavigateTab('account-settings');
                  } else {
                    toast.info('Cài đặt tài khoản', 'Đang mở trang cài đặt tài khoản...');
                  }
                }}
              >
                Cài đặt tài khoản
              </button>

              <div className="topbar-profile-divider" />

              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  setIsLogoutModalOpen(true);
                }}
                className="topbar-menu-item-logout"
              >
                Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal xác nhận đăng xuất */}
      {isLogoutModalOpen && (
        <div className="admin-modal-backdrop" onClick={() => setIsLogoutModalOpen(false)}>
          <div className="admin-modal-card modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <span className="admin-modal-tag tag-danger">XÁC NHẬN PHIÊN LÀM VIỆC</span>
                <h3 className="admin-modal-title">Đăng Xuất Khỏi Hệ Thống</h3>
              </div>
              <button className="admin-modal-close" onClick={() => setIsLogoutModalOpen(false)}>×</button>
            </div>

            <div className="admin-modal-body">
              <p className="admin-confirm-desc">
                Bạn có chắc chắn muốn đăng xuất khỏi tài khoản <strong>{userName}</strong> ({userRole})?
                Mọi tác vụ chưa lưu cần được kiểm tra trước khi thoát.
              </p>
            </div>

            <div className="admin-modal-footer">
              <button className="btn-modal-cancel" onClick={() => setIsLogoutModalOpen(false)}>
                Hủy bỏ
              </button>
              <button
                className="btn-modal-reject-confirm"
                onClick={() => {
                  setIsLogoutModalOpen(false);
                  toast.success('Đăng xuất thành công', 'Hẹn gặp lại bạn trong phiên làm việc tiếp theo!');
                  onLogout();
                }}
              >
                Đăng Xuất Ngay
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default TopBar;

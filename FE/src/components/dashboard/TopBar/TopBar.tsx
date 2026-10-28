import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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

export interface NotificationItem {
  id: number;
  title: string;
  desc: string;
  time: string;
  unread: boolean;
  type?: string;
  fullContent?: string;
  targetTab?: string;
}

export const getNotificationTypeConfig = (type?: string) => {
  const t = (type || '').toLowerCase();
  if (t.includes('giỗ') || t.includes('tưởng niệm')) {
    return {
      label: type || 'Lễ giỗ & Tưởng niệm',
      color: '#d97706',
      badgeBg: '#fef3c7',
      badgeBorder: '#fde68a',
      iconBg: '#fffbeb',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    };
  }
  if (t.includes('duyệt') || t.includes('thay đổi') || t.includes('hồ sơ')) {
    return {
      label: type || 'Phê duyệt hồ sơ',
      color: '#2563eb',
      badgeBg: '#eff6ff',
      badgeBorder: '#bfdbfe',
      iconBg: '#eff6ff',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    };
  }
  return {
    label: type || 'Sự kiện & Hoạt động',
    color: '#7c3aed',
    badgeBg: '#f5f3ff',
    badgeBorder: '#ddd6fe',
    iconBg: '#faf5ff',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  };
};

export const renderNotificationContent = (content: string) => {
  const paragraphs = content.split('\n\n');
  return (
    <div className="topbar-notif-content-flow">
      {paragraphs.map((para, idx) => {
        const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);

        // Khối nổi bật thông tin thời gian & địa điểm
        const isHighlightBlock = lines.some((l) => l.startsWith('Thời gian:') || l.startsWith('Địa điểm:'));
        if (isHighlightBlock) {
          return (
            <div key={idx} className="topbar-notif-highlight-card">
              {lines.map((line, lIdx) => (
                <div key={lIdx} className="topbar-notif-highlight-row">
                  <span className="topbar-notif-highlight-text">{line}</span>
                </div>
              ))}
            </div>
          );
        }

        // Khối danh sách các mục có dấu gạch đầu dòng / bullet
        const isListBlock = lines.some((l) => l.startsWith('•'));
        if (isListBlock) {
          return (
            <div key={idx} className="topbar-notif-list-card">
              {lines.map((line, lIdx) => {
                if (line.endsWith(':')) {
                  return (
                    <div key={lIdx} className="topbar-notif-list-header">
                      {line}
                    </div>
                  );
                }
                if (line.startsWith('•')) {
                  return (
                    <div key={lIdx} className="topbar-notif-list-item">
                      <span className="topbar-notif-list-bullet" />
                      <span className="topbar-notif-list-text">{line.replace(/^•\s*/, '')}</span>
                    </div>
                  );
                }
                return (
                  <div key={lIdx} className="topbar-notif-list-text-regular">
                    {line}
                  </div>
                );
              })}
            </div>
          );
        }

        return (
          <p key={idx} className="topbar-notif-paragraph">
            {para}
          </p>
        );
      })}
    </div>
  );
};

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
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const notifMenuRef = useRef<HTMLDivElement>(null);

  // Lắng nghe sự kiện Escape và Click Outside để tự động đóng dropdown menu & modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowProfileMenu(false);
        setShowNotifications(false);
        setSelectedNotification(null);
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

    if (showProfileMenu || showNotifications || selectedNotification) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileMenu, showNotifications, selectedNotification]);

  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 1,
      title: 'Lịch giỗ sắp tới',
      desc: 'Giỗ Cụ Nguyễn Văn A (Đời thứ 3) sẽ diễn ra vào ngày 15/08 Âm lịch.',
      time: '10 phút trước',
      unread: true,
      type: 'Lễ giỗ & Tưởng niệm',
      fullContent: 'Kính gửi toàn thể quý bà con cô bác và con cháu trong dòng tộc,\n\nBan khánh tiết xin trân trọng thông báo: Lễ tưởng niệm ngày giỗ Cụ Nguyễn Văn A (Đời thứ 3 - Chi 1) sẽ được tổ chức trang trọng tại Từ đường Nhà thờ tộc.\n\nThời gian: Ngày 15 tháng 08 Âm lịch\nĐịa điểm: Từ đường chính gia tộc\n\nChương trình buổi lễ:\n• 08:30: Lễ cáo yết và dâng hương tiên tổ\n• 10:00: Họp mặt truyền thống các chi phái và báo cáo quỹ khuyến học\n• 11:30: Thụ lộc gia tộc và giao lưu con cháu nội ngoại\n\nKính mời các gia đình và con cháu thu xếp thời gian về dự đông đủ.',
      targetTab: 'anniversaries',
    },
    {
      id: 2,
      title: 'Đề xuất thay đổi',
      desc: 'Yêu cầu cập nhật thông tin học vấn đã được gửi cho Quản trị viên duyệt.',
      time: '2 giờ trước',
      unread: true,
      type: 'Phê duyệt hồ sơ',
      fullContent: 'Hệ thống vừa tiếp nhận yêu cầu thay đổi thông tin từ thành viên trong gia tộc:\n\n• Người gửi: Nguyễn Văn B (Chi phái 2, Đời thứ 5)\n• Loại đề xuất: Cập nhật học vấn & nghề nghiệp\n• Nội dung thay đổi: Bổ sung bằng Thạc sĩ Công nghệ Thông tin, đơn vị công tác mới.\n\nYêu cầu này đã được chuyển đến mục Phê duyệt để Quản trị viên kiểm tra và cập nhật chính thức vào cơ sở dữ liệu phả hệ.',
      targetTab: 'admin-approvals',
    },
    {
      id: 3,
      title: 'Sự kiện gia tộc',
      desc: 'Lễ giỗ tổ dòng họ năm 2026 đã mở đăng ký tham dự.',
      time: '1 ngày trước',
      unread: false,
      type: 'Sự kiện & Hoạt động',
      fullContent: 'Ban liên lạc dòng họ thông báo đã chính thức mở cổng đăng ký tham dự Đại lễ Giỗ Tổ Dòng Họ năm 2026.\n\nĐể công tác đón tiếp và chuẩn bị khánh tiết được chu đáo, kính đề nghị đại diện các gia đình đăng ký sớm số lượng người tham dự trực tiếp trên hệ thống tại mục Quản lý Sự kiện.',
      targetTab: 'clan-events',
    },
  ]);

  const unreadCount = notifications.filter((n) => n.unread).length;
  const roleClass = userRole === 'Admin' ? 'admin' : 'member';

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, unread: false })));
  };

  const handleNotificationClick = (item: NotificationItem) => {
    // 1. Tự động đánh dấu đã đọc thông báo được bấm
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, unread: false } : n))
    );
    // 2. Mở modal hiển thị chi tiết thông báo
    setSelectedNotification({ ...item, unread: false });
    // 3. Đóng dropdown thông báo
    setShowNotifications(false);
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

  const handleNavToClanProfile = () => {
    setShowProfileMenu(false);
    if (onNavigateTab) onNavigateTab('clan-profile');
    else navigate(ROUTES.USER.CLAN_PROFILE);
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
                  notifications.map((item) => {
                    const typeConfig = getNotificationTypeConfig(item.type);
                    return (
                      <div
                        key={item.id}
                        className={`topbar-notif-item ${item.unread ? 'unread' : 'read'}`}
                        onClick={() => handleNotificationClick(item)}
                        role="button"
                        tabIndex={0}
                        title="Bấm để xem chi tiết và tự động đánh dấu đã đọc"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleNotificationClick(item);
                          }
                        }}
                      >
                        <div
                          className="topbar-notif-item-icon-box"
                          style={{
                            backgroundColor: typeConfig.iconBg,
                            color: typeConfig.color,
                            borderColor: typeConfig.badgeBorder,
                          }}
                        >
                          {typeConfig.icon}
                        </div>
                        <div className="topbar-notif-item-content-col">
                          <div className="topbar-notif-item-header">
                            <span className="topbar-notif-item-title">{item.title}</span>
                            {item.unread && <span className="topbar-notif-item-dot" title="Chưa đọc" />}
                          </div>
                          <div className="topbar-notif-item-desc">{item.desc}</div>
                          <div className="topbar-notif-item-meta">
                            <span className="topbar-notif-item-time">{item.time}</span>
                            <span className="topbar-notif-item-click-hint">Xem chi tiết →</span>
                          </div>
                        </div>
                      </div>
                    );
                  })
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
                Hồ sơ của tôi
              </button>

              <button className="topbar-menu-item" onClick={handleNavToClanProfile}>
                Hồ sơ gia tộc
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

      {/* Modal chi tiết thông báo hiển thị trên toàn màn hình khi người dùng bấm vào 1 thông báo */}
      {selectedNotification && typeof document !== 'undefined' && createPortal(
        (() => {
          const typeConfig = getNotificationTypeConfig(selectedNotification.type);
          return (
            <div
              className="topbar-notif-modal-backdrop"
              onClick={() => setSelectedNotification(null)}
              role="dialog"
              aria-modal="true"
            >
              <div
                className="topbar-notif-modal-card"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="topbar-notif-modal-header">
                  <div className="topbar-notif-modal-header-left">
                    <div
                      className="topbar-notif-modal-icon-box"
                      style={{
                        backgroundColor: typeConfig.iconBg,
                        color: typeConfig.color,
                        borderColor: typeConfig.badgeBorder,
                      }}
                    >
                      {typeConfig.icon}
                    </div>
                    <div className="topbar-notif-modal-header-text">
                      <div className="topbar-notif-modal-top-meta">
                        <span
                          className="topbar-notif-modal-badge"
                          style={{
                            backgroundColor: typeConfig.badgeBg,
                            color: typeConfig.color,
                            borderColor: typeConfig.badgeBorder,
                          }}
                        >
                          <span className="topbar-notif-modal-badge-dot" style={{ backgroundColor: typeConfig.color }} />
                          <span>{typeConfig.label}</span>
                        </span>
                        <span className="topbar-notif-modal-status">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Đã đánh dấu đã đọc
                        </span>
                      </div>

                      <h2 className="topbar-notif-modal-title">{selectedNotification.title}</h2>

                      <div className="topbar-notif-modal-time-row">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span>{selectedNotification.time}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="topbar-notif-modal-close"
                    onClick={() => setSelectedNotification(null)}
                    title="Đóng cửa sổ (Esc)"
                    aria-label="Đóng"
                  >
                    ✕
                  </button>
                </div>

                <div className="topbar-notif-modal-body">
                  {renderNotificationContent(selectedNotification.fullContent || selectedNotification.desc)}
                </div>

                <div className="topbar-notif-modal-footer">
                  <button
                    type="button"
                    className="topbar-notif-modal-btn-secondary"
                    onClick={() => setSelectedNotification(null)}
                  >
                    Đóng
                  </button>
                  {selectedNotification.targetTab && onNavigateTab && (
                    <button
                      type="button"
                      className="topbar-notif-modal-btn-primary"
                      onClick={() => {
                        const tab = selectedNotification.targetTab!;
                        setSelectedNotification(null);
                        onNavigateTab(tab);
                      }}
                    >
                      <span>Đến trang liên quan</span>
                      <span className="topbar-notif-modal-btn-arrow">→</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })(),
        document.body
      )}
    </header>
  );
};

export default TopBar;

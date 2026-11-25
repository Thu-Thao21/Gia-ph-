import { ROUTES } from './routes';

export interface NavItem {
  id: string;
  label: string;
  route?: string;
  badge?: string;
  children?: NavItem[];
}

export interface NavGroup {
  groupLabel: string;
  items: NavItem[];
}

// 1. MEMBER NAVIGATION (THÀNH VIÊN THƯỜNG - 38 FRs)
export const memberNavigation: NavGroup[] = [
  {
    groupLabel: 'TỔNG QUAN',
    items: [
      { id: 'dashboard', label: 'Trang chủ', route: ROUTES.USER.DASHBOARD },
      { id: 'notifications', label: 'Thông báo & Cài đặt', route: ROUTES.USER.NOTIFICATIONS },
    ],
  },
  {
    groupLabel: 'GIA PHẢ & QUAN HỆ',
    items: [
      { id: 'tree', label: 'Cây Gia Phả', route: ROUTES.USER.TREE_HORIZONTAL },
      { id: 'member-list', label: 'Danh sách thành viên', route: ROUTES.USER.MEMBERS },
      { id: 'relationship-finder', label: 'Tra cứu & Xưng hô', route: ROUTES.USER.RELATIONSHIP },
    ],
  },
  {
    groupLabel: 'MẠNG LƯỚI LIÊN HỌ',
    items: [
      {
        id: 'network',
        label: 'Mạng lưới Liên họ',
        children: [
          { id: 'net-noi', label: 'Dòng họ Nội', route: ROUTES.USER.NETWORK_NOI },
          { id: 'net-ngoai', label: 'Dòng họ Ngoại', route: ROUTES.USER.NETWORK_NGOAI },
          { id: 'net-dau-re', label: 'Dâu & Rể liên họ', route: ROUTES.USER.NETWORK_DAU_RE },
          { id: 'net-thong-gia', label: 'Họ Thông gia', route: ROUTES.USER.NETWORK_THONG_GIA },
        ],
      },
    ],
  },
  {
    groupLabel: 'HỒ SƠ & ĐỀ XUẤT',
    items: [
      { id: 'my-profile', label: 'Hồ sơ của tôi', route: ROUTES.USER.MY_PROFILE },
      { id: 'my-proposals', label: 'Đề xuất của tôi', route: ROUTES.USER.PROPOSALS },
    ],
  },
  {
    groupLabel: 'ĐỜI SỐNG DÒNG HỌ',
    items: [
      { id: 'events', label: 'Sự kiện & Ngày giỗ', route: ROUTES.USER.EVENTS },

      { id: 'funds', label: 'Quỹ & Đóng góp', route: ROUTES.USER.FUNDS },
      { id: 'ancestral-hall', label: 'Phòng thờ số', route: ROUTES.USER.ANCESTRAL_HALL },
    ],
  },
  {
    groupLabel: 'TƯ LIỆU & AI',
    items: [
      { id: 'documents', label: 'Tư liệu lịch sử', route: ROUTES.USER.DOCUMENTS },
      { id: 'ai-assistant', label: 'Trợ lý AI dòng họ', route: ROUTES.USER.AI_ASSISTANT },
      { id: 'ai-consent', label: 'Đồng ý sử dụng AI', route: ROUTES.USER.AI_CONSENT },
    ],
  },
  {
    groupLabel: 'CÀI ĐẶT & BẢO MẬT',
    items: [
      { id: 'privacy-settings', label: 'Quyền riêng tư', route: ROUTES.USER.PRIVACY_SETTINGS },
      { id: 'privacy-preview', label: 'Xem trước góc nhìn', route: ROUTES.USER.PRIVACY_PREVIEW },
    ],
  },
];


// 3. ADMIN NAVIGATION (QUẢN TRỊ VIÊN HỆ THỐNG)
export const adminNavigation: NavGroup[] = [
  {
    groupLabel: 'QUẢN TRỊ HỆ THỐNG',
    items: [
      { id: 'dashboard', label: 'Dashboard', route: ROUTES.ADMIN.DASHBOARD },
      { id: 'admin-account-mgmt', label: 'Quản Lý Tài Khoản', route: ROUTES.ADMIN.ACCOUNTS },
      { id: 'admin-approvals', label: 'Phê duyệt', route: ROUTES.ADMIN.APPROVALS },
      { id: 'admin-packages', label: 'Gói Dịch Vụ', route: ROUTES.ADMIN.PACKAGES },
      { id: 'admin-payments', label: 'Thanh Toán', route: ROUTES.ADMIN.PAYMENTS },
      { id: 'admin-moderation', label: 'Kiểm Duyệt', route: ROUTES.ADMIN.MODERATION },
      { id: 'admin-roles', label: 'Phân Quyền & Role', route: ROUTES.ADMIN.ROLES },
      { id: 'admin-logs', label: 'Nhật Ký Hệ Thống', route: ROUTES.ADMIN.SECURITY_LOGS },
      { id: 'admin-data-backup', label: 'Sao Lưu & Khôi Phục', route: ROUTES.ADMIN.BACKUP },
    ],
  },
];

export function getNavigationForRole(role: string): NavGroup[] {
  const r = role.toLowerCase();
  if (r === 'admin') {
    return adminNavigation;
  }

  return memberNavigation;
}

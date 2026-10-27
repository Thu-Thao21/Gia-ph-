import React, { useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import './NotificationCenterModule.css';

export type NotificationCategory = 'memorial' | 'event' | 'proposal' | 'fund' | 'system' | 'security' | 'ai';
export type DeliveryChannel = 'inApp' | 'email' | 'push';

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  content: string;
  createdAt: string;
  read: boolean;
  senderName?: string;
  targetAudience?: string;
}

export interface ClanBroadcastItem {
  id: string;
  clanName: string;
  senderName: string;
  senderRole: string;
  title: string;
  content: string;
  category: NotificationCategory;
  targetAudience: 'all' | 'chi_truong' | 'chi_thu' | 'council';
  priority: 'normal' | 'urgent';
  channels: {
    inApp: boolean;
    email: boolean;
    push: boolean;
  };
  createdAt: string;
  recipientCount: number;
  readCount: number;
}

export interface NotificationPreferences {
  masterEnabled: boolean;
  channels: Record<NotificationCategory, Record<DeliveryChannel, boolean>>;
  updatedAt: string | null;
}

export interface NotificationCenterModuleProps {
  canManage?: boolean;
  clanName?: string;
  userRole?: string;
}

const PREF_STORAGE_KEY = 'mfg-notification-preferences-v3';
const BROADCAST_STORAGE_KEY = 'mfg-clan-broadcasts-v3';

export const CATEGORIES: Array<{
  id: NotificationCategory;
  label: string;
  description: string;
}> = [
  { id: 'event', label: 'Sự kiện gia tộc', description: 'Lịch họp đại hội, nghi lễ và các sự kiện dòng họ.' },
  { id: 'memorial', label: 'Nhắc ngày giỗ', description: 'Ngày giỗ tổ và lịch tưởng niệm các bậc tiền bối.' },
  { id: 'fund', label: 'Quỹ dòng họ', description: 'Đóng góp, thu chi và xác nhận giao dịch quỹ gia tộc.' },
  { id: 'proposal', label: 'Đề xuất quan hệ', description: 'Kết quả phê duyệt hồ sơ và kết nối gia phả.' },
  { id: 'system', label: 'Thông báo chung', description: 'Tin tức, quy ước và thông cáo từ hội đồng gia tộc.' },
  { id: 'security', label: 'Bảo mật', description: 'Đăng nhập mới và thay đổi quyền truy cập tài khoản.' },
  { id: 'ai', label: 'Thông báo AI', description: 'Kết quả và gợi ý phục dựng từ trợ lý AI gia phả.' },
];

export const AUDIENCE_OPTIONS: Array<{
  id: 'all' | 'chi_truong' | 'chi_thu' | 'council';
  label: string;
  countText: string;
}> = [
  { id: 'all', label: 'Toàn thể dòng họ (Mọi thành viên)', countText: '~142 thành viên' },
  { id: 'chi_truong', label: 'Chi 1 (Chi Trưởng Từ Đường)', countText: '~86 thành viên' },
  { id: 'chi_thu', label: 'Chi 2 (Chi Thứ)', countText: '~56 thành viên' },
  { id: 'council', label: 'Hội đồng gia tộc & Ban Trị sự', countText: '18 thành viên' },
];

const DEFAULT_PREFERENCES: NotificationPreferences = {
  masterEnabled: true,
  channels: {
    event: { inApp: true, email: true, push: true },
    memorial: { inApp: true, email: true, push: true },
    fund: { inApp: true, email: true, push: false },
    proposal: { inApp: true, email: true, push: false },
    system: { inApp: true, email: false, push: false },
    security: { inApp: true, email: true, push: true },
    ai: { inApp: true, email: false, push: false },
  },
  updatedAt: null,
};

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-01',
    category: 'memorial',
    title: 'Sắp đến ngày giỗ Cụ Nguyễn Văn Đức',
    content: 'Còn 3 ngày nữa là ngày giỗ chính lễ 15/08 Âm lịch tại từ đường chi trưởng. Kính mời con cháu sắp xếp tham dự.',
    createdAt: '12/09/2026 09:00',
    read: false,
    senderName: 'Ban Trị Sự',
  },
  {
    id: 'notif-02',
    category: 'proposal',
    title: 'Đề xuất quan hệ đã được tiếp nhận',
    content: 'Yêu cầu bổ sung quan hệ cha – con đang được quản trị viên dòng họ kiểm tra và đối chiếu hồ sơ gia phả.',
    createdAt: '10/09/2026 15:30',
    read: false,
    senderName: 'Ban Quản Trị',
  },
  {
    id: 'notif-03',
    category: 'event',
    title: 'Mở đăng ký Lễ Tuyên dương Khuyến học 2026',
    content: 'Ban khuyến học bắt đầu nhận danh sách khen thưởng con cháu đạt thành tích học tập xuất sắc niên khóa 2025-2026.',
    createdAt: '05/09/2026 08:00',
    read: true,
    senderName: 'Hội đồng Gia tộc',
  },
  {
    id: 'notif-04',
    category: 'fund',
    title: 'Đã xác nhận khoản đóng góp Quỹ Khuyến học',
    content: 'Khoản đóng góp 2.000.000 ₫ vào Quỹ Khuyến học niên khóa 2026 đã được Ban Thủ quỹ ghi nhận vào sổ vàng.',
    createdAt: '03/09/2026 17:45',
    read: true,
    senderName: 'Ban Thủ Quỹ',
  },
  {
    id: 'notif-05',
    category: 'security',
    title: 'Phát hiện đăng nhập trên thiết bị mới',
    content: 'Tài khoản được đăng nhập từ trình duyệt Chrome tại TP. Đà Nẵng. Nếu không phải bạn, vui lòng đổi mật khẩu ngay.',
    createdAt: '01/09/2026 10:15',
    read: false,
    senderName: 'Hệ thống Bảo mật',
  },
  {
    id: 'notif-06',
    category: 'ai',
    title: 'Bản gợi ý phục dựng tiểu sử Thủy Tổ đã hoàn tất',
    content: 'Trợ lý AI đã hoàn tất bản thảo tiểu sử Thủy Tổ dựa trên sắc phong và tư liệu cổ. Dữ liệu gốc gia phả chưa thay đổi.',
    createdAt: '30/08/2026 14:20',
    read: true,
    senderName: 'Trợ lý AI Gia Phả',
  },
];

const INITIAL_BROADCASTS: ClanBroadcastItem[] = [
  {
    id: 'broadcast-01',
    clanName: 'Họ Võ Đại Tộc',
    senderName: 'Trưởng Tộc Võ Đại Tộc',
    senderRole: 'Chủ dòng họ',
    title: 'Thông báo Kế hoạch Lễ Giỗ Tổ Xuân Tế 2026',
    content: 'Kính báo toàn thể con cháu nội ngoại Dòng Họ Võ Đại Tộc: Lễ Giỗ Tổ Xuân Tế năm 2026 sẽ được tổ chức trang trọng vào ngày 15 tháng Giêng Âm lịch tại Từ Đường Chi Trưởng. Đề nghị các chi nhánh cử đại diện về dự và dâng hương đúng giờ.',
    category: 'memorial',
    targetAudience: 'all',
    priority: 'urgent',
    channels: { inApp: true, email: true, push: true },
    createdAt: '12/09/2026 09:00',
    recipientCount: 142,
    readCount: 118,
  },
  {
    id: 'broadcast-02',
    clanName: 'Họ Võ Đại Tộc',
    senderName: 'Ban Trị Sự Dòng Họ',
    senderRole: 'Quản trị viên gia tộc',
    title: 'Phát động đóng góp Quỹ Khuyến học & Khuyến tài niên khóa 2026',
    content: 'Hội đồng gia tộc phát động đóng góp Quỹ Khuyến học năm 2026 nhằm khen thưởng các cháu học sinh, sinh viên đạt thành tích xuất sắc. Mọi đóng góp xin chuyển vào quỹ chung hoặc gửi trực tiếp cho Ban Tài Chính dòng họ.',
    category: 'fund',
    targetAudience: 'all',
    priority: 'normal',
    channels: { inApp: true, email: true, push: false },
    createdAt: '03/09/2026 17:45',
    recipientCount: 142,
    readCount: 95,
  },
  {
    id: 'broadcast-03',
    clanName: 'Họ Võ Đại Tộc',
    senderName: 'Trưởng Tộc Võ Đại Tộc',
    senderRole: 'Chủ dòng họ',
    title: 'Triệu tập phiên họp Hội đồng gia tộc định kỳ quý 3/2026',
    content: 'Kính mời các vị Trưởng Chi, Trưởng Nhánh và các thành viên Ban Quản trị tham dự phiên họp định kỳ quý 3 vào lúc 08h30 Chủ nhật tuần này tại Nhà thờ họ để thảo luận về kế hoạch tu bổ Từ đường.',
    category: 'event',
    targetAudience: 'council',
    priority: 'urgent',
    channels: { inApp: true, email: true, push: true },
    createdAt: '28/08/2026 08:30',
    recipientCount: 18,
    readCount: 17,
  },
];

const clonePreferences = (preferences: NotificationPreferences): NotificationPreferences =>
  JSON.parse(JSON.stringify(preferences)) as NotificationPreferences;

const loadPreferences = (): NotificationPreferences => {
  try {
    const raw = localStorage.getItem(PREF_STORAGE_KEY);
    if (!raw) return clonePreferences(DEFAULT_PREFERENCES);
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences> | null;
    if (!parsed || typeof parsed !== 'object') return clonePreferences(DEFAULT_PREFERENCES);

    const next = clonePreferences(DEFAULT_PREFERENCES);
    if (typeof parsed.masterEnabled === 'boolean') next.masterEnabled = parsed.masterEnabled;
    CATEGORIES.forEach(({ id }) => {
      (['inApp', 'email', 'push'] as DeliveryChannel[]).forEach((channel) => {
        const value = parsed.channels?.[id]?.[channel];
        if (typeof value === 'boolean') next.channels[id][channel] = value;
      });
    });
    next.updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
    return next;
  } catch {
    return clonePreferences(DEFAULT_PREFERENCES);
  }
};

const loadBroadcasts = (): ClanBroadcastItem[] => {
  try {
    const raw = localStorage.getItem(BROADCAST_STORAGE_KEY);
    if (!raw) return INITIAL_BROADCASTS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_BROADCASTS;
  } catch {
    return INITIAL_BROADCASTS;
  }
};

const formatUpdatedAt = (value: string | null) => {
  if (!value) return 'Chưa lưu trên thiết bị';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Không xác định';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

export const NotificationCenterModule: React.FC<NotificationCenterModuleProps> = ({
  canManage = false,
  clanName = 'Dòng Họ Võ Đại Tộc',
  userRole,
}) => {
  const { account, primaryRole } = useAuth();

  // Kiểm tra thẩm quyền Trưởng Tộc / Quản trị viên
  const isAuthorized =
    canManage ||
    primaryRole === 'family_head' ||
    primaryRole === 'family_admin' ||
    primaryRole === 'admin' ||
    Boolean(
      account?.roles?.some(
        (r) =>
          (r.role === 'family_head' || r.role === 'family_admin' || r.role === 'admin') &&
          (r.status === 'active' || r.status === 'ACTIVE')
      )
    );

  const initialPreferences = useMemo(loadPreferences, []);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [broadcasts, setBroadcasts] = useState<ClanBroadcastItem[]>(loadBroadcasts);

  // Tabs điều hướng chính: inbox | broadcasts | settings
  const [activeMainTab, setActiveMainTab] = useState<'inbox' | 'broadcasts' | 'settings'>('inbox');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [activeCategory, setActiveCategory] = useState<'all' | NotificationCategory>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [savedPreferences, setSavedPreferences] = useState<NotificationPreferences>(() =>
    clonePreferences(initialPreferences)
  );
  const [draftPreferences, setDraftPreferences] = useState<NotificationPreferences>(() =>
    clonePreferences(initialPreferences)
  );
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal Soạn thông báo mới
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [composerForm, setComposerForm] = useState({
    title: '',
    category: 'event' as NotificationCategory,
    targetAudience: 'all' as 'all' | 'chi_truong' | 'chi_thu' | 'council',
    priority: 'normal' as 'normal' | 'urgent',
    inApp: true,
    email: true,
    push: false,
    content: '',
  });
  const [composerError, setComposerError] = useState('');

  // Modal Xem chi tiết
  const [viewingBroadcast, setViewingBroadcast] = useState<ClanBroadcastItem | null>(null);
  const [viewingNotification, setViewingNotification] = useState<NotificationItem | null>(null);

  const isDirty = useMemo(
    () => JSON.stringify(savedPreferences) !== JSON.stringify(draftPreferences),
    [draftPreferences, savedPreferences]
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Lọc thông báo trong hộp thư
  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      if (activeFilter === 'unread' && item.read) return false;
      if (activeFilter === 'read' && !item.read) return false;
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const match =
          item.title.toLowerCase().includes(q) ||
          item.content.toLowerCase().includes(q) ||
          (item.senderName && item.senderName.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  }, [notifications, activeFilter, activeCategory, searchTerm]);

  // Lọc thông báo dòng họ đã phát
  const filteredBroadcasts = useMemo(() => {
    return broadcasts.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const match =
          item.title.toLowerCase().includes(q) ||
          item.content.toLowerCase().includes(q) ||
          item.senderName.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [broadcasts, activeCategory, searchTerm]);

  const updateChannel = (category: NotificationCategory, channel: DeliveryChannel, enabled: boolean) => {
    setDraftPreferences((current) => ({
      ...current,
      channels: {
        ...current.channels,
        [category]: { ...current.channels[category], [channel]: enabled },
      },
    }));
    setNotice(null);
  };

  const savePreferences = () => {
    const next = { ...clonePreferences(draftPreferences), updatedAt: new Date().toISOString() };
    try {
      localStorage.setItem(PREF_STORAGE_KEY, JSON.stringify(next));
      setSavedPreferences(clonePreferences(next));
      setDraftPreferences(clonePreferences(next));
      setNotice({ type: 'success', text: 'Đã lưu cài đặt kênh nhận thông báo thành công!' });
    } catch {
      setNotice({ type: 'error', text: 'Không thể lưu cài đặt thông báo trên trình duyệt.' });
    }
  };

  // Mẫu soạn thảo nhanh
  const applyTemplate = (templateType: 'meeting' | 'memorial' | 'fund') => {
    if (templateType === 'meeting') {
      setComposerForm((prev) => ({
        ...prev,
        title: 'Thông báo: Họp Hội đồng Gia tộc Dòng họ',
        category: 'event',
        priority: 'urgent',
        targetAudience: 'council',
        content:
          'Kính gửi toàn thể các vị Trưởng Chi, Trưởng Nhánh và Ban Trị sự:\n\n' +
          'Trưởng tộc trân trọng triệu tập phiên họp định kỳ của Hội đồng gia tộc vào lúc 08h30 Chủ nhật tuần này tại Nhà Từ Đường.\n' +
          'Nội dung chính:\n' +
          '1. Tổng kết tình hình sinh hoạt và các hoạt động dòng họ quý vừa qua.\n' +
          '2. Thảo luận phương án tu bổ, tôn tạo Nhà thờ họ.\n' +
          '3. Kế hoạch tổ chức Lễ Khuyến học cho các cháu có thành tích học tập tốt.\n\n' +
          'Kính mong quý đại biểu tham dự đầy đủ và đúng giờ.',
      }));
    } else if (templateType === 'memorial') {
      setComposerForm((prev) => ({
        ...prev,
        title: 'Kính báo: Lễ Giỗ Tổ Thường Niên tại Từ Đường Chi Trưởng',
        category: 'memorial',
        priority: 'urgent',
        targetAudience: 'all',
        content:
          'Kính thưa toàn thể bà con nội ngoại, con cháu Dòng họ:\n\n' +
          'Ngày 15 tháng Giêng Âm lịch tới đây là ngày Lễ Giỗ Tổ chính lễ của dòng tộc. Nghi thức tế lễ sẽ bắt đầu lúc 09h00 sáng tại Từ đường.\n\n' +
          'Hội đồng gia tộc trân trọng kính mời quý bà con cô bác, dâu rể cùng các thế hệ con cháu sắp xếp thời gian tề tựu đông đủ để dâng nén tâm hương tưởng niệm công đức Tổ tiên và sum vầy đại gia đình.\n\n' +
          'Trưởng tộc kính báo!',
      }));
    } else if (templateType === 'fund') {
      setComposerForm((prev) => ({
        ...prev,
        title: 'Thư kêu gọi: Đóng góp Quỹ Khuyến học & Nghĩa tình Gia tộc',
        category: 'fund',
        priority: 'normal',
        targetAudience: 'all',
        content:
          'Kính gửi toàn thể bà con gia tộc và các nhà hảo tâm:\n\n' +
          'Để chuẩn bị cho Lễ Tuyên dương Khuyến học sắp tới và hỗ trợ các gia đình gặp hoàn cảnh khó khăn trong dòng tộc, Ban Quản lý Quỹ trân trọng phát động đợt đóng góp niên khóa 2026.\n\n' +
          'Mọi sự ủng hộ xin chuyển về tài khoản Quỹ dòng họ hoặc gửi trực tiếp cho Ban Tài chính. Danh sách công đức sẽ được cập nhật công khai minh bạch trên hệ thống.\n\n' +
          'Xin chân thành tri ân tấm lòng của quý bà con!',
      }));
    }
  };

  // Phát thông báo mới
  const handlePublishBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerForm.title.trim()) {
      setComposerError('Vui lòng nhập tiêu đề thông báo.');
      return;
    }
    if (!composerForm.content.trim()) {
      setComposerError('Vui lòng nhập nội dung chi tiết thông báo.');
      return;
    }

    const now = new Date();
    const formattedDate = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(now);

    const senderDisplay =
      account?.display_name || (userRole ? `Trưởng Tộc (${userRole})` : 'Trưởng Tộc Võ Đại Tộc');
    const senderRoleTitle = primaryRole === 'family_head' ? 'Chủ dòng họ' : 'Quản trị viên gia tộc';

    const newBroadcast: ClanBroadcastItem = {
      id: `broadcast-${Date.now()}`,
      clanName: clanName || 'Dòng Họ Võ Đại Tộc',
      senderName: senderDisplay,
      senderRole: senderRoleTitle,
      title: composerForm.title.trim(),
      content: composerForm.content.trim(),
      category: composerForm.category,
      targetAudience: composerForm.targetAudience,
      priority: composerForm.priority,
      channels: {
        inApp: composerForm.inApp,
        email: composerForm.email,
        push: composerForm.push,
      },
      createdAt: formattedDate,
      recipientCount: composerForm.targetAudience === 'council' ? 18 : 142,
      readCount: 1,
    };

    const nextBroadcasts = [newBroadcast, ...broadcasts];
    setBroadcasts(nextBroadcasts);
    try {
      localStorage.setItem(BROADCAST_STORAGE_KEY, JSON.stringify(nextBroadcasts));
    } catch {
      // Ignored
    }

    // Đẩy vào hộp thư
    const newNotifItem: NotificationItem = {
      id: `notif-${Date.now()}`,
      category: composerForm.category,
      title: composerForm.title.trim(),
      content: composerForm.content.trim(),
      createdAt: 'Vừa xong',
      read: false,
      senderName: senderDisplay,
      targetAudience: AUDIENCE_OPTIONS.find((a) => a.id === composerForm.targetAudience)?.label,
    };
    setNotifications((prev) => [newNotifItem, ...prev]);

    setComposerForm({
      title: '',
      category: 'event',
      targetAudience: 'all',
      priority: 'normal',
      inApp: true,
      email: true,
      push: false,
      content: '',
    });
    setComposerError('');
    setIsComposerOpen(false);
    setActiveMainTab('broadcasts');
    setNotice({
      type: 'success',
      text: `Đã phát thông báo thành công đến ${
        AUDIENCE_OPTIONS.find((a) => a.id === composerForm.targetAudience)?.label || 'dòng họ'
      }!`,
    });
  };

  const handleDeleteBroadcast = (id: string) => {
    if (window.confirm('Bạn có chắc chắn muốn thu hồi và xóa thông báo này?')) {
      const next = broadcasts.filter((b) => b.id !== id);
      setBroadcasts(next);
      try {
        localStorage.setItem(BROADCAST_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignored
      }
      if (viewingBroadcast?.id === id) setViewingBroadcast(null);
      setNotice({ type: 'success', text: 'Đã thu hồi thông báo thành công.' });
    }
  };

  const handleToggleRead = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: !item.read } : item))
    );
  };

  const handleOpenNotifDetail = (item: NotificationItem) => {
    if (!item.read) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
      );
    }
    setViewingNotification(item);
  };

  return (
    <div className="notif-center-wrapper">
      {/* 1. Header Hero Card */}
      <div className="notif-hero-card">
        <div className="notif-hero-text">
          <div className="notif-eyebrow-row">
            <span className="notif-eyebrow-tag">
              {isAuthorized ? 'QUẢN TRỊ DÒNG HỌ & THÔNG CÁO' : 'HỆ THỐNG THÔNG BÁO'}
            </span>
            <span className="notif-clan-pill">{clanName}</span>
          </div>
          <h2 className="notif-hero-title">Trung Tâm Thông Báo</h2>
          <p className="notif-hero-desc">
            {isAuthorized
              ? 'Theo dõi cập nhật, kiểm soát kênh nhận tin và phát hành thông cáo chính thức tới toàn thể con cháu dòng tộc.'
              : 'Theo dõi cập nhật sinh hoạt dòng họ, nhắc nhở ngày giỗ và tùy chỉnh các kênh nhận thông báo cá nhân.'}
          </p>
        </div>

        <div className="notif-hero-btns">
          {isAuthorized && (
            <button
              type="button"
              className="btn-create-announcement"
              onClick={() => {
                setComposerError('');
                setIsComposerOpen(true);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Soạn Thông Báo Gia Tộc
            </button>
          )}

          <button
            type="button"
            className="btn-mark-all-read"
            onClick={() => setNotifications((current) => current.map((item) => ({ ...item, read: true })))}
            disabled={unreadCount === 0}
          >
            ✓ Đánh dấu tất cả đã đọc ({unreadCount})
          </button>
        </div>
      </div>

      {/* Thông báo Alert Toast */}
      {notice && (
        <div className={`notif-alert-banner ${notice.type}`}>
          <div className="notif-alert-left">
            <span className="notif-alert-icon">{notice.type === 'success' ? '✓' : '!'}</span>
            <span className="notif-alert-text">{notice.text}</span>
          </div>
          <button type="button" className="notif-alert-close" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      {/* 2. Thanh Tabs Chính điều hướng */}
      <div className="notif-nav-tabs-bar">
        <button
          type="button"
          className={`notif-nav-tab ${activeMainTab === 'inbox' ? 'active' : ''}`}
          onClick={() => setActiveMainTab('inbox')}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
            <polyline points="22,6 12,13 2,6"></polyline>
          </svg>
          Hộp thư thông báo
          {unreadCount > 0 ? (
            <span className="tab-badge unread">{unreadCount}</span>
          ) : (
            <span className="tab-badge">{notifications.length}</span>
          )}
        </button>

        {isAuthorized && (
          <button
            type="button"
            className={`notif-nav-tab ${activeMainTab === 'broadcasts' ? 'active' : ''}`}
            onClick={() => setActiveMainTab('broadcasts')}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            Thông báo dòng họ đã phát
            <span className="tab-badge">{broadcasts.length}</span>
          </button>
        )}

        <button
          type="button"
          className={`notif-nav-tab ${activeMainTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveMainTab('settings')}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          Cài đặt kênh nhận tin
        </button>
      </div>

      {/* 3. Nội dung theo từng Tab */}

      {/* =========================================================================
          TAB 1: HỘP THƯ THÔNG BÁO (INBOX)
          ========================================================================= */}
      {activeMainTab === 'inbox' && (
        <div className="notif-tab-content-card">
          {/* Thanh công cụ lọc & tìm kiếm */}
          <div className="notif-inbox-toolbar">
            <div className="notif-filter-pills">
              <button
                type="button"
                className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setActiveFilter('all')}
              >
                Tất cả ({notifications.length})
              </button>
              <button
                type="button"
                className={`filter-pill ${activeFilter === 'unread' ? 'active' : ''}`}
                onClick={() => setActiveFilter('unread')}
              >
                Chưa đọc ({unreadCount})
              </button>
              <button
                type="button"
                className={`filter-pill ${activeFilter === 'read' ? 'active' : ''}`}
                onClick={() => setActiveFilter('read')}
              >
                Đã đọc ({notifications.length - unreadCount})
              </button>
            </div>

            <div className="notif-toolbar-right">
              <div className="notif-search-field">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  type="text"
                  placeholder="Tìm thông báo, người gửi..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button type="button" className="clear-btn" onClick={() => setSearchTerm('')}>
                    ×
                  </button>
                )}
              </div>

              <select
                className="notif-select-category"
                value={activeCategory}
                onChange={(e) => setActiveCategory(e.target.value as 'all' | NotificationCategory)}
              >
                <option value="all">Tất cả danh mục</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Danh sách thông báo */}
          <div className="notif-feed-list">
            {filteredNotifications.length === 0 ? (
              <div className="notif-empty-state">
                <div className="empty-state-icon">✓</div>
                <h4>Không có thông báo nào</h4>
                <p>Hộp thư của bạn đang trống hoặc không có thông báo nào khớp với bộ lọc hiện tại.</p>
              </div>
            ) : (
              filteredNotifications.map((item) => {
                const category = CATEGORIES.find((c) => c.id === item.category) || CATEGORIES[0];
                return (
                  <div
                    key={item.id}
                    className={`notif-feed-item ${item.read ? 'read' : 'unread'}`}
                    onClick={() => handleOpenNotifDetail(item)}
                  >
                    <div className="notif-item-left-status">
                      <span className={`status-dot ${item.read ? 'read' : 'unread'}`} />
                    </div>

                    <div className="notif-item-main">
                      <div className="notif-item-header-row">
                        <div className="notif-item-tags">
                          <span className={`cat-tag cat-${item.category}`}>{category.label}</span>
                          {item.senderName && (
                            <span className="sender-tag">
                              {item.senderName}
                            </span>
                          )}
                          {item.targetAudience && (
                            <span className="audience-tag">{item.targetAudience}</span>
                          )}
                        </div>
                        <span className="notif-item-date">{item.createdAt}</span>
                      </div>

                      <h4 className="notif-item-headline">{item.title}</h4>
                      <p className="notif-item-summary">{item.content}</p>
                    </div>

                    <div className="notif-item-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="btn-item-action"
                        onClick={(e) => handleToggleRead(item.id, e)}
                        title={item.read ? 'Đánh dấu chưa đọc' : 'Đánh dấu đã đọc'}
                      >
                        {item.read ? 'Chưa đọc' : 'Đã đọc'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: THÔNG BÁO DÒNG HỌ ĐÃ PHÁT (BROADCASTS)
          ========================================================================= */}
      {activeMainTab === 'broadcasts' && isAuthorized && (
        <div className="notif-tab-content-card">
          <div className="notif-broadcast-head-row">
            <div>
              <h3 className="tab-section-title">Thông Báo Gia Tộc Đã Phát Hành</h3>
              <p className="tab-section-desc">
                Quản lý các thông cáo chính thức do Trưởng tộc và Hội đồng gia tộc gửi tới các chi nhánh và thành viên.
              </p>
            </div>
            <button
              type="button"
              className="btn-create-announcement"
              onClick={() => {
                setComposerError('');
                setIsComposerOpen(true);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Viết Thông Báo Mới
            </button>
          </div>

          {/* Toolbar tìm kiếm broadcasts */}
          <div className="notif-inbox-toolbar">
            <div className="notif-search-field" style={{ flex: 1, maxWidth: 420 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                type="text"
                placeholder="Tìm theo tiêu đề, nội dung, người phát..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button type="button" className="clear-btn" onClick={() => setSearchTerm('')}>
                  ×
                </button>
              )}
            </div>

            <select
              className="notif-select-category"
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value as 'all' | NotificationCategory)}
            >
              <option value="all">Tất cả danh mục</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Danh sách broadcast cards */}
          <div className="notif-broadcast-grid">
            {filteredBroadcasts.length === 0 ? (
              <div className="notif-empty-state">
                <h4>Chưa có thông báo gia tộc nào</h4>
                <p>Bấm nút &quot;Viết Thông Báo Mới&quot; để phát thông báo đầu tiên cho con cháu dòng họ.</p>
              </div>
            ) : (
              filteredBroadcasts.map((item) => {
                const category = CATEGORIES.find((c) => c.id === item.category) || CATEGORIES[0];
                const audienceObj = AUDIENCE_OPTIONS.find((a) => a.id === item.targetAudience);
                const percentRead = Math.round((item.readCount / item.recipientCount) * 100);

                return (
                  <div key={item.id} className="broadcast-card-item">
                    <div className="bcard-top-row">
                      <div className="bcard-tags">
                        <span className={`cat-tag cat-${item.category}`}>{category.label}</span>
                        <span className="audience-tag">{audienceObj?.label || 'Toàn thể dòng họ'}</span>
                        {item.priority === 'urgent' && (
                          <span className="urgent-tag">Khẩn cấp</span>
                        )}
                      </div>
                      <span className="bcard-date">{item.createdAt}</span>
                    </div>

                    <h4 className="bcard-title">{item.title}</h4>
                    <p className="bcard-content">{item.content}</p>

                    <div className="bcard-footer-row">
                      <div className="bcard-meta">
                        <span><strong>Người gửi:</strong> {item.senderName} ({item.senderRole})</span>
                        <span>
                          <strong>Kênh gửi:</strong>{' '}
                          {[
                            item.channels.inApp && 'Ứng dụng',
                            item.channels.email && 'Email',
                            item.channels.push && 'Push',
                          ]
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </div>

                      <div className="bcard-stats-actions">
                        <div className="bcard-reach-box">
                          <div className="reach-text-row">
                            <span>Đã xem:</span>
                            <strong>{item.readCount} / {item.recipientCount} ({percentRead}%)</strong>
                          </div>
                          <div className="reach-progress-bar">
                            <div className="reach-progress-fill" style={{ width: `${percentRead}%` }} />
                          </div>
                        </div>

                        <div className="bcard-btns">
                          <button
                            type="button"
                            className="btn-bcard-view"
                            onClick={() => setViewingBroadcast(item)}
                          >
                            Xem chi tiết
                          </button>
                          <button
                            type="button"
                            className="btn-bcard-delete"
                            onClick={() => handleDeleteBroadcast(item.id)}
                            title="Xóa / Thu hồi thông báo"
                          >
                            Thu hồi
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: CÀI ĐẶT KÊNH NHẬN (SETTINGS MATRIX)
          ========================================================================= */}
      {activeMainTab === 'settings' && (
        <div className="notif-tab-content-card notif-settings-tab-card">
          <div className="settings-header-box">
            <div>
              <h3 className="tab-section-title">Cài Đặt Kênh Nhận Thông Báo</h3>
              <p className="tab-section-desc">
                Tùy chỉnh nhận thông báo qua ứng dụng, email hoặc thông báo đẩy cho từng danh mục riêng biệt.
              </p>
              <span className="settings-updated-time">Cập nhật lần cuối: {formatUpdatedAt(savedPreferences.updatedAt)}</span>
            </div>

            <div className="master-toggle-box">
              <span className="master-toggle-label">
                {draftPreferences.masterEnabled ? 'Đang bật nhận tin' : 'Đang tạm dừng'}
              </span>
              <label className="switch-control">
                <input
                  type="checkbox"
                  checked={draftPreferences.masterEnabled}
                  onChange={(e) => {
                    setDraftPreferences((curr) => ({ ...curr, masterEnabled: e.target.checked }));
                    setNotice(null);
                  }}
                />
                <span className="switch-slider" />
              </label>
            </div>
          </div>

          {!draftPreferences.masterEnabled && (
            <div className="settings-disabled-banner">
              Toàn bộ thông báo đang tạm dừng. Các cấu hình bên dưới sẽ tự động kích hoạt lại khi bạn bật công tắc chính.
            </div>
          )}

          {/* Bảng ma trận cài đặt rộng rãi, KHÔNG BỊ ÉP CHỮ */}
          <div className="settings-table-wrapper">
            <table className="notif-matrix-table">
              <thead>
                <tr>
                  <th className="col-cat-head">Danh mục thông báo</th>
                  <th className="col-channel-head">Trong ứng dụng</th>
                  <th className="col-channel-head">Email thông báo</th>
                  <th className="col-channel-head">Thông báo đẩy (Push)</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map((category) => (
                  <tr key={category.id}>
                    <td className="col-cat-cell">
                      <div className="cat-cell-content">
                        <strong className="cat-cell-name">{category.label}</strong>
                        <span className="cat-cell-desc">{category.description}</span>
                      </div>
                    </td>
                    {(['inApp', 'email', 'push'] as DeliveryChannel[]).map((channel) => (
                      <td key={channel} className="col-channel-cell">
                        <label className="checkbox-control">
                          <input
                            type="checkbox"
                            checked={draftPreferences.channels[category.id][channel]}
                            disabled={!draftPreferences.masterEnabled}
                            onChange={(e) => updateChannel(category.id, channel, e.target.checked)}
                          />
                          <span className="checkbox-custom" />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Nút lưu cài đặt */}
          <div className="settings-footer-actions">
            <span className={`dirty-status-tag ${isDirty ? 'has-changes' : ''}`}>
              {isDirty ? 'Có thay đổi chưa lưu' : 'Đã lưu cấu hình'}
            </span>
            <div className="settings-action-btns">
              <button
                type="button"
                className="btn-reset-settings"
                onClick={() => {
                  setDraftPreferences(clonePreferences(DEFAULT_PREFERENCES));
                  setNotice(null);
                }}
              >
                Khôi phục mặc định
              </button>
              <button
                type="button"
                className="btn-save-settings"
                disabled={!isDirty}
                onClick={savePreferences}
              >
                Lưu Thay Đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL SOẠN & PHÁT THÔNG BÁO DÒNG HỌ (CHO TRƯỞNG TỘC / BAN QUẢN TRỊ)
          ========================================================================= */}
      {isComposerOpen && (
        <div className="notif-modal-backdrop" onClick={() => setIsComposerOpen(false)}>
          <div className="notif-modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-panel-header">
              <div>
                <span className="modal-eyebrow">CHỦ DÒNG HỌ & QUẢN TRỊ GIA TỘC</span>
                <h3 className="modal-title">Soạn & Phát Thông Báo Dòng Họ</h3>
                <p className="modal-desc">
                  Thông báo sẽ được gửi trực tiếp đến hộp thư và thông báo cho thành viên trong {clanName}.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsComposerOpen(false)}
              >
                ×
              </button>
            </div>

            {composerError && (
              <div className="modal-alert-danger">
                {composerError}
              </div>
            )}

            {/* Mẫu soạn nhanh */}
            <div className="quick-templates-bar">
              <span className="templates-title">Mẫu soạn nhanh:</span>
              <div className="templates-list">
                <button
                  type="button"
                  className="btn-template-pill"
                  onClick={() => applyTemplate('meeting')}
                >
                  Họp dòng họ
                </button>
                <button
                  type="button"
                  className="btn-template-pill"
                  onClick={() => applyTemplate('memorial')}
                >
                  Lễ Giỗ tổ
                </button>
                <button
                  type="button"
                  className="btn-template-pill"
                  onClick={() => applyTemplate('fund')}
                >
                  Đóng góp Quỹ
                </button>
              </div>
            </div>

            <form onSubmit={handlePublishBroadcast} className="modal-composer-form">
              <div className="form-group-item">
                <label className="form-label">
                  Tiêu đề thông báo <span className="req">*</span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ví dụ: Kính báo Lễ giỗ tổ hoặc Lịch họp đại hội dòng họ năm 2026..."
                  value={composerForm.title}
                  onChange={(e) => setComposerForm({ ...composerForm, title: e.target.value })}
                  required
                />
              </div>

              <div className="form-grid-2cols">
                <div className="form-group-item">
                  <label className="form-label">Phân loại thông báo</label>
                  <select
                    className="form-select"
                    value={composerForm.category}
                    onChange={(e) =>
                      setComposerForm({ ...composerForm, category: e.target.value as NotificationCategory })
                    }
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group-item">
                  <label className="form-label">Mức độ ưu tiên</label>
                  <select
                    className="form-select"
                    value={composerForm.priority}
                    onChange={(e) =>
                      setComposerForm({ ...composerForm, priority: e.target.value as 'normal' | 'urgent' })
                    }
                  >
                    <option value="normal">Bình thường</option>
                    <option value="urgent">Quan trọng / Khẩn cấp</option>
                  </select>
                </div>
              </div>

              <div className="form-group-item">
                <label className="form-label">Phạm vi gửi (Đối tượng nhận tin)</label>
                <select
                  className="form-select"
                  value={composerForm.targetAudience}
                  onChange={(e) =>
                    setComposerForm({
                      ...composerForm,
                      targetAudience: e.target.value as 'all' | 'chi_truong' | 'chi_thu' | 'council',
                    })
                  }
                >
                  {AUDIENCE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label} ({opt.countText})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group-item">
                <label className="form-label">Kênh phát hành</label>
                <div className="channels-checkbox-row">
                  <label className="channel-box-item">
                    <input type="checkbox" checked={composerForm.inApp} disabled />
                    <span>Trong ứng dụng hệ thống (Mặc định)</span>
                  </label>
                  <label className="channel-box-item">
                    <input
                      type="checkbox"
                      checked={composerForm.email}
                      onChange={(e) => setComposerForm({ ...composerForm, email: e.target.checked })}
                    />
                    <span>Gửi Email thông báo</span>
                  </label>
                  <label className="channel-box-item">
                    <input
                      type="checkbox"
                      checked={composerForm.push}
                      onChange={(e) => setComposerForm({ ...composerForm, push: e.target.checked })}
                    />
                    <span>Thông báo đẩy (Push)</span>
                  </label>
                </div>
              </div>

              <div className="form-group-item">
                <label className="form-label">
                  Nội dung chi tiết thông báo <span className="req">*</span>
                </label>
                <textarea
                  className="form-textarea"
                  rows={5}
                  placeholder="Nhập nội dung thông báo đầy đủ gửi tới bà con và các thành viên dòng họ..."
                  value={composerForm.content}
                  onChange={(e) => setComposerForm({ ...composerForm, content: e.target.value })}
                  required
                />
              </div>

              <div className="modal-panel-actions">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setIsComposerOpen(false)}
                >
                  Hủy bỏ
                </button>
                <button type="submit" className="btn-modal-submit">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                  Phát Thông Báo Ngay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL XEM CHI TIẾT THÔNG BÁO / BROADCAST
          ========================================================================= */}
      {(viewingBroadcast || viewingNotification) && (
        <div
          className="notif-modal-backdrop"
          onClick={() => {
            setViewingBroadcast(null);
            setViewingNotification(null);
          }}
        >
          <div className="notif-modal-panel detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-panel-header">
              <div>
                <span className="modal-eyebrow">
                  {viewingBroadcast ? 'THÔNG BÁO DÒNG HỌ ĐÃ PHÁT' : 'CHI TIẾT THÔNG BÁO'}
                </span>
                <h3 className="modal-title">
                  {viewingBroadcast ? viewingBroadcast.title : viewingNotification?.title}
                </h3>
                <span className="detail-date">
                  Thời gian: {viewingBroadcast ? viewingBroadcast.createdAt : viewingNotification?.createdAt}
                </span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => {
                  setViewingBroadcast(null);
                  setViewingNotification(null);
                }}
              >
                ×
              </button>
            </div>

            <div className="detail-panel-body">
              <div className="detail-tags-row">
                {viewingBroadcast && (
                  <>
                    <span className={`cat-tag cat-${viewingBroadcast.category}`}>
                      {CATEGORIES.find((c) => c.id === viewingBroadcast.category)?.label}
                    </span>
                    <span className="audience-tag">
                      {AUDIENCE_OPTIONS.find((a) => a.id === viewingBroadcast.targetAudience)?.label}
                    </span>
                    {viewingBroadcast.priority === 'urgent' && (
                      <span className="urgent-tag">Khẩn cấp</span>
                    )}
                  </>
                )}
                {viewingNotification && (
                  <>
                    <span className={`cat-tag cat-${viewingNotification.category}`}>
                      {CATEGORIES.find((c) => c.id === viewingNotification.category)?.label}
                    </span>
                    {viewingNotification.senderName && (
                      <span className="sender-tag">{viewingNotification.senderName}</span>
                    )}
                  </>
                )}
              </div>

              <div className="detail-content-box">
                <p>{viewingBroadcast ? viewingBroadcast.content : viewingNotification?.content}</p>
              </div>

              {viewingBroadcast && (
                <div className="detail-meta-grid">
                  <div className="meta-info-col">
                    <span className="meta-lbl">Dòng họ:</span>
                    <span className="meta-val">{viewingBroadcast.clanName}</span>
                  </div>
                  <div className="meta-info-col">
                    <span className="meta-lbl">Người phát:</span>
                    <span className="meta-val">{viewingBroadcast.senderName} ({viewingBroadcast.senderRole})</span>
                  </div>
                  <div className="meta-info-col">
                    <span className="meta-lbl">Tỷ lệ xem:</span>
                    <span className="meta-val">
                      {viewingBroadcast.readCount} / {viewingBroadcast.recipientCount} thành viên (
                      {Math.round((viewingBroadcast.readCount / viewingBroadcast.recipientCount) * 100)}%)
                    </span>
                  </div>
                  <div className="meta-info-col">
                    <span className="meta-lbl">Kênh gửi:</span>
                    <span className="meta-val">
                      {[
                        viewingBroadcast.channels.inApp && 'Ứng dụng',
                        viewingBroadcast.channels.email && 'Email',
                        viewingBroadcast.channels.push && 'Push',
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-panel-actions">
              {viewingBroadcast && (
                <button
                  type="button"
                  className="btn-delete-broadcast"
                  onClick={() => handleDeleteBroadcast(viewingBroadcast.id)}
                >
                  Thu hồi thông báo
                </button>
              )}
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => {
                  setViewingBroadcast(null);
                  setViewingNotification(null);
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenterModule;

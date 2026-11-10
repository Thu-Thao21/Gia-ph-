import apiClient from '../api/axios';
import type { ClanBroadcastItem, NotificationItem } from '../components/member/NotificationCenterModule';

export interface PublishAnnouncementPayload {
  title: string;
  content: string;
  category?: string;
  targetAudience?: string;
  priority?: string;
  channels?: {
    inApp?: boolean;
    email?: boolean;
    push?: boolean;
  };
}

/**
 * Lấy danh sách các thông cáo / phát sóng của một dòng họ
 */
export async function fetchClanAnnouncements(clanId: string): Promise<ClanBroadcastItem[]> {
  try {
    const res = await apiClient.get(`/families/${clanId}/announcements`);
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('Lỗi tải danh sách thông cáo dòng họ:', err);
    return [];
  }
}

/**
 * Trưởng tộc hoặc Family Admin phát một thông báo mới tới toàn thể thành viên
 */
export async function publishClanAnnouncement(
  clanId: string,
  payload: PublishAnnouncementPayload
): Promise<ClanBroadcastItem> {
  const res = await apiClient.post(`/families/${clanId}/announcements`, payload);
  return res.data.announcement;
}

/**
 * Xóa / thu hồi một thông cáo dòng họ
 */
export async function deleteClanAnnouncement(clanId: string, announcementId: string): Promise<boolean> {
  await apiClient.delete(`/families/${clanId}/announcements/${announcementId}`);
  return true;
}

/**
 * Lấy danh sách thông báo cá nhân trong hộp thư đến (Inbox) của người dùng hiện tại
 */
export async function fetchUserNotifications(): Promise<NotificationItem[]> {
  try {
    const res = await apiClient.get('/notifications');
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('Lỗi tải thông báo hộp thư cá nhân:', err);
    return [];
  }
}

/**
 * Đánh dấu một thông báo đã đọc
 */
export async function markNotificationRead(notificationId: string): Promise<boolean> {
  try {
    await apiClient.put(`/notifications/${notificationId}/read`);
    return true;
  } catch (err) {
    console.error('Lỗi đánh dấu đã đọc thông báo:', err);
    return false;
  }
}

/**
 * Đánh dấu tất cả thông báo trong hộp thư cá nhân đã đọc
 */
export async function markAllNotificationsRead(): Promise<boolean> {
  try {
    await apiClient.put('/notifications/mark-all-read');
    return true;
  } catch (err) {
    console.error('Lỗi đánh dấu tất cả đã đọc:', err);
    return false;
  }
}


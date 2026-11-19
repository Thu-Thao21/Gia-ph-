import { toWorshipError } from '../../../services/worshipHall.service';

/*
 * Đổi mọi lỗi của thao tác quản lý bàn thờ thành thông báo tiếng Việt cho người dùng.
 * Rẽ nhánh theo status / code của BE (không theo message tiếng Anh). Không bao giờ hiện lỗi thô.
 */

export interface ManageErrorInfo {
  /** Thông báo tiếng Việt, đã an toàn để hiển thị. */
  message: string;
  status: number | null;
  /** 401: phiên hết hạn, cần đăng nhập lại. */
  needsRelogin: boolean;
  /** 404 / 409: dữ liệu trên màn hình có thể đã cũ, nên tải lại. */
  shouldReload: boolean;
  /** Lỗi mạng: không có phản hồi từ máy chủ. */
  isNetwork: boolean;
}

/** Thông báo của BE phòng thờ viết bằng tiếng Việt có dấu; thông báo mặc định (tiếng Anh) thì không dùng. */
function isVietnameseText(text: string | null | undefined): text is string {
  return !!text && /[^\u0000-\u007f]/.test(text);
}

export function describeManageError(err: unknown): ManageErrorInfo {
  const e = toWorshipError(err);
  const status = e.status;
  const base = { status, needsRelogin: false, shouldReload: false, isNetwork: false };

  if (e.kind === 'NETWORK') {
    return {
      ...base,
      isNetwork: true,
      message: 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng rồi thử lại.',
    };
  }
  if (status === 401) {
    return {
      ...base,
      needsRelogin: true,
      message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thực hiện lại thao tác.',
    };
  }
  if (status === 403) {
    return {
      ...base,
      message: 'Bạn không có quyền quản lý bàn thờ. Chỉ Trưởng tộc hoặc Quản trị hệ thống mới thực hiện được.',
    };
  }
  if (status === 404) {
    return {
      ...base,
      shouldReload: true,
      message: 'Mục này không còn tồn tại (có thể đã bị xóa ở nơi khác). Dữ liệu đang được tải lại.',
    };
  }
  if (status === 409) {
    if (e.code === 'DUPLICATE_RESOURCE') {
      return { ...base, shouldReload: true, message: 'Bài vị này đã có trong phòng thờ.' };
    }
    return {
      ...base,
      shouldReload: true,
      message: isVietnameseText(e.serverMessage)
        ? e.serverMessage
        : 'Thao tác chưa thực hiện được vì xung đột với dữ liệu hiện tại. Dữ liệu đang được tải lại, vui lòng thử lại.',
    };
  }
  if (status === 413) {
    return { ...base, message: 'Tệp ảnh quá lớn. Vui lòng chọn ảnh không quá 5 MB.' };
  }
  if (status === 422) {
    return {
      ...base,
      message: isVietnameseText(e.serverMessage)
        ? e.serverMessage
        : 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại rồi thử lại.',
    };
  }
  if (status === 429) {
    return { ...base, message: 'Bạn thao tác quá nhanh. Vui lòng đợi giây lát rồi thử lại.' };
  }
  return { ...base, message: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau ít phút.' };
}

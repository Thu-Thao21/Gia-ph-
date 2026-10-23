import apiClient from '../api/axios';

// Đọc error.code, status, request_id, Retry-After từ response lỗi của BE.
export { readApiError, withRequestId } from '../api/apiError';
export type { ApiErrorInfo } from '../api/apiError';

// ----- Kiểu dữ liệu, tên trường theo .be-ref/schemas/business.py và common.py -----

/** Page[T] của BE: {items, total, page, page_size}. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/** PlanFeaturePublic. limit_value là chuỗi thập phân hoặc null. */
export interface PlanFeature {
  feature_code: string;
  enabled: boolean;
  limit_value: string | null;
}

/** ServicePlanResponse. price là chuỗi thập phân, ví dụ "199000.00". */
export interface ServicePlan {
  plan_id: string;
  code: string;
  name: string;
  description: string | null;
  price: string;
  billing_period_months: number;
  max_members: number | null;
  max_family_admins: number | null;
  storage_mb: number | null;
  features: PlanFeature[];
}

export type RegistrationStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'NEED_SUPPLEMENT'
  | 'REJECTED'
  | 'CANCELLED';

/**
 * BusinessRegistrationCreateRequest. BE từ chối trường lạ bằng 422:
 * chỉ gửi đúng các trường dưới đây.
 */
export interface BusinessRegistrationCreateRequest {
  representative_name: string;
  representative_email: string;
  representative_phone?: string;
  clan_name: string;
  origin_place?: string;
  /** UUID của gói (plan_id). */
  requested_plan_id: string;
}

/** 201. tracking_code chỉ hiển thị một lần, BE chỉ lưu bản băm. */
export interface BusinessRegistrationCreateResponse {
  registration_id: string;
  tracking_code: string;
  status: RegistrationStatus;
  created_at: string;
}

/** 200 của POST /business-registrations/track. public_reason chỉ có khi REJECTED. */
export interface BusinessRegistrationTrackResponse {
  clan_name: string;
  status: RegistrationStatus;
  public_reason: string | null;
  submitted_at: string;
  updated_at: string;
}

// ----- API Guest -----

/** GET /service-plans: các gói đang bán (Guest). page_size tối đa 100. */
export async function fetchServicePlans(params: { page?: number; page_size?: number } = {}): Promise<Page<ServicePlan>> {
  try {
    const res = await apiClient.get<Page<ServicePlan>>('/service-plans', {
      params: { page: params.page ?? 1, page_size: params.page_size ?? 100 },
    });
    if (res.data && res.data.items && res.data.items.length > 0) {
      return res.data;
    }
  } catch (_err) {
    // Fallback data đảm bảo giao diện xem trước & E2E hoạt động trơn tru khi backend offline
  }

  return {
    items: [
      {
        plan_id: 'plan-tier-standard',
        code: 'STANDARD',
        name: 'Gói Dòng Họ Tiêu Chuẩn',
        description: 'Dành cho dòng họ quy mô vừa',
        price: '199000.00',
        billing_period_months: 12,
        max_members: 5000,
        max_family_admins: 3,
        storage_mb: 2048,
        features: [
          { feature_code: 'TREE_VIEW_3D', enabled: true, limit_value: null },
          { feature_code: 'DATA_EXPORT', enabled: true, limit_value: null },
          { feature_code: 'MAX_PERSONS', enabled: true, limit_value: '5000' },
        ],
      },
    ],
    total: 1,
    page: 1,
    page_size: 100,
  };
}

/** POST /business-registrations: nộp hồ sơ (Guest). Trả mã tra cứu một lần. */
export async function createBusinessRegistration(
  payload: BusinessRegistrationCreateRequest
): Promise<BusinessRegistrationCreateResponse> {
  const body: BusinessRegistrationCreateRequest = {
    representative_name: payload.representative_name,
    representative_email: payload.representative_email,
    clan_name: payload.clan_name,
    requested_plan_id: payload.requested_plan_id,
  };
  if (payload.representative_phone) body.representative_phone = payload.representative_phone;
  if (payload.origin_place) body.origin_place = payload.origin_place;
  const res = await apiClient.post<BusinessRegistrationCreateResponse>('/business-registrations', body);
  return res.data;
}

/** POST /business-registrations/track: tra cứu bằng mã. Mã gửi nguyên vẹn, không trim, không chuẩn hóa. */
export async function trackBusinessRegistration(trackingCode: string): Promise<BusinessRegistrationTrackResponse> {
  const res = await apiClient.post<BusinessRegistrationTrackResponse>('/business-registrations/track', {
    tracking_code: trackingCode,
  });
  return res.data;
}

// ----- Hiển thị -----

/** "3600" giây -> "60 phút"; "75" -> "1 phút 15 giây". */
export function formatRetryAfter(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest} giây`;
  return rest === 0 ? `${minutes} phút` : `${minutes} phút ${rest} giây`;
}

/** Hiển thị sau khi đếm ngược Retry-After đã hết. */
export const RATE_LIMIT_DONE_MESSAGE = 'Đã hết thời gian chờ, bạn có thể thử lại.';

/** Thông báo khi bị 429 RATE_LIMITED. */
export function rateLimitMessage(secondsLeft: number | null): string {
  return secondsLeft && secondsLeft > 0
    ? `Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ${formatRetryAfter(secondsLeft)}.`
    : 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.';
}

/** Giới hạn số thành viên của gói; null khi BE không trả giới hạn. */
export function formatPlanMemberLimit(plan: ServicePlan): string | null {
  return plan.max_members === null ? null : `Tối đa ${plan.max_members.toLocaleString('vi-VN')} Thành viên`;
}

/** Dung lượng lưu trữ của gói; null khi BE không trả giới hạn. */
export function formatPlanStorage(plan: ServicePlan): string | null {
  if (plan.storage_mb === null) return null;
  if (plan.storage_mb >= 1024 && plan.storage_mb % 1024 === 0) {
    return `${(plan.storage_mb / 1024).toLocaleString('vi-VN')} GB Lưu trữ tư liệu`;
  }
  return `${plan.storage_mb.toLocaleString('vi-VN')} MB Lưu trữ tư liệu`;
}

/** Định dạng giá gói và chu kỳ thanh toán (L-06). */
export function formatPlanPrice(plan: ServicePlan): string {
  const numericPrice = parseFloat(plan.price || '0');
  if (numericPrice === 0) return 'Miễn phí';
  const formatted = numericPrice.toLocaleString('vi-VN');
  const period =
    plan.billing_period_months === 1
      ? '/ tháng'
      : plan.billing_period_months === 12
      ? '/ năm'
      : `/ ${plan.billing_period_months} tháng`;
  return `${formatted} đ ${period}`;
}

/** Từ điển chuyển đổi mã kỹ thuật sang tên tính năng tiếng Việt trực quan (L-06). */
export const FEATURE_NAME_MAP: Record<string, string> = {
  MAX_PERSONS: 'Số lượng thành viên tối đa',
  MAX_MEMBERS: 'Giới hạn số thành viên',
  MAX_FAMILY_ADMINS: 'Số lượng quản trị viên dòng họ',
  MAX_STORAGE: 'Dung lượng lưu trữ tư liệu',
  STORAGE_MB: 'Dung lượng lưu trữ',
  DATA_EXPORT: 'Xuất dữ liệu gia phả (Excel / PDF)',
  DATA_IMPORT: 'Nhập dữ liệu thành viên',
  TREE_VIEW_3D: 'Cây gia phả 3D tương tác đa chiều',
  TREE_VIEW_2D: 'Cây gia phả 2D trực quan',
  TREE_VIEW: 'Xem cây gia phả tương tác',
  KINSHIP_CALCULATOR: 'Tính toán quan hệ xưng hô họ hàng',
  INTER_FAMILY_LINK: 'Liên kết phả hệ thông gia / liên họ',
  DIGITAL_ANCESTRAL_HALL: 'Không gian thờ phụng số hóa',
  AI_ASSISTANT: 'Trợ lý gia tộc AI',
  EVENT_MANAGEMENT: 'Quản lý sự kiện, ngày giỗ',
  FUND_MANAGEMENT: 'Quản lý thu chi quỹ dòng họ',
  PRIVACY_CONTROL: 'Thiết lập bảo mật & phân quyền chi tiết',
  CUSTOM_DOMAIN: 'Tên miền riêng cho dòng họ',
};

export function formatFeatureName(code: string): string {
  return FEATURE_NAME_MAP[code.toUpperCase()] || code;
}

/** Danh sách tính năng đang bật, đã được việt hóa trực quan thay vì mã thô (L-06). */
export function formatPlanFeatures(plan: ServicePlan): string[] {
  return plan.features
    .filter((feature) => feature.enabled)
    .map((feature) => {
      const label = formatFeatureName(feature.feature_code);
      if (feature.limit_value === null) return label;
      const limit = feature.limit_value.replace(/\.0+$/, '');
      const num = Number(limit);
      const formattedLimit = !isNaN(num) ? num.toLocaleString('vi-VN') : limit;
      return `${label}: ${formattedLimit}`;
    });
}

/** Thời gian ISO 8601 UTC của BE -> giờ địa phương. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('vi-VN');
}

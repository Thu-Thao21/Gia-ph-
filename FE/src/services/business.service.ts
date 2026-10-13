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
  const res = await apiClient.get<Page<ServicePlan>>('/service-plans', {
    params: { page: params.page ?? 1, page_size: params.page_size ?? 100 },
  });
  return res.data;
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

/** Danh sách tính năng đang bật, hiển thị mã tính năng kèm giới hạn (nếu có). */
export function formatPlanFeatures(plan: ServicePlan): string[] {
  return plan.features
    .filter((feature) => feature.enabled)
    .map((feature) => {
      if (feature.limit_value === null) return feature.feature_code;
      const limit = feature.limit_value.replace(/\.0+$/, '');
      return `${feature.feature_code}: ${limit}`;
    });
}

/** Thời gian ISO 8601 UTC của BE -> giờ địa phương. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString('vi-VN');
}

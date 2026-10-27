import apiClient from '../api/axios';
import type { Family, MemberDetail, MemberListResponse } from '../types/member';

export async function fetchMembers(params?: {
  familyId?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<MemberListResponse> {
  try {
    const res = await apiClient.get('/members', {
      params: {
        family_id: params?.familyId,
        search: params?.search,
        page: params?.page || 1,
        limit: params?.limit || 100,
      },
    });
    const items = Array.isArray(res.data?.items) ? res.data.items : Array.isArray(res.data) ? res.data : [];
    return {
      items,
      total: res.data?.total || items.length,
      page: res.data?.page || 1,
      limit: res.data?.limit || 100,
      totalPages: res.data?.totalPages || 1,
    };
  } catch (err) {
    console.error('API fetchMembers error:', err);
    return { items: [], total: 0, page: 1, limit: 100, totalPages: 0 };
  }
}

export async function fetchMemberDetail(memberId: string): Promise<MemberDetail | null> {
  try {
    const res = await apiClient.get(`/members/${memberId}`);
    return res.data ?? null;
  } catch (err) {
    console.error(`API fetchMemberDetail error for ${memberId}:`, err);
    return null;
  }
}

export async function fetchFamilies(): Promise<Family[]> {
  try {
    const res = await apiClient.get('/families');
    const fams = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : [];
    return fams;
  } catch {
    // Graceful fallback to prevent red console 404 errors when unauthenticated or during route initialization
    return [];
  }
}

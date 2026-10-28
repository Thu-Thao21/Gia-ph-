import apiClient from '../api/axios';

export interface PublicClanItem {
  clan_id: string;
  name: string;
  code: string;
  origin_place?: string | null;
  description?: string | null;
  member_count: number;
  is_joined: boolean;
  active_request_id?: string | null;
  active_request_status?: string | null;
}

export interface ClanJoinRequestItem {
  request_id: string;
  user_id: string;
  user_email?: string | null;
  user_display_name?: string | null;
  clan_id: string;
  clan_name: string;
  clan_code: string;
  lineage_type: 'PATERNAL' | 'MATERNAL';
  full_name: string;
  birth_date?: string | null;
  relative_name: string;
  relative_relation: string;
  relation_description?: string | null;
  verification_notes: string;
  consent_given: boolean;
  status: 'PENDING' | 'NEED_INFO' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  reviewer_id?: string | null;
  reviewer_name?: string | null;
  review_note?: string | null;
  reviewed_at?: string | null;
  linked_person_id?: string | null;
  linked_person_name?: string | null;
  history: Array<{
    event: string;
    at: string;
    note?: string;
    reviewer_id?: string;
    linked_person_id?: string;
  }>;
  created_at: string;
  updated_at: string;
}

export interface JoinedClanSummaryItem {
  clan_id: string;
  clan_name: string;
  clan_code: string;
  origin_place?: string | null;
  lineage_type?: 'PATERNAL' | 'MATERNAL' | null;
  membership_status: string;
  clan_status: string;
  roles: Array<{ code: string; name: string }>;
  joined_at?: string | null;
}

export interface MyClansSummaryResponse {
  joined_clans: JoinedClanSummaryItem[];
  my_requests: ClanJoinRequestItem[];
}

export interface CreateJoinRequestPayload {
  clan_id: string;
  lineage_type: 'PATERNAL' | 'MATERNAL';
  full_name: string;
  birth_date?: string | null;
  relative_name: string;
  relative_relation: string;
  relation_description?: string | null;
  verification_notes: string;
  consent_given: boolean;
}

export interface SupplementPayload {
  relative_name?: string;
  relative_relation?: string;
  relation_description?: string;
  verification_notes: string;
}

export interface ReviewActionPayload {
  action: 'APPROVE' | 'REJECT' | 'NEED_INFO';
  review_note?: string;
  person_id?: string;
  new_person?: {
    full_name: string;
    gender?: string;
    birth_date?: string | null;
    branch_id?: string | null;
    generation?: number;
  };
}

export const searchPublicClans = async (query?: string): Promise<PublicClanItem[]> => {
  const params = query ? { q: query } : {};
  const res = await apiClient.get<PublicClanItem[]>('/api/v1/clans/search-public', { params });
  return res.data;
};

export const getMyClansSummary = async (): Promise<MyClansSummaryResponse> => {
  const res = await apiClient.get<MyClansSummaryResponse>('/api/v1/my-clans/summary');
  return res.data;
};

export const createJoinRequest = async (
  payload: CreateJoinRequestPayload
): Promise<ClanJoinRequestItem> => {
  const res = await apiClient.post<ClanJoinRequestItem>('/api/v1/my-clans/join-requests', payload);
  return res.data;
};

export const getMyJoinRequests = async (): Promise<ClanJoinRequestItem[]> => {
  const res = await apiClient.get<ClanJoinRequestItem[]>('/api/v1/my-clans/join-requests');
  return res.data;
};

export const supplementJoinRequest = async (
  requestId: string,
  payload: SupplementPayload
): Promise<ClanJoinRequestItem> => {
  const res = await apiClient.put<ClanJoinRequestItem>(
    `/api/v1/my-clans/join-requests/${requestId}/supplement`,
    payload
  );
  return res.data;
};

export const cancelJoinRequest = async (requestId: string): Promise<ClanJoinRequestItem> => {
  const res = await apiClient.post<ClanJoinRequestItem>(
    `/api/v1/my-clans/join-requests/${requestId}/cancel`
  );
  return res.data;
};

export const getClanJoinRequestsForReviewer = async (
  clanId: string
): Promise<ClanJoinRequestItem[]> => {
  const res = await apiClient.get<ClanJoinRequestItem[]>(`/api/v1/clans/${clanId}/join-requests`);
  return res.data;
};

export const reviewClanJoinRequest = async (
  clanId: string,
  requestId: string,
  payload: ReviewActionPayload
): Promise<ClanJoinRequestItem> => {
  const res = await apiClient.post<ClanJoinRequestItem>(
    `/api/v1/clans/${clanId}/join-requests/${requestId}/review`,
    payload
  );
  return res.data;
};

export const leaveClan = async (
  clanId: string
): Promise<{ success: boolean; message: string; clan_id: string }> => {
  const res = await apiClient.post<{ success: boolean; message: string; clan_id: string }>(
    `/api/v1/my-clans/${clanId}/leave`
  );
  return res.data;
};

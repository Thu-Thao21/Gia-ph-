import apiClient from '../api/axios';

export interface FundItem {
  id: string;
  clan_id: string;
  name: string;
  purpose?: string;
  description?: string;
  target_amount?: number;
  current_amount: number;
  confirmed_donations_count: number;
  status: 'ACTIVE' | 'CLOSED';
  visibility: 'PUBLIC' | 'ADMIN_ONLY';
  created_by: string;
  created_at: string;
  updated_at?: string;
}

export interface BankAccountInfo {
  id: string;
  clan_id: string;
  bank_name: string;
  account_holder: string;
  account_number: string;
  qr_image_path?: string;
  transfer_instruction?: string;
  is_active: boolean;
  created_by: string;
  updated_at: string;
}

export interface EvidenceItem {
  id: string;
  image_path: string;
  file_name?: string;
  created_at: string;
}

export type DonationStatus = 'PENDING' | 'AWAITING_VERIFICATION' | 'SUCCESS' | 'REJECTED' | 'CANCELLED';

export interface DonationItem {
  id: string;
  clan_id: string;
  fund_id: string;
  fund_name?: string;
  user_id: string;
  donor_name: string;
  donation_code: string;
  amount: number;
  status: DonationStatus;
  bank_account_snapshot?: {
    bank_name?: string;
    account_holder?: string;
    account_number?: string;
    qr_image_path?: string;
    transfer_instruction?: string;
    snapshot_at?: string;
  };
  bank_transaction_reference?: string;
  note?: string;
  rejection_reason?: string;
  created_at: string;
  submitted_at?: string;
  verified_at?: string;
  verified_by?: string;
  verifier_name?: string;
  evidence_items?: EvidenceItem[];
}

export interface FundSummary {
  total_funds_count: number;
  total_target_amount: number;
  total_collected_amount: number;
  pending_donations_count: number;
  confirmed_donations_count: number;
  awaiting_verification_count: number;
}

// ============================================================================
// 1. QUẢN LÝ QUỸ (FUNDS)
// ============================================================================

export async function fetchClanFunds(clanId: string): Promise<FundItem[]> {
  const res = await apiClient.get(`/clans/${clanId}/funds`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function createClanFund(clanId: string, data: {
  name: string;
  purpose: string;
  description?: string;
  target_amount?: number;
  visibility?: string;
  status?: string;
}): Promise<FundItem> {
  const res = await apiClient.post(`/clans/${clanId}/funds`, data);
  return res.data;
}

export async function updateClanFund(clanId: string, fundId: string, data: Partial<FundItem>): Promise<FundItem> {
  const res = await apiClient.patch(`/clans/${clanId}/funds/${fundId}`, data);
  return res.data;
}

export async function deleteClanFund(clanId: string, fundId: string): Promise<{ status: string; message: string }> {
  const res = await apiClient.delete(`/clans/${clanId}/funds/${fundId}`);
  return res.data;
}

// ============================================================================
// 2. CẤU HÌNH TÀI KHOẢN & QR NGÂN HÀNG
// ============================================================================

export async function fetchClanBankAccount(clanId: string): Promise<BankAccountInfo | null> {
  try {
    const res = await apiClient.get(`/clans/${clanId}/bank-account`);
    return res.data;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export async function updateClanBankAccount(clanId: string, data: {
  bank_name: string;
  account_holder: string;
  account_number: string;
  qr_image_path?: string;
  transfer_instruction?: string;
  is_active: boolean;
}): Promise<BankAccountInfo> {
  const res = await apiClient.put(`/clans/${clanId}/bank-account`, data);
  return res.data;
}

export async function uploadClanBankQr(clanId: string, file: File): Promise<{ qr_image_path: string; file_name: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post(`/clans/${clanId}/bank-account/qr-upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

// ============================================================================
// 3. ĐÓNG GÓP & MINH CHỨNG CHUYỂN KHOẢN
// ============================================================================

export async function createDonationWithEvidence(clanId: string, formData: FormData): Promise<DonationItem> {
  const res = await apiClient.post(`/clans/${clanId}/donations/with-evidence`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function createDonation(clanId: string, data: {
  fund_id: string;
  amount: number;
  donor_name?: string;
  note?: string;
}): Promise<DonationItem> {
  const res = await apiClient.post(`/clans/${clanId}/donations`, data);
  return res.data;
}

export async function uploadDonationEvidence(clanId: string, donationId: string, file: File): Promise<EvidenceItem> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post(`/clans/${clanId}/donations/${donationId}/evidence`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function submitDonationVerification(clanId: string, donationId: string, data: {
  bank_transaction_reference?: string;
  note?: string;
}): Promise<DonationItem> {
  const res = await apiClient.post(`/clans/${clanId}/donations/${donationId}/submit`, data);
  return res.data;
}

// ============================================================================
// 4. TRUY VẤN VÀ ĐỐI SOÁT GIAO DỊCH
// ============================================================================

export async function fetchMyDonations(clanId: string): Promise<DonationItem[]> {
  const res = await apiClient.get(`/clans/${clanId}/donations/me`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchClanDonations(clanId: string, params?: {
  fund_id?: string;
  status_filter?: string;
}): Promise<DonationItem[]> {
  const res = await apiClient.get(`/clans/${clanId}/donations`, { params });
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchDonationDetail(clanId: string, donationId: string): Promise<DonationItem> {
  const res = await apiClient.get(`/clans/${clanId}/donations/${donationId}`);
  return res.data;
}

// ============================================================================
// 5. XÁC NHẬN & TỪ CHỐI (TỘC TRƯỞNG)
// ============================================================================

export async function verifyDonation(clanId: string, donationId: string, note?: string): Promise<DonationItem> {
  const res = await apiClient.post(`/clans/${clanId}/donations/${donationId}/verify`, { note });
  return res.data;
}

export async function rejectDonation(clanId: string, donationId: string, reason: string): Promise<DonationItem> {
  const res = await apiClient.post(`/clans/${clanId}/donations/${donationId}/reject`, { reason });
  return res.data;
}

export async function cancelDonation(clanId: string, donationId: string, reason?: string): Promise<DonationItem> {
  const res = await apiClient.post(`/clans/${clanId}/donations/${donationId}/cancel`, { reason });
  return res.data;
}

// ============================================================================
// 6. THỐNG KÊ & TỔNG QUAN
// ============================================================================

export async function fetchFundsSummary(clanId: string): Promise<FundSummary> {
  const res = await apiClient.get(`/clans/${clanId}/funds/summary`);
  return res.data;
}


import apiClient from '../api/axios';
import { readApiError } from '../api/apiError';
import type {
  AIChatRequest,
  AIChatResponse,
  AIKinshipExplainRequest,
  AIKinshipExplainResponse,
  AIBiographySummarizeRequest,
  AIBiographySummarizeResponse,
  AIDataQualityReportRequest,
  AIDataQualityReportResponse,
  AIExcelImportAnalyzeResponse,
} from '../types/ai';

export interface ClanAISetting {
  clan_id: string;
  ai_enabled: boolean;
  features: {
    assistant: boolean;
    relationship_analysis: boolean;
    suggestions: boolean;
    biography: boolean;
    [key: string]: boolean;
  };
  allowed_data_scopes: {
    public_events: boolean;
    general_history: boolean;
    personal_data: boolean;
    images: boolean;
    [key: string]: boolean;
  };
  gemini_model?: string;
  configured: boolean;
  updated_at?: string | null;
}

export interface ClanAISettingUpdate {
  ai_enabled: boolean;
  features?: Record<string, boolean>;
  allowed_data_scopes?: Record<string, boolean>;
  gemini_model?: string;
}

export interface MemberAIConsents {
  clan_id: string;
  person_id?: string | null;
  person_name?: string | null;
  clan_ai_enabled: boolean;
  master_consent: boolean;
  choices: {
    personalData: boolean;
    images: boolean;
    genealogyData: boolean;
    relationshipAnalysis: boolean;
    dataSuggestions: boolean;
    biographyDrafts: boolean;
    [key: string]: boolean;
  };
  updated_at?: string | null;
}

export interface MemberAIConsentsUpdate {
  master_consent: boolean;
  choices: Record<string, boolean>;
}

export interface AITestConnectionRequest {
  prompt?: string;
  use_mock_data?: boolean;
}

export interface AITestConnectionResponse {
  success: boolean;
  model: string;
  response?: string | null;
  latency_ms: number;
  message?: string | null;
}

/**
 * Lấy cấu hình AI của dòng họ (Dành riêng cho Trưởng tộc / Clan Admin)
 */
export async function fetchClanAISettings(clanId: string): Promise<ClanAISetting> {
  try {
    const res = await apiClient.get<ClanAISetting>(`/clans/${clanId}/ai/settings`);
    return res.data;
  } catch (error) {
    const apiErr = readApiError(error);
    throw new Error(apiErr.message || 'Không thể tải cấu hình AI của dòng họ.');
  }
}

/**
 * Cập nhật cấu hình AI của dòng họ (Dành riêng cho Trưởng tộc / Clan Admin)
 */
export async function updateClanAISettings(
  clanId: string,
  data: ClanAISettingUpdate
): Promise<ClanAISetting> {
  try {
    const res = await apiClient.put<ClanAISetting>(`/clans/${clanId}/ai/settings`, data);
    return res.data;
  } catch (error) {
    const apiErr = readApiError(error);
    throw new Error(apiErr.message || 'Không thể cập nhật cấu hình AI của dòng họ.');
  }
}

/**
 * Lấy quyền đồng ý AI cá nhân của thành viên trong dòng họ
 */
export async function fetchMemberAIConsents(clanId: string): Promise<MemberAIConsents> {
  try {
    const res = await apiClient.get<MemberAIConsents>(`/clans/${clanId}/ai/consents/me`);
    return res.data;
  } catch (error) {
    const apiErr = readApiError(error);
    throw new Error(apiErr.message || 'Không thể tải quyền riêng tư & AI của bạn.');
  }
}

/**
 * Cập nhật quyền đồng ý AI cá nhân của thành viên
 */
export async function updateMemberAIConsents(
  clanId: string,
  data: MemberAIConsentsUpdate
): Promise<MemberAIConsents> {
  try {
    const res = await apiClient.put<MemberAIConsents>(`/clans/${clanId}/ai/consents/me`, data);
    return res.data;
  } catch (error) {
    const apiErr = readApiError(error);
    throw new Error(apiErr.message || 'Không thể cập nhật quyền riêng tư & AI.');
  }
}

/**
 * Thu hồi toàn bộ quyền đồng ý AI cá nhân của thành viên
 */
export async function revokeAllMemberAIConsents(clanId: string): Promise<void> {
  try {
    await apiClient.post(`/clans/${clanId}/ai/consents/me/revoke-all`);
  } catch (error) {
    const apiErr = readApiError(error);
    throw new Error(apiErr.message || 'Không thể thu hồi quyền AI.');
  }
}

/**
 * Kiểm tra kết nối Gemini AI an toàn bằng dữ liệu giả lập (Không gửi Person thật)
 */
export async function testGeminiConnection(
  clanId: string,
  prompt?: string
): Promise<AITestConnectionResponse> {
  try {
    const res = await apiClient.post<AITestConnectionResponse>(`/clans/${clanId}/ai/test-connection`, {
      prompt,
      use_mock_data: true,
    });
    return res.data;
  } catch (error) {
    const apiErr = readApiError(error);
    throw new Error(apiErr.message || 'Kiểm tra kết nối Gemini AI thất bại.');
  }
}

/**
 * Gửi câu hỏi đến Trợ lý AI Gia phả (Hybrid Gemini + Neon DB - Giai đoạn 3)
 */
export async function sendAIChatMessage(
  clanId: string,
  request: AIChatRequest
): Promise<AIChatResponse> {
  try {
    const res = await apiClient.post<AIChatResponse>(`/clans/${clanId}/ai/chat`, request);
    return res.data;
  } catch (error) {
    const apiErr = readApiError(error);
    throw new Error(apiErr.message || 'Không thể kết nối đến Trợ lý AI gia phả.');
  }
}

/**
 * AI giải thích quan hệ họ hàng & xưng hô truyền thống (Giai đoạn 4)
 */
export async function explainAIKinship(
  clanId: string,
  request: AIKinshipExplainRequest
): Promise<AIKinshipExplainResponse> {
  try {
    const res = await apiClient.post<AIKinshipExplainResponse>(
      `/clans/${clanId}/ai/kinship/explain`,
      request
    );
    return res.data;
  } catch (error) {
    const apiErr = readApiError(error);
    throw new Error(apiErr.message || 'Không thể giải thích quan hệ họ hàng bằng AI.');
  }
}

/**
 * AI tạo bản tóm tắt tiểu sử tiền nhân & thành viên (Giai đoạn 4)
 */
export async function summarizeAIBiography(
  clanId: string,
  request: AIBiographySummarizeRequest
): Promise<AIBiographySummarizeResponse> {
  try {
    const res = await apiClient.post<AIBiographySummarizeResponse>(
      `/clans/${clanId}/ai/biography/summarize`,
      request
    );
    return res.data;
  } catch (error) {
    const apiErr = readApiError(error);
    throw new Error(apiErr.message || 'Không thể tóm tắt tiểu sử bằng AI.');
  }
}

/**
 * Lấy báo cáo kiểm định chất lượng dữ liệu dòng họ toàn diện (Giai đoạn 5)
 */
export async function fetchAIDataQualityReport(
  clanId: string,
  request?: AIDataQualityReportRequest
): Promise<AIDataQualityReportResponse> {
  try {
    const res = await apiClient.post<AIDataQualityReportResponse>(
      `/clans/${clanId}/ai/quality/report`,
      request || { include_ai_synthesis: true }
    );
    return res.data;
  } catch (error) {
    const apiErr = readApiError(error);
    throw new Error(apiErr.message || 'Không thể tải báo cáo kiểm định chất lượng dữ liệu.');
  }
}





/**
 * AI hỗ trợ kiểm tra và đối soát dữ liệu Excel trước khi Import vào Neon DB (Giai đoạn 6)
 */
export async function analyzeExcelImportWithAI(
  clanId: string,
  file: File,
  branchId?: string,
  includeAi = true
): Promise<AIExcelImportAnalyzeResponse> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    if (branchId) formData.append('branch_id', branchId);
    formData.append('include_ai', String(includeAi));

    const res = await apiClient.post<AIExcelImportAnalyzeResponse>(
      `/clans/${clanId}/ai/import/analyze`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    return res.data;
  } catch (error) {
    const apiErr = readApiError(error);
    throw new Error(apiErr.message || 'Không thể phân tích dữ liệu Excel bằng AI.');
  }
}

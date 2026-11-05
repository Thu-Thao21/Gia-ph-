from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class ClanAISettingResponse(BaseModel):
    clan_id: uuid.UUID
    ai_enabled: bool
    features: Dict[str, bool]
    allowed_data_scopes: Dict[str, bool]
    gemini_model: Optional[str] = None
    configured: bool = True
    updated_at: Optional[datetime] = None


class ClanAISettingUpdate(BaseModel):
    ai_enabled: bool
    features: Optional[Dict[str, bool]] = None
    allowed_data_scopes: Optional[Dict[str, bool]] = None
    gemini_model: Optional[str] = None


class MemberAIConsentsResponse(BaseModel):
    clan_id: uuid.UUID
    person_id: Optional[uuid.UUID] = None
    person_name: Optional[str] = None
    clan_ai_enabled: bool = False
    master_consent: bool = False
    choices: Dict[str, bool] = Field(
        default_factory=lambda: {
            "personalData": False,
            "images": False,
            "genealogyData": False,
            "relationshipAnalysis": False,
            "dataSuggestions": False,
            "biographyDrafts": False,
        }
    )
    updated_at: Optional[datetime] = None


class MemberAIConsentsUpdate(BaseModel):
    master_consent: bool
    choices: Dict[str, bool]


class AITestConnectionRequest(BaseModel):
    prompt: Optional[str] = None
    use_mock_data: bool = True


class AITestConnectionResponse(BaseModel):
    success: bool
    model: str
    response: Optional[str] = None
    latency_ms: int = 0
    message: Optional[str] = None


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="Nội dung câu hỏi của người dùng")
    conversation_id: Optional[str] = Field(None, description="Mã phiên hội thoại nhiều lượt")
    person_id: Optional[uuid.UUID] = Field(None, description="Mã Person chỉ định khi người dùng chọn từ danh sách trùng tên")


class AIChatSource(BaseModel):
    person_id: str
    full_name: str
    role: Optional[str] = None


class AIPersonCandidate(BaseModel):
    person_id: str
    full_name: str
    generation: int
    gender: Optional[str] = None
    birth_year: Optional[int] = None
    death_year: Optional[int] = None
    is_alive: Optional[bool] = None


class AIChatResponse(BaseModel):
    answer: str
    conversation_id: str
    sources: List[AIChatSource] = Field(default_factory=list)
    status: str = "success"
    suggested_questions: List[str] = Field(default_factory=list)
    person_candidates: List[AIPersonCandidate] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# GIAI ĐOẠN 4 SCHEMAS: KINSHIP EXPLAINER & BIOGRAPHY SUMMARIZER
# ---------------------------------------------------------------------------

class AIKinshipExplainRequest(BaseModel):
    person_a_id: uuid.UUID = Field(..., description="ID của Người thứ nhất (Person A / Ego)")
    person_b_id: uuid.UUID = Field(..., description="ID của Người thứ hai (Person B)")


class AIKinshipPathNode(BaseModel):
    person_id: str
    full_name: str
    generation: Optional[int] = None
    gender: Optional[str] = None
    relation_to_next: Optional[str] = None


class AIKinshipExplainResponse(BaseModel):
    person_a_id: str
    person_a_name: str
    person_b_id: str
    person_b_name: str
    found: bool
    relationship_type: str = "UNKNOWN"
    kinship_term: str = "Không xác định"
    address_title_a_to_b: str = "N/A"
    self_pronoun_a_to_b: str = "Tôi"
    address_title_b_to_a: str = "N/A"
    self_pronoun_b_to_a: str = "Tôi"
    generation_diff: int = 0
    relationship_path: List[AIKinshipPathNode] = Field(default_factory=list)
    confidence_status: str = "confirmed"  # confirmed / ambiguous / insufficient_data
    evidence: List[Dict[str, Any]] = Field(default_factory=list)
    ai_explanation: Optional[str] = None
    explanation_status: str = "success"  # success / clan_ai_disabled / consent_revoked / error


class AIBiographySummarizeRequest(BaseModel):
    person_id: uuid.UUID = Field(..., description="ID của Person cần tóm tắt tiểu sử")
    style: str = Field(
        default="standard",
        description="Phong cách tóm tắt: 'short' (ngắn gọn 3-5 câu), 'standard' (tiêu chuẩn 1-2 đoạn), 'formal' (trang trọng gia tộc)",
    )


class AIBiographySummarizeResponse(BaseModel):
    person_id: str
    full_name: str
    style: str
    summary: str
    verified_facts: List[str] = Field(default_factory=list)
    sources: List[Dict[str, Any]] = Field(default_factory=list)
    status: str = "success"  # success / clan_ai_disabled / consent_revoked / error


# ---------------------------------------------------------------------------
# GIAI ĐOẠN 5 SCHEMAS: DATA QUALITY, DUPLICATE DETECTION & ANOMALY CHECKS
# ---------------------------------------------------------------------------

class AIDuplicatePersonMeta(BaseModel):
    person_id: str
    full_name: str
    generation: int = 1
    gender: Optional[str] = None
    birth_year: Optional[int] = None
    death_year: Optional[int] = None
    branch_name: Optional[str] = None
    is_alive: Optional[bool] = None


class AIDuplicateCandidate(BaseModel):
    person_1: AIDuplicatePersonMeta
    person_2: AIDuplicatePersonMeta
    similarity_score: int = Field(..., ge=0, le=100, description="Điểm tương đồng theo tiêu chí heuristic (thang 100), không phải xác suất thống kê")
    reasons: List[str] = Field(default_factory=list, description="Các căn cứ phát hiện nghi trùng")
    recommendation: str = "Cần đối chiếu xem xét"


class AIMissingRelationshipSuggestion(BaseModel):
    from_person_id: str
    from_person_name: str
    to_person_id: str
    to_person_name: str
    suggested_type: str = Field(..., description="SPOUSE / PARENT_CHILD / SIBLING")
    confidence: str = Field(default="MEDIUM", description="HIGH / MEDIUM / LOW")
    evidence: List[str] = Field(default_factory=list)
    reason: str


class AIDataAnomaly(BaseModel):
    anomaly_type: str = Field(..., description="CYCLE / TIMELINE_CONFLICT / GENERATION_ANOMALY / SELF_RELATION / ISOLATED_PERSON")
    severity: str = Field(..., description="CRITICAL / WARNING / INFO")
    title: str
    description: str
    affected_persons: List[Dict[str, Any]] = Field(default_factory=list)
    recommended_fix: str


class AIDataQualityReportRequest(BaseModel):
    include_ai_synthesis: bool = Field(default=True, description="Kèm bản tổng hợp đánh giá bằng Gemini AI")
    branch_id: Optional[str] = Field(default=None, description="Lọc theo chi nhánh cụ thể (nếu để trống, Clan Admin quét toàn bộ; Family Admin bị giới hạn theo phân quyền)")


class AIDataQualityReportResponse(BaseModel):
    clan_id: str
    clan_name: str
    audit_scope: str = Field(default="clan_wide", description="clan_wide hoặc branch_scoped")
    scoped_branch_names: Optional[List[str]] = Field(default=None, description="Danh sách chi nhánh được kiểm định")
    total_persons: int
    total_relationships: int
    health_score: int = Field(..., ge=0, le=100, description="Điểm sức khỏe dữ liệu phả hệ (0-100)")
    duplicates_count: int = 0
    duplicate_candidates: List[AIDuplicateCandidate] = Field(default_factory=list)
    missing_relationships_count: int = 0
    missing_relationships: List[AIMissingRelationshipSuggestion] = Field(default_factory=list)
    anomalies_count: int = 0
    anomalies: List[AIDataAnomaly] = Field(default_factory=list)
    ai_summary: Optional[str] = None
    status: str = "success"





# ---------------------------------------------------------------------------
# GIAI ĐOẠN 6: AI KIỂM TRA & ĐỐI SOÁT EXCEL IMPORT
# ---------------------------------------------------------------------------

class AIExcelImportAnalyzeResponse(BaseModel):
    clan_id: str
    clan_name: str
    audit_scope: str = Field(default="clan_wide", description="clan_wide hoặc branch_scoped")
    is_valid: bool = Field(..., description="True nếu không có lỗi chặn (fatal errors)")
    summary: Dict[str, Any] = Field(default_factory=dict)
    fatal_errors: List[Dict[str, Any]] = Field(default_factory=list)
    warnings: List[Dict[str, Any]] = Field(default_factory=list)
    duplicate_candidates: List[Dict[str, Any]] = Field(default_factory=list)
    anomalous_relationships: List[Dict[str, Any]] = Field(default_factory=list)
    missing_relationship_suggestions: List[Dict[str, Any]] = Field(default_factory=list)
    ai_advisory: Optional[str] = None
    preview: Dict[str, Any] = Field(default_factory=dict)

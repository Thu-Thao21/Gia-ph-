export interface AIChatSource {
  person_id: string;
  full_name: string;
  role?: string;
}

export interface AIPersonCandidate {
  person_id: string;
  full_name: string;
  generation: number;
  gender?: string;
  birth_year?: number;
  death_year?: number;
  is_alive?: boolean;
}

export interface AIChatRequest {
  message: string;
  conversation_id?: string;
  person_id?: string;
}

export interface AIChatResponse {
  answer: string;
  conversation_id: string;
  sources: AIChatSource[];
  status: 'success' | 'clan_ai_disabled' | 'feature_disabled' | 'ambiguous' | 'not_found' | 'error' | 'empty_input' | string;
  suggested_questions: string[];
  person_candidates: AIPersonCandidate[];
}

export interface AIChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  sources?: AIChatSource[];
  suggested_questions?: string[];
  person_candidates?: AIPersonCandidate[];
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// GIAI ĐOẠN 4 TYPES: KINSHIP EXPLAINER & BIOGRAPHY SUMMARIZER
// ---------------------------------------------------------------------------

export interface AIKinshipPathNode {
  person_id: string;
  full_name: string;
  generation?: number;
  gender?: string;
  relation_to_next?: string;
}

export interface AIKinshipExplainRequest {
  person_a_id: string;
  person_b_id: string;
}

export interface AIKinshipExplainResponse {
  person_a_id: string;
  person_a_name: string;
  person_b_id: string;
  person_b_name: string;
  found: boolean;
  relationship_type: string;
  kinship_term: string;
  address_title_a_to_b: string;
  self_pronoun_a_to_b: string;
  address_title_b_to_a: string;
  self_pronoun_b_to_a: string;
  generation_diff: number;
  relationship_path: AIKinshipPathNode[];
  confidence_status: 'confirmed' | 'ambiguous' | 'insufficient_data';
  evidence: Array<{
    from_person?: string;
    to_person?: string;
    relationship_type?: string;
    verified?: boolean;
  }>;
  ai_explanation?: string;
  explanation_status: 'success' | 'clan_ai_disabled' | 'consent_revoked' | 'no_path' | 'error';
}

export interface AIBiographySummarizeRequest {
  person_id: string;
  style?: 'short' | 'standard' | 'formal';
}

export interface AIBiographySummarizeResponse {
  person_id: string;
  full_name: string;
  style: string;
  summary: string;
  verified_facts: string[];
  sources: Array<{
    person_id: string;
    full_name: string;
    role?: string;
  }>;
  status: 'success' | 'clan_ai_disabled' | 'consent_revoked' | 'error';
}

// ---------------------------------------------------------------------------
// GIAI ĐOẠN 5 TYPES: DATA QUALITY, DUPLICATE DETECTION & ANOMALIES
// ---------------------------------------------------------------------------

export interface AIDuplicatePersonMeta {
  person_id: string;
  full_name: string;
  generation: number;
  gender?: string;
  birth_year?: number;
  death_year?: number;
  branch_name?: string;
  is_alive?: boolean;
}

export interface AIDuplicateCandidate {
  person_1: AIDuplicatePersonMeta;
  person_2: AIDuplicatePersonMeta;
  similarity_score: number;
  reasons: string[];
  recommendation: string;
}

export interface AIMissingRelationshipSuggestion {
  from_person_id: string;
  from_person_name: string;
  to_person_id: string;
  to_person_name: string;
  suggested_type: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  evidence: string[];
  reason: string;
}

export interface AIDataAnomaly {
  anomaly_type: 'CYCLE' | 'TIMELINE_CONFLICT' | 'GENERATION_ANOMALY' | 'SELF_RELATION' | 'ISOLATED_PERSON' | string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  affected_persons: Array<{
    person_id: string;
    full_name: string;
    role?: string;
  }>;
  recommended_fix: string;
}

export interface AIDataQualityReportRequest {
  include_ai_synthesis?: boolean;
  branch_id?: string;
}

export interface AIDataQualityReportResponse {
  clan_id: string;
  clan_name: string;
  audit_scope?: 'clan_wide' | 'branch_scoped' | string;
  scoped_branch_names?: string[];
  total_persons: number;
  total_relationships: number;
  health_score: number;
  duplicates_count: number;
  duplicate_candidates: AIDuplicateCandidate[];
  missing_relationships_count: number;
  missing_relationships: AIMissingRelationshipSuggestion[];
  anomalies_count: number;
  anomalies: AIDataAnomaly[];
  ai_summary?: string;
  status: string;
}



// ---------------------------------------------------------------------------
// GIAI ĐOẠN 6: AI EXCEL IMPORT AUDIT TYPES
// ---------------------------------------------------------------------------

export interface AIExcelDuplicateItem {
  source: 'intra_excel' | 'db_cross_check';
  person_1: {
    code?: string;
    full_name: string;
    generation: number;
    birth_year?: number;
    row?: number;
  };
  person_2: {
    code?: string;
    person_id?: string;
    full_name: string;
    generation: number;
    birth_year?: number;
    branch_name?: string;
    row?: number;
  };
  similarity_score: number;
  reasons: string[];
  recommendation: string;
}

export interface AIExcelAnomalousRelation {
  type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  sheet: string;
  row?: number;
  title: string;
  description: string;
  recommended_fix: string;
}

export interface AIExcelMissingRelation {
  suggested_type: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  from_person: { code?: string; full_name: string };
  to_person: { code?: string; full_name: string };
  evidence: string[];
  reason: string;
}

export interface AIExcelImportAnalyzeResponse {
  clan_id: string;
  clan_name: string;
  audit_scope?: 'clan_wide' | 'branch_scoped' | string;
  is_valid: boolean;
  summary: {
    total_persons: number;
    total_relationships: number;
    total_branches: number;
    fatal_count: number;
    warning_count: number;
    duplicates_count: number;
    anomalies_count: number;
    missing_suggestions_count: number;
    health_score: number;
  };
  fatal_errors: Array<{
    sheet: string;
    row: number;
    column: string;
    code: string;
    message: string;
  }>;
  warnings: Array<{
    sheet: string;
    row: number;
    column: string;
    code: string;
    message: string;
  }>;
  duplicate_candidates: AIExcelDuplicateItem[];
  anomalous_relationships: AIExcelAnomalousRelation[];
  missing_relationship_suggestions: AIExcelMissingRelation[];
  ai_advisory?: string;
  preview: {
    persons: any[];
    relationships: any[];
    branches: any[];
  };
}

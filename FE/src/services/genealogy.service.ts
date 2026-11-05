import apiClient from '../api/axios';

export interface PersonItem {
  id: string;
  familyId: string;
  branchId?: string | null;
  fullName: string;
  gender: string;
  birthDate?: string | null;
  deathDate?: string | null;
  generation: number;
  avatarUrl?: string | null;
  isLiving: boolean;
  status: string;
}

export interface PersonCreatePayload {
  fullName: string;
  branchId?: string | null;
  gender?: string;
  birthDate?: string | null;
  deathDate?: string | null;
  generation?: number | null;
  avatarUrl?: string | null;
  isLiving?: boolean;
  status?: string;
}

export interface PersonUpdatePayload {
  fullName?: string;
  branchId?: string | null;
  gender?: string;
  birthDate?: string | null;
  deathDate?: string | null;
  generation?: number | null;
  avatarUrl?: string | null;
  isLiving?: boolean;
  status?: string;
}

export interface RelationshipItem {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  relationshipType: string;
  notes?: string | null;
}

export interface RelationshipCreatePayload {
  fromMemberId: string;
  toMemberId: string;
  relationshipType: string;
  notes?: string | null;
}

export interface AncestorDescendantItem {
  person: PersonItem;
  depth: number;
}

export interface TreeDataResponse {
  nodes: Array<{
    id: string;
    fullName: string;
    gender: string;
    generation: number;
    branchId?: string | null;
    avatarUrl?: string | null;
    isLiving?: boolean;
    status: string;
  }>;
  edges: RelationshipItem[];
}

export interface FocusViewNode {
  id: string;
  fullName: string;
  gender: string;
  generation: number;
  branchId?: string | null;
  avatarUrl?: string | null;
  depth: number;
  isEgo: boolean;
  status: string;
}

export interface FocusViewResponse {
  ego: PersonItem;
  nodes: FocusViewNode[];
  edges: RelationshipItem[];
  maxDepth: number;
}

export interface RelationshipCalculationResponse {
  found: boolean;
  fromPerson?: PersonItem;
  toPerson?: PersonItem;
  path: PersonItem[];
  edges: RelationshipItem[];
  kinshipName: string;
  addressTitle: string;
  generationDiff: number;
  description: string;
}

export interface PublicClanItem {
  id: string;
  name: string;
  clan_code?: string;
  status: string;
  activated_at?: string;
}

/** GET /families/{family_id}/persons */
export async function fetchFamilyPersons(
  familyId: string,
  params: {
    search?: string;
    gender?: string;
    branchId?: string;
    isLiving?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<PersonItem[]> {
  const res = await apiClient.get<PersonItem[]>(`/families/${familyId}/persons`, {
    params: {
      search: params.search || undefined,
      gender: params.gender || undefined,
      branchId: params.branchId || undefined,
      isLiving: params.isLiving,
      limit: params.limit ?? 100,
      offset: params.offset ?? 0,
    },
  });
  return res.data;
}

/** POST /families/{family_id}/persons */
export async function createFamilyPerson(
  familyId: string,
  payload: PersonCreatePayload
): Promise<PersonItem> {
  const res = await apiClient.post<PersonItem>(`/families/${familyId}/persons`, payload);
  return res.data;
}

/** GET /families/{family_id}/persons/{person_id} */
export async function getFamilyPerson(
  familyId: string,
  personId: string
): Promise<PersonItem> {
  const res = await apiClient.get<PersonItem>(`/families/${familyId}/persons/${personId}`);
  return res.data;
}

/** PATCH /families/{family_id}/persons/{person_id} */
export async function updateFamilyPerson(
  familyId: string,
  personId: string,
  payload: PersonUpdatePayload
): Promise<PersonItem> {
  const res = await apiClient.patch<PersonItem>(`/families/${familyId}/persons/${personId}`, payload);
  return res.data;
}

/** POST /families/{family_id}/relationships */
export async function createFamilyRelationship(
  familyId: string,
  payload: RelationshipCreatePayload
): Promise<RelationshipItem> {
  const res = await apiClient.post<RelationshipItem>(`/families/${familyId}/relationships`, payload);
  return res.data;
}

/** DELETE /families/{family_id}/relationships/{relationship_id} */
export async function deleteFamilyRelationship(
  familyId: string,
  relationshipId: string
): Promise<void> {
  await apiClient.delete(`/families/${familyId}/relationships/${relationshipId}`);
}

/** GET /families/{family_id}/persons/{person_id}/ancestors */
export async function fetchPersonAncestors(
  familyId: string,
  personId: string
): Promise<AncestorDescendantItem[]> {
  const res = await apiClient.get<AncestorDescendantItem[]>(
    `/families/${familyId}/persons/${personId}/ancestors`
  );
  return res.data;
}

/** GET /families/{family_id}/persons/{person_id}/descendants */
export async function fetchPersonDescendants(
  familyId: string,
  personId: string
): Promise<AncestorDescendantItem[]> {
  const res = await apiClient.get<AncestorDescendantItem[]>(
    `/families/${familyId}/persons/${personId}/descendants`
  );
  return res.data;
}

/** GET /families/{family_id}/tree-data */
export async function fetchFamilyTreeData(
  familyId: string,
  params?: {
    branchId?: string;
    generation?: number;
    maxGeneration?: number;
  }
): Promise<TreeDataResponse> {
  const res = await apiClient.get<TreeDataResponse>(`/families/${familyId}/tree-data`, {
    params: {
      branchId: params?.branchId || undefined,
      generation: params?.generation,
      maxGeneration: params?.maxGeneration,
    },
  });
  return res.data;
}

/** GET /families/{family_id}/persons/{person_id}/focus-view */
export async function fetchFocusView(
  familyId: string,
  personId: string,
  depth: number = 2
): Promise<FocusViewResponse> {
  const res = await apiClient.get<FocusViewResponse>(
    `/families/${familyId}/persons/${personId}/focus-view`,
    { params: { depth } }
  );
  return res.data;
}

/** GET /families/{family_id}/relationship-path */
export async function fetchRelationshipCalculation(
  familyId: string,
  fromPersonId: string,
  toPersonId: string
): Promise<RelationshipCalculationResponse> {
  const res = await apiClient.get<RelationshipCalculationResponse>(
    `/families/${familyId}/relationship-path`,
    {
      params: {
        fromPersonId,
        toPersonId,
        from_person_id: fromPersonId,
        to_person_id: toPersonId,
      },
    }
  );
  return res.data;
}

/** GET /public/families (Khách tìm kiếm dòng họ công khai) */
export async function fetchPublicClans(search?: string): Promise<PublicClanItem[]> {
  const res = await apiClient.get<PublicClanItem[]>('/public/families', {
    params: { search: search || undefined },
  });
  return res.data;
}

/** GET /families/{family_id}/public-tree (Cây công khai có che giấu dữ liệu riêng tư) */
export async function fetchPublicClanTree(familyId: string): Promise<TreeDataResponse> {
  const res = await apiClient.get<TreeDataResponse>(`/families/${familyId}/public-tree`);
  return res.data;
}


export interface BranchItem {
  id: string;
  name: string;
  description?: string;
  code?: string;
  familyId?: string;
  founderId?: string;
}

/** GET /families/{family_id}/branches */
export async function fetchFamilyBranches(familyId: string): Promise<BranchItem[]> {
  try {
    const res = await apiClient.get<BranchItem[]>(`/families/${familyId}/branches`);
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

/** POST /families/{family_id}/branches */
export async function createFamilyBranch(
  familyId: string,
  payload: { name: string; description?: string; code?: string }
): Promise<BranchItem> {
  const res = await apiClient.post<BranchItem>(`/families/${familyId}/branches`, payload);
  return res.data;
}

/** PATCH /families/{family_id}/branches/{branch_id} */
export async function updateFamilyBranch(
  familyId: string,
  branchId: string,
  payload: { name?: string; description?: string; code?: string }
): Promise<BranchItem> {
  const res = await apiClient.patch<BranchItem>(`/families/${familyId}/branches/${branchId}`, payload);
  return res.data;
}

/** DELETE /families/{family_id}/branches/{branch_id} */
export async function deleteFamilyBranch(familyId: string, branchId: string): Promise<void> {
  await apiClient.delete(`/families/${familyId}/branches/${branchId}`);
}


export interface ClanAuditLogItem {
  id: string;
  actorName: string;
  action: string;
  actionType: 'MEMBER' | 'RELATION' | 'BRANCH' | 'APPROVAL' | 'PERMISSION' | 'LINK' | 'EXPORT';
  details: string;
  occurredAt: string;
}

/** GET /families/{family_id}/audit-logs */
export async function fetchClanAuditLogs(
  familyId: string,
  category?: string
): Promise<ClanAuditLogItem[]> {
  try {
    const res = await apiClient.get<ClanAuditLogItem[]>(`/families/${familyId}/audit-logs`, {
      params: { category: category && category !== 'all' ? category : undefined },
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('Failed to fetch clan audit logs:', err);
    return [];
  }
}

/** POST /families/{family_id}/audit-logs */
export async function recordClanAuditLog(
  familyId: string,
  payload: { action: string; action_type?: string; details: string; entity_id?: string }
): Promise<void> {
  try {
    await apiClient.post(`/families/${familyId}/audit-logs`, {
      action: payload.action,
      action_type: payload.action_type || 'MEMBER',
      details: payload.details,
      entity_id: payload.entity_id,
    });
  } catch (err) {
    console.warn('Failed to record clan audit log:', err);
  }
}


// -----------------------------------------------------------------------------
// EXCEL GENEALOGY IMPORT INTERFACES & APIS (PERSON - USER PARADIGM)
// -----------------------------------------------------------------------------
export interface ExcelValidationErrorItem {
  sheet: string;
  row: number;
  column: string;
  code: string;
  message: string;
}

export interface ExcelValidationResult {
  is_valid: boolean;
  summary: {
    total_persons: number;
    total_relationships: number;
    total_branches: number;
    fatal_count: number;
    warning_count: number;
  };
  fatal_errors: ExcelValidationErrorItem[];
  warnings: ExcelValidationErrorItem[];
  preview: {
    persons: Array<{
      row_idx: number;
      code: string;
      fullName: string;
      gender: string;
      generation: number;
      isLiving: boolean;
      birthDate?: string | null;
      deathDate?: string | null;
      branchCode?: string | null;
      originPlace?: string | null;
      biography?: string | null;
    }>;
    relationships: Array<{
      row_idx: number;
      person1: string;
      person2: string;
      relationshipType: string;
      parentType?: string | null;
      childOrder?: number | null;
      notes?: string | null;
    }>;
    branches: Array<{
      row_idx: number;
      code: string;
      name: string;
      parent_code?: string | null;
      order: number;
      description?: string | null;
    }>;
  };
}

export interface ExcelImportExecutionResult {
  success: boolean;
  message: string;
  added_persons: number;
  added_relationships: number;
  added_branches: number;
}

/** Tải file mẫu Excel (.xlsx) chuẩn 4 sheets từ Backend */
export async function downloadGenealogyTemplate(familyId: string): Promise<Blob> {
  const res = await apiClient.get(`/families/${familyId}/import/template`, {
    responseType: 'blob',
  });
  return res.data;
}

/** Kiểm thử tệp Excel (Dry-run validation), báo cáo chi tiết từng dòng */
export async function previewGenealogyExcel(familyId: string, file: File): Promise<ExcelValidationResult> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post<ExcelValidationResult>(`/families/${familyId}/import/preview`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

/** Thực thi lưu tệp Excel vào Neon DB với Atomic Transaction */
export async function executeGenealogyExcel(familyId: string, file: File): Promise<ExcelImportExecutionResult> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post<ExcelImportExecutionResult>(`/families/${familyId}/import/execute`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

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
    status: string;
  }>;
  edges: RelationshipItem[];
}

/** GET /api/v1/families/{family_id}/persons */
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
  const res = await apiClient.get<PersonItem[]>(`/api/v1/families/${familyId}/persons`, {
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

/** POST /api/v1/families/{family_id}/persons */
export async function createFamilyPerson(
  familyId: string,
  payload: PersonCreatePayload
): Promise<PersonItem> {
  const res = await apiClient.post<PersonItem>(`/api/v1/families/${familyId}/persons`, payload);
  return res.data;
}

/** GET /api/v1/families/{family_id}/persons/{person_id} */
export async function getFamilyPerson(
  familyId: string,
  personId: string
): Promise<PersonItem> {
  const res = await apiClient.get<PersonItem>(`/api/v1/families/${familyId}/persons/${personId}`);
  return res.data;
}

/** PATCH /api/v1/families/{family_id}/persons/{person_id} */
export async function updateFamilyPerson(
  familyId: string,
  personId: string,
  payload: PersonUpdatePayload
): Promise<PersonItem> {
  const res = await apiClient.patch<PersonItem>(`/api/v1/families/${familyId}/persons/${personId}`, payload);
  return res.data;
}

/** POST /api/v1/families/{family_id}/relationships */
export async function createFamilyRelationship(
  familyId: string,
  payload: RelationshipCreatePayload
): Promise<RelationshipItem> {
  const res = await apiClient.post<RelationshipItem>(`/api/v1/families/${familyId}/relationships`, payload);
  return res.data;
}

/** DELETE /api/v1/families/{family_id}/relationships/{relationship_id} */
export async function deleteFamilyRelationship(
  familyId: string,
  relationshipId: string
): Promise<void> {
  await apiClient.delete(`/api/v1/families/${familyId}/relationships/${relationshipId}`);
}

/** GET /api/v1/families/{family_id}/persons/{person_id}/ancestors */
export async function fetchPersonAncestors(
  familyId: string,
  personId: string
): Promise<AncestorDescendantItem[]> {
  const res = await apiClient.get<AncestorDescendantItem[]>(
    `/api/v1/families/${familyId}/persons/${personId}/ancestors`
  );
  return res.data;
}

/** GET /api/v1/families/{family_id}/persons/{person_id}/descendants */
export async function fetchPersonDescendants(
  familyId: string,
  personId: string
): Promise<AncestorDescendantItem[]> {
  const res = await apiClient.get<AncestorDescendantItem[]>(
    `/api/v1/families/${familyId}/persons/${personId}/descendants`
  );
  return res.data;
}

/** GET /api/v1/families/{family_id}/tree-data */
export async function fetchFamilyTreeData(
  familyId: string
): Promise<TreeDataResponse> {
  const res = await apiClient.get<TreeDataResponse>(`/api/v1/families/${familyId}/tree-data`);
  return res.data;
}

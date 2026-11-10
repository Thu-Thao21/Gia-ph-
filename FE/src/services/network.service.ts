import type { MemberItem } from '../types/member';
import apiClient from '../api/axios';
import type {
  FamilyLinkRequest,
  FamilyNetwork,
  InLawMarriage,
  PersonMappingItem,
  InterClanSharedPolicyItem,
  SharedTreeResponse,
  NetworkDiagramResponse,
  HybridTreeResponse,
  DualLineageResponse,
  MyFamilyNetworkResponse,
  LineageAccessRequestItem,
  LineageAccessGrantItem,
  MarriageInvitationItem,
} from '../types/network';

export async function fetchFamilyNetwork(category: string = 'all'): Promise<FamilyNetwork[]> {
  try {
    const res = await apiClient.get('/networks/families', { params: { category } });
    const data = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : [];
    return data;
  } catch (err) {
    console.error('API fetchFamilyNetwork error:', err);
    return [];
  }
}

export async function fetchInLawMarriages(clanId?: string): Promise<InLawMarriage[]> {
  try {
    const res = await apiClient.get('/networks/inlaw-marriages', { params: clanId ? { clan_id: clanId } : {} });
    const data = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : [];
    return data;
  } catch (err) {
    console.error('API fetchInLawMarriages error:', err);
    return [];
  }
}

export async function fetchLinkRequests(): Promise<FamilyLinkRequest[]> {
  try {
    const res = await apiClient.get('/networks/link-requests');
    const data = Array.isArray(res.data) ? res.data : Array.isArray(res.data?.items) ? res.data.items : [];
    return data;
  } catch (err) {
    console.error('API fetchLinkRequests error:', err);
    return [];
  }
}

export interface CreateLinkRequestPayload {
  targetFamilyId: string;
  sourceFamilyId?: string;
  connectionType: 'IN_LAW' | 'ANCESTRAL' | 'ALLIED';
  sourcePersonId?: string | null;
  targetPersonId?: string | null;
  message?: string;
}

export async function sendLinkRequest(
  payload: CreateLinkRequestPayload | string,
  legacyType?: string,
  legacyMessage?: string,
): Promise<FamilyLinkRequest> {
  if (typeof payload === 'string') {
    const res = await apiClient.post('/networks/link-requests', {
      targetFamilyId: payload,
      connectionType: legacyType === 'marriage' ? 'IN_LAW' : 'ALLIED',
      message: legacyMessage,
    });
    return res.data;
  }
  const res = await apiClient.post('/networks/link-requests', {
    targetFamilyId: payload.targetFamilyId,
    sourceFamilyId: payload.sourceFamilyId,
    connectionType: payload.connectionType,
    sourcePersonId: payload.sourcePersonId || null,
    targetPersonId: payload.targetPersonId || null,
    message: payload.message,
  });
  return res.data;
}

export async function reviewLinkRequest(
  requestId: string,
  action: 'APPROVE' | 'REJECT',
  reason?: string
): Promise<{ status: string }> {
  const res = await apiClient.post(`/networks/link-requests/${requestId}/review`, {
    action,
    reason,
  });
  return res.data;
}

export async function fetchInterClanLinks(status?: string): Promise<any[]> {
  try {
    const res = await apiClient.get('/networks/links', { params: status ? { status } : {} });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('API fetchInterClanLinks error:', err);
    return [];
  }
}

export async function terminateInterClanLink(linkId: string, reason?: string): Promise<{ status: string }> {
  const res = await apiClient.post(`/networks/links/${linkId}/terminate`, { reason: reason || undefined });
  return res.data;
}

export async function fetchNetworkDiagram(): Promise<NetworkDiagramResponse> {
  try {
    const res = await apiClient.get('/networks/diagram');
    return res.data || { nodes: [], edges: [] };
  } catch (err) {
    console.error('API fetchNetworkDiagram error:', err);
    return { nodes: [], edges: [] };
  }
}

export async function fetchSharingPolicies(linkId: string): Promise<InterClanSharedPolicyItem[]> {
  try {
    const res = await apiClient.get('/networks/links/' + linkId + '/policies');
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('API fetchSharingPolicies error:', err);
    return [];
  }
}

export async function updateSharingPolicy(
  linkId: string,
  policyData: {
    dataScope?: string;
    allowedFields?: Record<string, boolean>;
    canExport?: boolean;
    ownerClanId?: string;
  }
): Promise<any> {
  const res = await apiClient.put('/networks/links/' + linkId + '/policies', policyData);
  return res.data;
}

export async function fetchSharedTree(familyId: string): Promise<SharedTreeResponse> {
  const res = await apiClient.get('/networks/shared-tree/' + familyId);
  return res.data;
}


export async function fetchPersonMappings(linkId: string): Promise<PersonMappingItem[]> {
  try {
    const res = await apiClient.get('/networks/links/' + linkId + '/person-mappings');
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('API fetchPersonMappings error:', err);
    return [];
  }
}

export async function createPersonMapping(
  linkId: string,
  payload: { sourcePersonId: string; targetPersonId: string; relationshipType?: string; notes?: string }
): Promise<PersonMappingItem> {
  const res = await apiClient.post('/networks/links/' + linkId + '/person-mappings', payload);
  return res.data;
}

export async function reviewPersonMapping(
  mappingId: string,
  action: 'VERIFY' | 'REJECT',
  notes?: string
): Promise<PersonMappingItem> {
  const res = await apiClient.post('/networks/person-mappings/' + mappingId + '/review', { action, notes });
  return res.data;
}

export async function revokePersonMapping(
  mappingId: string,
  reason?: string
): Promise<{ status: string; mapping_id: string }> {
  const res = await apiClient.post('/networks/person-mappings/' + mappingId + '/revoke', { reason });
  return res.data;
}


export async function fetchHybridTree(linkId: string): Promise<HybridTreeResponse> {
  const res = await apiClient.get('/networks/links/' + linkId + '/hybrid-tree');
  return res.data;
}


export async function fetchDualLineage(personId: string): Promise<DualLineageResponse | null> {
  try {
    const res = await apiClient.get(`/networks/persons/${personId}/dual-lineage`);
    return res.data;
  } catch (err) {
    console.error('API fetchDualLineage error:', err);
    return null;
  }
}

export async function fetchMyFamilyNetwork(clanId?: string): Promise<MyFamilyNetworkResponse | null> {
  try {
    const res = await apiClient.get('/networks/my-family-network', {
      params: clanId ? { clan_id: clanId } : {},
    });
    return res.data;
  } catch (err) {
    console.error('API fetchMyFamilyNetwork error:', err);
    return null;
  }
}

export async function fetchClanCandidateMembers(clanId: string): Promise<MemberItem[]> {
  try {
    const res = await apiClient.get(`/networks/clans/${clanId}/candidate-members`);
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('API fetchClanCandidateMembers error:', err);
    return [];
  }
}

// ==============================================================================
// LINEAGE ACCESS GRANTS & REQUESTS (Phê duyệt quyền xem cây 4 đời liên họ)
// ==============================================================================

export async function requestLineageAccess(
  ownerClanId: string,
  anchorPersonId: string,
  reason?: string
): Promise<LineageAccessRequestItem> {
  const res = await apiClient.post('/networks/lineage-access-requests', {
    owner_clan_id: ownerClanId,
    anchor_person_id: anchorPersonId,
    reason,
  });
  return res.data;
}

export async function fetchMyLineageAccessRequests(): Promise<LineageAccessRequestItem[]> {
  try {
    const res = await apiClient.get('/networks/lineage-access-requests/my');
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('API fetchMyLineageAccessRequests error:', err);
    return [];
  }
}

export async function fetchPendingLineageAccessRequests(clanId?: string): Promise<LineageAccessRequestItem[]> {
  try {
    const res = await apiClient.get('/networks/lineage-access-requests/pending', {
      params: clanId ? { clan_id: clanId } : {},
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('API fetchPendingLineageAccessRequests error:', err);
    return [];
  }
}

export async function reviewLineageAccessRequest(
  requestId: string,
  action: 'APPROVE' | 'REJECT',
  rejectionReason?: string
): Promise<LineageAccessRequestItem> {
  const res = await apiClient.post(`/networks/lineage-access-requests/${requestId}/review`, {
    action,
    rejection_reason: rejectionReason,
  });
  return res.data;
}

export async function revokeLineageAccessGrant(
  grantId: string,
  revocationReason?: string
): Promise<LineageAccessGrantItem> {
  const res = await apiClient.post(`/networks/lineage-access-grants/${grantId}/revoke`, {
    revocation_reason: revocationReason,
  });
  return res.data;
}

export async function listLineageAccessGrants(clanId?: string): Promise<LineageAccessGrantItem[]> {
  try {
    const res = await apiClient.get('/networks/lineage-access-grants', {
      params: clanId ? { clan_id: clanId } : {},
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('API listLineageAccessGrants error:', err);
    return [];
  }
}

export async function sendMarriageInvitation(
  targetPersonId: string,
  notes?: string
): Promise<MarriageInvitationItem> {
  const res = await apiClient.post('/networks/marriage-invitations', {
    target_person_id: targetPersonId,
    notes,
  });
  return res.data;
}

export async function fetchMyMarriageInvitations(): Promise<MarriageInvitationItem[]> {
  try {
    const res = await apiClient.get('/networks/marriage-invitations/my');
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('API fetchMyMarriageInvitations error:', err);
    return [];
  }
}

export async function respondMarriageInvitation(
  mappingId: string,
  action: 'ACCEPT' | 'REJECT',
  notes?: string
): Promise<MarriageInvitationItem> {
  const res = await apiClient.post(`/networks/marriage-invitations/${mappingId}/respond`, {
    action,
    notes,
  });
  return res.data;
}



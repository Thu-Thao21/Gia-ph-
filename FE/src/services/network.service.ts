import apiClient from '../api/axios';
import type { FamilyLinkRequest, FamilyNetwork, InLawMarriage } from '../types/network';

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

export async function fetchInLawMarriages(): Promise<InLawMarriage[]> {
  try {
    const res = await apiClient.get('/networks/inlaw-marriages');
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

export async function sendLinkRequest(
  targetFamilyId: string,
  requestType: string = 'marriage',
  message?: string,
): Promise<FamilyLinkRequest> {
  const res = await apiClient.post('/networks/link-requests', {
    target_family_id: targetFamilyId,
    request_type: requestType,
    message,
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

export async function terminateInterClanLink(linkId: string): Promise<{ status: string }> {
  const res = await apiClient.delete(`/networks/links/${linkId}`);
  return res.data;
}

export async function fetchNetworkDiagram(): Promise<{ nodes: any[]; edges: any[] }> {
  try {
    const res = await apiClient.get('/networks/diagram');
    return res.data || { nodes: [], edges: [] };
  } catch (err) {
    console.error('API fetchNetworkDiagram error:', err);
    return { nodes: [], edges: [] };
  }
}

export async function fetchSharingPolicies(linkId: string): Promise<any[]> {
  try {
    const res = await apiClient.get(`/networks/links/${linkId}/policies`);
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('API fetchSharingPolicies error:', err);
    return [];
  }
}

export async function updateSharingPolicy(
  linkId: string,
  policyData: { dataScope?: string; allowedFields?: Record<string, boolean>; canExport?: boolean }
): Promise<any> {
  const res = await apiClient.put(`/networks/links/${linkId}/policies`, policyData);
  return res.data;
}

export async function fetchSharedTree(familyId: string): Promise<any> {
  const res = await apiClient.get(`/networks/shared-tree/${familyId}`);
  return res.data;
}


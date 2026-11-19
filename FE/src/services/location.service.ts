import apiClient from '../api/axios';
import type { ClanLocation, PersonBurial, LocationProposal } from '../types/location';

/**
 * Universal Google Maps Directions Deep Link
 * Miễn phí quota 100%, tự động mở app Google Maps trên điện thoại hoặc trình duyệt
 * để chỉ đường từ vị trí GPS hiện tại của người dùng đến đích.
 */
export function getGoogleMapsDirectionUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/**
 * URL nhúng bản đồ Google Maps (iframe an toàn, không tốn quota API)
 */
export function getGoogleMapsEmbedUrl(lat: number, lng: number): string {
  return `https://maps.google.com/maps?q=${lat},${lng}&hl=vi&z=16&output=embed`;
}

// -------------------------------------------------------------
// Clan Locations API (Nhà thờ họ, từ đường, di tích, đất tổ...)
// -------------------------------------------------------------

export async function fetchClanLocations(clanId: string): Promise<ClanLocation[]> {
  try {
    const res = await apiClient.get(`/families/${clanId}/locations`);
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('Lỗi tải danh sách địa điểm dòng họ:', err);
    return [];
  }
}

export async function createClanLocation(clanId: string, data: Partial<ClanLocation>): Promise<ClanLocation> {
  const res = await apiClient.post(`/families/${clanId}/locations`, data);
  return res.data;
}

export async function updateClanLocation(clanId: string, locationId: string, data: Partial<ClanLocation>): Promise<ClanLocation> {
  const res = await apiClient.put(`/families/${clanId}/locations/${locationId}`, data);
  return res.data;
}

export async function deleteClanLocation(clanId: string, locationId: string): Promise<void> {
  await apiClient.delete(`/families/${clanId}/locations/${locationId}`);
}

// -------------------------------------------------------------
// Person Burial API (Mộ phần tổ tiên / người đã khuất)
// -------------------------------------------------------------

export async function fetchPersonBurial(personId: string): Promise<PersonBurial | null> {
  try {
    const res = await apiClient.get(`/members/${personId}/burial`);
    return res.data ?? null;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      return null;
    }
    console.error(`Lỗi tải mộ phần cho người ${personId}:`, err);
    return null;
  }
}

export async function savePersonBurial(personId: string, data: Partial<PersonBurial>): Promise<PersonBurial> {
  const res = await apiClient.put(`/members/${personId}/burial`, data);
  return res.data;
}

export async function deletePersonBurial(personId: string): Promise<void> {
  await apiClient.delete(`/members/${personId}/burial`);
}

// -------------------------------------------------------------
// Location Proposals API (Đề xuất & phê duyệt chỉnh sửa địa điểm)
// -------------------------------------------------------------

export async function fetchLocationProposals(clanId: string, status?: string): Promise<LocationProposal[]> {
  try {
    const res = await apiClient.get(`/families/${clanId}/location-proposals`, {
      params: status ? { status } : undefined,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('Lỗi tải danh sách đề xuất vị trí:', err);
    return [];
  }
}

export async function submitLocationProposal(clanId: string, data: Partial<LocationProposal>): Promise<LocationProposal> {
  const res = await apiClient.post(`/families/${clanId}/location-proposals`, data);
  return res.data;
}

export async function reviewLocationProposal(
  clanId: string,
  proposalId: string,
  data: { action: 'APPROVE' | 'REJECT'; reviewNotes?: string }
): Promise<any> {
  const res = await apiClient.put(`/families/${clanId}/location-proposals/${proposalId}/review`, data);
  return res.data;
}


import apiClient from '../api/axios';

export interface ClanDocumentItem {
  id: string;
  documentId: string;
  title: string;
  description?: string;
  category: string;
  fileUrl?: string;
  fileType?: string;
  createdAt?: string;
}

export async function fetchClanDocuments(familyId: string, category?: string): Promise<ClanDocumentItem[]> {
  try {
    const res = await apiClient.get<ClanDocumentItem[]>(`/families/${familyId}/documents`, {
      params: category && category !== 'all' ? { category } : undefined,
    });
    return Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    console.error('Lỗi khi tải tư liệu dòng họ:', err);
    return [];
  }
}

export async function createClanDocument(
  familyId: string,
  data: {
    title: string;
    description?: string;
    category?: string;
    fileUrl?: string;
    fileType?: string;
  }
): Promise<{ id: string; documentId: string; title: string; message: string }> {
  const res = await apiClient.post(`/families/${familyId}/documents`, data);
  return res.data;
}

export async function deleteClanDocument(familyId: string, documentId: string): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.delete(`/families/${familyId}/documents/${documentId}`);
  return res.data;
}

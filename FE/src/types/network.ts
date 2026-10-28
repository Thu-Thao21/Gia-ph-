export interface NetworkMemberItem {
  id: string;
  fullName: string;
  gender: string;
  generation: number;
  birthDate?: string | null;
  deathDate?: string | null;
  isAlive?: boolean;
  branch?: string;
  bio?: string;
}

export interface FamilyNetwork {
  id: string;
  name: string;
  code?: string;
  founderName?: string;
  originPlace?: string;
  ancestralHouseAddress?: string;
  history?: string;
  description?: string;
  branches: string[];
  status: string;
  category: string; // noi, ngoai, thong-gia
  memberCount: number;
  linkedSince?: string;
  members?: NetworkMemberItem[];
}

export interface InLawMarriage {
  id: string;
  husbandName: string;
  husbandFamily: string;
  wifeName: string;
  wifeFamily: string;
  marriageDate?: string;
  status: string;
  notes?: string;
}

export interface FamilyLinkRequest {
  id: string;
  sourceFamilyId: string;
  sourceFamilyName: string;
  targetFamilyId: string;
  targetFamilyName: string;
  requestType: string;
  status: string;
  message?: string;
  createdAt?: string;
}

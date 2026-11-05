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
  husbandPersonId?: string;
  husbandClanId?: string;
  wifeName: string;
  wifeFamily: string;
  wifePersonId?: string;
  wifeClanId?: string;
  marriageDate?: string;
  status?: string;
  isCrossClan?: boolean;
  linkId?: string;
  notes?: string;
}

export interface FamilyLinkRequest {
  id: string;
  sourceFamilyId: string;
  sourceFamilyName: string;
  targetFamilyId: string;
  targetFamilyName: string;
  connectionType?: 'IN_LAW' | 'ANCESTRAL' | 'ALLIED';
  sourcePersonId?: string | null;
  targetPersonId?: string | null;
  sourcePersonName?: string | null;
  targetPersonName?: string | null;
  requestType?: string;
  status: string;
  message?: string;
  createdAt?: string;
}

export interface InterClanLinkItem {
  id: string;
  requestId: string;
  clanAId: string;
  clanAName: string;
  clanBId: string;
  clanBName: string;
  connectionType?: 'IN_LAW' | 'ANCESTRAL' | 'ALLIED';
  status: string;
  linkedAt: string;
  endedAt?: string | null;
  terminatedBy?: string | null;
  terminationReason?: string | null;
}

export interface PersonMappingItem {
  id: string;
  linkId: string;
  clanAId: string;
  clanAName: string;
  personAId: string;
  personAName: string;
  personAGender?: string;
  clanBId: string;
  clanBName: string;
  personBId: string;
  personBName: string;
  personBGender?: string;
  relationshipType: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REVOKED';
  requestedBy?: string;
  requestedClanId: string;
  verifiedBy?: string;
  verifiedAt?: string;
  reviewNotes?: string;
  notes?: string;
  createdAt: string;
}


export interface InterClanSharedPolicyItem {
  id: string;
  linkId: string;
  ownerClanId: string;
  dataScope: 'BASIC' | 'EXTENDED' | 'FULL' | string;
  allowedFields: {
    full_name?: boolean;
    gender?: boolean;
    generation?: boolean;
    avatar_url?: boolean;
    branch_id?: boolean;
    birth_date?: boolean;
    death_date?: boolean;
    bio?: boolean;
    burial_location?: boolean;
    living_persons?: boolean;
    [key: string]: boolean | undefined;
  };
  visibility: string;
  canExport: boolean;
  updatedAt: string;
}

export interface SharedTreeNode {
  id: string;
  fullName: string;
  gender: string;
  generation: number;
  branchId?: string | null;
  avatarUrl?: string | null;
  isLiving: boolean;
  status: string;
  birthDate?: string | null;
  deathDate?: string | null;
  privacyLevel?: 'MASKED' | 'PRIVATE' | 'SHARED' | string;
}

export interface SharedTreeResponse {
  nodes: SharedTreeNode[];
  edges: {
    id: string;
    fromMemberId: string;
    toMemberId: string;
    relationshipType: string;
    notes?: string | null;
  }[];
  canExport?: boolean;
}


export interface NetworkDiagramNode {
  id: string;
  name: string;
  code?: string;
  isCallerClan: boolean;
  isLinked: boolean;
  category: 'CURRENT' | 'IN_LAW' | 'ANCESTRAL' | 'ALLIED' | 'UNLINKED' | string;
  categoryLabel: string;
  memberCount: number;
  originPlace?: string;
  status: string;
  connectionsCount: number;
  x?: number;
  y?: number;
}

export interface NetworkDiagramEdge {
  id: string;
  source: string;
  sourceName: string;
  target: string;
  targetName: string;
  connectionType: 'IN_LAW' | 'ANCESTRAL' | 'ALLIED' | string;
  label: string;
  status: string;
  linkedAt?: string | null;
  verifiedCount: number;
  policies?: Record<string, string>;
}

export interface NetworkDiagramResponse {
  nodes: NetworkDiagramNode[];
  edges: NetworkDiagramEdge[];
}


export interface HybridTreeNode {
  id: string;
  clanId: string;
  clanName: string;
  isPrimaryClan: boolean;
  fullName: string;
  gender: string;
  generation: number;
  branchId?: string | null;
  avatarUrl?: string | null;
  isLiving: boolean;
  status: string;
  birthDate?: string | null;
  deathDate?: string | null;
  privacyLevel: 'OWN_CLAN' | 'MASKED' | 'PRIVATE' | 'SHARED' | string;
  isReadOnly: boolean;
}

export interface HybridTreeBridge {
  id: string;
  mappingId: string;
  primaryPersonId: string;
  primaryPersonName: string;
  partnerPersonId: string;
  partnerPersonName: string;
  relationshipType: string;
  label: string;
  isBridge: boolean;
}

export interface HybridTreeEdge {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  relationshipType: string;
  isBridge: boolean;
  label?: string;
  clanId?: string;
}

export interface HybridTreeResponse {
  linkId: string;
  connectionType: string;
  primaryClan: {
    id: string;
    name: string;
  };
  partnerClan: {
    id: string;
    name: string;
    dataScope: string;
    canExport: boolean;
  };
  bridges: HybridTreeBridge[];
  nodes: HybridTreeNode[];
  edges: HybridTreeEdge[];
  canExport: boolean;
}


export interface DualLineageMember {
  id: string;
  fullName: string;
  gender: string;
  generation: number;
  isLiving: boolean;
  clanId: string;
  clanName: string;
}

export interface DualLineageGeneration {
  level: number;
  title: string;
  members: DualLineageMember[];
}

export interface DualLineageSide {
  clanId: string;
  clanName: string;
  generations: DualLineageGeneration[];
}

export interface DualLineageResponse {
  person: {
    id: string;
    fullName: string;
    gender: string;
    generation: number;
    clanId: string;
    clanName: string;
  };
  spouseBridge?: {
    partnerPersonId: string;
    partnerName: string;
    partnerClanName: string;
    partnerClanId: string;
    partnerGender: string;
    linkId: string;
    isCrossClan: boolean;
  } | null;
  paternalSide: DualLineageSide;
  maternalSide: DualLineageSide;
}

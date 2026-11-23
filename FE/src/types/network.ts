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
  husbandBirthDate?: string;
  husbandOccupation?: string;
  husbandUserId?: string;
  wifeName: string;
  wifeFamily: string;
  wifePersonId?: string;
  wifeClanId?: string;
  wifeBirthDate?: string;
  wifeOccupation?: string;
  wifeUserId?: string;
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

export type LineageGrantStatus =
  | 'NONE'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVOKED'
  | 'AWAITING_SPOUSE'
  | 'PENDING_ADMIN_VERIFICATION'
  | 'MARRIAGE_REJECTED';

export interface MyFamilyNetworkNode {
  id: string;
  uniqueKey?: string;
  fullName: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | string;
  generation: number;
  relativeLevel: -2 | -1 | 0 | 1;
  relativeRole: 'EGO' | 'SPOUSE' | 'FATHER' | 'MOTHER' | 'PARENT' | 'GRANDFATHER' | 'GRANDMOTHER' | 'GRANDPARENT' | 'SIBLING' | 'CHILD' | string;
  clanId: string;
  clanName: string;
  isEgo: boolean;
  isSpouse: boolean;
  isLiving: boolean;
  avatarUrl?: string | null;
  isCrossClan: boolean;
  canExpand: boolean;
  privacyMasked: boolean;
  birthDate?: string | null;
  deathDate?: string | null;
  userId?: string | null;
  isCurrentUser?: boolean;
  occupation?: string | null;
  grantStatus?: LineageGrantStatus;
  grantId?: string | null;
  requestId?: string | null;
  rejectionReason?: string | null;
  revocationReason?: string | null;
  canRequestAccess?: boolean;
  isReadOnly?: boolean;
}

export interface MyFamilyNetworkEdge {
  id: string;
  source: string;
  target: string;
  type: 'BLOODLINE' | 'MARRIAGE' | 'INTER_CLAN_BRIDGE' | string;
  label: string;
}

export interface MyFamilyNetworkBridge {
  linkId: string;
  mappingId: string;
  egoPersonId: string;
  spousePersonId: string;
  spouseName: string;
  spouseClanId: string;
  spouseClanName: string;
  status: string;
  isSharingAllowed: boolean;
  grantStatus?: LineageGrantStatus;
  grantId?: string | null;
  requestId?: string | null;
  rejectionReason?: string | null;
  revocationReason?: string | null;
  canRequestAccess?: boolean;
}

export interface MyFamilyNetworkResponse {
  isLinked: boolean;
  ego: MyFamilyNetworkNode | null;
  natalClan: {
    id: string;
    name: string;
  } | null;
  spouseClan: {
    id: string;
    name: string;
    linkId: string;
    isSharingAllowed: boolean;
    grantStatus?: LineageGrantStatus;
    grantId?: string | null;
    requestId?: string | null;
    rejectionReason?: string | null;
    revocationReason?: string | null;
    canRequestAccess?: boolean;
  } | null;
  nodes: MyFamilyNetworkNode[];
  edges: MyFamilyNetworkEdge[];
  bridges: MyFamilyNetworkBridge[];
  generationCounts: {
    '-2': number;
    '-1': number;
    '0': number;
    '1': number;
  };
  hasCrossClanLink: boolean;
  message: string;
}

export interface LineageAccessRequestItem {
  id: string;
  owner_clan_id: string;
  owner_clan_name?: string | null;
  requester_user_id: string;
  requester_name?: string | null;
  anchor_person_id: string;
  anchor_person_name?: string | null;
  grantee_user_id: string;
  grantee_name?: string | null;
  scope_type: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LineageAccessGrantItem {
  id: string;
  request_id: string;
  owner_clan_id: string;
  owner_clan_name?: string | null;
  anchor_person_id: string;
  anchor_person_name?: string | null;
  grantee_user_id: string;
  grantee_name?: string | null;
  scope_type: string;
  permission: string;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  approved_by: string;
  approved_at: string;
  expires_at?: string | null;
  revoked_by?: string | null;
  revoked_at?: string | null;
  revocation_reason?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarriageInvitationItem {
  id: string;
  link_id: string;
  sender_user_id?: string | null;
  sender_name?: string | null;
  sender_person_id: string;
  sender_clan_id: string;
  sender_clan_name?: string | null;
  target_person_id: string;
  target_name?: string | null;
  target_clan_id: string;
  target_clan_name?: string | null;
  target_user_id?: string | null;
  relationship_type: string;
  status: 'AWAITING_SPOUSE' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REVOKED';
  notes?: string | null;
  review_notes?: string | null;
  can_respond: boolean;
  created_at: string;
}


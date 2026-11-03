export type LocationType = 
  | 'ANCESTRAL_HALL' 
  | 'BRANCH_HALL' 
  | 'HISTORIC_SITE' 
  | 'EVENT_VENUE' 
  | 'HOMELAND' 
  | 'OTHER';

export type LocationPrivacyLevel = 
  | 'PUBLIC' 
  | 'CLAN_ONLY' 
  | 'BRANCH_ONLY' 
  | 'PRIVATE';

export interface ClanLocation {
  id: string;
  clanId: string;
  branchId?: string | null;
  name: string;
  locationType: LocationType;
  address: string;
  latitude: number;
  longitude: number;
  description?: string | null;
  photoUrls?: string[];
  privacyLevel: LocationPrivacyLevel;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PersonBurial {
  id?: string;
  burialId?: string;
  personId: string;
  clanId?: string;
  cemeteryName?: string | null;
  graveCode?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  burialDate?: string | null;
  orientation?: string | null;
  notes?: string | null;
  photoUrls?: string[];
  privacyLevel: LocationPrivacyLevel;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface LocationProposal {
  id: string;
  clanId: string;
  targetType: 'PERSON_BURIAL' | 'CLAN_LOCATION';
  personId?: string | null;
  personName?: string | null;
  locationId?: string | null;
  proposerId: string;
  proposerName?: string | null;
  proposedName?: string | null;
  proposedAddress?: string | null;
  proposedLat: number;
  proposedLng: number;
  reason?: string | null;
  evidencePhotos?: string[];
  status: ProposalStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}


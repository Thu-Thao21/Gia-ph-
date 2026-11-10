export interface ContactItem {
  id: string;
  contactType: string;
  contactValue: string;
  isPrimary: boolean;
  isPublic: boolean;
  notes?: string;
}

export interface LifeEventItem {
  id: string;
  eventType: string;
  title: string;
  eventDate?: string;
  description?: string;
  location?: string;
}

export interface MediaItem {
  id: string;
  mediaType: string;
  mediaUrl: string;
  caption?: string;
  sortOrder: number;
}

export interface SkillItem {
  id: string;
  skillName: string;
  category?: string;
  proficiencyLevel: string;
}

export interface Member {
  id: string;
  familyId: string;
  fullName: string;
  otherName?: string;
  gender: string;
  birthDate?: string;
  deathDate?: string;
  isAlive: boolean;
  branch?: string;
  subBranch?: string;
  generation: number;
  occupation?: string;
  education?: string;
  avatarUrl?: string;
  status: string;
  userId?: string;
}

export interface MemberDetail extends Member {
  familyName?: string;
  userId?: string;
  lunarDeathDate?: string;
  burialPlace?: string;
  burialCoordinates?: Record<string, any>;
  fatherId?: string;
  motherId?: string;
  displayOrder: number;
  bio?: string;
  galleryPhotos: Array<{ url: string; caption?: string }>;
  careerHistory: Array<{ period: string; role: string; organization: string }>;
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
  };
  privacySettings?: Record<string, boolean>;
  contribution?: {
    ability?: string;
    specialty?: string;
    field?: string;
  };
  isPrimary: boolean;
  createdAt?: string;
  updatedAt?: string;

  contacts: ContactItem[];
  lifeEvents: LifeEventItem[];
  media: MediaItem[];
  skills: SkillItem[];
}

export interface MemberListResponse {
  items: Member[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Family {
  id: string;
  name: string;
  code?: string;
  description?: string;
  founderName?: string;
  originPlace?: string;
  status: string;
  memberCount: number;
}

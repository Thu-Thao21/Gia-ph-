export type AncestralMediaType = 'Ảnh 360°' | 'Ảnh tư liệu' | 'Video' | 'Tài liệu' | 'Âm thanh';

export interface AncestorRecord {
  id: string;
  name: string;
  initials: string;
  title: string;
  generation: number;
  branch: string;
  relationship: string;
  birthYear: string;
  deathYear: string;
  lifespan: string;
  memorialDate: string;
  memorialPlace: string;
  restingPlace: string;
  biography: string;
  legacy: string;
  portraitTone: 'indigo' | 'teal' | 'amber' | 'rose';
  incenseCount: number;
}

export interface AncestralMediaItem {
  id: string;
  ancestorId: string;
  title: string;
  type: AncestralMediaType;
  capturedAt: string;
  description: string;
  source: string;
  duration?: string;
  accent: 'indigo' | 'teal' | 'amber' | 'rose' | 'slate';
}

export interface MemorialMessageRecord {
  id: string;
  ancestorId: string;
  sender: string;
  initials: string;
  relationship: string;
  message: string;
  createdAt: string;
  isOwn: boolean;
}

export const ANCESTOR_RECORDS: AncestorRecord[] = [];

export const ANCESTRAL_MEDIA: AncestralMediaItem[] = [];

export const INITIAL_MEMORIAL_MESSAGES: MemorialMessageRecord[] = [];

export const MEDIA_TYPE_OPTIONS: Array<'Tất cả' | AncestralMediaType> = [
  'Tất cả',
  'Ảnh 360°',
  'Ảnh tư liệu',
  'Video',
  'Tài liệu',
  'Âm thanh',
];

export function getAncestorById(ancestorId: string): AncestorRecord | undefined {
  return ANCESTOR_RECORDS.find((ancestor) => ancestor.id === ancestorId);
}

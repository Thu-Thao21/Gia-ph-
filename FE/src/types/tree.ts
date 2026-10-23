import type { Member } from './member';

export type TreeViewMode = 'vertical' | 'horizontal' | 'focus';

export interface SpouseNode {
  id: string;
  fullName: string;
  gender: string;
  birthDate?: string;
  avatarUrl?: string;
  isAlive: boolean;
  occupation?: string;
  focusRole?: string;
}

export interface ErgoTreeNode {
  id: string;
  fullName: string;
  otherName?: string;
  gender: string;
  birthDate?: string;
  avatarUrl?: string;
  isAlive: boolean;
  generation: number;
  branch?: string;
  occupation?: string;
  fatherId?: string;
  motherId?: string;
  spouses: SpouseNode[];
  children: ErgoTreeNode[];
  isFocusPerson?: boolean;
  focusTier?: 'parent' | 'ego' | 'child';
  focusRole?: string;
}

export interface TreeContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  member: Member | ErgoTreeNode | null;
}

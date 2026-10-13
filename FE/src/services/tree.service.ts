import apiClient from '../api/axios';
import { fetchMembers } from './member.service';
import type { Member } from '../types/member';
import type { ErgoTreeNode, SpouseNode } from '../types/tree';

export async function buildErgoTreeFromDB(
  familyId?: string,
  focusMemberId?: string,
): Promise<{ rootNodes: ErgoTreeNode[]; allMembers: Member[] }> {
  try {
    // Fetch members with maximum limit for complete tree layout
    const res = await fetchMembers({ familyId, limit: 1000 });
    const allMembers = Array.isArray(res?.items) ? res.items : [];

    if (allMembers.length === 0) {
      return { rootNodes: [], allMembers: [] };
    }

    // Create lookup map
    const memberMap = new Map<string, Member>();
    allMembers.forEach((m) => memberMap.set(m.id, m));

    // Helper to find true wives/spouses of a male member without hardcoded IDs
    const getSpousesOfMale = (m: Member): SpouseNode[] => {
      if (m.gender !== 'male') return [];

      const spouses: SpouseNode[] = [];

      allMembers.forEach((w) => {
        if (w.gender !== 'female' || w.id === m.id) return;

        // Exclude sisters (share same father or mother)
        const mFather = (m as any).fatherId;
        const mMother = (m as any).motherId;
        const wFather = (w as any).fatherId;
        const wMother = (w as any).motherId;
        if (mFather && wFather && mFather === wFather) return;
        if (mMother && wMother && mMother === wMother) return;

        // Check 1: Shared children in database
        const isMotherOfChildren = allMembers.some(
          (c) => (c as any).fatherId === m.id && (c as any).motherId === w.id
        );

        // Check 2: Explicit spouse link properties
        const isExplicitSpouse =
          (w as any).spouseId === m.id ||
          (m as any).spouseId === w.id ||
          (w as any).husbandId === m.id ||
          (m as any).wifeId === w.id;

        if (isMotherOfChildren || isExplicitSpouse) {
          spouses.push({
            id: w.id,
            fullName: w.fullName,
            gender: w.gender,
            birthDate: w.birthDate,
            avatarUrl: w.avatarUrl,
            isAlive: w.isAlive,
            occupation: w.occupation,
          });
        }
      });

      return spouses;
    };

    // Helper to convert Member to ErgoTreeNode
    const convertNode = (m: Member, isFocus: boolean = false): ErgoTreeNode => {
      const spouses = getSpousesOfMale(m);

      return {
        id: m.id,
        fullName: m.fullName,
        otherName: m.otherName,
        gender: m.gender,
        birthDate: m.birthDate,
        avatarUrl: m.avatarUrl,
        isAlive: m.isAlive,
        generation: m.generation,
        branch: m.branch,
        occupation: m.occupation,
        spouses,
        children: [],
        isFocusPerson: isFocus,
      };
    };

    // Build recursive children with cycle detection
    const buildChildrenRecursive = (parentId: string, visited: Set<string>): ErgoTreeNode[] => {
      if (visited.has(parentId)) return [];
      visited.add(parentId);

      const parentM = memberMap.get(parentId);
      if (!parentM) return [];

      let directChildren: Member[] = [];

      if (parentM.gender === 'male') {
        directChildren = allMembers.filter((m) => (m as any).fatherId === parentId);
      } else {
        const husbandExists = allMembers.some(
          (m) => m.gender === 'male' && getSpousesOfMale(m).some((s) => s.id === parentId)
        );
        if (!husbandExists) {
          directChildren = allMembers.filter((m) => (m as any).motherId === parentId);
        }
      }

      return directChildren.map((c) => {
        const node = convertNode(c, c.id === focusMemberId);
        node.children = buildChildrenRecursive(c.id, new Set(visited));
        return node;
      });
    };

    // Identify root ancestors
    let rootMembers: Member[] = [];
    if (focusMemberId) {
      const focusM = memberMap.get(focusMemberId);
      if (focusM) {
        rootMembers = [focusM];
      }
    }

    if (rootMembers.length === 0) {
      rootMembers = allMembers.filter((m) => m.generation === 1 && m.gender === 'male');
      if (rootMembers.length === 0) {
        rootMembers = allMembers.filter((m) => m.generation === 1);
      }
      if (rootMembers.length === 0 && allMembers.length > 0) {
        rootMembers = [allMembers[0]];
      }
    }

    const rootNodes: ErgoTreeNode[] = rootMembers.map((r) => {
      const node = convertNode(r, r.id === focusMemberId);
      node.children = buildChildrenRecursive(r.id, new Set());
      return node;
    });

    return { rootNodes, allMembers };
  } catch (err) {
    console.error('API buildErgoTreeFromDB error:', err);
    return { rootNodes: [], allMembers: [] };
  }
}

/**
 * Dữ liệu vẽ cây gia phả trả về từ Backend:
 * GET /api/v1/families/{family_id}/tree-data (trả về danh sách nodes và edges).
 */
export interface FamilyTreeDataResponse {
  nodes: Array<{
    id: string;
    label?: string;
    full_name?: string;
    gender?: string;
    generation?: number;
    birth_year?: number;
    death_year?: number;
    [key: string]: any;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relation_type?: string;
    [key: string]: any;
  }>;
  family_id?: string;
  clan_name?: string;
}

export async function fetchFamilyTreeData(familyId: string): Promise<FamilyTreeDataResponse | null> {
  try {
    const res = await apiClient.get<FamilyTreeDataResponse>(`/api/v1/families/${familyId}/tree-data`);
    return res.data;
  } catch (err) {
    console.error(`API fetchFamilyTreeData error for familyId ${familyId}:`, err);
    return null;
  }
}

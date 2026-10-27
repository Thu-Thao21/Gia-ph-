import apiClient from '../api/axios';
import { fetchMembers } from './member.service';
import type { Member } from '../types/member';
import type { ErgoTreeNode, SpouseNode } from '../types/tree';

export async function buildErgoTreeFromDB(
  familyId?: string,
  focusMemberId?: string,
): Promise<{ rootNodes: ErgoTreeNode[]; allMembers: Member[] }> {
  try {
    let res = await fetchMembers({ familyId, limit: 1000 });
    let allMembers = Array.isArray(res?.items) ? res.items : [];

    if (allMembers.length === 0) {
      return { rootNodes: [], allMembers: [] };
    }

    // Create lookup map
    const memberMap = new Map<string, Member>();
    allMembers.forEach((m) => memberMap.set(m.id, m));

    // Helper to find true spouses (wives/husbands)
    const getSpouses = (m: Member): SpouseNode[] => {
      const spouses: SpouseNode[] = [];
      const spouseId = (m as any).spouseId;
      if (spouseId && memberMap.has(spouseId)) {
        const sp = memberMap.get(spouseId)!;
        spouses.push({
          id: sp.id,
          fullName: sp.fullName,
          gender: sp.gender,
          birthDate: sp.birthDate,
          avatarUrl: sp.avatarUrl,
          isAlive: sp.isAlive,
          occupation: sp.occupation,
        });
        return spouses;
      }

      allMembers.forEach((w) => {
        if (w.gender === m.gender || w.id === m.id) return;

        // Exclude children of m
        if ((w as any).fatherId === m.id || (w as any).motherId === m.id) return;
        // Exclude parents of m
        if ((m as any).fatherId === w.id || (m as any).motherId === w.id) return;

        // Exclude siblings (share same father or mother)
        const mFather = (m as any).fatherId;
        const mMother = (m as any).motherId;
        const wFather = (w as any).fatherId;
        const wMother = (w as any).motherId;
        if (mFather && wFather && mFather === wFather) return;
        if (mMother && wMother && mMother === wMother) return;

        // Check shared children or explicit spouse link
        const isSharedParent = allMembers.some(
          (c) =>
            ((c as any).fatherId === m.id && (c as any).motherId === w.id) ||
            ((c as any).fatherId === w.id && (c as any).motherId === m.id)
        );

        const isExplicitSpouse =
          (w as any).spouseId === m.id ||
          (m as any).spouseId === w.id ||
          (w as any).husbandId === m.id ||
          (m as any).wifeId === w.id;

        if (isSharedParent || isExplicitSpouse) {
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

    const focusM = focusMemberId ? memberMap.get(focusMemberId) : undefined;

    // Helper to convert Member to ErgoTreeNode
    const convertNode = (m: Member): ErgoTreeNode => {
      const isCardFocus = m.id === focusMemberId;
      const spouses = getSpouses(m);

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
        isFocusPerson: isCardFocus,
      };
    };

    // When focusMemberId is provided: Render strict 3-tier centered genealogy:
    // Level 1: Cha & Mẹ
    // Level 2 (CHÍNH GIỮA): Bản thân (Ego, ĐANG CHỌN) & Vợ/Chồng
    // Level 3: Con cái
    if (focusMemberId && focusM) {
      // Direct children (+1)
      const egoChildrenMembers = allMembers.filter(
        (m) => (m as any).fatherId === focusM.id || (m as any).motherId === focusM.id
      );
      const egoChildNodes: ErgoTreeNode[] = egoChildrenMembers.map((c) => ({
        ...convertNode(c),
        focusRole: c.gender === 'female' ? 'Con gái' : 'Con trai',
        children: [],
      }));

      // Ego spouses
      const egoSpouses = getSpouses(focusM).map((s) => ({
        ...s,
        focusRole: s.gender === 'female' ? 'Vợ' : 'Chồng',
      }));

      // Ego Node (0)
      const egoNode: ErgoTreeNode = {
        ...convertNode(focusM),
        spouses: egoSpouses,
        isFocusPerson: true,
        focusRole: 'Đang chọn',
        children: egoChildNodes,
      };

      const fatherId = (focusM as any).fatherId;
      const motherId = (focusM as any).motherId;
      const fatherM = fatherId ? memberMap.get(fatherId) : undefined;
      const motherM = motherId ? memberMap.get(motherId) : undefined;

      if (fatherM) {
        const fatherNode: ErgoTreeNode = {
          ...convertNode(fatherM),
          focusRole: 'Cha',
          children: [egoNode],
        };
        if (motherM) {
          fatherNode.spouses = [
            {
              id: motherM.id,
              fullName: motherM.fullName,
              gender: motherM.gender,
              birthDate: motherM.birthDate,
              avatarUrl: motherM.avatarUrl,
              isAlive: motherM.isAlive,
              occupation: motherM.occupation,
              focusRole: 'Mẹ',
            },
          ];
        }
        return { rootNodes: [fatherNode], allMembers };
      } else if (motherM) {
        const motherNode: ErgoTreeNode = {
          ...convertNode(motherM),
          focusRole: 'Mẹ',
          children: [egoNode],
        };
        return { rootNodes: [motherNode], allMembers };
      } else {
        return { rootNodes: [egoNode], allMembers };
      }
    }

    // Build recursive children with cycle detection for full tree
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
          (m) => m.gender === 'male' && getSpouses(m).some((s) => s.id === parentId)
        );
        if (!husbandExists) {
          directChildren = allMembers.filter((m) => (m as any).motherId === parentId);
        }
      }

      return directChildren.map((c) => {
        const node = convertNode(c);
        node.children = buildChildrenRecursive(c.id, new Set(visited));
        return node;
      });
    };

    // Full Tree Network: Identify root ancestors
    let rootMembers: Member[] = allMembers.filter((m) => m.generation === 1 && m.gender === 'male');
    if (rootMembers.length === 0) {
      rootMembers = allMembers.filter((m) => m.generation === 1);
    }
    if (rootMembers.length === 0 && allMembers.length > 0) {
      rootMembers = [allMembers[0]];
    }

    const rootNodes: ErgoTreeNode[] = rootMembers.map((r) => {
      const node = convertNode(r);
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
    const res = await apiClient.get<FamilyTreeDataResponse>(`/families/${familyId}/tree-data`);
    return res.data;
  } catch (err) {
    console.error(`API fetchFamilyTreeData error for familyId ${familyId}:`, err);
    return null;
  }
}

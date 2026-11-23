import apiClient from '../api/axios';
import { fetchMembers } from './member.service';
import { fetchInLawMarriages } from './network.service';
import type { Member } from '../types/member';
import type { ErgoTreeNode, SpouseNode } from '../types/tree';

export async function buildErgoTreeFromDB(
  familyId?: string,
  focusMemberId?: string,
  cachedMembers?: Member[],
  currentPersonId?: string,
  currentUserId?: string,
): Promise<{ rootNodes: ErgoTreeNode[]; allMembers: Member[] }> {
  try {
    let allMembers = (cachedMembers && cachedMembers.length > 0) ? cachedMembers : [];
    if (allMembers.length === 0) {
      let res = await fetchMembers({ familyId, limit: 1000 });
      allMembers = Array.isArray(res?.items) ? res.items : [];
    }

    if (allMembers.length === 0) {
      return { rootNodes: [], allMembers: [] };
    }

    // 1. Create lookup maps and fast parent/children indexing in O(N)
    const memberMap = new Map<string, Member>();
    allMembers.forEach((m) => memberMap.set(m.id, m));

    // Fast children index by parent id (fatherId or motherId)
    const childrenByParentId = new Map<string, Member[]>();
    allMembers.forEach((m) => {
      const fId = (m as any).fatherId;
      const mId = (m as any).motherId;
      if (fId) {
        if (!childrenByParentId.has(fId)) childrenByParentId.set(fId, []);
        childrenByParentId.get(fId)!.push(m);
      }
      if (mId) {
        if (!childrenByParentId.has(mId)) childrenByParentId.set(mId, []);
        childrenByParentId.get(mId)!.push(m);
      }
    });

    // 2. Precompute co-parents for fast spouse inference in O(N)
    const coParentMap = new Map<string, Set<string>>();
    allMembers.forEach((c) => {
      const fId = (c as any).fatherId;
      const mId = (c as any).motherId;
      if (fId && mId) {
        if (!coParentMap.has(fId)) coParentMap.set(fId, new Set());
        coParentMap.get(fId)!.add(mId);
        if (!coParentMap.has(mId)) coParentMap.set(mId, new Set());
        coParentMap.get(mId)!.add(fId);
      }
    });

    // Fetch verified cross-clan marriages for this family
    let crossClanMarriages: any[] = [];
    try {
      crossClanMarriages = await fetchInLawMarriages(familyId);
    } catch {
      crossClanMarriages = [];
    }

    const crossSpousesByPersonId = new Map<string, SpouseNode[]>();
    crossClanMarriages.forEach((cm) => {
      if (!cm.isCrossClan) return;
      const hId = cm.husbandPersonId;
      const wId = cm.wifePersonId;

      if (hId && memberMap.has(hId)) {
        const cur = crossSpousesByPersonId.get(hId) || [];
        const isCurrent = Boolean(
          (currentPersonId && (wId === currentPersonId || String(wId).toLowerCase() === String(currentPersonId).toLowerCase())) ||
          (currentUserId && cm.wifeUserId === currentUserId)
        );
        cur.push({
          id: wId || ('cross-wife-' + cm.id),
          fullName: cm.wifeName,
          gender: 'female',
          birthDate: cm.wifeBirthDate || undefined,
          occupation: cm.wifeOccupation || 'Kinh doanh / Quản trị',
          isAlive: true,
          isCrossClan: true,
          clanName: cm.wifeFamily,
          clanId: cm.wifeClanId,
          inLawRole: `Dâu họ ${cm.wifeFamily}`,
          linkId: cm.linkId,
          isCurrentUser: isCurrent,
          userId: cm.wifeUserId || (isCurrent ? currentUserId : undefined),
        });
        crossSpousesByPersonId.set(hId, cur);
      }

      if (wId && memberMap.has(wId)) {
        const cur = crossSpousesByPersonId.get(wId) || [];
        const isCurrent = Boolean(
          (currentPersonId && (hId === currentPersonId || String(hId).toLowerCase() === String(currentPersonId).toLowerCase())) ||
          (currentUserId && cm.husbandUserId === currentUserId)
        );
        cur.push({
          id: hId || ('cross-husband-' + cm.id),
          fullName: cm.husbandName,
          gender: 'male',
          birthDate: cm.husbandBirthDate || undefined,
          occupation: cm.husbandOccupation || 'Kinh doanh / Quản trị',
          isAlive: true,
          isCrossClan: true,
          clanName: cm.husbandFamily,
          clanId: cm.husbandClanId,
          inLawRole: `Rể họ ${cm.husbandFamily}`,
          linkId: cm.linkId,
          isCurrentUser: isCurrent,
          userId: cm.husbandUserId || (isCurrent ? currentUserId : undefined),
        });
        crossSpousesByPersonId.set(wId, cur);
      }
    });

    // 3. Precompute spouses map for O(1) instantaneous access
    const spousesCache = new Map<string, SpouseNode[]>();
    allMembers.forEach((m) => {
      const spouses: SpouseNode[] = [];
      const spouseIds = new Set<string>();

      // Direct explicit spouse link
      const explicitSpouseId = (m as any).spouseId || (m as any).husbandId || (m as any).wifeId;
      if (explicitSpouseId && memberMap.has(explicitSpouseId)) {
        spouseIds.add(explicitSpouseId);
      }

      // Inferred spouse through shared children
      const coParents = coParentMap.get(m.id);
      if (coParents) {
        coParents.forEach((cpId) => {
          if (memberMap.has(cpId)) {
            const cp = memberMap.get(cpId)!;
            // Exclude blood parents or children
            const isChild = (cp as any).fatherId === m.id || (cp as any).motherId === m.id;
            const isParent = (m as any).fatherId === cp.id || (m as any).motherId === cp.id;
            if (!isChild && !isParent) {
              spouseIds.add(cpId);
            }
          }
        });
      }

      spouseIds.forEach((spId) => {
        const sp = memberMap.get(spId);
        if (sp) {
          spouses.push({
            id: sp.id,
            fullName: sp.fullName,
            gender: sp.gender,
            birthDate: sp.birthDate,
            avatarUrl: sp.avatarUrl,
            isAlive: sp.isAlive,
            occupation: sp.occupation,
            userId: sp.userId || (sp as any).user_id,
          });
        }
      });

      // Inject cross-clan verified in-law spouses
      const crossList = crossSpousesByPersonId.get(m.id) || [];
      crossList.forEach((cs) => {
        if (!spouses.some((s) => s.id === cs.id || s.fullName === cs.fullName)) {
          const isCurrent = Boolean(
            (currentPersonId && (cs.id === currentPersonId || String(cs.id).toLowerCase() === String(currentPersonId).toLowerCase())) ||
            (currentUserId && (cs.userId === currentUserId || (cs as any).user_id === currentUserId))
          );
          spouses.push({
            ...cs,
            isCurrentUser: isCurrent || cs.isCurrentUser,
          });
        }
      });

      spousesCache.set(m.id, spouses);
    });

    const getSpouses = (m: Member): SpouseNode[] => {
      return spousesCache.get(m.id) || [];
    };

    const focusM = focusMemberId ? memberMap.get(focusMemberId) : undefined;

    // Helper to convert Member to ErgoTreeNode
    const convertNode = (m: Member): ErgoTreeNode => {
      const isCardFocus = m.id === focusMemberId;
      const spouses = getSpouses(m);

      const localPrivacy = localStorage.getItem(`privacy_setting_${m.id}`);
      const isPrivate = localPrivacy ? localPrivacy === 'private' : Boolean((m as any).isPrivate || (m as any).is_private);
      const isUnconnected = Boolean((m as any).isUnconnected || (m as any).is_unconnected);

      const isCurrent = Boolean(
        (currentPersonId && (m.id === currentPersonId || String(m.id).toLowerCase() === String(currentPersonId).toLowerCase())) ||
        (currentUserId && (m.userId === currentUserId || (m as any).user_id === currentUserId))
      );
      return {
        id: m.id,
        fullName: m.fullName,
        otherName: m.otherName,
        gender: m.gender,
        birthDate: m.birthDate,
        deathDate: (m as any).deathDate,
        avatarUrl: m.avatarUrl,
        isAlive: m.isAlive,
        generation: m.generation,
        branch: m.branch,
        occupation: m.occupation,
        bio: (m as any).bio,
        userId: m.userId || (m as any).user_id,
        isPrivate,
        isUnconnected,
        spouses,
        children: [],
        isFocusPerson: isCardFocus,
        isCurrentUser: isCurrent,
      };
    };

    // Khi có focusMemberId: Chuyển sang chế độ phả hệ 4 đời lấy người này làm trọng tâm
    if (focusMemberId && memberMap.has(focusMemberId)) {
      const focusM = memberMap.get(focusMemberId)!;
      const focusGen = focusM.generation || 1;
      const visitedInFocus = new Set<string>();

      // 1. Tìm các thế hệ con cháu của focusM
      const getDescendantGens = (mId: string): number[] => {
        const gens: number[] = [];
        const children = allMembers.filter((m) => (m as any).fatherId === mId || (m as any).motherId === mId);
        children.forEach((c) => {
          if (c.generation) gens.push(c.generation);
          gens.push(...getDescendantGens(c.id));
        });
        return gens;
      };

      const descGens = getDescendantGens(focusM.id);
      const maxDescGen = descGens.length > 0 ? Math.max(...descGens) : focusGen;
      const descDepth = Math.min(3, Math.max(0, maxDescGen - focusGen));

      // Số thế hệ đi lên tổ tiên (tối đa sao cho tổng số đời hiển thị = 4)
      const targetGenerations = 4;
      const stepsUp = Math.max(0, targetGenerations - 1 - descDepth);

      // Đi ngược lên tổ tiên trực hệ của focusM
      let currentAncestor: Member = focusM;
      for (let step = 0; step < stepsUp; step++) {
        const pFather = (currentAncestor as any).fatherId ? memberMap.get((currentAncestor as any).fatherId) : null;
        const pMother = (currentAncestor as any).motherId ? memberMap.get((currentAncestor as any).motherId) : null;
        const parent = pFather || pMother;
        if (parent) {
          currentAncestor = parent;
        } else {
          break;
        }
      }

      // Nếu tổ tiên là nữ và có chồng trong cây, lấy chồng làm root để cặp vợ chồng hiển thị cùng nhau
      let rootFocusMember = currentAncestor;
      if (rootFocusMember.gender === 'female') {
        const husband = allMembers.find(
          (m) => m.gender === 'male' && getSpouses(m).some((s) => s.id === rootFocusMember.id)
        );
        if (husband) {
          rootFocusMember = husband;
        }
      }

      const rootGen = rootFocusMember.generation || 1;
      const maxAllowedGen = rootGen + targetGenerations - 1;

      // Xây dựng cây con đệ quy chỉ trong giới hạn maxAllowedGen (4 đời)
      const buildFocusChildrenRecursive = (parentId: string, visited: Set<string>): ErgoTreeNode[] => {
        if (visited.has(parentId)) return [];
        visited.add(parentId);
        visitedInFocus.add(parentId);

        const parentM = memberMap.get(parentId);
        if (!parentM) return [];

        const spouses = getSpouses(parentM);
        spouses.forEach((s) => visitedInFocus.add(s.id));

        // Lấy toàn bộ con từ cha hoặc mẹ (kể cả phối ngẫu) qua map O(1)
        const childCandidateMap = new Map<string, Member>();
        const parentChildren = childrenByParentId.get(parentId) || [];
        parentChildren.forEach((c) => childCandidateMap.set(c.id, c));

        spouses.forEach((s) => {
          const spChildren = childrenByParentId.get(s.id) || [];
          spChildren.forEach((c) => childCandidateMap.set(c.id, c));
        });

        // Lọc con cái không vượt quá thế hệ tối đa của khung 4 đời và chưa thăm
        const allowedChildren = Array.from(childCandidateMap.values()).filter(
          (c) =>
            !visited.has(c.id) &&
            !visitedInFocus.has(c.id) &&
            (c.generation || (parentM.generation || 1) + 1) <= maxAllowedGen
        );

        return allowedChildren.map((c) => {
          visitedInFocus.add(c.id);
          getSpouses(c).forEach((s) => visitedInFocus.add(s.id));
          const node = convertNode(c);
          node.children = buildFocusChildrenRecursive(c.id, new Set(visited));
          return node;
        });
      };

      visitedInFocus.add(rootFocusMember.id);
      getSpouses(rootFocusMember).forEach((s) => visitedInFocus.add(s.id));
      const focusRootNode = convertNode(rootFocusMember);
      focusRootNode.children = buildFocusChildrenRecursive(rootFocusMember.id, new Set());

      return { rootNodes: [focusRootNode], allMembers };
    }

    // Chế độ xem toàn bộ cây gia phả:
    // Build recursive children with cycle detection for full tree in O(N)
    const visitedInTree = new Set<string>();

    const buildChildrenRecursive = (parentId: string, visited: Set<string>): ErgoTreeNode[] => {
      if (visited.has(parentId)) return [];
      visited.add(parentId);
      visitedInTree.add(parentId);

      const parentM = memberMap.get(parentId);
      if (!parentM) return [];

      const spouses = getSpouses(parentM);
      spouses.forEach((s) => visitedInTree.add(s.id));

      // Lấy toàn bộ con cái từ cha hoặc mẹ (kể cả phối ngẫu) bằng Map O(1)
      const childCandidateMap = new Map<string, Member>();
      const parentChildren = childrenByParentId.get(parentId) || [];
      parentChildren.forEach((c) => childCandidateMap.set(c.id, c));

      spouses.forEach((s) => {
        const spChildren = childrenByParentId.get(s.id) || [];
        spChildren.forEach((c) => childCandidateMap.set(c.id, c));
      });

      // Loại bỏ các con đã được duyệt trong nhánh để tránh chu trình
      const uniqueChildren = Array.from(childCandidateMap.values()).filter(
        (c) => !visited.has(c.id) && !visitedInTree.has(c.id)
      );

      return uniqueChildren.map((c) => {
        visitedInTree.add(c.id);
        getSpouses(c).forEach((s) => visitedInTree.add(s.id));
        const node = convertNode(c);
        node.children = buildChildrenRecursive(c.id, new Set(visited));
        return node;
      });
    };

    // Full Tree Network: Identify root ancestors accurately
    const validGens = allMembers
      .map((m) => m.generation)
      .filter((g): g is number => typeof g === 'number' && !isNaN(g));
    const minGen = validGens.length > 0 ? Math.min(...validGens) : 1;

    // 1. Ưu tiên những người ở thế hệ nhỏ nhất không có cha mẹ trong danh sách
    let candidates = allMembers.filter((m) => {
      const genMatch = (m.generation || 1) === minGen;
      const noFather = !(m as any).fatherId || !memberMap.has((m as any).fatherId);
      const noMother = !(m as any).motherId || !memberMap.has((m as any).motherId);
      return genMatch && noFather && noMother;
    });

    if (candidates.length === 0) {
      candidates = allMembers.filter((m) => {
        const noFather = !(m as any).fatherId || !memberMap.has((m as any).fatherId);
        const noMother = !(m as any).motherId || !memberMap.has((m as any).motherId);
        return noFather && noMother;
      });
    }

    if (candidates.length === 0) {
      candidates = allMembers.filter((m) => (m.generation || 1) === minGen);
    }

    // 2. Quy tắc gia phả: Trong cùng thế hệ gốc, người VỢ (nữ) đã được gắn vào spouse của CHỒNG (nam).
    // Tuyệt đối không để người Vợ/Chồng trở thành một Root riêng độc lập gây ra hiện tượng 2 cây trùng lặp.
    const maleCandidates = candidates.filter((c) => c.gender === 'male');
    let rootMembers: Member[];

    if (maleCandidates.length > 0) {
      rootMembers = maleCandidates;
    } else {
      // Nếu thế hệ 1 chỉ có nữ, loại trừ những người là spouse của ứng viên khác
      const spouseIds = new Set<string>();
      candidates.forEach((c) => {
        getSpouses(c).forEach((s) => spouseIds.add(s.id));
      });
      const uniqueFemaleRoots = candidates.filter((c) => !spouseIds.has(c.id));
      rootMembers = uniqueFemaleRoots.length > 0 ? uniqueFemaleRoots : [candidates[0]];
    }

    const rootNodes: ErgoTreeNode[] = rootMembers.map((r) => {
      visitedInTree.add(r.id);
      getSpouses(r).forEach((s) => visitedInTree.add(s.id));
      const node = convertNode(r);
      node.children = buildChildrenRecursive(r.id, new Set());
      return node;
    });

    // 3. Tìm tất cả các thành viên chưa được kết nối vào cây phả hệ (Unconnected Members)
    // Tận dụng Map O(1) kiểm tra phối ngẫu cực nhanh, không làm đơ giao diện
    const unconnectedMembers = allMembers.filter((m) => {
      if (visitedInTree.has(m.id)) return false;
      // Nếu là vợ/chồng của bất kỳ ai đã có trong cây thì họ đã được hiển thị trên card của người đó
      const isSpouseOfVisited = (spousesCache.get(m.id) || []).some((s) => visitedInTree.has(s.id));
      if (isSpouseOfVisited) {
        visitedInTree.add(m.id);
        return false;
      }
      return true;
    });

    unconnectedMembers.forEach((um) => {
      if (visitedInTree.has(um.id)) return;
      visitedInTree.add(um.id);
      getSpouses(um).forEach((s) => visitedInTree.add(s.id));
      const unNode = convertNode(um);
      unNode.isUnconnected = true;
      unNode.focusRole = 'Chưa nối cụ tổ';
      unNode.children = buildChildrenRecursive(um.id, new Set());
      rootNodes.push(unNode);
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

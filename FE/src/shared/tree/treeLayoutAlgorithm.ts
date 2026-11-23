import type { ErgoTreeNode } from '../../types/tree';

export type TreeDirection = 'vertical' | 'horizontal';

export interface LayoutCard {
  id: string;
  fullName: string;
  gender: string;
  avatarUrl?: string;
  birthDate?: string;
  isAlive?: boolean;
  occupation?: string;
  generation: number;
  isFocusPerson?: boolean;
  focusRole?: string;
  isSpouse: boolean;
  relX: number;
  relY: number;
  width: number;
  height: number;
}

export interface LayoutUnit {
  id: string;
  node: ErgoTreeNode;
  generation: number;
  x: number;
  y: number;
  width: number;
  height: number;
  bloodCardCenterX: number;
  bloodCardCenterY: number;
  parentStemX: number;
  parentStemY: number;
  primaryCard: LayoutCard;
  spouseCard?: LayoutCard;
  spouseRole?: string;
  childrenUnits: LayoutUnit[];
  hasChildren: boolean;
  isExpanded: boolean;
  subtreeSpan: number;
}

export interface BusGroup {
  id: string;
  trunkPath: string;
  busBarPath: string;
  dropPaths: string[];
  trunkJunction: { x: number; y: number };
  dropJunctions: { x: number; y: number }[];
}

export interface TreeLayoutOptions {
  siblingGap?: number;
  rowGap?: number;
  showSpouse?: boolean;
  zigzagCompact?: boolean;
  maxGeneration?: number;
}

export interface LayoutResult {
  units: LayoutUnit[];
  flatUnits: LayoutUnit[];
  busGroups: BusGroup[];
  totalWidth: number;
  totalHeight: number;
  minX: number;
  minY: number;
  direction: TreeDirection;
}

// Dimensional Constants (Pixel-Perfect Matching TreeNodeCard.css)
export const CARD_WIDTH = 140;
export const CARD_HEIGHT = 160;
export const SPOUSE_GAP = 36;
export const COUPLE_WIDTH = CARD_WIDTH * 2 + SPOUSE_GAP; // 316px
export const SINGLE_WIDTH = CARD_WIDTH; // 140px

// Spacing Constants for Vertical Layout (Top -> Down)
export const VERTICAL_SIBLING_GAP = 48; // Space between adjacent sibling units
export const VERTICAL_ROW_GAP = 96; // Space between generation rows
export const VERTICAL_LEVEL_HEIGHT = CARD_HEIGHT + VERTICAL_ROW_GAP; // 256px

// Spacing Constants for Horizontal Layout (Left -> Right)
export const HORIZONTAL_SIBLING_GAP = 44; // Vertical space between sibling units
export const HORIZONTAL_COL_GAP = 120; // Clear horizontal highway between generations
export const HORIZONTAL_LEVEL_WIDTH = COUPLE_WIDTH + HORIZONTAL_COL_GAP; // 436px

/**
 * Chuẩn hóa ID thành chuỗi chữ thường không khoảng trắng để so khớp chuẩn xác 100%
 */
export const normalizeId = (id: string | number | undefined | null): string => {
  return String(id || '').trim().toLowerCase();
};

/**
 * Kiểm tra xem một thẻ (kể cả thẻ chính hoặc phối ngẫu) có nằm trong danh sách mở rộng hay không.
 * Đảm bảo mọi nhánh con đều mở ra ngay lập tức ở lần click đầu tiên.
 */
export const isNodeExpanded = (node: ErgoTreeNode, expandedIds: Set<string>): boolean => {
  if (!expandedIds || expandedIds.size === 0) return false;
  const nid = normalizeId(node.id);
  const rawId = String(node.id || '');
  if (expandedIds.has(nid) || expandedIds.has(rawId)) return true;
  if (node.spouses && node.spouses.length > 0) {
    for (const sp of node.spouses) {
      const spId = normalizeId(sp.id);
      const spRaw = String(sp.id || '');
      if (expandedIds.has(spId) || expandedIds.has(spRaw)) return true;
    }
  }
  return false;
};

// ============================================================================
// 1. VERTICAL LAYOUT ENGINE (Top-to-Bottom Pedigree)
// ============================================================================

function measureSubtreeVertical(
  node: ErgoTreeNode,
  expandedIds: Set<string>,
  memo?: Map<string, number>,
  options?: TreeLayoutOptions
): number {
  if (memo && memo.has(node.id)) return memo.get(node.id)!;
  const showSpouse = options?.showSpouse !== false;
  const siblingGap = options?.siblingGap ?? VERTICAL_SIBLING_GAP;
  const maxGeneration = options?.maxGeneration ?? 0;

  const hasSpouse = showSpouse && Boolean(node.spouses && node.spouses.length > 0);
  const unitWidth = hasSpouse ? COUPLE_WIDTH : SINGLE_WIDTH;
  const isExpanded = isNodeExpanded(node, expandedIds);
  const hasChildren = Boolean(node.children && node.children.length > 0);

  if (!hasChildren || !isExpanded || (maxGeneration > 0 && (node.generation || 1) >= maxGeneration)) {
    if (memo) memo.set(node.id, unitWidth);
    return unitWidth;
  }

  let childrenTotalW = 0;
  node.children.forEach((child, idx) => {
    const chW = measureSubtreeVertical(child, expandedIds, memo, options);
    childrenTotalW += chW;
    if (idx < node.children.length - 1) {
      childrenTotalW += siblingGap;
    }
  });

  const res = Math.max(unitWidth, childrenTotalW);
  if (memo) memo.set(node.id, res);
  return res;
}

function positionUnitVertical(
  node: ErgoTreeNode,
  leftX: number,
  level: number,
  expandedIds: Set<string>,
  flatList: LayoutUnit[],
  memo?: Map<string, number>,
  options?: TreeLayoutOptions
): LayoutUnit {
  const showSpouse = options?.showSpouse !== false;
  const siblingGap = options?.siblingGap ?? VERTICAL_SIBLING_GAP;
  const rowGap = options?.rowGap ?? VERTICAL_ROW_GAP;
  const levelHeight = CARD_HEIGHT + rowGap;
  const zigzagCompact = options?.zigzagCompact ?? false;
  const maxGeneration = options?.maxGeneration ?? 0;

  const hasSpouse = showSpouse && Boolean(node.spouses && node.spouses.length > 0);
  const primarySpouse = hasSpouse ? node.spouses![0] : undefined;
  const unitWidth = hasSpouse ? COUPLE_WIDTH : SINGLE_WIDTH;
  const isExpanded = isNodeExpanded(node, expandedIds);
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const subtreeW = measureSubtreeVertical(node, expandedIds, memo, options);

  // Center this parent unit horizontally in its allocated subtree span
  const unitX = leftX + (subtreeW - unitWidth) / 2;
  const unitY = 60 + (level - 1) * levelHeight;

  const bloodCardCenterX = unitX + CARD_WIDTH / 2;
  const bloodCardCenterY = unitY + CARD_HEIGHT / 2;
  const parentStemX = hasSpouse ? unitX + unitWidth / 2 : bloodCardCenterX;
  const parentStemY = unitY + CARD_HEIGHT;

  const primaryCard: LayoutCard = {
    id: node.id,
    fullName: node.fullName,
    gender: node.gender,
    avatarUrl: node.avatarUrl,
    birthDate: node.birthDate,
    isAlive: node.isAlive,
    occupation: node.occupation,
    generation: node.generation || level,
    isFocusPerson: node.isFocusPerson,
    focusRole: node.focusRole,
    isSpouse: false,
    relX: 0,
    relY: 0,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  };

  let spouseCard: LayoutCard | undefined;
  if (primarySpouse) {
    spouseCard = {
      id: primarySpouse.id,
      fullName: primarySpouse.fullName,
      gender: primarySpouse.gender,
      avatarUrl: primarySpouse.avatarUrl,
      birthDate: primarySpouse.birthDate,
      isAlive: primarySpouse.isAlive,
      occupation: primarySpouse.occupation,
      generation: node.generation || level,
      isFocusPerson: node.isFocusPerson,
      focusRole: primarySpouse.focusRole,
      isSpouse: true,
      relX: CARD_WIDTH + SPOUSE_GAP,
      relY: 0,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    };
  }

  // Children units centered underneath
  const childrenUnits: LayoutUnit[] = [];
  if (hasChildren && isExpanded && (maxGeneration === 0 || level < maxGeneration)) {
    const childWidths = node.children.map((c) => measureSubtreeVertical(c, expandedIds, memo, options));
    const totalChildW = childWidths.reduce(
      (sum, w, idx) => sum + w + (idx < childWidths.length - 1 ? siblingGap : 0),
      0
    );

    let childCurrentX = leftX + (subtreeW - totalChildW) / 2;
    node.children.forEach((child, idx) => {
      const chW = childWidths[idx];
      const childUnit = positionUnitVertical(child, childCurrentX, level + 1, expandedIds, flatList, memo, options);
      if (zigzagCompact && idx % 2 === 1) {
        childUnit.y += 20;
        childUnit.bloodCardCenterY += 20;
        childUnit.parentStemY += 20;
      }
      childrenUnits.push(childUnit);
      childCurrentX += chW + siblingGap;
    });
  }

  const unit: LayoutUnit = {
    id: node.id,
    node,
    generation: level,
    x: unitX,
    y: unitY,
    width: unitWidth,
    height: CARD_HEIGHT,
    bloodCardCenterX,
    bloodCardCenterY,
    parentStemX,
    parentStemY,
    primaryCard,
    spouseCard,
    spouseRole: primarySpouse?.focusRole,
    childrenUnits,
    hasChildren,
    isExpanded,
    subtreeSpan: subtreeW,
  };

  flatList.push(unit);
  return unit;
}

// ============================================================================
// 2. HORIZONTAL LAYOUT ENGINE (Left-to-Right Pedigree)
// ============================================================================

function measureSubtreeHorizontal(
  node: ErgoTreeNode,
  expandedIds: Set<string>,
  options?: TreeLayoutOptions
): number {
  const isExpanded = isNodeExpanded(node, expandedIds);
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const unitHeight = CARD_HEIGHT;
  const siblingGap = options?.siblingGap ?? HORIZONTAL_SIBLING_GAP;
  const maxGeneration = options?.maxGeneration ?? 0;

  if (!hasChildren || !isExpanded || (maxGeneration > 0 && (node.generation || 1) >= maxGeneration)) {
    return unitHeight;
  }

  let childrenTotalH = 0;
  node.children.forEach((child, idx) => {
    const chH = measureSubtreeHorizontal(child, expandedIds, options);
    childrenTotalH += chH;
    if (idx < node.children.length - 1) {
      childrenTotalH += siblingGap;
    }
  });

  return Math.max(unitHeight, childrenTotalH);
}

function positionUnitHorizontal(
  node: ErgoTreeNode,
  leftX: number,
  topY: number,
  level: number,
  expandedIds: Set<string>,
  flatList: LayoutUnit[],
  options?: TreeLayoutOptions
): LayoutUnit {
  const showSpouse = options?.showSpouse !== false;
  const siblingGap = options?.siblingGap ?? HORIZONTAL_SIBLING_GAP;
  const colGap = options?.rowGap ?? HORIZONTAL_COL_GAP;
  const maxGeneration = options?.maxGeneration ?? 0;

  const hasSpouse = showSpouse && Boolean(node.spouses && node.spouses.length > 0);
  const primarySpouse = hasSpouse ? node.spouses![0] : undefined;
  const unitWidth = hasSpouse ? COUPLE_WIDTH : SINGLE_WIDTH;
  const isExpanded = isNodeExpanded(node, expandedIds);
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const subtreeH = measureSubtreeHorizontal(node, expandedIds, options);

  const unitX = leftX;
  const unitY = topY + (subtreeH - CARD_HEIGHT) / 2;

  const bloodCardCenterX = unitX + CARD_WIDTH / 2;
  const bloodCardCenterY = unitY + CARD_HEIGHT / 2;
  const parentStemX = hasSpouse ? unitX + unitWidth / 2 : bloodCardCenterX;
  const parentStemY = unitY + CARD_HEIGHT;

  const primaryCard: LayoutCard = {
    id: node.id,
    fullName: node.fullName,
    gender: node.gender,
    avatarUrl: node.avatarUrl,
    birthDate: node.birthDate,
    isAlive: node.isAlive,
    occupation: node.occupation,
    generation: node.generation || level,
    isFocusPerson: node.isFocusPerson,
    focusRole: node.focusRole,
    isSpouse: false,
    relX: 0,
    relY: 0,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  };

  let spouseCard: LayoutCard | undefined;
  if (primarySpouse) {
    spouseCard = {
      id: primarySpouse.id,
      fullName: primarySpouse.fullName,
      gender: primarySpouse.gender,
      avatarUrl: primarySpouse.avatarUrl,
      birthDate: primarySpouse.birthDate,
      isAlive: primarySpouse.isAlive,
      occupation: primarySpouse.occupation,
      generation: node.generation || level,
      isFocusPerson: node.isFocusPerson,
      focusRole: primarySpouse.focusRole,
      isSpouse: true,
      relX: CARD_WIDTH + SPOUSE_GAP,
      relY: 0,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    };
  }

  // Children units positioned in next column
  const childrenUnits: LayoutUnit[] = [];
  if (hasChildren && isExpanded && (maxGeneration === 0 || level < maxGeneration)) {
    const childHeights = node.children.map((c) => measureSubtreeHorizontal(c, expandedIds, options));
    const totalChildH = childHeights.reduce(
      (sum, h, idx) => sum + h + (idx < childHeights.length - 1 ? siblingGap : 0),
      0
    );

    let childCurrentY = topY + (subtreeH - totalChildH) / 2;
    const nextColX = unitX + unitWidth + colGap;

    node.children.forEach((child, idx) => {
      const chH = childHeights[idx];
      const childUnit = positionUnitHorizontal(child, nextColX, childCurrentY, level + 1, expandedIds, flatList, options);
      childrenUnits.push(childUnit);
      childCurrentY += chH + siblingGap;
    });
  }

  const unit: LayoutUnit = {
    id: node.id,
    node,
    generation: level,
    x: unitX,
    y: unitY,
    width: unitWidth,
    height: CARD_HEIGHT,
    bloodCardCenterX,
    bloodCardCenterY,
    parentStemX,
    parentStemY,
    primaryCard,
    spouseCard,
    spouseRole: primarySpouse?.focusRole,
    childrenUnits,
    hasChildren,
    isExpanded,
    subtreeSpan: subtreeH,
  };

  flatList.push(unit);
  return unit;
}

// ============================================================================
// 3. MAIN CALCULATOR (Supports Both Vertical & Horizontal Directions)
// ============================================================================

export function calculateTreeLayout(
  rootNodes: ErgoTreeNode[],
  expandedIds: Set<string>,
  direction: TreeDirection = 'vertical',
  options?: TreeLayoutOptions
): LayoutResult {
  const flatUnits: LayoutUnit[] = [];
  const rootUnits: LayoutUnit[] = [];

  const vertSiblingGap = options?.siblingGap ?? VERTICAL_SIBLING_GAP;
  const horizSiblingGap = options?.siblingGap ?? HORIZONTAL_SIBLING_GAP;

  if (direction === 'vertical') {
    const memo = new Map<string, number>();
    // 1. Measure all roots
    const rootWidths = rootNodes.map((r) => measureSubtreeVertical(r, expandedIds, memo, options));

    // 2. Position all roots side-by-side
    let currentX = 80;
    rootNodes.forEach((root, idx) => {
      const rW = rootWidths[idx];
      const unit = positionUnitVertical(root, currentX, 1, expandedIds, flatUnits, memo, options);
      rootUnits.push(unit);
      currentX += rW + vertSiblingGap * 2;
    });

    // 3. Compute bounds & auto-center horizontally
    let minX = 0;
    let maxX = 1200;
    let minY = 0;
    let maxY = 800;

    if (flatUnits.length > 0) {
      minX = Math.min(...flatUnits.map((u) => u.x));
      maxX = Math.max(...flatUnits.map((u) => u.x + u.width));
      minY = Math.min(...flatUnits.map((u) => u.y));
      maxY = Math.max(...flatUnits.map((u) => u.y + u.height));
    }

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const totalWidth = Math.max(1600, contentWidth + 240);
    const totalHeight = Math.max(900, contentHeight + 200);

    const targetMinX = Math.max(80, Math.round((totalWidth - contentWidth) / 2));
    const deltaX = targetMinX - minX;

    if (deltaX !== 0) {
      flatUnits.forEach((u) => {
        u.x += deltaX;
        u.bloodCardCenterX += deltaX;
        u.parentStemX += deltaX;
      });
      minX += deltaX;
      maxX += deltaX;
    }

    // 4. Build Vertical Orthogonal Bus Groups AFTER units are at final centered coordinates
    const busGroups: BusGroup[] = [];

    flatUnits.forEach((parent) => {
      if (!parent.hasChildren || !parent.isExpanded || parent.childrenUnits.length === 0) {
        return;
      }

      const fromX = parent.parentStemX;
      const fromY = parent.parentStemY;
      const children = parent.childrenUnits;
      const midY = fromY + Math.round(VERTICAL_ROW_GAP * 0.45);

      const childrenDropInfo = children.map((c) => {
        const hasSpouse = Boolean(c.spouseCard);
        const husbandX = c.bloodCardCenterX;
        const wifeX = hasSpouse ? c.x + CARD_WIDTH + SPOUSE_GAP + CARD_WIDTH / 2 : husbandX;
        const stemX = hasSpouse ? (husbandX + wifeX) / 2 : husbandX;
        return {
          unit: c,
          hasSpouse,
          husbandX,
          wifeX,
          stemX,
          topY: c.y,
        };
      });

      const minChildX = Math.min(...childrenDropInfo.map((p) => p.stemX));
      const maxChildX = Math.max(...childrenDropInfo.map((p) => p.stemX));
      const minLineX = Math.min(fromX, minChildX);
      const maxLineX = Math.max(fromX, maxChildX);

      // 1. Trunk down from parent couple center (under toggle button)
      const trunkPath = `M ${fromX} ${fromY} V ${midY}`;

      // 2. Horizontal bus bar spanning across all children and parent stem
      const busBarPath = `M ${minLineX} ${midY} H ${maxLineX}`;

      // 3. Drop lines & fork brackets for married couples vs single children
      const dropPaths: string[] = [];
      const dropJunctions: { x: number; y: number }[] = [];

      childrenDropInfo.forEach((cp) => {
        // Dot on the bus bar where this drop originates
        dropJunctions.push({ x: cp.stemX, y: midY });

        if (cp.hasSpouse) {
          // Married couple: stem drops from bus bar to fork point, branches horizontally, and drops into both cards
          const forkY = cp.topY - 20;
          dropPaths.push(
            `M ${cp.stemX} ${midY} V ${forkY} M ${cp.husbandX} ${cp.topY} V ${forkY} H ${cp.wifeX} V ${cp.topY}`
          );
          // Branching junction dot
          dropJunctions.push({ x: cp.stemX, y: forkY });
        } else {
          // Single child: straight line from bus bar into card top
          dropPaths.push(`M ${cp.stemX} ${midY} V ${cp.topY}`);
        }
      });

      // 4. Trunk junction dot
      const trunkJunction = { x: fromX, y: midY };

      busGroups.push({
        id: `bus-${parent.id}`,
        trunkPath,
        busBarPath,
        dropPaths,
        trunkJunction,
        dropJunctions,
      });
    });

    return {
      units: rootUnits,
      flatUnits,
      busGroups,
      totalWidth,
      totalHeight,
      minX,
      minY,
      direction: 'vertical',
    };
  } else {
    // ========================================================================
    // HORIZONTAL DIRECTION (Left to Right)
    // ========================================================================
    const rootHeights = rootNodes.map((r) => measureSubtreeHorizontal(r, expandedIds, options));

    let currentY = 60;
    rootNodes.forEach((root, idx) => {
      const rH = rootHeights[idx];
      const unit = positionUnitHorizontal(root, 80, currentY, 1, expandedIds, flatUnits, options);
      rootUnits.push(unit);
      currentY += rH + horizSiblingGap * 2;
    });

    // Compute bounds & auto-center vertically/horizontally
    let minX = 0;
    let maxX = 1200;
    let minY = 0;
    let maxY = 800;

    if (flatUnits.length > 0) {
      minX = Math.min(...flatUnits.map((u) => u.x));
      maxX = Math.max(...flatUnits.map((u) => u.x + u.width));
      minY = Math.min(...flatUnits.map((u) => u.y));
      maxY = Math.max(...flatUnits.map((u) => u.y + u.height));
    }

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const totalWidth = Math.max(1600, contentWidth + 240);
    const totalHeight = Math.max(900, contentHeight + 200);

    const targetMinY = Math.max(60, Math.round((totalHeight - contentHeight) / 2));
    const deltaY = targetMinY - minY;

    if (deltaY !== 0) {
      flatUnits.forEach((u) => {
        u.y += deltaY;
        u.bloodCardCenterY += deltaY;
        u.parentStemY += deltaY;
      });
      minY += deltaY;
      maxY += deltaY;
    }

    // Build Horizontal Orthogonal Bus Groups AFTER units are at final centered coordinates
    const busGroups: BusGroup[] = [];

    flatUnits.forEach((parent) => {
      if (!parent.hasChildren || !parent.isExpanded || parent.childrenUnits.length === 0) {
        return;
      }

      const fromX = parent.x + parent.width;
      const fromY = parent.bloodCardCenterY;
      const children = parent.childrenUnits;
      const midX = fromX + Math.round(HORIZONTAL_COL_GAP * 0.45);

      const childrenDropPoints = children.map((c) => ({
        x: c.x,
        y: c.bloodCardCenterY,
      }));

      const minChildY = Math.min(...childrenDropPoints.map((p) => p.y));
      const maxChildY = Math.max(...childrenDropPoints.map((p) => p.y));
      const minLineY = Math.min(fromY, minChildY);
      const maxLineY = Math.max(fromY, maxChildY);

      const trunkPath = `M ${fromX} ${fromY} H ${midX}`;
      const busBarPath = `M ${midX} ${minLineY} V ${maxLineY}`;
      const dropPaths = childrenDropPoints.map((ch) => `M ${midX} ${ch.y} H ${ch.x}`);

      busGroups.push({
        id: `bus-${parent.id}`,
        trunkPath,
        busBarPath,
        dropPaths,
        trunkJunction: { x: midX, y: fromY },
        dropJunctions: childrenDropPoints.map((ch) => ({ x: midX, y: ch.y })),
      });
    });

    return {
      units: rootUnits,
      flatUnits,
      busGroups,
      totalWidth,
      totalHeight,
      minX,
      minY,
      direction: 'horizontal',
    };
  }
}

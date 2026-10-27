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

// ============================================================================
// 1. VERTICAL LAYOUT ENGINE (Top-to-Bottom Pedigree)
// ============================================================================

function measureSubtreeVertical(node: ErgoTreeNode, expandedIds: Set<string>): number {
  const hasSpouse = Boolean(node.spouses && node.spouses.length > 0);
  const unitWidth = hasSpouse ? COUPLE_WIDTH : SINGLE_WIDTH;
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = Boolean(node.children && node.children.length > 0);

  if (!hasChildren || !isExpanded) {
    return unitWidth;
  }

  let childrenTotalW = 0;
  node.children.forEach((child, idx) => {
    const chW = measureSubtreeVertical(child, expandedIds);
    childrenTotalW += chW;
    if (idx < node.children.length - 1) {
      childrenTotalW += VERTICAL_SIBLING_GAP;
    }
  });

  return Math.max(unitWidth, childrenTotalW);
}

function positionUnitVertical(
  node: ErgoTreeNode,
  leftX: number,
  level: number,
  expandedIds: Set<string>,
  flatList: LayoutUnit[]
): LayoutUnit {
  const hasSpouse = Boolean(node.spouses && node.spouses.length > 0);
  const primarySpouse = hasSpouse ? node.spouses![0] : undefined;
  const unitWidth = hasSpouse ? COUPLE_WIDTH : SINGLE_WIDTH;
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const subtreeW = measureSubtreeVertical(node, expandedIds);

  // Center this parent unit horizontally in its allocated subtree span
  const unitX = leftX + (subtreeW - unitWidth) / 2;
  const unitY = 60 + (level - 1) * VERTICAL_LEVEL_HEIGHT;

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
  if (hasChildren && isExpanded) {
    const childWidths = node.children.map((c) => measureSubtreeVertical(c, expandedIds));
    const totalChildW = childWidths.reduce(
      (sum, w, idx) => sum + w + (idx < childWidths.length - 1 ? VERTICAL_SIBLING_GAP : 0),
      0
    );

    let childCurrentX = leftX + (subtreeW - totalChildW) / 2;
    node.children.forEach((child, idx) => {
      const chW = childWidths[idx];
      const childUnit = positionUnitVertical(child, childCurrentX, level + 1, expandedIds, flatList);
      childrenUnits.push(childUnit);
      childCurrentX += chW + VERTICAL_SIBLING_GAP;
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

function measureSubtreeHorizontal(node: ErgoTreeNode, expandedIds: Set<string>): number {
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const unitHeight = CARD_HEIGHT;

  if (!hasChildren || !isExpanded) {
    return unitHeight;
  }

  let childrenTotalH = 0;
  node.children.forEach((child, idx) => {
    const chH = measureSubtreeHorizontal(child, expandedIds);
    childrenTotalH += chH;
    if (idx < node.children.length - 1) {
      childrenTotalH += HORIZONTAL_SIBLING_GAP;
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
  flatList: LayoutUnit[]
): LayoutUnit {
  const hasSpouse = Boolean(node.spouses && node.spouses.length > 0);
  const primarySpouse = hasSpouse ? node.spouses![0] : undefined;
  const unitWidth = hasSpouse ? COUPLE_WIDTH : SINGLE_WIDTH;
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const subtreeH = measureSubtreeHorizontal(node, expandedIds);

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
  if (hasChildren && isExpanded) {
    const childHeights = node.children.map((c) => measureSubtreeHorizontal(c, expandedIds));
    const totalChildH = childHeights.reduce(
      (sum, h, idx) => sum + h + (idx < childHeights.length - 1 ? HORIZONTAL_SIBLING_GAP : 0),
      0
    );

    let childCurrentY = topY + (subtreeH - totalChildH) / 2;
    const nextColX = unitX + HORIZONTAL_LEVEL_WIDTH;

    node.children.forEach((child, idx) => {
      const chH = childHeights[idx];
      const childUnit = positionUnitHorizontal(child, nextColX, childCurrentY, level + 1, expandedIds, flatList);
      childrenUnits.push(childUnit);
      childCurrentY += chH + HORIZONTAL_SIBLING_GAP;
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
  direction: TreeDirection = 'vertical'
): LayoutResult {
  const flatUnits: LayoutUnit[] = [];
  const rootUnits: LayoutUnit[] = [];

  if (direction === 'vertical') {
    // 1. Measure all roots
    const rootWidths = rootNodes.map((r) => measureSubtreeVertical(r, expandedIds));

    // 2. Position all roots side-by-side
    let currentX = 80;
    rootNodes.forEach((root, idx) => {
      const rW = rootWidths[idx];
      const unit = positionUnitVertical(root, currentX, 1, expandedIds, flatUnits);
      rootUnits.push(unit);
      currentX += rW + VERTICAL_SIBLING_GAP * 2;
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

      const childrenDropPoints = children.map((c) => ({
        x: c.bloodCardCenterX,
        y: c.y,
      }));

      const minChildX = Math.min(...childrenDropPoints.map((p) => p.x));
      const maxChildX = Math.max(...childrenDropPoints.map((p) => p.x));
      const minLineX = Math.min(fromX, minChildX);
      const maxLineX = Math.max(fromX, maxChildX);

      // 1. Trunk down from parent couple center (under toggle button)
      const trunkPath = `M ${fromX} ${fromY} V ${midY}`;

      // 2. Horizontal bus bar spanning across all children and parent stem
      const busBarPath = `M ${minLineX} ${midY} H ${maxLineX}`;

      // 3. Drop lines to each child card
      const dropPaths = childrenDropPoints.map((ch) => `M ${ch.x} ${midY} V ${ch.y}`);

      // 4. Junction dots
      const trunkJunction = { x: fromX, y: midY };
      const dropJunctions = childrenDropPoints.map((ch) => ({ x: ch.x, y: midY }));

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
    const rootHeights = rootNodes.map((r) => measureSubtreeHorizontal(r, expandedIds));

    let currentY = 60;
    rootNodes.forEach((root, idx) => {
      const rH = rootHeights[idx];
      const unit = positionUnitHorizontal(root, 80, currentY, 1, expandedIds, flatUnits);
      rootUnits.push(unit);
      currentY += rH + HORIZONTAL_SIBLING_GAP * 2;
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

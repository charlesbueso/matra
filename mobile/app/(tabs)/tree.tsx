// ============================================================
// Matra — Lineage (Tree) View
// ============================================================
// The family tree rendered as a living canopy.
// Each person is a warm organic node on branches.
// ============================================================

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, Pressable, ScrollView, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withDecay,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Line, Circle, Path, Defs, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { StarField, BioAlgae, TreeTrunk, MountainScape, FlyingBirds } from '../../src/components/ui';
import { useFamilyStore, Person, Relationship } from '../../src/stores/familyStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useNotificationStore } from '../../src/stores/notificationStore';
import { useSignedUrls } from '../../src/hooks';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing } from '../../src/theme/tokens';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const NODE_RADIUS = 28;
const HORIZONTAL_SPACING = 140;
const VERTICAL_SPACING = 160;
const COUPLE_GAP = 100;

// Build a proper genealogical tree layout from relationships
function layoutNodes(
  people: Person[],
  relationships: Relationship[],
  selfPersonId?: string | null
): {
  positions: Map<string, { x: number; y: number }>;
  roleLabels: Map<string, string>;
  generation: Map<string, number>;
  width: number;
  height: number;
} {
  const positions = new Map<string, { x: number; y: number }>();
  const roleLabels = new Map<string, string>();
  const generation = new Map<string, number>();
  if (people.length === 0) return { positions, roleLabels, generation, width: SCREEN_WIDTH, height: SCREEN_HEIGHT };

  const peopleById = new Map(people.map((p) => [p.id, p]));

  // Build adjacency: parent→children, spouse pairs
  const childrenOf = new Map<string, string[]>(); // parentId → childIds
  const parentOf = new Map<string, string[]>();    // childId → parentIds
  const spouseOf = new Map<string, Set<string>>(); // personId → spouseIds

  for (const rel of relationships) {
    const a = rel.person_a_id;
    const b = rel.person_b_id;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;

    const type = rel.relationship_type;

    if (type === 'parent') {
      // A is parent of B
      if (!childrenOf.has(a)) childrenOf.set(a, []);
      childrenOf.get(a)!.push(b);
      if (!parentOf.has(b)) parentOf.set(b, []);
      parentOf.get(b)!.push(a);
    } else if (type === 'child') {
      // A is child of B → B is parent of A
      if (!childrenOf.has(b)) childrenOf.set(b, []);
      childrenOf.get(b)!.push(a);
      if (!parentOf.has(a)) parentOf.set(a, []);
      parentOf.get(a)!.push(b);
    } else if (type === 'spouse' || type === 'ex_spouse') {
      if (!spouseOf.has(a)) spouseOf.set(a, new Set());
      if (!spouseOf.has(b)) spouseOf.set(b, new Set());
      spouseOf.get(a)!.add(b);
      spouseOf.get(b)!.add(a);
    } else if (type === 'sibling') {
      // Siblings share a generation — also track for adjacency in layout
      if (!spouseOf.has(a)) spouseOf.set(a, new Set());
      if (!spouseOf.has(b)) spouseOf.set(b, new Set());
      // We don't add siblings as spouses, but we need to ensure
      // they get the same generation. Track siblingOf separately.
    }
  }

  // Build multi-generation ancestor maps for proper vertical placement
  // These track relationships that skip generations (grandparent = 2, great = 3, etc.)
  const ancestorOf = new Map<string, { descendantId: string; gap: number }[]>();
  const descendantParentOf = new Map<string, { ancestorId: string; gap: number }[]>();
  for (const rel of relationships) {
    const a = rel.person_a_id;
    const b = rel.person_b_id;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    const type = rel.relationship_type;
    let gap = 0;
    let ancestorId = '';
    let descendantId = '';
    if (type === 'grandparent')              { gap = 2; ancestorId = a; descendantId = b; }
    else if (type === 'grandchild')           { gap = 2; ancestorId = b; descendantId = a; }
    else if (type === 'great_grandparent')    { gap = 3; ancestorId = a; descendantId = b; }
    else if (type === 'great_grandchild')     { gap = 3; ancestorId = b; descendantId = a; }
    else if (type === 'great_great_grandparent') { gap = 4; ancestorId = a; descendantId = b; }
    else if (type === 'great_great_grandchild')  { gap = 4; ancestorId = b; descendantId = a; }
    if (gap > 0) {
      if (!ancestorOf.has(ancestorId)) ancestorOf.set(ancestorId, []);
      ancestorOf.get(ancestorId)!.push({ descendantId, gap });
      if (!descendantParentOf.has(descendantId)) descendantParentOf.set(descendantId, []);
      descendantParentOf.get(descendantId)!.push({ ancestorId, gap });
      // Also register in parentOf so roots are computed correctly
      if (!parentOf.has(descendantId)) parentOf.set(descendantId, []);
      if (!parentOf.get(descendantId)!.includes(ancestorId)) {
        parentOf.get(descendantId)!.push(ancestorId);
      }
    }
  }

  // Build sibling adjacency for same-generation placement
  const siblingOf = new Map<string, Set<string>>();
  const fullSiblingOf = new Map<string, Set<string>>(); // only true siblings, not step
  for (const rel of relationships) {
    const a = rel.person_a_id;
    const b = rel.person_b_id;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    if (rel.relationship_type === 'sibling' || rel.relationship_type === 'half_sibling' || rel.relationship_type === 'step_sibling') {
      if (!siblingOf.has(a)) siblingOf.set(a, new Set());
      if (!siblingOf.has(b)) siblingOf.set(b, new Set());
      siblingOf.get(a)!.add(b);
      siblingOf.get(b)!.add(a);
    }
    if (rel.relationship_type === 'sibling') {
      if (!fullSiblingOf.has(a)) fullSiblingOf.set(a, new Set());
      if (!fullSiblingOf.has(b)) fullSiblingOf.set(b, new Set());
      fullSiblingOf.get(a)!.add(b);
      fullSiblingOf.get(b)!.add(a);
    }
  }

  // Propagate parent relationships through full siblings only (not step siblings):
  // If A is sibling of B and B has parents, A should also be a child of those parents
  let changed = true;
  while (changed) {
    changed = false;
    for (const [personId, sibs] of fullSiblingOf) {
      for (const sibId of sibs) {
        const sibParents = parentOf.get(sibId) || [];
        for (const parentId of sibParents) {
          // Add parentId as parent of personId if not already
          if (!parentOf.has(personId)) parentOf.set(personId, []);
          if (!parentOf.get(personId)!.includes(parentId)) {
            parentOf.get(personId)!.push(parentId);
            if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
            if (!childrenOf.get(parentId)!.includes(personId)) {
              childrenOf.get(parentId)!.push(personId);
            }
            changed = true;
          }
        }
      }
    }
  }

  // ── Assign generations via self-centric BFS ──
  // Start from self (gen 0) and walk outward using relationship-type offsets.
  // This correctly places parents at gen -1, grandparents at -2, great-grandparents
  // at -3, children at +1, etc. — regardless of how many roots there are.
  const visited = new Set<string>();

  // Generation offset map: how many generations ABOVE self is person A when
  // "A is [type] of B" (the directional semantics of the relationships table).
  const GEN_OFFSET_A: Record<string, number> = {
    parent: -1, child: 1,
    spouse: 0, ex_spouse: 0,
    sibling: 0, half_sibling: 0, step_sibling: 0,
    grandparent: -2, grandchild: 2,
    great_grandparent: -3, great_grandchild: 3,
    great_great_grandparent: -4, great_great_grandchild: 4,
    uncle_aunt: -1, nephew_niece: 1,
    cousin: 0,
    in_law: 0,
    parent_in_law: -1, child_in_law: 1,
    step_parent: -1, step_child: 1,
    adopted_parent: -1, adopted_child: 1,
    godparent: -1, godchild: 1,
    other: 0,
  };

  // Build a bidirectional adjacency list with signed offsets from the raw relationships
  const adjList = new Map<string, { targetId: string; offset: number }[]>();
  const addAdj = (from: string, to: string, offset: number) => {
    if (!adjList.has(from)) adjList.set(from, []);
    adjList.get(from)!.push({ targetId: to, offset });
  };
  for (const rel of relationships) {
    const a = rel.person_a_id;
    const b = rel.person_b_id;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    const off = GEN_OFFSET_A[rel.relationship_type] ?? 0;
    // A is at offset `off` relative to B  →  from B's perspective, A is `off` gens away
    addAdj(b, a, off);       // going from B → A means moving `off` generations
    addAdj(a, b, -off);      // going from A → B means moving `-off` generations
  }

  // BFS from self at generation 0
  const startNode = selfPersonId && peopleById.has(selfPersonId) ? selfPersonId : null;
  if (startNode) {
    const queue: { id: string; gen: number }[] = [{ id: startNode, gen: 0 }];
    visited.add(startNode);
    while (queue.length > 0) {
      const { id, gen } = queue.shift()!;
      generation.set(id, gen);
      const neighbors = adjList.get(id) || [];
      for (const { targetId, offset } of neighbors) {
        if (!visited.has(targetId)) {
          visited.add(targetId);
          queue.push({ id: targetId, gen: gen + offset });
        }
      }
    }
  }

  // Handle unvisited people (disconnected components or no self)
  // Use root-based BFS as fallback
  for (const p of people) {
    if (visited.has(p.id)) continue;
    // Check if this person connects to an already-placed person
    const neighbors = adjList.get(p.id) || [];
    const placedNeighbor = neighbors.find((n) => generation.has(n.targetId));
    if (placedNeighbor) {
      const queue: { id: string; gen: number }[] = [{
        id: p.id,
        gen: generation.get(placedNeighbor.targetId)! + placedNeighbor.offset,
      }];
      visited.add(p.id);
      while (queue.length > 0) {
        const { id, gen } = queue.shift()!;
        generation.set(id, gen);
        const ns = adjList.get(id) || [];
        for (const { targetId, offset } of ns) {
          if (!visited.has(targetId)) {
            visited.add(targetId);
            queue.push({ id: targetId, gen: gen + offset });
          }
        }
      }
    } else {
      generation.set(p.id, 0);
    }
  }

  // Shift all generations so the minimum is 0
  let minGen = 0;
  for (const gen of generation.values()) {
    if (gen < minGen) minGen = gen;
  }
  if (minGen < 0) {
    for (const [personId, gen] of generation) {
      generation.set(personId, gen - minGen);
    }
  }

  // Group by generation
  const genGroups = new Map<number, string[]>();
  for (const [personId, gen] of generation) {
    if (!genGroups.has(gen)) genGroups.set(gen, []);
    genGroups.get(gen)!.push(personId);
  }

  const sortedGens = [...genGroups.keys()].sort((a, b) => a - b);

  // Position each generation row
  // Children are grouped under their parents so siblings stay together
  let maxRowWidth = 0;
  const PADDING = 80;

  // Helper: build units (couples or singles) from a list of person IDs
  function buildUnits(ids: string[]) {
    const placed = new Set<string>();
    const units: { ids: string[]; width: number }[] = [];
    for (const personId of ids) {
      if (placed.has(personId)) continue;
      const spouses = spouseOf.get(personId);
      const spouseInRow = spouses
        ? [...spouses].find((s) => ids.includes(s) && !placed.has(s))
        : null;
      if (spouseInRow) {
        placed.add(personId);
        placed.add(spouseInRow);
        units.push({ ids: [personId, spouseInRow], width: COUPLE_GAP });
      } else {
        placed.add(personId);
        units.push({ ids: [personId], width: 0 });
      }
    }
    return units;
  }

  for (let gi = 0; gi < sortedGens.length; gi++) {
    const gen = sortedGens[gi];
    const row = genGroups.get(gen)!;
    // Use actual generation number (not loop index) so empty intermediate
    // generations still consume vertical space in the layout.
    const minGen = sortedGens[0];
    const y = PADDING + (gen - minGen) * VERTICAL_SPACING;

    if (gi === 0) {
      // Root generation — just center
      const units = buildUnits(row);
      const totalWidth = units.reduce((sum, u) => sum + u.width, 0) +
        (units.length - 1) * HORIZONTAL_SPACING;
      maxRowWidth = Math.max(maxRowWidth, totalWidth);

      let x = PADDING + (Math.max(maxRowWidth, SCREEN_WIDTH) - totalWidth) / 2;
      for (const unit of units) {
        if (unit.ids.length === 2) {
          positions.set(unit.ids[0], { x, y });
          positions.set(unit.ids[1], { x: x + COUPLE_GAP, y });
          x += COUPLE_GAP + HORIZONTAL_SPACING;
        } else {
          positions.set(unit.ids[0], { x, y });
          x += HORIZONTAL_SPACING;
        }
      }
      continue;
    }

    // For non-root generations: group children by parent unit,
    // then center each sibling group under their parents
    // First, find which parent unit each child belongs to
    const parentUnitMap = new Map<string, string[]>(); // parentKey → childIds
    const orphans: string[] = [];

    for (const childId of row) {
      const parents = parentOf.get(childId) || [];
      // Find the parent(s) that are already positioned
      const positionedParent = parents.find((p) => positions.has(p));
      if (positionedParent) {
        // Use the parent (or their spouse) as the unit key
        const parentPos = positions.get(positionedParent)!;
        const spouse = spouseOf.get(positionedParent);
        const spouseId = spouse ? [...spouse].find((s) => positions.has(s)) : null;
        // Sort so the key is deterministic
        const key = spouseId
          ? [positionedParent, spouseId].sort().join('|')
          : positionedParent;
        if (!parentUnitMap.has(key)) parentUnitMap.set(key, []);
        parentUnitMap.get(key)!.push(childId);
      } else {
        orphans.push(childId);
      }
    }

    // Place orphan step/half siblings next to their sibling's parent group
    // e.g. a step_sibling of the narrator should be placed in the same
    // group as narrator, not floating separately.
    const remainingOrphans: string[] = [];
    for (const orphanId of orphans) {
      const sibs = siblingOf.get(orphanId);
      let placed = false;
      if (sibs) {
        for (const sibId of sibs) {
          // Find which parent group this sibling belongs to
          for (const [key, children] of parentUnitMap) {
            if (children.includes(sibId)) {
              children.push(orphanId);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
      if (!placed) remainingOrphans.push(orphanId);
    }

    // Sort parent groups by their x position (left to right)
    const sortedParentKeys = [...parentUnitMap.keys()].sort((a, b) => {
      const aIds = a.split('|');
      const bIds = b.split('|');
      const aX = Math.min(...aIds.map((id) => positions.get(id)?.x ?? 0));
      const bX = Math.min(...bIds.map((id) => positions.get(id)?.x ?? 0));
      return aX - bX;
    });

    // Build ordered child list: children grouped under parents, then remaining orphans
    const orderedChildren: string[] = [];
    for (const key of sortedParentKeys) {
      orderedChildren.push(...parentUnitMap.get(key)!);
    }
    orderedChildren.push(...remainingOrphans);

    const units = buildUnits(orderedChildren);
    const totalWidth = units.reduce((sum, u) => sum + u.width, 0) +
      (units.length - 1) * HORIZONTAL_SPACING;
    maxRowWidth = Math.max(maxRowWidth, totalWidth);

    // Try to center sibling groups under their parents
    // First pass: compute desired center for each group
    let x = PADDING + (Math.max(maxRowWidth, SCREEN_WIDTH) - totalWidth) / 2;
    for (const unit of units) {
      // Find the parent center for this unit's first member
      const firstChild = unit.ids[0];
      const parents = parentOf.get(firstChild) || [];
      const positionedParents = parents.filter((p) => positions.has(p));
      if (positionedParents.length > 0) {
        const parentCenterX = positionedParents.reduce((sum, p) => sum + positions.get(p)!.x, 0) / positionedParents.length;
        // Nudge x toward parent center (but don't overlap with previous unit)
        x = Math.max(x, parentCenterX - (unit.width / 2));
      }

      if (unit.ids.length === 2) {
        positions.set(unit.ids[0], { x, y });
        positions.set(unit.ids[1], { x: x + COUPLE_GAP, y });
        x += COUPLE_GAP + HORIZONTAL_SPACING;
      } else {
        positions.set(unit.ids[0], { x, y });
        x += HORIZONTAL_SPACING;
      }
    }
  }

  // Compute graph dimensions from actual positioned nodes (not pre-centering estimates)
  let actualMaxX = 0;
  let actualMaxY = 0;
  for (const pos of positions.values()) {
    if (pos.x > actualMaxX) actualMaxX = pos.x;
    if (pos.y > actualMaxY) actualMaxY = pos.y;
  }
  const genRange = sortedGens.length > 0 ? (sortedGens[sortedGens.length - 1] - sortedGens[0] + 1) : 1;
  const graphWidth = Math.max(actualMaxX + PADDING * 3, maxRowWidth + PADDING * 2, SCREEN_WIDTH * 1.5);
  const graphHeight = Math.max(actualMaxY + PADDING * 3, PADDING * 2 + genRange * VERTICAL_SPACING, SCREEN_HEIGHT);

  // Compute role labels relative to the self person
  // Each person's label describes their relationship TO the user
  if (selfPersonId) {
    // Inverse map: when self is personA with type X, what is personB's label?
    const inverseLabel: Record<string, string> = {
      parent: 'Child',
      child: 'Parent',
      spouse: 'Spouse',
      ex_spouse: 'Ex-Spouse',
      sibling: 'Sibling',
      step_sibling: 'Step Sibling',
      half_sibling: 'Half Sibling',
      grandparent: 'Grandchild',
      grandchild: 'Grandparent',
      great_grandparent: 'Great Grandchild',
      great_grandchild: 'Great Grandparent',
      great_great_grandparent: 'Great Great Grandchild',
      great_great_grandchild: 'Great Great Grandparent',
      uncle_aunt: 'Nephew/Niece',
      nephew_niece: 'Uncle/Aunt',
      cousin: 'Cousin',
      in_law: 'In-law',
      parent_in_law: 'Child-in-law',
      child_in_law: 'Parent-in-law',
      step_parent: 'Step Child',
      step_child: 'Step Parent',
      adopted_parent: 'Adopted Child',
      adopted_child: 'Adopted Parent',
      godparent: 'Godchild',
      godchild: 'Godparent',
    };
    // Direct map: when self is personB with type X, what is personA's label?
    const directLabel: Record<string, string> = {
      parent: 'Parent',
      child: 'Child',
      spouse: 'Spouse',
      ex_spouse: 'Ex-Spouse',
      sibling: 'Sibling',
      step_sibling: 'Step Sibling',
      half_sibling: 'Half Sibling',
      grandparent: 'Grandparent',
      grandchild: 'Grandchild',
      great_grandparent: 'Great Grandparent',
      great_grandchild: 'Great Grandchild',
      great_great_grandparent: 'Great Great Grandparent',
      great_great_grandchild: 'Great Great Grandchild',
      uncle_aunt: 'Uncle/Aunt',
      nephew_niece: 'Nephew/Niece',
      cousin: 'Cousin',
      in_law: 'In-law',
      parent_in_law: 'Parent-in-law',
      child_in_law: 'Child-in-law',
      step_parent: 'Step Parent',
      step_child: 'Step Child',
      adopted_parent: 'Adopted Parent',
      adopted_child: 'Adopted Child',
      godparent: 'Godparent',
      godchild: 'Godchild',
    };

    for (const rel of relationships) {
      const type = rel.relationship_type;
      if (rel.person_a_id === selfPersonId && rel.person_b_id !== selfPersonId) {
        // Self is personA → personB's label is the inverse
        const label = inverseLabel[type];
        if (label && !roleLabels.has(rel.person_b_id)) {
          roleLabels.set(rel.person_b_id, label);
        }
      } else if (rel.person_b_id === selfPersonId && rel.person_a_id !== selfPersonId) {
        // Self is personB → personA's label is the direct
        const label = directLabel[type];
        if (label && !roleLabels.has(rel.person_a_id)) {
          roleLabels.set(rel.person_a_id, label);
        }
      }
    }
    // Label self
    roleLabels.set(selfPersonId, 'Me');
  } else {
    // Fallback: no self person — use generic labels
    for (const p of people) {
      const hasChildren = childrenOf.has(p.id) && childrenOf.get(p.id)!.length > 0;
      const hasParents = parentOf.has(p.id) && parentOf.get(p.id)!.length > 0;
      const hasSpouse = spouseOf.has(p.id) && spouseOf.get(p.id)!.size > 0;
      const hasSiblings = siblingOf.has(p.id) && siblingOf.get(p.id)!.size > 0;

      const hasFullSiblings = fullSiblingOf.has(p.id) && fullSiblingOf.get(p.id)!.size > 0;
      const hasStepSiblings = relationships.some(
        (r) => (r.relationship_type === 'step_sibling' || r.relationship_type === 'half_sibling') &&
          (r.person_a_id === p.id || r.person_b_id === p.id)
      );

      if (hasChildren && hasParents) roleLabels.set(p.id, 'Parent');
      else if (hasChildren) roleLabels.set(p.id, 'Parent');
      else if (hasFullSiblings) roleLabels.set(p.id, 'Sibling');
      else if (hasStepSiblings) roleLabels.set(p.id, 'Half Sibling');
      else if (hasParents && hasSiblings) roleLabels.set(p.id, 'Sibling');
      else if (hasParents) roleLabels.set(p.id, 'Child');
      else if (hasSpouse) roleLabels.set(p.id, 'Spouse');
    }
  }

  return { positions, roleLabels, generation, width: graphWidth, height: graphHeight };
}

type ViewMode = 'graph' | 'table';

export default function TreeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { people, relationships } = useFamilyStore();
  const selfPersonId = useAuthStore((s) => s.profile?.self_person_id);
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const avatarUrls = useSignedUrls(people.map((p) => p.avatar_url));

  const roleTranslations: Record<string, string> = useMemo(() => ({
    'Me': t('tree.me'),
    'Parent': t('tree.roleParent'),
    'Child': t('tree.roleChild'),
    'Spouse': t('tree.roleSpouse'),
    'Ex-Spouse': t('tree.roleExSpouse'),
    'Sibling': t('tree.roleSibling'),
    'Step Sibling': t('tree.roleStepSibling'),
    'Grandparent': t('tree.roleGrandparent'),
    'Grandchild': t('tree.roleGrandchild'),
    'Great Grandparent': t('tree.roleGreatGrandparent'),
    'Great Grandchild': t('tree.roleGreatGrandchild'),
    'Great Great Grandparent': t('tree.roleGreatGreatGrandparent'),
    'Great Great Grandchild': t('tree.roleGreatGreatGrandchild'),
    'Uncle/Aunt': t('tree.roleUncleAunt'),
    'Nephew/Niece': t('tree.roleNephewNiece'),
    'Cousin': t('tree.roleCousin'),
    'In-law': t('tree.roleInLaw'),
    'Step Parent': t('tree.roleStepParent'),
    'Step Child': t('tree.roleStepChild'),
    'Adopted Parent': t('tree.roleAdoptedParent'),
    'Adopted Child': t('tree.roleAdoptedChild'),
    'Godparent': t('tree.roleGodparent'),
    'Godchild': t('tree.roleGodchild'),
  }), [t]);

  const translateRole = (role: string) => roleTranslations[role] || role;

  const { positions, roleLabels, generation, width: GRAPH_WIDTH, height: GRAPH_HEIGHT } = useMemo(
    () => layoutNodes(people, relationships, selfPersonId),
    [people, relationships, selfPersonId]
  );

  // Mark lineage as read when this tab is viewed
  useFocusEffect(
    useCallback(() => {
      useNotificationStore.getState().markLineageRead();
    }, [])
  );

  // ── Pan & Zoom state (must be declared before any early return) ──
  const scale = useSharedValue(0.8);
  const translateX = useSharedValue(-GRAPH_WIDTH / 2 + SCREEN_WIDTH / 2);
  const translateY = useSharedValue(-GRAPH_HEIGHT / 2 + SCREEN_HEIGHT / 2);

  const savedScale = useSharedValue(0.8);
  const savedTranslateX = useSharedValue(translateX.value);
  const savedTranslateY = useSharedValue(translateY.value);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 0.3), 4);
    });

  const panGesture = Gesture.Pan()
    .onStart(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd((e) => {
      translateX.value = withDecay({ velocity: e.velocityX, deceleration: 0.997 });
      translateY.value = withDecay({ velocity: e.velocityY, deceleration: 0.997 });
    });

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const animatedCanvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (people.length === 0) {
    return (
      <StarField particleCount={30}>
        <MountainScape mountainOpacity={0.10} cloudCount={6} />
        <FlyingBirds count={4} />
        <TreeTrunk opacity={0.18} />
        <BioAlgae strandCount={50} height={0.22} />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🌳</Text>
          <Text style={styles.emptyTitle}>{t('tree.emptyTitle')}</Text>
          <Text style={styles.emptySubtitle}>
            {t('tree.emptySubtitle')}
          </Text>
        </View>
      </StarField>
    );
  }

  return (
    <StarField particleCount={20}>
      <MountainScape mountainOpacity={0.10} cloudCount={8} />
      <FlyingBirds count={5} />
      <TreeTrunk opacity={0.18} />
      <BioAlgae strandCount={60} height={0.22} />
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{t('tree.title')}</Text>
            <Text style={styles.subtitle}>{t('tree.subtitle', { people: people.length, connections: relationships.length })}</Text>
          </View>
          <View style={styles.toggleContainer}>
            <Pressable
              onPress={() => setViewMode('graph')}
              style={[styles.toggleButton, viewMode === 'graph' && styles.toggleButtonActive]}
            >
              <Text style={[styles.toggleText, viewMode === 'graph' && styles.toggleTextActive]}>{t('tree.graph')}</Text>
            </Pressable>
            <Pressable
              onPress={() => setViewMode('table')}
              style={[styles.toggleButton, viewMode === 'table' && styles.toggleButtonActive]}
            >
              <Text style={[styles.toggleText, viewMode === 'table' && styles.toggleTextActive]}>{t('tree.table')}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {viewMode === 'table' ? (
        <ScrollView style={styles.tableContainer} contentContainerStyle={styles.tableContent}>
          {people.map((person) => {
            const isSelf = person.id === selfPersonId;
            const initials = (person.first_name?.[0] || '') + (person.last_name?.[0] || '');
            const role = isSelf ? t('tree.me') : roleLabels.get(person.id) ? translateRole(roleLabels.get(person.id)!) : '';
            return (
              <Pressable
                key={person.id}
                style={styles.tableRow}
                onPress={() => router.push(`/person/${person.id}`)}
              >
                {person.avatar_url && avatarUrls.get(person.avatar_url) ? (
                  <Image
                    source={{ uri: avatarUrls.get(person.avatar_url) }}
                    style={styles.tableAvatar}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View style={[styles.tableAvatar, styles.tableAvatarPlaceholder]}>
                    <Text style={styles.tableAvatarText}>{initials}</Text>
                  </View>
                )}
                <View style={styles.tableInfo}>
                  <Text style={styles.tableName}>
                    {person.first_name}{person.last_name ? ' ' + person.last_name : ''}
                  </Text>
                  {person.birth_place ? (
                    <Text style={styles.tableDetail} numberOfLines={1}>{person.birth_place}</Text>
                  ) : null}
                </View>
                {role ? <Text style={[styles.tableRole, isSelf && styles.tableRoleSelf]}>{role}</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
      <GestureDetector gesture={composedGesture}>
        <Animated.View style={[styles.canvasContainer]}>
          <Animated.View style={[{ width: GRAPH_WIDTH, height: GRAPH_HEIGHT }, animatedCanvasStyle]}>
            <Svg width={GRAPH_WIDTH} height={GRAPH_HEIGHT} style={StyleSheet.absoluteFill}>
            <Defs>
            <RadialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={Colors.accent.cyan} stopOpacity="0.3" />
              <Stop offset="100%" stopColor={Colors.accent.cyan} stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="selfGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={Colors.accent.amber} stopOpacity="0.5" />
              <Stop offset="100%" stopColor={Colors.accent.amber} stopOpacity="0" />
            </RadialGradient>
          </Defs>

          {/* Relationship connectors */}
          {relationships.map((rel) => {
            const posA = positions.get(rel.person_a_id);
            const posB = positions.get(rel.person_b_id);
            if (!posA || !posB) return null;

            const color = rel.verified ? Colors.graph.lineActive : Colors.graph.lineInactive;
            const sw = rel.verified ? 2 : 1;
            const dash = rel.verified ? undefined : '4 4';
            const type = rel.relationship_type;

            if (type === 'spouse') {
              // Horizontal line between spouses
              const leftX = Math.min(posA.x, posB.x) + NODE_RADIUS;
              const rightX = Math.max(posA.x, posB.x) - NODE_RADIUS;
              return (
                <Line
                  key={rel.id}
                  x1={leftX}
                  y1={posA.y}
                  x2={rightX}
                  y2={posB.y}
                  stroke={Colors.accent.amber}
                  strokeWidth={2}
                  strokeDasharray={dash}
                />
              );
            }

            if (type === 'ex_spouse') {
              // Dashed gray line between ex-spouses
              const leftX = Math.min(posA.x, posB.x) + NODE_RADIUS;
              const rightX = Math.max(posA.x, posB.x) - NODE_RADIUS;
              return (
                <Line
                  key={rel.id}
                  x1={leftX}
                  y1={posA.y}
                  x2={rightX}
                  y2={posB.y}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                />
              );
            }

            if (type === 'sibling' || type === 'half_sibling' || type === 'step_sibling') {
              // Siblings at same level — skip individual lines,
              // we draw a group bar below instead.
              return null;
            }

            // Only draw ancestor-type lines (parent, grandparent, etc.)
            const ancestorTypes = ['parent', 'child', 'grandparent', 'grandchild',
              'great_grandparent', 'great_grandchild', 'great_great_grandparent', 'great_great_grandchild'];
            if (!ancestorTypes.includes(type)) return null;

            // For multi-gen links (grandparent+), skip if there's an intermediate
            // person bridging both endpoints — the chain lines already cover it.
            if (type !== 'parent' && type !== 'child') {
              const genA = generation.get(rel.person_a_id) ?? 0;
              const genB = generation.get(rel.person_b_id) ?? 0;
              const minG = Math.min(genA, genB);
              const maxG = Math.max(genA, genB);
              // Check if any person at an intermediate gen connects to both endpoints
              const hasBridge = relationships.some((r2) => {
                if (r2.id === rel.id) return false;
                const otherId = r2.person_a_id === rel.person_a_id || r2.person_a_id === rel.person_b_id
                  ? r2.person_b_id
                  : r2.person_b_id === rel.person_a_id || r2.person_b_id === rel.person_b_id
                    ? r2.person_a_id
                    : null;
                if (!otherId) return false;
                const otherGen = generation.get(otherId) ?? -999;
                return otherGen > minG && otherGen < maxG;
              });
              if (hasBridge) return null;
            }

            // Parent-child: elbow connector
            const parent = posA.y < posB.y ? posA : posB;
            const child = posA.y < posB.y ? posB : posA;
            const midY = parent.y + (child.y - parent.y) / 2;

            return (
              <Path
                key={rel.id}
                d={`M ${parent.x} ${parent.y + NODE_RADIUS} L ${parent.x} ${midY} L ${child.x} ${midY} L ${child.x} ${child.y - NODE_RADIUS}`}
                stroke={color}
                strokeWidth={sw}
                strokeDasharray={dash}
                fill="none"
              />
            );
          })}

          {/* Sibling connector lines (per relationship pair) */}
          {relationships.map((rel) => {
            if (rel.relationship_type !== 'sibling' && rel.relationship_type !== 'half_sibling' && rel.relationship_type !== 'step_sibling') return null;
            const posA = positions.get(rel.person_a_id);
            const posB = positions.get(rel.person_b_id);
            if (!posA || !posB) return null;
            const leftX = Math.min(posA.x, posB.x) + NODE_RADIUS;
            const rightX = Math.max(posA.x, posB.x) - NODE_RADIUS;
            if (leftX >= rightX) return null;
            return (
              <Line
                key={`sib-${rel.id}`}
                x1={leftX}
                y1={posA.y}
                x2={rightX}
                y2={posB.y}
                stroke={Colors.accent.cyan}
                strokeWidth={1.5}
                strokeDasharray={(rel.relationship_type === 'half_sibling' || rel.relationship_type === 'step_sibling') ? '6 3' : undefined}
                strokeOpacity={0.7}
              />
            );
          })}

          {/* Nodes with initials */}
          {people.map((person) => {
            const pos = positions.get(person.id);
            if (!pos) return null;

            const initials = (person.first_name?.[0] || '') + (person.last_name?.[0] || '');
            const isSelf = person.id === selfPersonId;

            return (
              <React.Fragment key={`node-${person.id}`}>
                <Circle
                  cx={pos.x}
                  cy={pos.y}
                  r={NODE_RADIUS * 2}
                  fill={isSelf ? 'url(#selfGlow)' : 'url(#nodeGlow)'}
                />
                <Circle
                  cx={pos.x}
                  cy={pos.y}
                  r={NODE_RADIUS}
                  fill={Colors.background.abyss}
                  stroke={isSelf ? Colors.accent.amber : Colors.graph.nodeCore}
                  strokeWidth={isSelf ? 3 : 2}
                />
                <SvgText
                  x={pos.x}
                  y={pos.y + 5}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight="bold"
                  fill={Colors.text.starlight}
                >
                  {initials}
                </SvgText>
              </React.Fragment>
            );
          })}
            </Svg>

            {/* Clickable node overlays with name labels */}
            {people.map((person) => {
              const pos = positions.get(person.id);
              if (!pos) return null;

              return (
                <Pressable
                  key={`label-${person.id}`}
                  onPress={() => router.push(`/person/${person.id}`)}
                  style={[
                    styles.nodeHitArea,
                    {
                      left: pos.x - 50,
                      top: pos.y - NODE_RADIUS,
                    },
                  ]}
                >
                  <Animated.View entering={FadeIn.delay(100)} style={styles.nodeLabelInner}>
                    {person.avatar_url && avatarUrls.get(person.avatar_url) ? (
                      <Image
                        source={{ uri: avatarUrls.get(person.avatar_url) }}
                        style={styles.nodeAvatar}
                        contentFit="cover"
                        transition={200}
                      />
                    ) : (
                      <View style={{ height: NODE_RADIUS * 2 }} />
                    )}
                    <Text style={styles.nodeName} numberOfLines={1}>
                      {person.first_name}
                    </Text>
                    <Text style={styles.roleTag}>
                      {person.id === selfPersonId ? t('tree.me') : roleLabels.get(person.id) ? translateRole(roleLabels.get(person.id)!) : ''}
                    </Text>
                  </Animated.View>
                </Pressable>
              );
            })}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
      )}
    </StarField>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
    paddingBottom: Spacing.md,
    zIndex: 10,
  },
  canvasContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  title: {
    fontSize: Typography.sizes.h2,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
  },
  subtitle: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: Spacing.xxs,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: Spacing.xl,
  },
  emptyTitle: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    textAlign: 'center',
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  nodeHitArea: {
    position: 'absolute',
    width: 100,
    alignItems: 'center',
  },
  nodeLabelInner: {
    alignItems: 'center',
  },
  nodeAvatar: {
    width: NODE_RADIUS * 2,
    height: NODE_RADIUS * 2,
    borderRadius: NODE_RADIUS,
    borderWidth: 2,
    borderColor: Colors.graph.nodeCore,
  },
  nodeName: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
    textAlign: 'center',
  },
  nodeNickname: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  roleTag: {
    fontSize: 11,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.cyan,
    textAlign: 'center',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 1,
  },
  // ── Header toggle ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    padding: 2,
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: Colors.accent.cyan,
  },
  toggleText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.text.twilight,
  },
  toggleTextActive: {
    color: '#FFFFFF',
  },
  // ── Table view ──
  tableContainer: {
    flex: 1,
  },
  tableContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 100,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tableAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: Spacing.md,
  },
  tableAvatarPlaceholder: {
    backgroundColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableAvatarText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.heading,
    color: '#FFFFFF',
  },
  tableInfo: {
    flex: 1,
  },
  tableName: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
  },
  tableDetail: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: 2,
  },
  tableRole: {
    fontSize: 10,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.accent.cyan,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tableRoleSelf: {
    color: Colors.accent.amber,
  },
});

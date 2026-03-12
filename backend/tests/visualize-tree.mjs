#!/usr/bin/env node
// ============================================================
// Matra — Family Tree Layout Visualizer
// ============================================================
// Reads the debug JSON from test runs (test-unconventional-debug.json
// or test-relationship-extraction-debug.json) and generates an
// interactive HTML file that replicates the EXACT layout algorithm
// from mobile/app/(tabs)/tree.tsx.
//
// Usage:
//   node visualize-tree.mjs                         # uses unconventional debug JSON
//   node visualize-tree.mjs test-relationship-extraction-debug.json
//   node visualize-tree.mjs test-unconventional-debug.json 2 5   # only scenarios 2 & 5
//
// Output: test-tree-visualization.html
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Parse args ──
let debugFile = 'test-unconventional-debug.json';
const scenarioNums = [];
for (const arg of process.argv.slice(2)) {
  if (arg.endsWith('.json')) {
    debugFile = arg;
  } else {
    const n = parseInt(arg);
    if (!isNaN(n)) scenarioNums.push(n);
  }
}

const debugPath = path.join(__dirname, debugFile);
if (!fs.existsSync(debugPath)) {
  console.error(`❌ Debug file not found: ${debugPath}`);
  console.error('   Run a test suite first to generate the debug JSON.');
  process.exit(1);
}

const debugData = JSON.parse(fs.readFileSync(debugPath, 'utf-8'));
let scenarios = debugData.scenarios;
if (scenarioNums.length > 0) {
  scenarios = scenarios.filter((_, i) => scenarioNums.includes(i + 1));
}

console.log(`📋 Loaded ${scenarios.length} scenario(s) from ${debugFile}`);

// ============================================================
// LAYOUT ALGORITHM — Faithful port from tree.tsx
// ============================================================

const NODE_RADIUS = 28;
const HORIZONTAL_SPACING = 140;
const VERTICAL_SPACING = 160;
const COUPLE_GAP = 100;
const PADDING = 80;
const CANVAS_MIN_WIDTH = 800;
const CANVAS_MIN_HEIGHT = 600;

function layoutScenario(scenario) {
  const people = scenario.people || [];
  const rawRels = scenario.relationships || [];

  // The test debug JSON has a different structure than the app.
  // Map test people to app-like people objects.
  const appPeople = people.map(p => ({
    id: p.id,
    first_name: p.firstName,
    last_name: p.lastName || null,
    nickname: p.nickname || null,
    birth_date: p.birthDate || null,
    isNarrator: p.isNarrator || false,
  }));

  // Map test relationships to app-like relationship objects.
  // Test rels have: personAId, personBId, type, personAName, personBName, confidence, inferred
  const appRels = rawRels.map((r, i) => ({
    id: `rel-${i}`,
    person_a_id: r.personAId,
    person_b_id: r.personBId,
    relationship_type: r.type,
    confidence: r.confidence || 0.9,
    verified: !r.inferred,
  }));

  // Find the narrator (selfPersonId)
  const narrator = appPeople.find(p => p.isNarrator);
  const selfPersonId = narrator?.id || null;

  return layoutNodes(appPeople, appRels, selfPersonId);
}

function layoutNodes(people, relationships, selfPersonId) {
  const positions = new Map();
  const roleLabels = new Map();
  const generation = new Map();
  if (people.length === 0) return { positions, roleLabels, generation, width: CANVAS_MIN_WIDTH, height: CANVAS_MIN_HEIGHT };

  const peopleById = new Map(people.map(p => [p.id, p]));

  // Build adjacency
  const childrenOf = new Map();
  const parentOf = new Map();
  const spouseOf = new Map();
  const exSpousePairs = new Set();

  for (const rel of relationships) {
    const a = rel.person_a_id;
    const b = rel.person_b_id;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    const type = rel.relationship_type;

    if (type === 'parent') {
      if (!childrenOf.has(a)) childrenOf.set(a, []);
      childrenOf.get(a).push(b);
      if (!parentOf.has(b)) parentOf.set(b, []);
      parentOf.get(b).push(a);
    } else if (type === 'child') {
      if (!childrenOf.has(b)) childrenOf.set(b, []);
      childrenOf.get(b).push(a);
      if (!parentOf.has(a)) parentOf.set(a, []);
      parentOf.get(a).push(b);
    } else if (type === 'spouse' || type === 'ex_spouse') {
      if (!spouseOf.has(a)) spouseOf.set(a, new Set());
      if (!spouseOf.has(b)) spouseOf.set(b, new Set());
      spouseOf.get(a).add(b);
      spouseOf.get(b).add(a);
      if (type === 'ex_spouse') {
        exSpousePairs.add([a, b].sort().join('|'));
      }
    } else if (type === 'step_parent') {
      if (!childrenOf.has(a)) childrenOf.set(a, []);
      childrenOf.get(a).push(b);
      if (!parentOf.has(b)) parentOf.set(b, []);
      parentOf.get(b).push(a);
    } else if (type === 'step_child') {
      if (!childrenOf.has(b)) childrenOf.set(b, []);
      childrenOf.get(b).push(a);
      if (!parentOf.has(a)) parentOf.set(a, []);
      parentOf.get(a).push(b);
    } else if (type === 'adopted_parent') {
      if (!childrenOf.has(a)) childrenOf.set(a, []);
      childrenOf.get(a).push(b);
      if (!parentOf.has(b)) parentOf.set(b, []);
      parentOf.get(b).push(a);
    } else if (type === 'adopted_child') {
      if (!childrenOf.has(b)) childrenOf.set(b, []);
      childrenOf.get(b).push(a);
      if (!parentOf.has(a)) parentOf.set(a, []);
      parentOf.get(a).push(b);
    }
  }

  // directParentOf tracks only 1-generation parent relationships (parent, step_parent, adopted_parent)
  // Used for sibling propagation — grandparent+ entries must NOT be propagated through siblings.
  const directParentOf = new Map();
  for (const [childId, parents] of parentOf) {
    directParentOf.set(childId, [...parents]);
  }

  // Multi-generation ancestor maps
  const ancestorOf = new Map();
  const descendantParentOf = new Map();
  for (const rel of relationships) {
    const a = rel.person_a_id;
    const b = rel.person_b_id;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    const type = rel.relationship_type;
    let gap = 0, ancestorId = '', descendantId = '';
    if (type === 'grandparent') { gap = 2; ancestorId = a; descendantId = b; }
    else if (type === 'grandchild') { gap = 2; ancestorId = b; descendantId = a; }
    else if (type === 'great_grandparent') { gap = 3; ancestorId = a; descendantId = b; }
    else if (type === 'great_grandchild') { gap = 3; ancestorId = b; descendantId = a; }
    else if (type === 'great_great_grandparent') { gap = 4; ancestorId = a; descendantId = b; }
    else if (type === 'great_great_grandchild') { gap = 4; ancestorId = b; descendantId = a; }
    if (gap > 0) {
      if (!ancestorOf.has(ancestorId)) ancestorOf.set(ancestorId, []);
      ancestorOf.get(ancestorId).push({ descendantId, gap });
      if (!descendantParentOf.has(descendantId)) descendantParentOf.set(descendantId, []);
      descendantParentOf.get(descendantId).push({ ancestorId, gap });
      if (!parentOf.has(descendantId)) parentOf.set(descendantId, []);
      if (!parentOf.get(descendantId).includes(ancestorId)) {
        parentOf.get(descendantId).push(ancestorId);
      }
    }
  }

  // Build sibling adjacency
  const siblingOf = new Map();
  const fullSiblingOf = new Map();
  for (const rel of relationships) {
    const a = rel.person_a_id;
    const b = rel.person_b_id;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    if (['sibling', 'half_sibling', 'step_sibling'].includes(rel.relationship_type)) {
      if (!siblingOf.has(a)) siblingOf.set(a, new Set());
      if (!siblingOf.has(b)) siblingOf.set(b, new Set());
      siblingOf.get(a).add(b);
      siblingOf.get(b).add(a);
    }
    if (rel.relationship_type === 'sibling') {
      if (!fullSiblingOf.has(a)) fullSiblingOf.set(a, new Set());
      if (!fullSiblingOf.has(b)) fullSiblingOf.set(b, new Set());
      fullSiblingOf.get(a).add(b);
      fullSiblingOf.get(b).add(a);
    }
  }

  // Propagate parent through full siblings (only direct/1-gen parents)
  let changed = true;
  while (changed) {
    changed = false;
    for (const [personId, sibs] of fullSiblingOf) {
      for (const sibId of sibs) {
        const sibParents = directParentOf.get(sibId) || [];
        for (const parentId of sibParents) {
          if (!parentOf.has(personId)) parentOf.set(personId, []);
          if (!parentOf.get(personId).includes(parentId)) {
            parentOf.get(personId).push(parentId);
            if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
            if (!childrenOf.get(parentId).includes(personId)) {
              childrenOf.get(parentId).push(personId);
            }
            changed = true;
          }
          // Also update directParentOf for further propagation
          if (!directParentOf.has(personId)) directParentOf.set(personId, []);
          if (!directParentOf.get(personId).includes(parentId)) {
            directParentOf.get(personId).push(parentId);
          }
        }
      }
    }
  }

  // Infer spouse links from step_parent
  for (const rel of relationships) {
    if (rel.relationship_type !== 'step_parent' && rel.relationship_type !== 'step_child') continue;
    const a = rel.person_a_id;
    const b = rel.person_b_id;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    const stepParentId = rel.relationship_type === 'step_parent' ? a : b;
    const childId = rel.relationship_type === 'step_parent' ? b : a;
    const bioParents = (parentOf.get(childId) || []).filter(p => p !== stepParentId);
    for (const bioParentId of bioParents) {
      const existingSpouses = spouseOf.get(bioParentId);
      if (existingSpouses && existingSpouses.has(stepParentId)) continue;
      if (!spouseOf.has(bioParentId)) spouseOf.set(bioParentId, new Set());
      if (!spouseOf.has(stepParentId)) spouseOf.set(stepParentId, new Set());
      spouseOf.get(bioParentId).add(stepParentId);
      spouseOf.get(stepParentId).add(bioParentId);
    }
  }

  // ── Generation assignment via BFS ──
  const visited = new Set();
  const GEN_OFFSET_A = {
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

  const adjList = new Map();
  const addAdj = (from, to, offset) => {
    if (!adjList.has(from)) adjList.set(from, []);
    adjList.get(from).push({ targetId: to, offset });
  };
  for (const rel of relationships) {
    const a = rel.person_a_id;
    const b = rel.person_b_id;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    const off = GEN_OFFSET_A[rel.relationship_type] ?? 0;
    addAdj(b, a, off);
    addAdj(a, b, -off);
  }

  const startNode = selfPersonId && peopleById.has(selfPersonId) ? selfPersonId : null;
  if (startNode) {
    const queue = [{ id: startNode, gen: 0 }];
    visited.add(startNode);
    while (queue.length > 0) {
      const { id, gen } = queue.shift();
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

  // Handle unvisited
  for (const p of people) {
    if (visited.has(p.id)) continue;
    const neighbors = adjList.get(p.id) || [];
    const placedNeighbor = neighbors.find(n => generation.has(n.targetId));
    if (placedNeighbor) {
      const queue = [{
        id: p.id,
        gen: generation.get(placedNeighbor.targetId) + placedNeighbor.offset,
      }];
      visited.add(p.id);
      while (queue.length > 0) {
        const { id, gen } = queue.shift();
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

  // Shift so min gen = 0
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
  const genGroups = new Map();
  for (const [personId, gen] of generation) {
    if (!genGroups.has(gen)) genGroups.set(gen, []);
    genGroups.get(gen).push(personId);
  }
  const sortedGens = [...genGroups.keys()].sort((a, b) => a - b);

  let maxRowWidth = 0;

  function buildUnits(ids) {
    const placed = new Set();
    const units = [];
    for (const personId of ids) {
      if (placed.has(personId)) continue;
      const spouses = spouseOf.get(personId);
      const spousesInRow = spouses
        ? [...spouses].filter(s => ids.includes(s) && !placed.has(s))
        : [];

      if (spousesInRow.length >= 2) {
        placed.add(personId);
        const exes = [];
        const currents = [];
        for (const sp of spousesInRow) {
          placed.add(sp);
          const pairKey = [personId, sp].sort().join('|');
          if (exSpousePairs.has(pairKey)) exes.push(sp);
          else currents.push(sp);
        }
        const unitIds = [...exes, personId, ...currents];
        if (exes.length === 0 && currents.length >= 2) {
          const mid = Math.floor(currents.length / 2);
          unitIds.length = 0;
          unitIds.push(...currents.slice(0, mid), personId, ...currents.slice(mid));
        }
        units.push({ ids: unitIds, width: (unitIds.length - 1) * COUPLE_GAP });
      } else if (spousesInRow.length === 1) {
        const spouseInRow = spousesInRow[0];
        placed.add(personId);
        placed.add(spouseInRow);
        const personHasSib = siblingOf.get(personId)?.size
          ? [...siblingOf.get(personId)].some(s => ids.includes(s))
          : false;
        const spouseHasSib = siblingOf.get(spouseInRow)?.size
          ? [...siblingOf.get(spouseInRow)].some(s => ids.includes(s))
          : false;
        if (personHasSib && !spouseHasSib) {
          units.push({ ids: [spouseInRow, personId], width: COUPLE_GAP });
        } else {
          units.push({ ids: [personId, spouseInRow], width: COUPLE_GAP });
        }
      } else {
        placed.add(personId);
        units.push({ ids: [personId], width: 0 });
      }
    }
    return units;
  }

  for (let gi = 0; gi < sortedGens.length; gi++) {
    const gen = sortedGens[gi];
    const row = genGroups.get(gen);
    const minGenForY = sortedGens[0];
    const y = PADDING + (gen - minGenForY) * VERTICAL_SPACING;

    if (gi === 0) {
      const units = buildUnits(row);
      const totalWidth = units.reduce((sum, u) => sum + u.width, 0) +
        (units.length - 1) * HORIZONTAL_SPACING;
      maxRowWidth = Math.max(maxRowWidth, totalWidth);

      let x = PADDING + (Math.max(maxRowWidth, CANVAS_MIN_WIDTH) - totalWidth) / 2;
      for (const unit of units) {
        for (let i = 0; i < unit.ids.length; i++) {
          positions.set(unit.ids[i], { x: x + i * COUPLE_GAP, y });
        }
        x += unit.width + HORIZONTAL_SPACING;
      }
      continue;
    }

    const parentUnitMap = new Map();
    const orphans = [];

    for (const childId of row) {
      const parents = parentOf.get(childId) || [];
      const positionedParent = parents.find(p => positions.has(p));
      if (positionedParent) {
        const spouse = spouseOf.get(positionedParent);
        const spouseId = spouse ? [...spouse].find(s => positions.has(s)) : null;
        const key = spouseId
          ? [positionedParent, spouseId].sort().join('|')
          : positionedParent;
        if (!parentUnitMap.has(key)) parentUnitMap.set(key, []);
        parentUnitMap.get(key).push(childId);
      } else {
        orphans.push(childId);
      }
    }

    const remainingOrphans = [];
    for (const orphanId of orphans) {
      const sibs = siblingOf.get(orphanId);
      let placed = false;
      if (sibs) {
        for (const sibId of sibs) {
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
      if (!placed) {
        const spouses = spouseOf.get(orphanId);
        if (spouses) {
          for (const spId of spouses) {
            for (const [key, children] of parentUnitMap) {
              if (children.includes(spId)) {
                children.push(orphanId);
                placed = true;
                break;
              }
            }
            if (placed) break;
          }
        }
      }
      if (!placed) remainingOrphans.push(orphanId);
    }

    const sortedParentKeys = [...parentUnitMap.keys()].sort((a, b) => {
      const aIds = a.split('|');
      const bIds = b.split('|');
      const aX = Math.min(...aIds.map(id => positions.get(id)?.x ?? 0));
      const bX = Math.min(...bIds.map(id => positions.get(id)?.x ?? 0));
      return aX - bX;
    });

    const groupPlacements = [];

    for (const key of sortedParentKeys) {
      const groupChildren = parentUnitMap.get(key);
      const groupUnits = buildUnits(groupChildren);

      const parentIds = key.split('|');
      const parentXs = parentIds.map(id => positions.get(id)?.x ?? 0);
      const parentCenterX = parentXs.reduce((a, b) => a + b, 0) / parentXs.length;

      const groupTotalWidth = groupUnits.reduce((sum, u) => sum + u.width, 0) +
        (groupUnits.length - 1) * HORIZONTAL_SPACING;

      let gx = parentCenterX - groupTotalWidth / 2;
      const placed = [];
      for (const unit of groupUnits) {
        placed.push({ ids: unit.ids, width: unit.width, x: gx });
        gx += unit.width + HORIZONTAL_SPACING;
      }
      groupPlacements.push(placed);
    }

    if (remainingOrphans.length > 0) {
      const orphanUnits = buildUnits(remainingOrphans);
      let ox = PADDING;
      const placed = [];
      for (const unit of orphanUnits) {
        placed.push({ ids: unit.ids, width: unit.width, x: ox });
        ox += unit.width + HORIZONTAL_SPACING;
      }
      groupPlacements.push(placed);
    }

    // Resolve overlaps
    for (let g = 0; g < groupPlacements.length; g++) {
      const group = groupPlacements[g];
      if (group.length > 0 && group[0].x < PADDING) {
        const shift = PADDING - group[0].x;
        for (const pu of group) pu.x += shift;
      }
      if (g === 0) continue;
      const prevGroup = groupPlacements[g - 1];
      const prevLast = prevGroup[prevGroup.length - 1];
      const prevRightEdge = prevLast.x + prevLast.width;
      const minX = prevRightEdge + HORIZONTAL_SPACING;
      if (group[0].x < minX) {
        const shift = minX - group[0].x;
        for (const pu of group) pu.x += shift;
      }
    }

    // Apply positions
    let rowWidth = 0;
    for (const group of groupPlacements) {
      for (const pu of group) {
        for (let i = 0; i < pu.ids.length; i++) {
          positions.set(pu.ids[i], { x: pu.x + i * COUPLE_GAP, y });
        }
        rowWidth = Math.max(rowWidth, pu.x + pu.width);
      }
    }

    // Post-pass: shift single parents to center above children
    for (const key of sortedParentKeys) {
      const parentIds = key.split('|');
      if (parentIds.length !== 1) continue;
      const parentId = parentIds[0];
      const parentPos = positions.get(parentId);
      if (!parentPos) continue;
      const children = parentUnitMap.get(key);
      const childXs = children.map(c => positions.get(c)?.x ?? 0);
      if (childXs.length === 0) continue;
      const childCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
      if (childCenter > parentPos.x) {
        parentPos.x = childCenter;
      }
    }

    maxRowWidth = Math.max(maxRowWidth, rowWidth + PADDING);
  }

  // Bottom-up re-centering
  for (let gi = sortedGens.length - 2; gi >= 0; gi--) {
    const gen = sortedGens[gi];
    const row = genGroups.get(gen);
    for (const personId of row) {
      const kids = childrenOf.get(personId);
      if (!kids || kids.length === 0) continue;
      const pos = positions.get(personId);
      if (!pos) continue;
      const kidXs = kids.map(c => positions.get(c)?.x).filter(x => x !== undefined);
      if (kidXs.length === 0) continue;
      const spouses = spouseOf.get(personId);
      const spouseInRow = spouses ? [...spouses].find(s => row.includes(s) && positions.has(s)) : null;
      const childCenter = (Math.min(...kidXs) + Math.max(...kidXs)) / 2;
      if (spouseInRow) {
        const spousePos = positions.get(spouseInRow);
        const coupleCenter = (Math.min(pos.x, spousePos.x) + Math.max(pos.x, spousePos.x)) / 2;
        const shift = childCenter - coupleCenter;
        if (shift > 0) {
          pos.x += shift;
          spousePos.x += shift;
        }
      } else {
        if (childCenter > pos.x) {
          pos.x = childCenter;
        }
      }
    }
  }

  // Post-layout overlap deconfliction: sort each row by x and push apart overlapping nodes
  const MIN_NODE_DISTANCE = NODE_RADIUS * 2 + 20;
  for (const gen of sortedGens) {
    const row = genGroups.get(gen);
    const rowNodes = row
      .map(id => ({ id, pos: positions.get(id) }))
      .filter(n => n.pos)
      .sort((a, b) => a.pos.x - b.pos.x);
    for (let i = 1; i < rowNodes.length; i++) {
      const gap = rowNodes[i].pos.x - rowNodes[i - 1].pos.x;
      if (gap < MIN_NODE_DISTANCE) {
        const push = MIN_NODE_DISTANCE - gap;
        for (let j = i; j < rowNodes.length; j++) {
          rowNodes[j].pos.x += push;
        }
      }
    }
  }

  // Compute canvas dimensions
  let actualMaxX = 0, actualMaxY = 0;
  for (const pos of positions.values()) {
    if (pos.x > actualMaxX) actualMaxX = pos.x;
    if (pos.y > actualMaxY) actualMaxY = pos.y;
  }
  const genRange = sortedGens.length > 0 ? (sortedGens[sortedGens.length - 1] - sortedGens[0] + 1) : 1;
  const graphWidth = Math.max(actualMaxX + PADDING * 3, maxRowWidth + PADDING * 2, CANVAS_MIN_WIDTH);
  const graphHeight = Math.max(actualMaxY + PADDING * 3, PADDING * 2 + genRange * VERTICAL_SPACING, CANVAS_MIN_HEIGHT);

  // Role labels
  const inverseLabel = {
    parent: 'Child', child: 'Parent', spouse: 'Spouse', ex_spouse: 'Ex-Spouse',
    sibling: 'Sibling', step_sibling: 'Step Sib', half_sibling: 'Half Sib',
    grandparent: 'Grandchild', grandchild: 'Grandparent',
    great_grandparent: 'Gt-Grandchild', great_grandchild: 'Gt-Grandparent',
    uncle_aunt: 'Nephew/Niece', nephew_niece: 'Uncle/Aunt', cousin: 'Cousin',
    in_law: 'In-law', parent_in_law: 'Child-in-law', child_in_law: 'Parent-in-law',
    step_parent: 'Step Child', step_child: 'Step Parent',
    adopted_parent: 'Adopted Child', adopted_child: 'Adopted Parent',
    godparent: 'Godchild', godchild: 'Godparent',
  };
  const directLabel = {
    parent: 'Parent', child: 'Child', spouse: 'Spouse', ex_spouse: 'Ex-Spouse',
    sibling: 'Sibling', step_sibling: 'Step Sib', half_sibling: 'Half Sib',
    grandparent: 'Grandparent', grandchild: 'Grandchild',
    great_grandparent: 'Gt-Grandparent', great_grandchild: 'Gt-Grandchild',
    uncle_aunt: 'Uncle/Aunt', nephew_niece: 'Nephew/Niece', cousin: 'Cousin',
    in_law: 'In-law', parent_in_law: 'Parent-in-law', child_in_law: 'Child-in-law',
    step_parent: 'Step Parent', step_child: 'Step Child',
    adopted_parent: 'Adopted Parent', adopted_child: 'Adopted Child',
    godparent: 'Godparent', godchild: 'Godchild',
  };

  if (selfPersonId) {
    for (const rel of relationships) {
      const type = rel.relationship_type;
      if (rel.person_a_id === selfPersonId && rel.person_b_id !== selfPersonId) {
        const label = inverseLabel[type];
        if (label && !roleLabels.has(rel.person_b_id)) roleLabels.set(rel.person_b_id, label);
      } else if (rel.person_b_id === selfPersonId && rel.person_a_id !== selfPersonId) {
        const label = directLabel[type];
        if (label && !roleLabels.has(rel.person_a_id)) roleLabels.set(rel.person_a_id, label);
      }
    }
    roleLabels.set(selfPersonId, 'Me');
  }

  return {
    positions,
    roleLabels,
    generation,
    width: graphWidth,
    height: graphHeight,
    people,
    relationships,
    selfPersonId,
  };
}

// ============================================================
// HTML GENERATION
// ============================================================

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateSVG(layout) {
  const { positions, roleLabels, generation, width, height, people, relationships, selfPersonId } = layout;
  const peopleById = new Map(people.map(p => [p.id, p]));

  let svg = '';

  // Defs
  svg += `<defs>
    <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00bcd4" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#00bcd4" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="selfGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffc107" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#ffc107" stop-opacity="0"/>
    </radialGradient>
  </defs>\n`;

  // ── Draw edges ──

  // Parent-child edges (elbow connectors)
  for (const rel of relationships) {
    const posA = positions.get(rel.person_a_id);
    const posB = positions.get(rel.person_b_id);
    if (!posA || !posB) continue;

    const type = rel.relationship_type;
    const verified = rel.verified;
    const color = verified ? '#4dd0e1' : 'rgba(255,255,255,0.3)';
    const sw = verified ? 2 : 1;
    const dash = verified ? '' : 'stroke-dasharray="4 4"';

    if (type === 'spouse') {
      const leftX = Math.min(posA.x, posB.x) + NODE_RADIUS;
      const rightX = Math.max(posA.x, posB.x) - NODE_RADIUS;
      svg += `<line x1="${leftX}" y1="${posA.y}" x2="${rightX}" y2="${posB.y}" stroke="#ffc107" stroke-width="2" ${dash}/>\n`;
      continue;
    }

    if (type === 'ex_spouse') {
      const leftX = Math.min(posA.x, posB.x) + NODE_RADIUS;
      const rightX = Math.max(posA.x, posB.x) - NODE_RADIUS;
      svg += `<line x1="${leftX}" y1="${posA.y}" x2="${rightX}" y2="${posB.y}" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="6 4"/>\n`;
      continue;
    }

    if (type === 'sibling' || type === 'half_sibling' || type === 'step_sibling') {
      continue; // drawn separately
    }

    const ancestorTypes = ['parent', 'child', 'grandparent', 'grandchild',
      'great_grandparent', 'great_grandchild', 'great_great_grandparent', 'great_great_grandchild',
      'step_parent', 'step_child', 'adopted_parent', 'adopted_child'];
    if (!ancestorTypes.includes(type)) continue;

    // Skip multi-gen if bridge exists
    if (type !== 'parent' && type !== 'child' && type !== 'step_parent' && type !== 'step_child' && type !== 'adopted_parent' && type !== 'adopted_child') {
      const genA = generation.get(rel.person_a_id) ?? 0;
      const genB = generation.get(rel.person_b_id) ?? 0;
      const minG = Math.min(genA, genB);
      const maxG = Math.max(genA, genB);
      const hasBridge = relationships.some(r2 => {
        if (r2 === rel) return false;
        const otherId = r2.person_a_id === rel.person_a_id || r2.person_a_id === rel.person_b_id
          ? r2.person_b_id
          : r2.person_b_id === rel.person_a_id || r2.person_b_id === rel.person_b_id
            ? r2.person_a_id
            : null;
        if (!otherId) return false;
        const otherGen = generation.get(otherId) ?? -999;
        return otherGen > minG && otherGen < maxG;
      });
      if (hasBridge) continue;
    }

    const parent = posA.y < posB.y ? posA : posB;
    const child = posA.y < posB.y ? posB : posA;
    const midY = parent.y + (child.y - parent.y) / 2;
    svg += `<path d="M ${parent.x} ${parent.y + NODE_RADIUS} L ${parent.x} ${midY} L ${child.x} ${midY} L ${child.x} ${child.y - NODE_RADIUS}" stroke="${color}" stroke-width="${sw}" ${dash} fill="none"/>\n`;
  }

  // Sibling lines
  for (const rel of relationships) {
    if (!['sibling', 'half_sibling', 'step_sibling'].includes(rel.relationship_type)) continue;
    const posA = positions.get(rel.person_a_id);
    const posB = positions.get(rel.person_b_id);
    if (!posA || !posB) continue;
    const leftX = Math.min(posA.x, posB.x) + NODE_RADIUS;
    const rightX = Math.max(posA.x, posB.x) - NODE_RADIUS;
    if (leftX >= rightX) continue;
    const dashAttr = (rel.relationship_type === 'half_sibling' || rel.relationship_type === 'step_sibling')
      ? 'stroke-dasharray="6 3"' : '';
    svg += `<line x1="${leftX}" y1="${posA.y}" x2="${rightX}" y2="${posB.y}" stroke="#00bcd4" stroke-width="1.5" ${dashAttr} opacity="0.7"/>\n`;
  }

  // ── Draw nodes ──
  for (const person of people) {
    const pos = positions.get(person.id);
    if (!pos) continue;
    const isSelf = person.id === selfPersonId;
    const initials = (person.first_name?.[0] || '') + (person.last_name?.[0] || '');
    const role = roleLabels.get(person.id) || '';
    const name = person.first_name + (person.last_name ? ' ' + person.last_name : '');
    const gen = generation.get(person.id) ?? 0;

    // Glow
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${NODE_RADIUS * 2}" fill="url(#${isSelf ? 'selfGlow' : 'nodeGlow'})"/>\n`;
    // Core circle
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${NODE_RADIUS}" fill="#0a0e14" stroke="${isSelf ? '#ffc107' : '#4dd0e1'}" stroke-width="${isSelf ? 3 : 2}"/>\n`;
    // Initials
    svg += `<text x="${pos.x}" y="${pos.y + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="#e8eaed">${escapeHtml(initials)}</text>\n`;

    // Name label below
    svg += `<text x="${pos.x}" y="${pos.y + NODE_RADIUS + 18}" text-anchor="middle" font-size="12" fill="#e8eaed">${escapeHtml(person.first_name)}</text>\n`;

    // Role tag
    if (role) {
      const roleColor = isSelf ? '#ffc107' : '#4dd0e1';
      svg += `<text x="${pos.x}" y="${pos.y + NODE_RADIUS + 32}" text-anchor="middle" font-size="9" fill="${roleColor}" font-weight="600" text-transform="uppercase">${escapeHtml(role)}</text>\n`;
    }

    // Generation indicator (small)
    svg += `<text x="${pos.x}" y="${pos.y - NODE_RADIUS - 6}" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.3)">Gen ${gen}</text>\n`;
  }

  return svg;
}

function detectOverlaps(layout) {
  const { positions, people } = layout;
  const issues = [];
  const personNames = new Map(people.map(p => [p.id, p.first_name + (p.last_name ? ' ' + p.last_name : '')]));

  const positioned = [...positions.entries()];
  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      const [idA, posA] = positioned[i];
      const [idB, posB] = positioned[j];
      const dx = Math.abs(posA.x - posB.x);
      const dy = Math.abs(posA.y - posB.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = NODE_RADIUS * 2 + 10; // nodes should be at least this far apart

      if (dist < minDist) {
        issues.push({
          type: 'overlap',
          severity: dist < NODE_RADIUS ? 'critical' : 'warning',
          message: `${personNames.get(idA)} and ${personNames.get(idB)} overlap (distance: ${dist.toFixed(0)}px, min: ${minDist}px)`,
          personA: personNames.get(idA),
          personB: personNames.get(idB),
          posA,
          posB,
          distance: dist,
        });
      }
    }
  }

  // Check vertical alignment — people in same generation should have same Y
  const genYMap = new Map(); // gen → expected Y
  for (const [personId, pos] of positions) {
    const gen = layout.generation.get(personId);
    if (gen === undefined) continue;
    if (!genYMap.has(gen)) genYMap.set(gen, pos.y);
    else if (Math.abs(genYMap.get(gen) - pos.y) > 1) {
      issues.push({
        type: 'vertical_misalignment',
        severity: 'warning',
        message: `${personNames.get(personId)} at Gen ${gen} has y=${pos.y.toFixed(0)} but expected y=${genYMap.get(gen).toFixed(0)}`,
        personId,
      });
    }
  }

  return issues;
}

function generateHTML(allLayouts) {
  let scenarioTabs = '';
  let scenarioPanels = '';

  for (let i = 0; i < allLayouts.length; i++) {
    const { layout, scenario, issues } = allLayouts[i];
    const hasIssues = issues.some(iss => iss.severity === 'critical');
    const hasWarnings = issues.length > 0;
    const icon = hasIssues ? '❌' : hasWarnings ? '⚠️' : '✅';
    const scenarioName = scenario.name;

    scenarioTabs += `<button class="tab ${i === 0 ? 'active' : ''}" onclick="showScenario(${i})" id="tab-${i}">${icon} ${escapeHtml(scenarioName)}</button>\n`;

    const issuesList = issues.length > 0
      ? `<div class="issues">${issues.map(iss =>
          `<div class="issue ${iss.severity}">${escapeHtml(iss.message)}</div>`
        ).join('')}</div>`
      : '<div class="no-issues">✅ No overlaps or alignment issues detected</div>';

    // Build data table
    let dataTable = '<table class="data-table"><tr><th>Person</th><th>Gen</th><th>X</th><th>Y</th><th>Role</th></tr>';
    const people = layout.people;
    for (const p of people) {
      const pos = layout.positions.get(p.id);
      if (!pos) continue;
      const gen = layout.generation.get(p.id) ?? '?';
      const role = layout.roleLabels.get(p.id) || '';
      const isSelf = p.id === layout.selfPersonId;
      const name = p.first_name + (p.last_name ? ' ' + p.last_name : '');
      dataTable += `<tr class="${isSelf ? 'self-row' : ''}"><td>${escapeHtml(name)}</td><td>${gen}</td><td>${pos.x.toFixed(0)}</td><td>${pos.y.toFixed(0)}</td><td>${escapeHtml(role)}</td></tr>`;
    }
    dataTable += '</table>';

    // Relationship list
    let relList = '<table class="data-table"><tr><th>Person A</th><th>→</th><th>Person B</th><th>Type</th><th>Source</th></tr>';
    for (const rel of layout.relationships) {
      const pA = people.find(p => p.id === rel.person_a_id);
      const pB = people.find(p => p.id === rel.person_b_id);
      if (!pA || !pB) continue;
      relList += `<tr><td>${escapeHtml(pA.first_name)}</td><td>→</td><td>${escapeHtml(pB.first_name)}</td><td><code>${escapeHtml(rel.relationship_type)}</code></td><td>${rel.verified ? 'Direct' : 'Inferred'}</td></tr>`;
    }
    relList += '</table>';

    const svgContent = generateSVG(layout);

    scenarioPanels += `
    <div class="scenario-panel ${i === 0 ? 'active' : ''}" id="panel-${i}">
      <h2>${escapeHtml(scenarioName)}</h2>
      <div class="stats">
        <span class="stat">${people.length} people</span>
        <span class="stat">${layout.relationships.length} relationships</span>
        <span class="stat">${issues.length} issues</span>
        <span class="stat">Canvas: ${layout.width.toFixed(0)} × ${layout.height.toFixed(0)}</span>
      </div>
      ${issuesList}
      <div class="svg-container" id="svg-container-${i}">
        <svg width="${layout.width}" height="${layout.height}" xmlns="http://www.w3.org/2000/svg" style="background: #0a0e14;">
          ${svgContent}
        </svg>
      </div>
      <div class="controls">
        <button onclick="zoomIn(${i})">🔍+</button>
        <button onclick="zoomOut(${i})">🔍−</button>
        <button onclick="resetZoom(${i})">↺ Reset</button>
        <button onclick="toggleGrid(${i})">⊞ Grid</button>
      </div>
      <details class="details-section">
        <summary>📊 Position Data</summary>
        ${dataTable}
      </details>
      <details class="details-section">
        <summary>🔗 Relationships (${layout.relationships.length})</summary>
        ${relList}
      </details>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Matra — Tree Layout Visualizer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #e8eaed;
      min-height: 100vh;
    }
    h1 { padding: 20px 24px 8px; font-size: 22px; color: #ffc107; }
    h1 span { color: #4dd0e1; font-weight: 400; font-size: 14px; margin-left: 12px; }
    h2 { font-size: 16px; margin-bottom: 12px; color: #e8eaed; }

    .tabs {
      display: flex;
      gap: 4px;
      padding: 8px 24px;
      overflow-x: auto;
      border-bottom: 1px solid #1e2530;
      flex-wrap: wrap;
    }
    .tab {
      background: #161b22;
      color: #8b949e;
      border: 1px solid #30363d;
      border-radius: 8px 8px 0 0;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
      transition: all 0.2s;
    }
    .tab:hover { background: #1e2530; color: #e8eaed; }
    .tab.active { background: #1e2530; color: #ffc107; border-bottom-color: #1e2530; }

    .scenario-panel { display: none; padding: 20px 24px; }
    .scenario-panel.active { display: block; }

    .stats {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .stat {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      color: #4dd0e1;
    }

    .issues { margin-bottom: 16px; }
    .issue {
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 4px;
      font-size: 12px;
    }
    .issue.critical { background: rgba(255, 0, 0, 0.15); border: 1px solid #f44336; color: #ef9a9a; }
    .issue.warning { background: rgba(255, 193, 7, 0.1); border: 1px solid #ffc107; color: #ffe082; }
    .no-issues {
      background: rgba(76, 175, 80, 0.1);
      border: 1px solid #4caf50;
      color: #a5d6a7;
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 12px;
    }

    .svg-container {
      overflow: auto;
      border: 1px solid #30363d;
      border-radius: 8px;
      background: #0a0e14;
      margin-bottom: 12px;
      position: relative;
      max-height: 70vh;
      cursor: grab;
    }
    .svg-container:active { cursor: grabbing; }
    .svg-container svg { display: block; transform-origin: 0 0; transition: transform 0.1s ease-out; }

    .controls {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .controls button {
      background: #161b22;
      border: 1px solid #30363d;
      color: #e8eaed;
      border-radius: 6px;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }
    .controls button:hover { background: #1e2530; border-color: #4dd0e1; }

    .details-section {
      margin-bottom: 12px;
    }
    .details-section summary {
      cursor: pointer;
      padding: 8px 12px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      font-size: 13px;
      color: #8b949e;
      transition: all 0.15s;
    }
    .details-section summary:hover { color: #e8eaed; }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 12px;
    }
    .data-table th {
      background: #161b22;
      color: #4dd0e1;
      padding: 6px 10px;
      text-align: left;
      border-bottom: 1px solid #30363d;
    }
    .data-table td {
      padding: 5px 10px;
      border-bottom: 1px solid #1e2530;
    }
    .data-table code {
      background: #1e2530;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      color: #ffc107;
    }
    .self-row { background: rgba(255, 193, 7, 0.08); }
    .self-row td { color: #ffc107; }

    /* Grid overlay */
    .grid-overlay {
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      display: none;
    }
    .grid-overlay.visible { display: block; }
  </style>
</head>
<body>
  <h1>🌳 Matra Tree Visualizer <span>${allLayouts.length} scenario${allLayouts.length !== 1 ? 's' : ''} · ${debugFile}</span></h1>
  <div class="tabs">
    ${scenarioTabs}
  </div>
  ${scenarioPanels}

  <script>
    const scales = {};
    const gridVisible = {};

    function showScenario(idx) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.scenario-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-' + idx).classList.add('active');
      document.getElementById('panel-' + idx).classList.add('active');
    }

    function getScale(idx) {
      if (!scales[idx]) scales[idx] = 1;
      return scales[idx];
    }

    function applyScale(idx) {
      const container = document.getElementById('svg-container-' + idx);
      const svg = container?.querySelector('svg');
      if (svg) svg.style.transform = 'scale(' + getScale(idx) + ')';
    }

    function zoomIn(idx) {
      scales[idx] = Math.min((scales[idx] || 1) * 1.3, 4);
      applyScale(idx);
    }

    function zoomOut(idx) {
      scales[idx] = Math.max((scales[idx] || 1) / 1.3, 0.2);
      applyScale(idx);
    }

    function resetZoom(idx) {
      scales[idx] = 1;
      applyScale(idx);
    }

    function toggleGrid(idx) {
      const container = document.getElementById('svg-container-' + idx);
      const svg = container?.querySelector('svg');
      if (!svg) return;

      let grid = svg.querySelector('.grid-lines');
      if (grid) {
        grid.style.display = grid.style.display === 'none' ? 'block' : 'none';
        return;
      }

      // Create grid
      const w = parseInt(svg.getAttribute('width'));
      const h = parseInt(svg.getAttribute('height'));
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'grid-lines');

      for (let x = ${PADDING}; x < w; x += ${VERTICAL_SPACING}) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x); line.setAttribute('y1', 0);
        line.setAttribute('x2', x); line.setAttribute('y2', h);
        line.setAttribute('stroke', 'rgba(255,255,255,0.05)');
        line.setAttribute('stroke-width', '1');
        g.appendChild(line);
      }
      for (let y = ${PADDING}; y < h; y += ${VERTICAL_SPACING}) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', 0); line.setAttribute('y1', y);
        line.setAttribute('x2', w); line.setAttribute('y2', y);
        line.setAttribute('stroke', 'rgba(255,255,255,0.05)');
        line.setAttribute('stroke-width', '1');
        g.appendChild(line);

        // Gen label
        const gen = (y - ${PADDING}) / ${VERTICAL_SPACING};
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '10');
        text.setAttribute('y', y + 4);
        text.setAttribute('fill', 'rgba(255,255,255,0.2)');
        text.setAttribute('font-size', '10');
        text.textContent = 'Gen ' + gen;
        g.appendChild(text);
      }

      svg.insertBefore(g, svg.firstChild);
    }

    // Scroll wheel zoom
    document.querySelectorAll('.svg-container').forEach((container, idx) => {
      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        scales[idx] = Math.min(Math.max((scales[idx] || 1) * delta, 0.2), 4);
        applyScale(idx);
      }, { passive: false });
    });
  </script>
</body>
</html>`;
}

// ============================================================
// MAIN
// ============================================================

const allLayouts = [];

for (let i = 0; i < scenarios.length; i++) {
  const scenario = scenarios[i];
  console.log(`  🌳 Laying out: ${scenario.name}`);

  const layout = layoutScenario(scenario);
  const issues = detectOverlaps(layout);

  if (issues.length > 0) {
    for (const iss of issues) {
      const icon = iss.severity === 'critical' ? '❌' : '⚠️';
      console.log(`     ${icon} ${iss.message}`);
    }
  } else {
    console.log(`     ✅ No overlaps or alignment issues`);
  }

  allLayouts.push({ layout, scenario, issues });
}

const html = generateHTML(allLayouts);
const outputPath = path.join(__dirname, 'test-tree-visualization.html');
fs.writeFileSync(outputPath, html, 'utf-8');

console.log(`\n✅ HTML visualization written to: ${outputPath}`);
console.log(`   Open in browser to inspect layouts.\n`);

// Summary
const totalIssues = allLayouts.reduce((sum, l) => sum + l.issues.length, 0);
const criticalIssues = allLayouts.reduce((sum, l) => sum + l.issues.filter(i => i.severity === 'critical').length, 0);
if (totalIssues === 0) {
  console.log('🎉 All scenarios have clean layouts — no overlaps detected!\n');
} else {
  console.log(`⚠️  ${totalIssues} issue(s) found (${criticalIssues} critical)\n`);
}

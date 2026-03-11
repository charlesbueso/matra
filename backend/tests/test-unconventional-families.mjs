#!/usr/bin/env node
// ============================================================
// Matra — Unconventional Families & Transcripts Test Suite
// ============================================================
// Run: node test-unconventional-families.mjs
//
// Tests the AI model with non-traditional family structures,
// messy transcripts, code-switching, self-corrections, and
// edge cases that real users will produce.
//
// 8 Test scenarios:
//   1. EN — Same-sex mothers, sperm donor, surrogacy
//   2. ES — Single mom, absent father, raised by grandparents
//   3. EN — Rambling, self-correcting, chaotic transcript
//   4. ES/EN — Spanglish code-switching mid-sentence
//   5. EN — Triple-divorce blended chaos ("my mom's ex's kids")
//   6. EN — Foster care, multiple placements, bio vs legal
//   7. ES — Informal slang-heavy Mexican Spanish (neta, morro, jefa)
//   8. EN — Non-linear storytelling, time jumps, unreliable narrator
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env from .env.local ──
for (const envDir of [__dirname, path.join(__dirname, '..')]) {
  const envFile = path.join(envDir, '.env.local');
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        process.env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
      }
    }
    break;
  }
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!GROQ_API_KEY && !OPENAI_API_KEY) {
  console.error('❌ No API keys found. Set GROQ_API_KEY or OPENAI_API_KEY in .env.local');
  process.exit(1);
}

// ============================================================
// EXTRACTION PROMPT (mirrored from backend _shared/ai/prompts.ts)
// ============================================================

function languageInstruction(language) {
  if (!language || language === 'en') return '';
  const langNames = { es: 'Spanish' };
  const name = langNames[language] || language;
  return `\n\nIMPORTANT: Generate ALL output text (summaries, stories, biographies, titles, descriptions) in ${name}. Field names/keys in the JSON must remain in English, but all human-readable string values must be in ${name}.`;
}

// Import the prompt from the main test file to keep them in sync
import { readFileSync } from 'fs';
const mainTestFile = readFileSync(path.join(__dirname, 'test-relationship-extraction.mjs'), 'utf-8');
const promptMatch = mainTestFile.match(/const EXTRACTION_PROMPT = `([\s\S]*?)`;/);
let EXTRACTION_PROMPT;
if (promptMatch) {
  EXTRACTION_PROMPT = promptMatch[1];
} else {
  console.error('❌ Could not extract EXTRACTION_PROMPT from main test file — falling back to inline');
  process.exit(1);
}

// ============================================================
// AI API Calls
// ============================================================

async function callGroq(systemPrompt, userMessage) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Groq error: ${JSON.stringify(json)}`);
  return JSON.parse(json.choices[0].message.content);
}

async function callOpenAI(systemPrompt, userMessage) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI error: ${JSON.stringify(json)}`);
  return JSON.parse(json.choices[0].message.content);
}

async function callLLM(systemPrompt, userMessage) {
  if (GROQ_API_KEY) return callGroq(systemPrompt, userMessage);
  return callOpenAI(systemPrompt, userMessage);
}

// ============================================================
// UTILITIES
// ============================================================

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function stripHonorifics(name) {
  return (name || '')
    .replace(/^(Don|Doña|Dona|Señor|Señora|Sr\.|Sra\.|Mr\.|Mrs\.|Ms\.|Miss|Sir|Dame|Dr\.|Prof\.)\s+/i, '')
    .trim();
}

function newResults() {
  return { passed: 0, failed: 0, warnings: 0, errors: [], warns: [], currentSection: '' };
}
function section(R, name) { R.currentSection = name; }
function assert(R, condition, msg) {
  if (condition) R.passed++;
  else { R.failed++; R.errors.push(`[${R.currentSection}] ${msg}`); }
}
function warn(R, condition, msg) {
  if (condition) R.passed++;
  else { R.warnings++; R.warns.push(`[${R.currentSection}] ${msg}`); }
}

function uniquePeople(resolvedMap) {
  return [...new Map([...resolvedMap].map(([, v]) => [v.id, v])).values()];
}

function hasRelOfType(rels, type) {
  return rels.some(r => r.type === type);
}

function hasRel(rels, personAFirst, personBFirst, type) {
  const a = normalize(personAFirst);
  const b = normalize(personBFirst);
  return rels.some(r => {
    const ra = normalize((r.personAName || '').split(' ')[0]);
    const rb = normalize((r.personBName || '').split(' ')[0]);
    return r.type === type && ((ra === a && rb === b) || (ra === b && rb === a));
  });
}

function hasRelDirectional(rels, personAFirst, personBFirst, type) {
  const a = normalize(personAFirst);
  const b = normalize(personBFirst);
  return rels.some(r => {
    const ra = normalize((r.personAName || '').split(' ')[0]);
    const rb = normalize((r.personBName || '').split(' ')[0]);
    return r.type === type && ra === a && rb === b;
  });
}

function hasRelByFirstName(rels, fullName, personBFirst, type) {
  const a = normalize(fullName);
  const b = normalize(personBFirst);
  return rels.some(r => {
    const ra = normalize(r.personAName || '');
    const rb = normalize(r.personBName || '');
    const raFirst = ra.split(' ')[0];
    const rbFirst = rb.split(' ')[0];
    return r.type === type && (
      (ra.includes(a) && (rb.includes(b) || rbFirst === b)) ||
      (rb.includes(a) && (ra.includes(b) || raFirst === b)) ||
      (raFirst === a.split(' ')[0] && rbFirst === b) ||
      (rbFirst === a.split(' ')[0] && raFirst === b)
    );
  });
}

function hasAnyRelBetween(rels, nameA, nameB) {
  const a = normalize(nameA);
  const b = normalize(nameB);
  return rels.some(r => {
    const ra = normalize((r.personAName || '').split(' ')[0]);
    const rb = normalize((r.personBName || '').split(' ')[0]);
    return (ra === a && rb === b) || (ra === b && rb === a);
  });
}

// ============================================================
// Person Resolution (mirrors backend)
// ============================================================

function resolvePeople(suggestedPeople, narrator, existingPeople) {
  const resolved = new Map();
  let nextId = 1;

  const narratorId = 'person-narrator';
  const narratorKey = normalize(`${narrator.firstName} ${narrator.lastName || ''}`);
  const narratorRecord = {
    id: narratorId,
    firstName: narrator.firstName,
    lastName: narrator.lastName,
    gender: narrator.gender,
    isNarrator: true,
  };
  resolved.set(narratorKey, narratorRecord);

  for (const ep of existingPeople) {
    const epKey = normalize(`${ep.first_name} ${ep.last_name || ''}`);
    if (!resolved.has(epKey)) {
      resolved.set(epKey, {
        id: ep.id,
        firstName: ep.first_name,
        lastName: ep.last_name,
        nickname: ep.nickname,
        birthDate: ep.birth_date,
        birthPlace: ep.birth_place,
        gender: ep.metadata?.gender,
        profession: ep.metadata?.profession,
        existing: true,
      });
    }
  }

  for (const suggested of suggestedPeople) {
    if (suggested.firstName) suggested.firstName = stripHonorifics(suggested.firstName).trim();
    if (suggested.lastName) suggested.lastName = stripHonorifics(suggested.lastName).trim();
    const sugFirst = normalize(suggested.firstName || '');
    const sugLast = normalize(suggested.lastName || '');
    const sugFullKey = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);

    if (resolved.has(sugFullKey)) {
      const existing = resolved.get(sugFullKey);
      // Birth date conflict: widely different birth years mean different people
      if (suggested.birthDate && existing.birthDate) {
        const sugYear = parseInt(suggested.birthDate);
        const exYear = parseInt(existing.birthDate);
        if (!isNaN(sugYear) && !isNaN(exYear) && Math.abs(sugYear - exYear) > 5) {
          const disambigKey = `${sugFullKey} (${suggested.birthDate})`;
          const newPerson = {
            id: `person-${nextId++}`,
            firstName: suggested.firstName,
            lastName: suggested.lastName,
            nickname: suggested.nickname,
            birthDate: suggested.birthDate,
            deathDate: suggested.deathDate,
            birthPlace: suggested.birthPlace,
            currentLocation: suggested.currentLocation,
            profession: suggested.profession,
            isDeceased: suggested.isDeceased,
            gender: suggested.gender,
          };
          resolved.set(disambigKey, newPerson);
          continue;
        }
      }
      if (suggested.birthDate && !existing.birthDate) existing.birthDate = suggested.birthDate;
      if (suggested.birthPlace && !existing.birthPlace) existing.birthPlace = suggested.birthPlace;
      if (suggested.gender && !existing.gender) existing.gender = suggested.gender;
      if (suggested.profession && !existing.profession) existing.profession = suggested.profession;
      if (suggested.nickname && !existing.nickname) existing.nickname = suggested.nickname;
      if (suggested.deathDate && !existing.deathDate) existing.deathDate = suggested.deathDate;
      if (suggested.isDeceased && !existing.isDeceased) existing.isDeceased = suggested.isDeceased;
      continue;
    }
    if (resolved.has(sugFirst)) {
      const existing = resolved.get(sugFirst);
      if (existing?.isNarrator) continue;
    }

    let matchKey = null;
    let bestScore = 0;

    for (const [key, person] of resolved) {
      if (person.isNarrator) continue;
      const exFirst = normalize(person.firstName || '');
      const exLast = normalize(person.lastName || '');
      let score = 0;
      if (sugFirst && exFirst && sugFirst === exFirst) score += 3;
      if (score === 0) continue;
      if (sugLast && exLast) {
        if (sugLast === exLast) score += 3;
        else if (sugLast.includes(exLast) || exLast.includes(sugLast)) score += 2;
        else score -= 2;
      }
      if (score > bestScore) {
        bestScore = score;
        matchKey = key;
      }
    }

    if (matchKey && bestScore >= 3) {
      const existing = resolved.get(matchKey);
      // Birth date conflict check
      if (suggested.birthDate && existing.birthDate) {
        const sugYear = parseInt(suggested.birthDate);
        const exYear = parseInt(existing.birthDate);
        if (!isNaN(sugYear) && !isNaN(exYear) && Math.abs(sugYear - exYear) > 5) {
          const newPerson = {
            id: `person-${nextId++}`,
            firstName: suggested.firstName,
            lastName: suggested.lastName,
            nickname: suggested.nickname,
            birthDate: suggested.birthDate,
            deathDate: suggested.deathDate,
            birthPlace: suggested.birthPlace,
            currentLocation: suggested.currentLocation,
            profession: suggested.profession,
            isDeceased: suggested.isDeceased,
            gender: suggested.gender,
          };
          resolved.set(sugFullKey, newPerson);
          continue;
        }
      }
      if (suggested.lastName && !existing.lastName) existing.lastName = suggested.lastName;
      if (suggested.birthDate && !existing.birthDate) existing.birthDate = suggested.birthDate;
      if (suggested.birthPlace && !existing.birthPlace) existing.birthPlace = suggested.birthPlace;
      if (suggested.gender && !existing.gender) existing.gender = suggested.gender;
      if (suggested.profession && !existing.profession) existing.profession = suggested.profession;
      if (suggested.nickname && !existing.nickname) existing.nickname = suggested.nickname;
      if (suggested.deathDate && !existing.deathDate) existing.deathDate = suggested.deathDate;
      if (suggested.isDeceased && !existing.isDeceased) existing.isDeceased = suggested.isDeceased;
      resolved.set(sugFullKey, existing);
    } else {
      const newPerson = {
        id: `person-${nextId++}`,
        firstName: suggested.firstName,
        lastName: suggested.lastName,
        nickname: suggested.nickname,
        birthDate: suggested.birthDate,
        deathDate: suggested.deathDate,
        birthPlace: suggested.birthPlace,
        currentLocation: suggested.currentLocation,
        profession: suggested.profession,
        isDeceased: suggested.isDeceased,
        gender: suggested.gender,
      };
      resolved.set(sugFullKey, newPerson);
      if (!resolved.has(sugFirst)) resolved.set(sugFirst, newPerson);
    }
  }

  return resolved;
}

function resolvePersonName(name, resolvedMap, narrator) {
  const selfRefs = ['i', 'me', 'myself', 'narrator', 'the narrator'];
  if (selfRefs.includes(name.toLowerCase().trim())) {
    const narratorKey = normalize(`${narrator.firstName} ${narrator.lastName || ''}`);
    return resolvedMap.get(narratorKey);
  }

  const normName = normalize(name);
  if (resolvedMap.has(normName)) return resolvedMap.get(normName);

  const stripped = normalize(stripHonorifics(name));
  if (stripped !== normName && resolvedMap.has(stripped)) return resolvedMap.get(stripped);

  const normFirst = stripped.split(/\s+/)[0];
  const normLast = stripped.split(/\s+/).length > 1 ? stripped.split(/\s+/).slice(1).join(' ') : '';
  let bestPerson = null;
  let bestScore = 0;
  for (const [key, person] of resolvedMap) {
    const keyParts = key.split(/\s+/);
    const keyFirst = keyParts[0];
    const keyLast = keyParts.length > 1 ? keyParts.slice(1).join(' ') : '';
    if (keyFirst !== normFirst && normalize(person.firstName) !== normFirst) continue;
    if (normLast && keyLast) {
      const normLastWords = normLast.split(/\s+/);
      const keyLastWords = keyLast.split(/\s+/);
      const hasOverlap = normLastWords.some(w => keyLastWords.includes(w));
      if (!hasOverlap) continue;
    }
    let score = 1;
    if (key === stripped) score = 100;
    else {
      const normWords = stripped.split(/\s+/);
      score = keyParts.filter(w => normWords.includes(w)).length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPerson = person;
    }
  }
  if (bestPerson) return bestPerson;
  return null;
}

// ============================================================
// Transitive Inference (mirrors backend)
// ============================================================

function inferTransitiveRelationships(directRels) {
  const parentsOf = new Map();
  const childrenOf = new Map();
  const siblingsOf = new Map();
  const stepSiblingsOf = new Map();
  const existingSet = new Set();

  function addToSetMap(map, key, val) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(val);
  }

  for (const r of directRels) {
    const key = `${r.personAId}|${r.personBId}|${r.type}`;
    existingSet.add(key);
    if (r.type === 'parent') {
      addToSetMap(parentsOf, r.personBId, r.personAId);
      addToSetMap(childrenOf, r.personAId, r.personBId);
    } else if (r.type === 'child') {
      addToSetMap(parentsOf, r.personAId, r.personBId);
      addToSetMap(childrenOf, r.personBId, r.personAId);
    } else if (r.type === 'sibling') {
      addToSetMap(siblingsOf, r.personAId, r.personBId);
      addToSetMap(siblingsOf, r.personBId, r.personAId);
    } else if (r.type === 'half_sibling') {
      addToSetMap(stepSiblingsOf, r.personAId, r.personBId);
      addToSetMap(stepSiblingsOf, r.personBId, r.personAId);
    }
  }

  const inferred = [];
  function tryInfer(a, b, type) {
    if (a === b) return false;
    const fwd = `${a}|${b}|${type}`;
    const rev = `${b}|${a}|${type}`;
    if (existingSet.has(fwd) || existingSet.has(rev)) return false;
    inferred.push({ personAId: a, personBId: b, type, confidence: 0.85 });
    existingSet.add(fwd);
    return true;
  }

  // Pass 1: Full siblings share parents
  let changed = true;
  while (changed) {
    changed = false;
    for (const [personId, siblings] of siblingsOf) {
      const myParents = parentsOf.get(personId) || new Set();
      for (const sibId of siblings) {
        for (const parentId of myParents) {
          if (tryInfer(parentId, sibId, 'parent')) {
            addToSetMap(parentsOf, sibId, parentId);
            addToSetMap(childrenOf, parentId, sibId);
            changed = true;
          }
        }
      }
    }
  }

  // Pass 2: Children of same parent → siblings or half_siblings
  for (const [, children] of childrenOf) {
    const childArr = [...children];
    for (let i = 0; i < childArr.length; i++) {
      for (let j = i + 1; j < childArr.length; j++) {
        const stepFwd = `${childArr[i]}|${childArr[j]}|half_sibling`;
        const stepRev = `${childArr[j]}|${childArr[i]}|half_sibling`;
        if (existingSet.has(stepFwd) || existingSet.has(stepRev)) continue;
        let isHalf = false;
        const aParents = parentsOf.get(childArr[i]) || new Set();
        const bParents = parentsOf.get(childArr[j]) || new Set();
        if (aParents.size > 0 && bParents.size > 0) {
          const shared = [...aParents].filter(p => bParents.has(p)).length;
          if (shared < Math.min(aParents.size, bParents.size)) isHalf = true;
          const totalUnique = new Set([...aParents, ...bParents]).size;
          if (shared > 0 && totalUnique > shared + 1) isHalf = true;
        }
        const aStepSibs = stepSiblingsOf.get(childArr[i]) || new Set();
        const bStepSibs = stepSiblingsOf.get(childArr[j]) || new Set();
        const aSibs = siblingsOf.get(childArr[i]) || new Set();
        const bSibs = siblingsOf.get(childArr[j]) || new Set();
        for (const bSib of bSibs) { if (aStepSibs.has(bSib)) { isHalf = true; break; } }
        for (const aSib of aSibs) { if (bStepSibs.has(aSib)) { isHalf = true; break; } }
        if (isHalf) {
          if (tryInfer(childArr[i], childArr[j], 'half_sibling')) {
            addToSetMap(stepSiblingsOf, childArr[i], childArr[j]);
            addToSetMap(stepSiblingsOf, childArr[j], childArr[i]);
          }
        } else if (tryInfer(childArr[i], childArr[j], 'sibling')) {
          addToSetMap(siblingsOf, childArr[i], childArr[j]);
          addToSetMap(siblingsOf, childArr[j], childArr[i]);
        }
      }
    }
  }

  // Pass 3: Co-parents → spouse
  for (const [, parents] of parentsOf) {
    const parentArr = [...parents];
    for (let i = 0; i < parentArr.length; i++) {
      for (let j = i + 1; j < parentArr.length; j++) {
        tryInfer(parentArr[i], parentArr[j], 'spouse');
      }
    }
  }

  // Pass 4: Grandparent
  for (const [parentId, children] of childrenOf) {
    for (const childId of children) {
      const grandchildren = childrenOf.get(childId) || new Set();
      for (const gcId of grandchildren) {
        tryInfer(parentId, gcId, 'grandparent');
      }
    }
  }

  // Pass 5: Great-grandparent
  for (const [gpId, children] of childrenOf) {
    for (const childId of children) {
      const grandchildren = childrenOf.get(childId) || new Set();
      for (const gcId of grandchildren) {
        const greatGrandchildren = childrenOf.get(gcId) || new Set();
        for (const ggcId of greatGrandchildren) {
          tryInfer(gpId, ggcId, 'great_grandparent');
        }
      }
    }
  }

  // Pass 6: Uncle/aunt via siblings
  for (const [personId, siblings] of siblingsOf) {
    for (const sibId of siblings) {
      const niblings = childrenOf.get(sibId) || new Set();
      for (const nibId of niblings) {
        tryInfer(personId, nibId, 'uncle_aunt');
      }
    }
  }

  // Pass 7: Uncle/aunt via half-siblings
  for (const [personId, stepSibs] of stepSiblingsOf) {
    for (const stepSibId of stepSibs) {
      const niblings = childrenOf.get(stepSibId) || new Set();
      for (const nibId of niblings) {
        tryInfer(personId, nibId, 'uncle_aunt');
      }
    }
  }

  return inferred;
}

// ============================================================
// SCENARIOS
// ============================================================

const SCENARIOS = [];

// ────────────────────────────────────────────────────────────
// SCENARIO 1: EN — Same-sex parents, sperm donor, surrogacy
// ────────────────────────────────────────────────────────────
// Tests two moms as parents, donor mentioned by name but NOT
// a parent, surrogate NOT a parent, grandparents from both
// moms' sides, adopted vs biological nuance
//
// NARRATOR: Zoe Chen-Reeves (female, b.2006, Portland OR)
//   Mom 1: Lisa Chen (b.1978) — carried Zoe (bio mom)
//   Mom 2: Karen Reeves (b.1980) — co-parent, married to Lisa
//   Sperm donor: "David" — known donor, NOT a parent
//   Lisa's parents: Wei Chen (b.1948) + Mei-Ling Xu (b.1950)
//   Karen's mother: Patricia Reeves (b.1955)
//   Zoe's brother: Oliver Chen-Reeves (b.2010, via surrogate)
//   Surrogate: "a woman named Jess" — NOT a parent
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '1. EN — Same-Sex Parents, Donor, Surrogate',
  language: 'en',
  narrator: { firstName: 'Zoe', lastName: 'Chen-Reeves', gender: 'female' },
  existingPeople: [],
  transcript: `I'm Zoe Chen-Reeves, born in 2006 in Portland, Oregon. I'm female.

I have two moms. My mom Lisa Chen was born in 1978 in San Francisco. She's a pediatrician. My other mom is Karen Reeves, born in 1980 in Portland. She's a software engineer. They got married in 2012, but they've been together since like 2003.

So technically, my mom Lisa is my biological mother. She carried me. They used a sperm donor named David. I've actually met David a couple times — he's a nice guy, a professor — but he's not my dad or anything. He's just the donor. He has no parental role in my life.

My little brother Oliver Chen-Reeves was born in 2010. For Oliver, they used a surrogate — a woman named Jess carried him. But Lisa is still Oliver's biological mother because they used her egg. So genetically Oliver and I are full siblings, we share the same bio mom and the same donor. Karen is equally our parent though, she adopted both of us legally.

My grandparents on my mom Lisa's side are Wei Chen, born in 1948 in Shanghai, and Mei-Ling Xu, born in 1950 in Taipei. Grandpa Wei is retired, he was an engineer. Grandma Mei-Ling still cooks the best dumplings.

On my mom Karen's side, I mostly know my grandma Patricia Reeves, born in 1955 in Seattle. Grandma Pat is a retired nurse. Karen's dad left when she was young, so I've never met him.

My favorite memory is when both my moms took Oliver and me camping in the Cascades. Mom Lisa taught us how to identify plants and Mom Karen built the most epic campfire.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Zoe', 'Lisa', 'Karen', 'Oliver', 'Wei', 'Patricia']) {
      assert(R, pNames.includes(normalize(name)), `Person missing: ${name}`);
    }
    // Mei-Ling may appear as "Mei-Ling" or "Mei"
    assert(R, pNames.some(pn => pn.includes('mei')), 'Person missing: Mei-Ling');

    section(R, 'Two Moms as Parents');
    assert(R, hasRel(allRelationships, 'Lisa', 'Zoe', 'parent') || hasRel(allRelationships, 'Lisa', 'Zoe', 'adopted_parent'),
      'Lisa → parent of Zoe');
    assert(R, hasRel(allRelationships, 'Karen', 'Zoe', 'parent') || hasRel(allRelationships, 'Karen', 'Zoe', 'adopted_parent'),
      'Karen → parent of Zoe');
    assert(R, hasRel(allRelationships, 'Lisa', 'Karen', 'spouse'), 'Lisa ↔ Karen spouse');

    section(R, 'Oliver — Brother');
    assert(R, hasRel(allRelationships, 'Oliver', 'Zoe', 'sibling'), 'Oliver ↔ sibling of Zoe');
    // At least one mom should be parent of Oliver
    assert(R, hasRel(allRelationships, 'Lisa', 'Oliver', 'parent') || hasRel(allRelationships, 'Karen', 'Oliver', 'parent') ||
      hasRel(allRelationships, 'Lisa', 'Oliver', 'adopted_parent') || hasRel(allRelationships, 'Karen', 'Oliver', 'adopted_parent'),
      'Lisa or Karen → parent of Oliver');

    section(R, 'Donor & Surrogate — NOT Parents');
    // David should NOT be parent of Zoe or Oliver
    const davidParentRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '').split(' ')[0];
      const b = normalize(r.personBName || '').split(' ')[0];
      return (a === 'david' || b === 'david') && (r.type === 'parent' || r.type === 'adopted_parent');
    });
    assert(R, davidParentRels.length === 0, 'David (donor) should NOT be parent of anyone');
    // Jess should NOT be parent
    const jessParentRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '').split(' ')[0];
      const b = normalize(r.personBName || '').split(' ')[0];
      return (a === 'jess' || b === 'jess') && (r.type === 'parent' || r.type === 'adopted_parent');
    });
    assert(R, jessParentRels.length === 0, 'Jess (surrogate) should NOT be parent of anyone');

    section(R, 'Grandparents');
    assert(R, hasRel(allRelationships, 'Wei', 'Lisa', 'parent') || hasRel(allRelationships, 'Wei', 'Zoe', 'grandparent'),
      'Wei → parent of Lisa or grandparent of Zoe');
    assert(R, hasRel(allRelationships, 'Patricia', 'Karen', 'parent') || hasRel(allRelationships, 'Patricia', 'Zoe', 'grandparent'),
      'Patricia → parent of Karen or grandparent of Zoe');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 2: ES — Single mom, absent father, raised by
//             grandparents, informal/emotional tone
// ────────────────────────────────────────────────────────────
// Tests: biological father acknowledged but absent,
//        grandparents as primary caregivers (but still
//        grandparent type, NOT parent), "como un padre"
//        figurative language, emotional storytelling
//
// NARRATOR: Valentina Ríos (female, b.2003, Quito, Ecuador)
//   Mom: Lucía Ríos (b.1985, single mom, waitress)
//   Bio father: "Marcos" — left before birth, never met
//   Raised by: Abuela Carmen Ríos (b.1955) + Abuelo Raúl Ríos (b.1953, d.2021)
//   Tío: Ernesto Ríos (b.1982, Carmen's son, "como un padre para mí")
//   Ernesto's wife: Patricia (b.1983)
//   Ernesto's kids: Matías (b.2008), Luciana (b.2011) — primos
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '2. ES — Madre Soltera, Padre Ausente, Criada por Abuelos',
  language: 'es',
  narrator: { firstName: 'Valentina', lastName: 'Ríos', gender: 'female' },
  existingPeople: [],
  transcript: `Me llamo Valentina Ríos, nací en el 2003 en Quito, Ecuador. Soy mujer.

Mi mamá es Lucía Ríos, nacida en 1985 aquí en Quito. Ella trabaja de mesera en un restaurante del centro. Mi mamá me tuvo muy joven, tenía solo dieciocho años. Mi papá... bueno, mi papá biológico se llama Marcos. No sé su apellido. Él se fue antes de que yo naciera y nunca lo conocí. Mi mamá dice que era de Guayaquil, pero la verdad es que no sé casi nada de él. No lo considero mi papá porque nunca estuvo ahí.

En realidad, a mí me criaron mis abuelos. Mi abuela Carmen Ríos, nacida en 1955, y mi abuelo Raúl Ríos, nacido en 1953. Mi abuelito Raúl falleció en 2021, fue lo más triste que me ha pasado en la vida. Él era carpintero, hacía unos muebles hermosos. Mi abuela Carmen sigue viviendo en la misma casa de siempre, ella fue costurera toda su vida.

Mi tío Ernesto Ríos, nacido en 1982, es el hermano de mi mamá. Él ha sido como un padre para mí. Ojo, no digo que sea mi papá — es mi tío — pero siempre estuvo presente, me llevaba al colegio, me ayudaba con las tareas, iba a las reuniones de padres. Mi tío Ernesto es mecánico y tiene su propio taller.

El tío Ernesto está casado con Patricia, nacida en 1983. Tienen dos hijos: mi primo Matías, que nació en 2008, y mi prima Luciana, nacida en 2011.

Recuerdo que los domingos mi abuelita Carmen hacía un locro de papas increíble. Toda la familia se juntaba: mi mamá Lucía, mi tío Ernesto con Patricia y los niños, mi abuelito Raúl... Él siempre se sentaba en su silla favorita y nos contaba historias de cuando era joven. Lo extraño tanto.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Valentina', 'Lucía', 'Carmen', 'Raúl', 'Ernesto', 'Patricia', 'Matías', 'Luciana']) {
      assert(R, pNames.some(pn => pn.includes(normalize(name))), `Person missing: ${name}`);
    }

    section(R, 'Single Mom');
    assert(R, hasRel(allRelationships, 'Lucía', 'Valentina', 'parent') || hasRel(allRelationships, 'Lucia', 'Valentina', 'parent'),
      'Lucía → parent of Valentina');

    section(R, 'Absent Father — Marcos');
    // Marcos may or may not be extracted. If extracted, he should NOT be parent
    // (narrator says "no lo considero mi papá")... but he IS the biological father.
    // Acceptable: parent relationship with low confidence, OR no relationship at all.
    // The key test: Marcos should NOT be extracted as a full parent with high confidence
    // and Ernesto should NOT be parent (figurative "como un padre" test)
    const ernestoParentRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '').split(' ')[0];
      const b = normalize(r.personBName || '').split(' ')[0];
      return (a === 'ernesto' && b === 'valentina') && r.type === 'parent';
    });
    assert(R, ernestoParentRels.length === 0,
      'Ernesto should NOT be parent of Valentina ("como un padre" is figurative)');

    section(R, 'Grandparents as Caregivers');
    assert(R, hasRel(allRelationships, 'Carmen', 'Valentina', 'grandparent') || hasRel(allRelationships, 'Carmen', 'Lucía', 'parent') ||
      hasRel(allRelationships, 'Carmen', 'Lucia', 'parent'),
      'Carmen → grandparent of Valentina or parent of Lucía');
    assert(R, hasRel(allRelationships, 'Raúl', 'Valentina', 'grandparent') || hasRel(allRelationships, 'Raul', 'Valentina', 'grandparent') ||
      hasRel(allRelationships, 'Raúl', 'Lucía', 'parent') || hasRel(allRelationships, 'Raul', 'Lucia', 'parent'),
      'Raúl → grandparent of Valentina or parent of Lucía');

    section(R, 'Uncle & Cousins');
    assert(R, hasRel(allRelationships, 'Ernesto', 'Lucía', 'sibling') || hasRel(allRelationships, 'Ernesto', 'Lucia', 'sibling'),
      'Ernesto ↔ sibling of Lucía (hermano de mi mamá)');
    assert(R, hasRel(allRelationships, 'Ernesto', 'Matías', 'parent') || hasRel(allRelationships, 'Ernesto', 'Matias', 'parent') ||
      hasRel(allRelationships, 'Patricia', 'Matías', 'parent') || hasRel(allRelationships, 'Patricia', 'Matias', 'parent') ||
      hasRel(allRelationships, 'Matías', 'Ernesto', 'child') || hasRel(allRelationships, 'Matias', 'Ernesto', 'child') ||
      hasRel(allRelationships, 'Matías', 'Patricia', 'child') || hasRel(allRelationships, 'Matias', 'Patricia', 'child'),
      'Ernesto/Patricia → parent of Matías (or Matías → child of Ernesto/Patricia)');
    assert(R, hasRel(allRelationships, 'Ernesto', 'Luciana', 'parent') || hasRel(allRelationships, 'Patricia', 'Luciana', 'parent') ||
      hasRel(allRelationships, 'Luciana', 'Ernesto', 'child') || hasRel(allRelationships, 'Luciana', 'Patricia', 'child'),
      'Ernesto/Patricia → parent of Luciana (or Luciana → child of Ernesto/Patricia)');

    section(R, 'Deceased');
    const raul = people.find(p => normalize(p.firstName).includes('raul'));
    warn(R, raul?.isDeceased || !!raul?.deathDate, 'Raúl should be deceased');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 3: EN — Rambling, self-correcting, chaotic
//             transcript with filler words, tangents,
//             corrections, and stream-of-consciousness
// ────────────────────────────────────────────────────────────
// Tests: "wait no I mean...", name corrections,
//        tangential stories, filler words (um, uh, like),
//        run-on sentences, abrupt topic changes
//
// NARRATOR: Jake Morrison (male, b.1995, Denver CO)
//   Dad: Bill Morrison (b.1965, mechanic)
//   Mom: Diane... wait no, Diana Morrison née Parker (b.1968)
//   Sister: "um, Rachel, no wait, Rebecca. Rebecca." (b.1998)
//   Grandpa: "Old Tom" Thomas Morrison (b.1935, d.2015)
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '3. EN — Rambling, Self-Correcting, Chaotic Transcript',
  language: 'en',
  narrator: { firstName: 'Jake', lastName: 'Morrison', gender: 'male' },
  existingPeople: [],
  transcript: `Uh, yeah, so, I'm Jake Morrison? Born in ninety-five, in Denver. Colorado. I'm a guy, obviously, haha.

OK so my dad is, um, William Morrison? But everyone calls him Bill. He was born in sixty-five. Nineteen sixty-five I mean, not like 1865, haha. He's a mechanic, been working at the same shop for like thirty years. Good old Bill.

My mom is Diane — wait, no, sorry, her name is Diana. Diana Morrison. Her maiden name was, uh, what was it... Parker! Diana Parker. She was born in sixty-eight. She teaches elementary school. Third grade I think? Or maybe fourth grade now, I'm not sure.

I have a sister named... um... Rachel. No wait. That's my ex-girlfriend. My sister is Rebecca. Rebecca Morrison, born in ninety-eight. Ninety-eight as in 1998 not like the number ninety-eight. She's in med school right now which is pretty cool.

Oh man and I gotta tell you about my grandpa. We called him "Old Tom" but his real name was Thomas Morrison. He was born in like 1935 or something? He died in 2015. God I miss that guy. He was a trucker, drove cross-country his whole life. Had the best stories. One time he told me about — actually that's a long story, never mind.

So yeah that's basically my family. Oh wait, I should mention my mom's parents too. My grandma on my mom's side is Helen Parker, she was born in like forty-two? 1942. She's still kicking, lives in a retirement home in Phoenix. And my grandpa Bob Parker, he was born in 1940, he passed away back in 2010. He was a rancher.

What else... oh yeah, my dad's mom, so my other grandma, is Margaret Morrison. She was born in 1938. We call her Maggie. She makes the best apple pie in the state, I swear.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    // Should extract the CORRECTED names, not the mistakes
    assert(R, pNames.some(pn => pn.includes('diana') || pn.includes('diane')), 'Diana/Diane should exist');
    assert(R, pNames.some(pn => pn.includes('rebecca')), 'Rebecca should exist (corrected from Rachel)');
    // Thomas/"Old Tom"
    assert(R, pNames.some(pn => pn.includes('thomas') || pn.includes('tom')), 'Thomas/Tom should exist');
    // William/Bill
    assert(R, pNames.some(pn => pn.includes('william') || pn.includes('bill')), 'William/Bill should exist');
    assert(R, pNames.some(pn => pn.includes('helen')), 'Helen should exist');
    assert(R, pNames.some(pn => pn.includes('bob') || pn.includes('robert')), 'Bob should exist');
    assert(R, pNames.some(pn => pn.includes('margaret') || pn.includes('maggie')), 'Margaret/Maggie should exist');

    section(R, 'Self-Corrections');
    // Rachel (the ex-girlfriend, abandoned name) should ideally NOT exist
    // OR if it exists, should NOT be sibling of Jake
    const rachelSibRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '').split(' ')[0];
      const b = normalize(r.personBName || '').split(' ')[0];
      return (a === 'rachel' || b === 'rachel') && r.type === 'sibling';
    });
    warn(R, rachelSibRels.length === 0, 'Rachel should NOT be sibling of Jake (narrator corrected to Rebecca)');

    section(R, 'Core Family');
    // Bill/William is parent
    const dadParent = allRelationships.some(r => {
      const a = normalize(r.personAName || '').split(' ')[0];
      const b = normalize(r.personBName || '').split(' ')[0];
      return r.type === 'parent' && (a === 'william' || a === 'bill') && b === 'jake';
    });
    assert(R, dadParent, 'Bill/William → parent of Jake');

    // Diana is parent
    const momParent = allRelationships.some(r => {
      const a = normalize(r.personAName || '').split(' ')[0];
      const b = normalize(r.personBName || '').split(' ')[0];
      return r.type === 'parent' && (a === 'diana' || a === 'diane') && b === 'jake';
    });
    assert(R, momParent, 'Diana → parent of Jake');

    // Rebecca is sibling
    assert(R, hasRel(allRelationships, 'Rebecca', 'Jake', 'sibling'), 'Rebecca ↔ sibling of Jake');

    section(R, 'Informal Year Parsing');
    // "born in ninety-five" → 1995
    // "born in sixty-five" → 1965
    const bill = people.find(p => normalize(p.firstName).includes('william') || normalize(p.firstName).includes('bill'));
    warn(R, bill?.birthDate && parseInt(bill.birthDate) === 1965, `Bill birth year should be 1965, got ${bill?.birthDate}`);
    const rebecca = people.find(p => normalize(p.firstName) === 'rebecca');
    warn(R, rebecca?.birthDate && parseInt(rebecca.birthDate) === 1998, `Rebecca birth year should be 1998, got ${rebecca?.birthDate}`);

    section(R, 'Nicknames');
    const thomas = people.find(p => normalize(p.firstName).includes('thomas') || normalize(p.firstName).includes('tom'));
    const margaret = people.find(p => normalize(p.firstName).includes('margaret') || normalize(p.firstName).includes('maggie'));
    warn(R, thomas?.nickname?.toLowerCase()?.includes('tom') || normalize(thomas?.firstName || '').includes('tom'),
      'Thomas should have nickname "Old Tom" or "Tom"');
    warn(R, margaret?.nickname?.toLowerCase()?.includes('maggie') || normalize(margaret?.firstName || '').includes('maggie'),
      'Margaret should have nickname "Maggie"');

    section(R, 'Grandparents');
    // Thomas → parent of Bill or grandparent of Jake
    const thomasGP = allRelationships.some(r => {
      const a = normalize(r.personAName || '').split(' ')[0];
      const b = normalize(r.personBName || '').split(' ')[0];
      return (a === 'thomas' || a === 'tom') && (
        (b === 'william' || b === 'bill') && r.type === 'parent' ||
        b === 'jake' && r.type === 'grandparent'
      );
    });
    assert(R, thomasGP, 'Thomas → parent of Bill or grandparent of Jake');

    section(R, 'Deceased');
    warn(R, thomas?.isDeceased || !!thomas?.deathDate, 'Thomas should be deceased');
    const bob = people.find(p => normalize(p.firstName).includes('bob') || normalize(p.firstName).includes('robert'));
    warn(R, bob?.isDeceased || !!bob?.deathDate, 'Bob should be deceased');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 4: ES/EN — Spanglish code-switching mid-sentence
// ────────────────────────────────────────────────────────────
// Tests: Bilingual speaker mixing Spanish & English freely,
//        kinship terms in both languages within one sentence,
//        some family described in English, some in Spanish
//
// NARRATOR: Diego Fernández (male, b.2001, Houston TX)
//   Dad: Roberto Fernández (b.1970, from Monterrey MX)
//   Mom: Jennifer "Jenny" Walsh (b.1973, from Houston)
//   Abuela: Doña Rosa Hernández (b.1942, from Monterrey)
//   Grandma: Susan Walsh (b.1947, from Austin)
//   Sister: Sofía Fernández (b.2004)
//   Half-brother: Tyler Walsh (b.1995, mom's son from 1st marriage)
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '4. ES/EN — Spanglish Code-Switching',
  language: 'en',
  narrator: { firstName: 'Diego', lastName: 'Fernández', gender: 'male' },
  existingPeople: [],
  transcript: `So yeah, I'm Diego Fernández. Born in 2001 in Houston, Texas. I'm a dude.

My dad, mi papá, es Roberto Fernández, he was born in seventy in Monterrey, Mexico. He's a contractor, builds houses y todo eso. My mom is Jennifer Walsh — everyone calls her Jenny — she was born here in Houston in seventy-three. She's a real estate agent.

OK so here's where it gets complicated. My mom was married before, right? She has a son from that first marriage — Tyler Walsh, born in ninety-five. Tyler is my half-brother on my mom's side. Tyler's dad, o sea el ex de mi mamá, I never really knew him. They got divorced when Tyler was like two.

Tengo una hermana, Sofía Fernández, she was born in 2004. She's my full sister, same mom and dad. Sofía y yo somos bien close, we tell each other everything.

By the way, on my dad's side, mi abuela Rosa Hernández, she was born in 1942 en Monterrey. Everybody calls her Doña Rosa pero that's just respect, you know? She's amazing, she makes the best tamales every Christmas. Doña Rosa never really learned English pero she tries, it's cute.

And then my mom's mom, my grandma Susan Walsh, born in forty-seven in Austin. Grandma Sue is super chill, she still drives her old Cadillac around town. She came to every one of my football games creciendo.

La neta es que growing up bilingual was confusing sometimes. At home we'd be like "pásame the salt" and "turn off la luz" haha. My dad speaks English with an accent pero he understands everything. Mi abuela Rosa solo speaks Spanish though, so when Grandma Sue comes over, my mom has to translate todo. It's a whole thing pero it works.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Diego', 'Roberto', 'Jennifer', 'Tyler', 'Sofía', 'Rosa', 'Susan']) {
      assert(R, pNames.some(pn => pn.includes(normalize(name))), `Person missing: ${name}`);
    }

    section(R, 'Core Family — Mixed Language References');
    assert(R, hasRel(allRelationships, 'Roberto', 'Diego', 'parent'), 'Roberto → parent of Diego');
    assert(R, hasRel(allRelationships, 'Jennifer', 'Diego', 'parent') || hasRel(allRelationships, 'Jenny', 'Diego', 'parent'),
      'Jennifer/Jenny → parent of Diego');
    assert(R, hasRel(allRelationships, 'Sofía', 'Diego', 'sibling') || hasRel(allRelationships, 'Sofia', 'Diego', 'sibling'),
      'Sofía ↔ sibling of Diego');

    section(R, 'Half-Brother Tyler');
    assert(R, hasRel(allRelationships, 'Tyler', 'Diego', 'half_sibling'), 'Tyler ↔ half_sibling of Diego');
    // Tyler's parent attribution: Jennifer → parent of Tyler
    assert(R, hasRel(allRelationships, 'Jennifer', 'Tyler', 'parent') || hasRel(allRelationships, 'Jenny', 'Tyler', 'parent'),
      'Jennifer → parent of Tyler (half-brother from mom\'s side)');

    section(R, 'Grandparents — Bilingual References');
    // "mi abuela Rosa" and "my grandma Susan" — both should resolve correctly
    assert(R, hasRel(allRelationships, 'Rosa', 'Roberto', 'parent') || hasRel(allRelationships, 'Rosa', 'Diego', 'grandparent'),
      'Rosa → parent of Roberto or grandparent of Diego');
    assert(R, hasRel(allRelationships, 'Susan', 'Jennifer', 'parent') || hasRel(allRelationships, 'Susan', 'Diego', 'grandparent') ||
      hasRel(allRelationships, 'Susan', 'Jenny', 'parent'),
      'Susan → parent of Jennifer or grandparent of Diego');

    section(R, 'Honorific Stripping');
    // "Doña Rosa" should be stripped to just "Rosa"
    const rosaEntry = people.find(p => normalize(p.firstName).includes('rosa'));
    warn(R, rosaEntry && !rosaEntry.firstName.toLowerCase().includes('doña') && !rosaEntry.firstName.toLowerCase().includes('dona'),
      `Rosa's firstName should not include "Doña" — got "${rosaEntry?.firstName}"`);

    section(R, 'Nickname');
    const jenny = people.find(p => normalize(p.firstName).includes('jennifer') || normalize(p.firstName).includes('jenny'));
    warn(R, jenny?.nickname?.toLowerCase() === 'jenny' || normalize(jenny?.firstName || '').includes('jenny'),
      'Jennifer should have nickname "Jenny"');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 5: EN — Triple-divorce blended chaos
// ────────────────────────────────────────────────────────────
// Tests: Multiple ex-spouses, "my mom's ex-husband's daughter",
//        step-parents who are no longer step-parents (divorced),
//        complex possessive chains through remarriages,
//        "my stepdad's kids from his first marriage"
//
// NARRATOR: Mia Torres (female, b.2005, Phoenix AZ)
//   Mom: Andrea Torres (b.1980)
//     Marriage 1: Chris Baker (ex) → Ethan Baker (b.2001, half-bro)
//     Marriage 2: Steve Park (ex) → no kids, just "my ex-stepdad"
//     Marriage 3: now with Derek Williams → Lily Williams (b.2010, Derek's daughter, NOT Mia's sister)
//   Dad: Marco Torres (b.1978)
//     Now married to: Priya Patel (b.1982, stepmom)
//     Priya's son from prev: Ravi Patel (b.2003, not related to Mia)
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '5. EN — Triple-Divorce Blended Chaos',
  language: 'en',
  narrator: { firstName: 'Mia', lastName: 'Torres', gender: 'female' },
  existingPeople: [],
  transcript: `I'm Mia Torres, born in 2005 in Phoenix, Arizona. Female.

OK so my family situation is... a lot. Deep breath. Here goes.

My dad is Marco Torres, born in 1978 here in Phoenix. He's an electrician. My mom is Andrea Torres — well, that's her current name, she's gone through a few — she was born in 1980 in Tucson. She works in HR.

So my mom and dad were married first, had me, then divorced when I was three. After that, my mom married Chris Baker. Chris was from Ohio, I don't know when he was born honestly. My mom and Chris had a son together — my half-brother Ethan Baker, born in 2001. Well actually wait, Ethan was born before me, so Chris and my mom were together before my parents even. It's complicated. Anyway, Ethan is my half-brother through my mom.

Mom and Chris eventually divorced too. Then she married Steve Park for like two years. Steve was nice I guess but they had no kids and they split up. Steve was just my stepdad for a while. I don't really count him as family anymore.

Now my mom is with Derek Williams. They got married in 2019. Derek has a daughter from a previous relationship named Lily Williams, she was born in 2010. Lily lives with us half the time. She's technically my stepsister I guess? Derek's daughter, not mine. We get along though.

On my dad's side, my dad Marco remarried too. He's married to Priya Patel, born in 1982. She's from India originally, she's a dentist. Priya is my stepmom and I actually really love her. Priya has a son from before she married my dad — Ravi Patel, born in 2003. Ravi is not my brother but we grew up in the same house so he's like family to me.

It's wild at holidays. Mom's house has me, Ethan, Derek, and sometimes Lily. Dad's house has me, Priya, and Ravi. And somehow it all works.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Mia', 'Marco', 'Andrea', 'Chris', 'Ethan', 'Derek', 'Lily', 'Priya', 'Ravi']) {
      assert(R, pNames.includes(normalize(name)), `Person missing: ${name}`);
    }
    // Steve may or may not be extracted — he's "not counted as family"
    // But he was mentioned so probably will be

    section(R, 'Core Parents');
    assert(R, hasRel(allRelationships, 'Marco', 'Mia', 'parent'), 'Marco → parent of Mia');
    assert(R, hasRel(allRelationships, 'Andrea', 'Mia', 'parent'), 'Andrea → parent of Mia');
    assert(R, hasRel(allRelationships, 'Marco', 'Andrea', 'ex_spouse'), 'Marco ↔ Andrea ex_spouse');

    section(R, 'Half-Brother Ethan');
    assert(R, hasRel(allRelationships, 'Ethan', 'Mia', 'half_sibling'), 'Ethan ↔ half_sibling of Mia');
    assert(R, hasRel(allRelationships, 'Andrea', 'Ethan', 'parent') || hasRel(allRelationships, 'Chris', 'Ethan', 'parent'),
      'Andrea or Chris → parent of Ethan');

    section(R, 'Mom\'s Marriages');
    assert(R, hasRel(allRelationships, 'Andrea', 'Chris', 'ex_spouse'), 'Andrea ↔ Chris ex_spouse');
    assert(R, hasRel(allRelationships, 'Andrea', 'Derek', 'spouse'), 'Andrea ↔ Derek spouse (current)');

    section(R, 'Step-relationships — Correct Attribution');
    // Derek is step_parent of Mia (or just Andrea's spouse)
    warn(R, hasRel(allRelationships, 'Derek', 'Mia', 'step_parent') || hasRel(allRelationships, 'Andrea', 'Derek', 'spouse'),
      'Derek → step_parent of Mia or at least spouse of Andrea');
    // Lily is Derek's daughter (parent rel), NOT Mia's sibling
    assert(R, hasRel(allRelationships, 'Derek', 'Lily', 'parent'), 'Derek → parent of Lily');
    // Lily could be step_sibling of Mia
    warn(R, hasRel(allRelationships, 'Lily', 'Mia', 'step_sibling'),
      'Lily should be step_sibling of Mia');

    section(R, 'Dad\'s Remarriage');
    assert(R, hasRel(allRelationships, 'Marco', 'Priya', 'spouse'), 'Marco ↔ Priya spouse');
    warn(R, hasRel(allRelationships, 'Priya', 'Mia', 'step_parent'),
      'Priya → step_parent of Mia');

    section(R, 'Non-Related People Correct');
    // Ravi should NOT be sibling of Mia (narrator says "not my brother")
    const raviSibRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '').split(' ')[0];
      const b = normalize(r.personBName || '').split(' ')[0];
      return (a === 'ravi' || b === 'ravi') && (r.type === 'sibling' || r.type === 'half_sibling');
    });
    // This is a warn because the AI might reasonably infer step_sibling
    warn(R, raviSibRels.length === 0, 'Ravi should NOT be sibling/half_sibling of Mia ("not my brother")');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 6: EN — Foster care, multiple placements,
//             biological vs legal vs emotional family
// ────────────────────────────────────────────────────────────
// Tests: Bio parents who lost custody, foster parents,
//        multiple foster siblings, "real family" vs legal,
//        caseworker mentioned but NOT family, adopted by
//        final foster family
//
// NARRATOR: Marcus Johnson (male, b.2004, Atlanta GA)
//   Bio mom: Tanya Johnson (b.1985) — lost custody
//   Bio dad: unknown
//   Foster family 1: the Hendersons (brief mention, not detailed)
//   Foster family 2 (adopted by): David and Maria Santos
//     David Santos (b.1970, teacher)
//     Maria Santos (b.1972, nurse)
//     Their bio son: Luis Santos (b.2000, Marcus's adopted brother)
//   Caseworker: "Ms. Robinson" — NOT a family member
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '6. EN — Foster Care, Bio vs Legal Family',
  language: 'en',
  narrator: { firstName: 'Marcus', lastName: 'Johnson', gender: 'male' },
  existingPeople: [],
  transcript: `Yeah, my name is Marcus Johnson. Born in 2004 in Atlanta. I'm male.

So my story is a little different from most people's. I grew up in the foster care system. My biological mom is Tanya Johnson, she was born in 1985. I don't know much about her honestly. She had some problems — I won't get into it — and she lost custody of me when I was about two. I don't have any memories of her. My biological father, I have no idea who he is. His name isn't on my birth certificate.

After my mom lost custody, I went to a foster home — the Hendersons. I was there for maybe a year. They were OK but it wasn't permanent.

Then when I was about four, I was placed with David and Maria Santos. David was born in 1970, he's a high school teacher. Maria was born in 1972, she's a nurse. And man, from day one they treated me like their own. They already had a son, Luis Santos, born in 2000. Luis is four years older than me and he immediately became my big brother.

David and Maria officially adopted me when I was seven. So legally they're my parents now. I still go by Johnson because that was my choice — they said I could keep my birth name or change it, and I decided to keep it. But they're my mom and dad. Period.

My caseworker Ms. Robinson was great too, she really fought for me to stay with the Santos family. But she's not family, she's a social worker who helped with my case.

I remember the day the adoption was finalized. Maria — Mom — was crying. Dad was trying not to cry and failing. Luis lifted me up on his shoulders. That was the day I got my forever family.

Maria's parents, my grandparents — I call them Abuela and Abuelo — are Jorge Santos, born in 1942, and Elena Vega, born in 1945. They're from Puerto Rico originally. They accepted me from day one as their grandson.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Marcus', 'David', 'Maria', 'Luis', 'Jorge', 'Elena']) {
      assert(R, pNames.includes(normalize(name)), `Person missing: ${name}`);
    }
    // Tanya may or may not be extracted (bio mom, very little info)
    warn(R, pNames.includes('tanya'), 'Tanya (bio mom) should be extracted');

    section(R, 'Adoptive Family');
    assert(R, hasRel(allRelationships, 'David', 'Marcus', 'adopted_parent') || hasRel(allRelationships, 'David', 'Marcus', 'parent'),
      'David → adopted_parent or parent of Marcus');
    assert(R, hasRel(allRelationships, 'Maria', 'Marcus', 'adopted_parent') || hasRel(allRelationships, 'Maria', 'Marcus', 'parent'),
      'Maria → adopted_parent or parent of Marcus');

    section(R, 'Adopted Brother Luis');
    assert(R, hasRel(allRelationships, 'Luis', 'Marcus', 'sibling') ||
      hasRel(allRelationships, 'David', 'Luis', 'parent') || hasRel(allRelationships, 'Maria', 'Luis', 'parent'),
      'Luis should be sibling of Marcus or child of David/Maria');

    section(R, 'Caseworker — NOT Family');
    const robinsonRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '');
      const b = normalize(r.personBName || '');
      return a.includes('robinson') || b.includes('robinson');
    });
    assert(R, robinsonRels.length === 0, 'Ms. Robinson (caseworker) should NOT have family relationships');

    section(R, 'Grandparents (Adopted Family)');
    assert(R, hasRel(allRelationships, 'Jorge', 'Maria', 'parent') || hasRel(allRelationships, 'Jorge', 'Marcus', 'grandparent'),
      'Jorge → parent of Maria or grandparent of Marcus');
    assert(R, hasRel(allRelationships, 'Elena', 'Maria', 'parent') || hasRel(allRelationships, 'Elena', 'Marcus', 'grandparent'),
      'Elena → parent of Maria or grandparent of Marcus');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 7: ES — Informal slang-heavy Mexican Spanish
// ────────────────────────────────────────────────────────────
// Tests: "jefa" for mom, "jefe" for dad, "morro" for kid,
//        "carnal" for brother (slang, NOT literal),
//        "compadre/comadre" used loosely, "neta",
//        "la ruca de mi tío" for uncle's partner,
//        age-based references "el más grande"
//
// NARRATOR: Kevin Ramírez (male, b.2002, Guadalajara)
//   Jefa: Patricia Ramírez (b.1975)
//   Jefe: Tomás Ramírez (b.1972, albañil)
//   Carnal: Ángel Ramírez (b.1999, hermano mayor)
//   Hermana: Lupita (Guadalupe) Ramírez (b.2006)
//   Abuela: Doña Concha (Concepción) Ramírez (b.1945)
//   Tío: Beto (Alberto) Ramírez (b.1978)
//   Beto's partner: "la Güera" Laura (b.1980)
//   Beto & Laura's kid: Brandon (b.2010)
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '7. ES — Slang-Heavy Mexican Spanish (jefa, carnal, morro)',
  language: 'es',
  narrator: { firstName: 'Kevin', lastName: 'Ramírez', gender: 'male' },
  existingPeople: [],
  transcript: `Qué onda, soy Kevin Ramírez, nací en el 2002 en Guadalajara. Soy vato pues.

Mi jefa es Patricia Ramírez, nació en el setenta y cinco. Ella trabaja limpiando casas. Y mi jefe es Tomás Ramírez, nació en el setenta y dos. El jefe es albañil, se la pasa chambando todo el día.

Mi carnal Ángel Ramírez nació en el noventa y nueve. O sea, es mi hermano, el más grande. Ángel está chambeando en una fábrica ahorita en León. Es bien chido el güey, siempre me defiende.

También tengo a mi hermana la Lupita, bueno, su nombre es Guadalupe Ramírez, nació en el 2006. Lupita está en la prepa y le va re bien, es la más inteligente de la familia, neta.

Mi abuela, la Doña Concha — bueno, se llama Concepción Ramírez — nació en el cuarenta y cinco. Ella vive con nosotros. Toda la vida ha vivido en Guanajuato pero se vino a vivir con nosotros cuando mi abuelo murió. La Doña Concha cocina bien sabroso, la neta.

Mi tío Beto, bueno, Alberto Ramírez, nació en el setenta y ocho. Es el hermano de mi jefe. El tío Beto es soldador y está juntado con la Güera Laura, ella nació en el ochenta. No se casaron por la iglesia ni nada, viven juntos nomás. Tienen un morro que se llama Brandon, nació en el 2010.

La familia de mi jefa no la conozco mucho. Solo sé que mi abuela materna se llama Esperanza, pero no sé su apellido ni cuándo nació. Vive en algún lado de Michoacán.

Neta que los domingos son lo mejor. Nos juntamos todos en la casa de la abuela Concha, mi jefa hace agua de Jamaica, mi carnal Ángel llega con las chelas, y el tío Beto cuenta sus historias bien locas. Brandon anda correteando por todos lados. Eso es la familia, güey.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction — Through Slang');
    // "jefa" = mom, "jefe" = dad, "carnal" = brother
    assert(R, pNames.some(pn => pn.includes('patricia')), 'Patricia (jefa) should exist');
    assert(R, pNames.some(pn => pn.includes('tomas')), 'Tomás (jefe) should exist');
    assert(R, pNames.some(pn => pn.includes('angel')), 'Ángel (carnal) should exist');
    assert(R, pNames.some(pn => pn.includes('guadalupe') || pn.includes('lupita')), 'Lupita/Guadalupe should exist');
    assert(R, pNames.some(pn => pn.includes('concepcion') || pn.includes('concha')), 'Concha/Concepción should exist');
    assert(R, pNames.some(pn => pn.includes('alberto') || pn.includes('beto')), 'Beto/Alberto should exist');
    assert(R, pNames.some(pn => pn.includes('laura')), 'Laura should exist');
    assert(R, pNames.includes('brandon'), 'Brandon should exist');

    section(R, 'Slang → Relationships');
    // "mi jefa" = my mom
    assert(R, hasRel(allRelationships, 'Patricia', 'Kevin', 'parent'), 'Patricia (jefa) → parent of Kevin');
    // "mi jefe" = my dad
    assert(R, hasRel(allRelationships, 'Tomás', 'Kevin', 'parent') || hasRel(allRelationships, 'Tomas', 'Kevin', 'parent'),
      'Tomás (jefe) → parent of Kevin');
    // "mi carnal" = my brother (actual brother, not figurative)
    assert(R, hasRel(allRelationships, 'Ángel', 'Kevin', 'sibling') || hasRel(allRelationships, 'Angel', 'Kevin', 'sibling'),
      'Ángel (carnal) ↔ sibling of Kevin');
    // "mi hermana la Lupita"
    assert(R, hasRel(allRelationships, 'Guadalupe', 'Kevin', 'sibling') || hasRel(allRelationships, 'Lupita', 'Kevin', 'sibling'),
      'Lupita ↔ sibling of Kevin');

    section(R, 'Uncle & Partner');
    // "tío Beto... es el hermano de mi jefe"
    // LLM may express this as uncle_aunt(Alberto→Kevin) instead of explicit sibling(Alberto→Tomás)
    const albertoTomas = hasRel(allRelationships, 'Alberto', 'Tomás', 'sibling') || hasRel(allRelationships, 'Beto', 'Tomas', 'sibling') ||
      hasRel(allRelationships, 'Alberto', 'Tomas', 'sibling') || hasRel(allRelationships, 'Beto', 'Tomás', 'sibling');
    const albertoUncle = allRelationships.some(r => {
      const a = normalize(r.personAName || '').split(' ')[0];
      return (a === 'alberto' || a === 'beto') && r.type === 'uncle_aunt';
    });
    assert(R, albertoTomas || albertoUncle,
      'Beto/Alberto ↔ sibling of Tomás or uncle_aunt of Kevin (implies brotherhood)');
    warn(R, albertoTomas,
      'Prefer explicit sibling(Alberto↔Tomás) over implicit uncle_aunt(Alberto→Kevin)');
    // "juntado con la Güera Laura" — spouse
    const betoLaura = allRelationships.some(r => {
      const a = normalize(r.personAName || '').split(' ')[0];
      const b = normalize(r.personBName || '').split(' ')[0];
      return (r.type === 'spouse') &&
        ((a === 'alberto' || a === 'beto') && b === 'laura') ||
        (a === 'laura' && (b === 'alberto' || b === 'beto'));
    });
    assert(R, betoLaura, 'Beto ↔ Laura spouse ("juntado con")');
    // Brandon is Beto & Laura's kid
    const brandonParent = allRelationships.some(r => {
      const a = normalize(r.personAName || '').split(' ')[0];
      const b = normalize(r.personBName || '').split(' ')[0];
      return r.type === 'parent' && (a === 'alberto' || a === 'beto' || a === 'laura') && b === 'brandon';
    });
    assert(R, brandonParent, 'Beto/Laura → parent of Brandon');

    section(R, 'Grandma — Nicknames');
    // "Doña Concha" = Concepción
    const concha = people.find(p => normalize(p.firstName).includes('concepcion') || normalize(p.firstName).includes('concha'));
    warn(R, concha?.nickname?.toLowerCase()?.includes('concha') || normalize(concha?.firstName || '').includes('concha'),
      'Concepción should have nickname "Concha"');

    section(R, 'Informal Year Parsing');
    const tomas = people.find(p => normalize(p.firstName).includes('tomas'));
    warn(R, tomas?.birthDate && parseInt(tomas.birthDate) === 1972, `Tomás "setenta y dos" → 1972, got ${tomas?.birthDate}`);

    // Esperanza — minimal info grandma
    warn(R, pNames.some(pn => pn.includes('esperanza')), 'Esperanza (abuela materna) should be extracted even with minimal info');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 8: EN — Non-linear storytelling, time jumps,
//             unreliable narrator, contradictions
// ────────────────────────────────────────────────────────────
// Tests: Out-of-order revelations, "oh I forgot to mention",
//        narrator backtracks and adds context later,
//        emotional tangents, nickname-only references that
//        are later revealed to be the same person,
//        a pet mentioned (should NOT be a person)
//
// NARRATOR: Aisha Mohammed (female, b.1997, London UK)
//   Dad: Hassan Mohammed (b.1960, from Mogadishu, Somalia)
//   Mom: Fatima Ali (b.1965, from Nairobi, Kenya)
//   Brother: Omar Mohammed (b.1994)
//   Sister: Amina Mohammed (b.2000)
//   "Habaryar" (Somali for maternal aunt): Halima Ali (b.1970)
//   "Ayeeyo" (Somali for grandma): Khadija (b.1935, d.2019)
//   Mentioned pet: "Simba" the cat — NOT a person
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '8. EN — Non-Linear Storytelling, Time Jumps, Unreliable Narrator',
  language: 'en',
  narrator: { firstName: 'Aisha', lastName: 'Mohammed', gender: 'female' },
  existingPeople: [],
  transcript: `Yeah so, where do I start? I guess I should start with Ayeeyo. She was everything to me. Ayeeyo passed away in 2019 and honestly I still think about her every day. She was born in 1935 in Somalia.

Oh wait, I should probably say who I am first. I'm Aisha Mohammed, born in 1997 in London. I'm female. My parents immigrated from East Africa before I was born.

So my dad, Hassan Mohammed, he's from Mogadishu, Somalia. Born in 1960. He drives a taxi. Has been doing that since we moved here. My mom is Fatima Ali, she's from Nairobi, Kenya. Born in 1965. She works as a teaching assistant at a primary school.

So Ayeeyo — that's what we call grandma in Somali — her real name was Khadija. I don't know her last name actually. She was my mom's mother. She lived with us for the last ten years of her life. She used to tell us stories about life in Kenya, about her childhood. She couldn't read or write but she was the wisest person I've ever known.

I have a brother, Omar. He was born in ninety-four. Omar is the oldest. He's an accountant now, very serious type. And my little sister Amina was born in 2000. Amina is studying nursing.

Oh and another person I should mention — my mom's sister, my habaryar Halima. That means maternal aunt in Somali. Halima Ali, born in 1970 in Nairobi. She still lives in Kenya. We video-call her every weekend. She's hilarious, always making jokes.

Going back to Ayeeyo... she had this cat named Simba. After she passed, we kept Simba. That cat is like seventeen years old now and still going strong. Simba practically thinks he's a member of the family, haha.

Wait, I forgot to mention — Omar is married! His wife is Zahra, born in 1996. They have a little girl named Safiya, she's three years old. Safiya is the cutest thing ever, she calls me "Aunt Aisha" and it melts my heart.

One thing I want to say about my family — being Somali and Kenyan in London, it's a unique mix. My dad and mom come from very different cultures but they made it work. Dad speaks Somali, Mom speaks Swahili and Somali, and we all speak English obviously. Ayeeyo only spoke Somali. I wish I spoke it better.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Aisha', 'Hassan', 'Fatima', 'Omar', 'Amina', 'Halima', 'Zahra', 'Safiya']) {
      assert(R, pNames.includes(normalize(name)), `Person missing: ${name}`);
    }
    // Khadija/Ayeeyo
    assert(R, pNames.some(pn => pn.includes('khadija') || pn.includes('ayeeyo')), 'Khadija/Ayeeyo should exist');

    section(R, 'Non-Linear Reference Resolution');
    // "Ayeeyo" introduced first, then revealed as Khadija, mom's mother
    const khadija = people.find(p => normalize(p.firstName).includes('khadija') || normalize(p.firstName).includes('ayeeyo'));
    assert(R, hasRel(allRelationships, 'Fatima', 'Aisha', 'parent'), 'Fatima → parent of Aisha');
    assert(R, hasRel(allRelationships, 'Hassan', 'Aisha', 'parent'), 'Hassan → parent of Aisha');

    // Khadija → parent of Fatima or grandparent of Aisha
    const khadijaRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '');
      const b = normalize(r.personBName || '');
      return a.includes('khadija') || a.includes('ayeeyo') || b.includes('khadija') || b.includes('ayeeyo');
    });
    assert(R, khadijaRels.some(r => r.type === 'parent' || r.type === 'grandparent'),
      'Khadija/Ayeeyo should be parent of Fatima or grandparent of Aisha');

    section(R, 'Sibling Relationships');
    assert(R, hasRel(allRelationships, 'Omar', 'Aisha', 'sibling'), 'Omar ↔ sibling of Aisha');
    assert(R, hasRel(allRelationships, 'Amina', 'Aisha', 'sibling'), 'Amina ↔ sibling of Aisha');

    section(R, '"Habaryar" — Maternal Aunt');
    assert(R, hasRel(allRelationships, 'Halima', 'Fatima', 'sibling') ||
      hasRel(allRelationships, 'Halima', 'Aisha', 'uncle_aunt'),
      'Halima ↔ sibling of Fatima or uncle_aunt of Aisha');

    section(R, 'Late Revelation — Omar\'s Family');
    assert(R, hasRel(allRelationships, 'Omar', 'Zahra', 'spouse'), 'Omar ↔ Zahra spouse');
    assert(R, hasRel(allRelationships, 'Omar', 'Safiya', 'parent') || hasRel(allRelationships, 'Zahra', 'Safiya', 'parent'),
      'Omar/Zahra → parent of Safiya');

    section(R, 'Age Calculation');
    const safiya = people.find(p => normalize(p.firstName) === 'safiya');
    warn(R, safiya?.birthDate && parseInt(safiya.birthDate) >= 2022 && parseInt(safiya.birthDate) <= 2024,
      `Safiya "three years old" → ~2023, got ${safiya?.birthDate}`);

    section(R, 'Pet — NOT a Person');
    const simbaRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '').split(' ')[0];
      const b = normalize(r.personBName || '').split(' ')[0];
      return a === 'simba' || b === 'simba';
    });
    assert(R, simbaRels.length === 0, 'Simba (the cat) should NOT have family relationships');

    section(R, 'Deceased');
    warn(R, khadija?.isDeceased || !!khadija?.deathDate, 'Khadija/Ayeeyo should be deceased');

    return R;
  }
});

// ============================================================
// RUNNER
// ============================================================

async function runScenario(scenario) {
  const provider = GROQ_API_KEY ? 'Groq (Llama 3.3 70B)' : 'OpenAI (GPT-4o-mini)';

  console.log('\n' + '═'.repeat(70));
  console.log(`  📋 SCENARIO: ${scenario.name}`);
  console.log('═'.repeat(70));
  console.log(`  Provider: ${provider}`);
  console.log(`  Language: ${scenario.language}`);
  console.log(`  Narrator: ${scenario.narrator.firstName} ${scenario.narrator.lastName}`);
  console.log(`  Transcript: ${scenario.transcript.length} chars`);

  const subjectName = `${scenario.narrator.firstName} ${scenario.narrator.lastName}`;
  const genderHint = scenario.narrator.gender
    ? ` Their gender is ${scenario.narrator.gender}. Use correct gendered language when referring to ${subjectName}.`
    : '';

  let existingTreeContext = '';
  if (scenario.existingPeople?.length > 0) {
    const peopleLines = scenario.existingPeople.map(p => {
      const parts = [p.first_name + (p.last_name ? ' ' + p.last_name : '')];
      if (p.birth_date) parts.push(`b. ${p.birth_date}`);
      if (p.birth_place) parts.push(`from ${p.birth_place}`);
      if (p.metadata?.gender) parts.push(p.metadata.gender);
      return `  - ${parts.join(', ')} [id:${p.id}]`;
    }).join('\n');
    existingTreeContext = `\n\n[EXISTING FAMILY TREE — These people already exist in the database. When you detect a person who matches an existing entry, use their exact name. Do NOT create duplicates.\nKnown people:\n${peopleLines}\n]`;
  }

  const transcriptForAI = `[Narrator/subject of this interview is ${subjectName}.${genderHint} Any first-person references ("I", "me", "my") refer to ${subjectName}. Do NOT create a separate entry for the narrator — they are ${subjectName}. IMPORTANT: When the narrator says "my mom", "my dad", "my brother", etc., create relationships between those people and ${subjectName}. Use ${subjectName} as the personA or personB name in relationships — never use "I" or "me" as a person name.]${existingTreeContext}\n\n${scenario.transcript}`;

  const startTime = Date.now();

  console.log('  ⏳ Extracting...');
  const extraction = await callLLM(
    EXTRACTION_PROMPT + languageInstruction(scenario.language) + '\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
    transcriptForAI
  );
  console.log(`  ✅ Extraction: ${extraction.suggestedPeople?.length || 0} people, ${extraction.relationships?.length || 0} rels (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);

  const resolvedPeople = resolvePeople(
    extraction.suggestedPeople || [],
    scenario.narrator,
    scenario.existingPeople || []
  );

  const allRelationships = [];
  let unresolvedCount = 0;
  for (const rel of (extraction.relationships || [])) {
    const personA = resolvePersonName(rel.personA, resolvedPeople, scenario.narrator);
    const personB = resolvePersonName(rel.personB, resolvedPeople, scenario.narrator);
    if (personA && personB && personA.id !== personB.id) {
      let relType = rel.relationshipType;
      if (relType === 'adopted_sibling') relType = 'sibling';
      if (relType === 'aunt' || relType === 'uncle') relType = 'uncle_aunt';
      if (relType === 'nephew' || relType === 'niece') relType = 'nephew_niece';
      if (relType === 'grandfather' || relType === 'grandmother') relType = 'grandparent';
      if (relType === 'grandson' || relType === 'granddaughter') relType = 'grandchild';
      if (relType === 'father' || relType === 'mother') relType = 'parent';
      if (relType === 'son' || relType === 'daughter') relType = 'child';
      if (relType === 'husband' || relType === 'wife') relType = 'spouse';
      if (relType === 'brother' || relType === 'sister') relType = 'sibling';
      if (relType === 'father_in_law' || relType === 'mother_in_law') relType = 'parent_in_law';
      if (relType === 'son_in_law' || relType === 'daughter_in_law') relType = 'child_in_law';
      if (relType === 'brother_in_law' || relType === 'sister_in_law') relType = 'in_law';
      allRelationships.push({
        personAId: personA.id,
        personBId: personB.id,
        personAName: `${personA.firstName}${personA.lastName ? ' ' + personA.lastName : ''}`,
        personBName: `${personB.firstName}${personB.lastName ? ' ' + personB.lastName : ''}`,
        type: relType,
        confidence: rel.confidence,
        inferred: false,
      });
    } else {
      unresolvedCount++;
    }
  }
  if (unresolvedCount > 0) {
    console.log(`  ⚠️  ${unresolvedCount} unresolved relationship(s)`);
  }

  const inferred = inferTransitiveRelationships(allRelationships);
  const peopleArr = uniquePeople(resolvedPeople);
  for (const inf of inferred) {
    const personA = peopleArr.find(p => p.id === inf.personAId);
    const personB = peopleArr.find(p => p.id === inf.personBId);
    allRelationships.push({
      ...inf,
      personAName: personA ? `${personA.firstName}${personA.lastName ? ' ' + personA.lastName : ''}` : '?',
      personBName: personB ? `${personB.firstName}${personB.lastName ? ' ' + personB.lastName : ''}` : '?',
      inferred: true,
    });
  }

  const directCount = allRelationships.filter(r => !r.inferred).length;
  const inferredCount = allRelationships.filter(r => r.inferred).length;
  console.log(`  📊 Total: ${allRelationships.length} rels (${directCount} direct + ${inferredCount} inferred)`);

  const results = scenario.assertions(extraction, resolvedPeople, allRelationships);
  printResults(results, scenario.name);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ⏱️  Completed in ${totalTime}s`);

  return { name: scenario.name, results, extraction, resolvedPeople: peopleArr, allRelationships, unresolvedCount, totalTime };
}

function printResults(R) {
  if (R.errors.length) {
    console.log(`\n  ❌ FAILURES (${R.failed}):`);
    for (const e of R.errors) console.log(`     ✗ ${e}`);
  }
  if (R.warns.length) {
    console.log(`\n  ⚠️  WARNINGS (${R.warnings}):`);
    for (const w of R.warns) console.log(`     ⚠ ${w}`);
  }
  const total = R.passed + R.failed + R.warnings;
  const passRate = total > 0 ? ((R.passed / total) * 100).toFixed(1) : 0;
  console.log(`\n  ═══════════════════════════════`);
  console.log(`  ✅ Passed:   ${R.passed}`);
  console.log(`  ❌ Failed:   ${R.failed}`);
  console.log(`  ⚠️  Warnings: ${R.warnings}`);
  console.log(`  📊 Score:    ${passRate}% (${R.passed}/${total})`);
  console.log(`  ═══════════════════════════════`);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const startTime = Date.now();
  const provider = GROQ_API_KEY ? 'Groq (Llama 3.3 70B)' : 'OpenAI (GPT-4o-mini)';

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   Matra — Unconventional Families Test Suite                  ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║   8 scenarios · Real-world edge cases & messy transcripts     ║');
  console.log('║   Same-sex · Foster · Slang · Spanglish · Non-linear         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n  Provider: ${provider}\n`);

  const args = process.argv.slice(2);
  let scenariosToRun = SCENARIOS;
  if (args.length > 0) {
    const nums = args.map(a => parseInt(a)).filter(n => !isNaN(n));
    if (nums.length > 0) {
      scenariosToRun = SCENARIOS.filter((_, i) => nums.includes(i + 1));
      console.log(`  Running scenarios: ${nums.join(', ')}\n`);
    }
  }

  const allResults = [];
  for (const scenario of scenariosToRun) {
    try {
      const result = await runScenario(scenario);
      allResults.push(result);
    } catch (err) {
      console.error(`  💥 SCENARIO FAILED: ${scenario.name}`);
      console.error(`     ${err.message}`);
      allResults.push({
        name: scenario.name,
        results: { passed: 0, failed: 1, warnings: 0, errors: [`Scenario crashed: ${err.message}`], warns: [] },
        resolvedPeople: [],
        allRelationships: [],
        unresolvedCount: 0,
        totalTime: '0',
      });
    }
  }

  // Grand summary
  console.log('\n\n' + '═'.repeat(70));
  console.log('  📊 GRAND SUMMARY — Unconventional Families Test Suite');
  console.log('═'.repeat(70));

  let grandPassed = 0, grandFailed = 0, grandWarnings = 0;
  for (const r of allResults) {
    const R = r.results;
    const total = R.passed + R.failed + R.warnings;
    const score = total > 0 ? ((R.passed / total) * 100).toFixed(1) : 0;
    const icon = R.failed === 0 ? '✅' : '❌';
    console.log(`  ${icon} ${r.name.padEnd(55)} ${score}% (${R.passed}P ${R.failed}F ${R.warnings}W)`);
    grandPassed += R.passed;
    grandFailed += R.failed;
    grandWarnings += R.warnings;
  }

  const grandTotal = grandPassed + grandFailed + grandWarnings;
  const overallScore = grandTotal > 0 ? ((grandPassed / grandTotal) * 100).toFixed(1) : 0;
  const scenariosPassed = allResults.filter(r => r.results.failed === 0).length;

  console.log('\n' + '─'.repeat(70));
  console.log(`  📋 Scenarios: ${scenariosPassed}/${allResults.length} passed`);
  console.log(`  ✅ Passed:    ${grandPassed}`);
  console.log(`  ❌ Failed:    ${grandFailed}`);
  console.log(`  ⚠️  Warnings:  ${grandWarnings}`);
  console.log(`  📊 Overall:   ${overallScore}% (${grandPassed}/${grandTotal})`);
  console.log('─'.repeat(70));

  if (grandFailed === 0) {
    console.log('\n  🎉 ALL SCENARIOS PASSED! 🎉\n');
  } else {
    console.log(`\n  💥 ${grandFailed} total assertion(s) failed across ${allResults.length - scenariosPassed} scenario(s)\n`);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ⏱️  Total time: ${totalTime}s\n`);

  // Debug JSON
  const debugPath = path.join(__dirname, 'test-unconventional-debug.json');
  fs.writeFileSync(debugPath, JSON.stringify({
    provider,
    timestamp: new Date().toISOString(),
    totalTime: `${totalTime}s`,
    overallScore: `${overallScore}%`,
    scenarios: allResults.map(r => ({
      name: r.name,
      passed: r.results.passed,
      failed: r.results.failed,
      warnings: r.results.warnings,
      errors: r.results.errors,
      warns: r.results.warns,
      people: r.resolvedPeople,
      relationships: r.allRelationships,
      rawExtraction: r.extraction,
    })),
  }, null, 2), 'utf-8');
  console.log(`  🔍 Debug JSON: ${debugPath}\n`);

  process.exit(grandFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});

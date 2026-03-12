#!/usr/bin/env node
// ============================================================
// Matra — AI Pipeline Test Harness
// ============================================================
// Run: node test-pipeline.mjs
//
// Tests the extraction + summarization pipeline locally using
// the same prompts as the edge function, without needing to go
// through the full app flow.
//
// Outputs:
//   1. Console tree visualization of people + relationships
//   2. Stories with key moments
//   3. HTML graph file (open in browser)
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env from .env.local ──
const envPath = fs.existsSync(path.join(__dirname, '.env.local'))
  ? path.join(__dirname, '.env.local')
  : path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      process.env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
  }
}

// ── Config ──
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!GROQ_API_KEY && !OPENAI_API_KEY) {
  console.error('❌ No API keys found. Set GROQ_API_KEY or OPENAI_API_KEY in .env.local');
  process.exit(1);
}

// ── Test Interviews (sequential — first Carlos, then Carlos José) ──
const INTERVIEWS = [
  {
    id: 'interview-1',
    label: 'Carlos Bueso (son)',
    narrator: { firstName: 'Carlos', lastName: 'Bueso', gender: 'male' },
    transcript: `Hola, mi nombre es Carlos Adrián Bueso. Nací el octubre 22 de 1999 en la Ciudad de México. Mis papás se llaman Carlos José Bueso y mi mamá se llama Alicia Rentería Montes de Oca. Mi papá nació en Puerto Rico y se fue a estudiar la universidad a Boston, en Massachusetts. Y después de eso consiguió un trabajo que lo expatrió a la Ciudad de México, donde conoció a mi mamá. Una vez que mi mamá y él se conocieron, se casaron y tuvieron tres hijos, que soy yo, mi hermano grande Marco Andrés Bueso y mi hermana pequeña Brisela Alessandra Bueso. También tengo un medio hermano de parte de mi mamá que se llama Cristian Rentería. Él nació en 1985 y él ya tiene dos hijos. Uno de sus hijos se llama Mateo Renter y su otro hijo se llama Andr Renter Mi familia es bastante grande y la verdad es que somos muy unidos Yo soy desarrollador de software y me dedico a programar. Tengo una empresa con mis amigos, un estudio creativo que se llama Alquimia Studio y yo soy programador ahí. principalmente hago páginas web, aplicaciones como esta misma en la que estamos trabajando el cual construye una gráfica de tu árbol familiar con inteligencia artificial y bueno, entre muchas otras cosas mi abuela materna se llama igual que mi mamá, Alicia Rentería y ella ya falleció, pero la queremos mucho. De hecho, el apodo que le tenemos a ella es Abuelita Mimi y también tengo una tía de parte de mi mamá. Ella se llama Claudia y ella es hermana de mi mamá mamá y Claudia tiene dos hijos que son Omar Gutiérrez y Valeria Gutiérrez que son mis primos`,
  },
  {
    id: 'interview-2',
    label: 'Carlos José Bueso (dad)',
    narrator: { firstName: 'Carlos José', lastName: 'Bueso', gender: 'male' },
    transcript: `Hola, me llamo Carlos José Bueso y nací en Puerto Rico el 16 de marzo de 1968. Yo tengo tres hijos con mi ex esposa Alicia Rentería. Mis hijos son Carlos, Marco y Bricel. Yo tengo mis papás en Puerto Rico Mi mamá se llama Lilian Mas Y mi papá biológico se llama Héctor Bueso Mi papá biológico Héctor falleció cuando yo tenía seis meses de edad En una exploración de cuevas en Puerto Rico Y mi abuela después se casó con mi padrastro que se llama José Virriel. También tengo un hermano que se llama Héctor Bueso y mi hermano está casado con su esposa que se llama Omaira Ortega.`,
  },
];

// ============================================================
// PROMPTS (mirrored from backend)
// ============================================================

function languageInstruction(language) {
  if (!language || language === 'en') return '';
  const langNames = { es: 'Spanish' };
  const name = langNames[language] || language;
  return `\n\nIMPORTANT: Generate ALL output text (summaries, stories, biographies, titles, descriptions) in ${name}. Field names/keys in the JSON must remain in English, but all human-readable string values must be in ${name}.`;
}

const EXTRACTION_PROMPT = `You are an AI assistant specialized in analyzing family interview transcripts. Your job is to extract structured information about people, relationships, dates, locations, and events.

Analyze the provided transcript and extract:

1. **entities**: An array of detected entities. Each entity has:
   - type: "person" | "date" | "location" | "event" | "relationship"
   - value: The entity text as mentioned
   - confidence: 0.0-1.0 confidence score
   - context: The surrounding sentence for reference

2. **relationships**: An array of detected relationships. Each has:
   - personA: First person's name (the one who holds the role)
   - personB: Second person's name (the one personA is related to)
   - relationshipType: One of: parent, child, spouse, ex_spouse, sibling, half_sibling, grandparent, grandchild, great_grandparent, great_grandchild, great_great_grandparent, great_great_grandchild, uncle_aunt, nephew_niece, cousin, in_law, parent_in_law, child_in_law, step_parent, step_child, step_sibling, adopted_parent, adopted_child, godparent, godchild, other
   - confidence: 0.0-1.0
   - context: The sentence that implies this relationship

   IMPORTANT directionality: "personA is [relationshipType] of personB".
   Example: if the narrator says "my mom is Maria", then personA="Maria", personB="[narrator name]", relationshipType="parent".
   Example: if the narrator says "I have a brother named James", then personA="James", personB="[narrator name]", relationshipType="sibling".

3. **suggestedPeople**: An array of unique people mentioned. Each has:
   - firstName: string (required)
   - lastName: string (optional)
   - nickname: string (optional)
   - birthDate: ISO date string (optional)
   - deathDate: ISO date string (optional)
   - birthPlace: string (optional)
   - currentLocation: string (optional)
   - profession: string (optional)
   - isDeceased: boolean (optional)
   - gender: "male" | "female" | null (optional — infer from contextual clues)

Rules:
- Be conservative with confidence scores. Only use 0.9+ when explicitly stated.
- Extract ALL relationships stated or strongly implied. Possessive references like "my mom", "my dad" are EXPLICIT — extract with 0.9+.
- MULTILINGUAL SUPPORT: Recognize Spanish kinship terms:
  - Parents: papá, mamá, padre, madre
  - Siblings: hermano, hermana
  - Half siblings: medio hermano, media hermana → use "half_sibling"
  - Step siblings: hermanastro, hermanastra → use "step_sibling"
  - CRITICAL for half-siblings: when the narrator specifies WHICH PARENT the half-sibling comes from (e.g., "medio hermano de parte de mi mamá"), you MUST extract a parent relationship between that parent and the half-sibling.
  - In-laws: suegro, suegra → use "parent_in_law". nuero, nuera, yerno → use "child_in_law". cuñado, cuñada → use "in_law".
  - Grandparents: abuelo, abuela, bisabuelo, bisabuela
  - Uncle/aunt: tío, tía
  - Cousin: primo, prima
  - Spouse: esposo, esposa
  - Child: hijo, hija
- Deduplicate people — but NEVER merge two distinct individuals who happen to share the same name.
- HOMONYMOUS PEOPLE: If the transcript mentions two or more DISTINCT people with the same full name (e.g., a deceased father and a living brother both called "Héctor Bueso", or a grandmother and granddaughter with the same name), you MUST create SEPARATE suggestedPeople entries for each. Disambiguate by appending a parenthetical role to the firstName field, e.g., firstName: "Héctor (padre)" vs firstName: "Héctor (hermano)". Use that same disambiguated name consistently in all personA/personB references in the relationships array. Never merge distinct people into one entry.
- Dates: If a year is mentioned without month/day, use ONLY "YYYY" format. Do NOT add "-01-01". "born in 1968" → "1968", NOT "1968-01-01".
- Ages: "tiene seis años" → calculate approximate birth year. Use "YYYY" format.
- EVERY person in "relationships" MUST appear in "suggestedPeople".
- When someone's children are mentioned (e.g., "his children are X and Y"), the parent is THAT person, not the narrator.
- Pay attention to possessive chains: "his/her children" refers to the LAST mentioned person.

Respond with a JSON object matching the schema above. No other text.`;

const SUMMARY_PROMPT = `You are an AI assistant that creates warm, emotionally resonant summaries of family interview transcripts.

Analyze the transcript and produce:

1. **summary**: A 2-4 paragraph summary in warm, narrative tone.
2. **keyTopics**: Array of 3-7 key topics (short phrases).
3. **emotionalTone**: A single word or short phrase.
4. **suggestedStories**: Array of up to 5 distinct stories. Each has:
   - title: Evocative, poetic title
   - content: 1-3 paragraphs narrative
   - involvedPeople: Array of names
   - approximateDate: (optional)
   - location: (optional)
   - keyMoments: Array of 1-3 verbatim quotes with labels

Rules:
- ALWAYS produce at least 1 story.
- Stories should feel like chapters in a family memoir.
- Quality over quantity.

Respond with a JSON object. No other text.`;

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
      temperature: 0.3,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
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
      temperature: 0.3,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function callLLM(systemPrompt, userMessage) {
  if (GROQ_API_KEY) return callGroq(systemPrompt, userMessage);
  return callOpenAI(systemPrompt, userMessage);
}

// ============================================================
// Person Resolution (mirrors backend logic)
// ============================================================

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

// Strip parenthetical disambiguators: "Héctor (padre)" → "Héctor"
function stripDisambiguator(name) {
  return (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Check if a relationship name plausibly refers to a target person name.
// Requires all words of the shorter name to appear in the longer one,
// with at most 1 extra word difference. Ignores parenthetical disambiguators.
function nameRefersTo(refNorm, targetNorm) {
  if (refNorm === targetNorm) return true;
  const rWords = refNorm.split(/\s+/).filter(w => !w.startsWith('(') && !w.endsWith(')'));
  const tWords = targetNorm.split(/\s+/).filter(w => !w.startsWith('(') && !w.endsWith(')'));
  const shorter = rWords.length <= tWords.length ? rWords : tWords;
  const longer = rWords.length <= tWords.length ? tWords : rWords;
  if (longer.length - shorter.length > 1) return false;
  return shorter.length > 0 && shorter.every(w => longer.includes(w));
}

// Check if two suggested people with the same name are actually different individuals
function shouldCreateSeparatePerson(suggested, existing, relationships) {
  // Deceased mismatch → different people (e.g., deceased father vs living brother)
  if (suggested.isDeceased === true && !existing.isDeceased) return true;
  if (!suggested.isDeceased && existing.isDeceased === true) return true;

  // Different birth dates → different people
  if (suggested.birthDate && existing.birthDate && suggested.birthDate !== existing.birthDate) return true;

  // Check for a direct ancestor relationship between them in the extraction
  const sugName = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);
  const exName = normalize(`${existing.firstName} ${existing.lastName || ''}`);
  const ancestorTypes = ['parent', 'grandparent', 'great_grandparent', 'great_great_grandparent'];
  for (const rel of (relationships || [])) {
    const nA = normalize(rel.personA);
    const nB = normalize(rel.personB);
    if (ancestorTypes.includes(rel.relationshipType)) {
      // Strict: one side must exactly match suggested, other must exactly match existing
      if ((nA === sugName && nB === exName) || (nA === exName && nB === sugName)) return true;
    }
  }

  // Check for contradictory relationship types to/from the same target
  // (e.g., same name is both "parent" and "sibling" of the same person)
  const baseNorm = normalize(stripDisambiguator(suggested.firstName) + ' ' + stripDisambiguator(suggested.lastName || ''));
  const baseFirst = baseNorm.split(/\s+/)[0];
  const ancestorSet = new Set(['parent', 'grandparent', 'great_grandparent', 'step_parent']);
  const peerSet = new Set(['sibling', 'half_sibling', 'step_sibling', 'spouse', 'ex_spouse']);
  const byTarget = new Map();
  for (const rel of (relationships || [])) {
    const nA = normalize(rel.personA);
    const nB = normalize(rel.personB);
    // Strict match: only match if nA/nB IS baseNorm or just the first name.
    // Prevents "Carlos José Bueso" from matching "Carlos Bueso" (different people).
    const matchA = nA === baseNorm || nA === baseFirst;
    const matchB = nB === baseNorm || nB === baseFirst;
    if (matchA) {
      if (!byTarget.has(nB)) byTarget.set(nB, new Set());
      byTarget.get(nB).add(rel.relationshipType);
    }
    if (matchB) {
      if (!byTarget.has(nA)) byTarget.set(nA, new Set());
      byTarget.get(nA).add(rel.relationshipType);
    }
  }
  for (const [, types] of byTarget) {
    const hasAnc = [...types].some(t => ancestorSet.has(t));
    const hasPeer = [...types].some(t => peerSet.has(t));
    if (hasAnc && hasPeer) return true;
  }

  return false;
}

function resolvePeople(suggestedPeople, narrator, existingPeople, relationships, narratorId = 'person-narrator', startNextId = 1) {
  const resolved = new Map(); // normKey → personRecord
  let nextId = startNextId;

  // Helper: check if a name looks like a variant of the narrator's name
  const narFirst = normalize(narrator.firstName || '');
  const narLast = normalize(narrator.lastName || '');
  const narLastWords = narLast ? narLast.split(/\s+/) : [];
  const normNarratorName = normalize(`${narrator.firstName} ${narrator.lastName || ''}`);

  function looksLikeNarratorVariant(normName) {
    const parts = normName.split(/\s+/);
    const firstWord = parts[0];
    const lastWords = parts.length > 1 ? parts.slice(1) : [];
    return firstWord === narFirst &&
      narLastWords.length > 0 && lastWords.length > 0 &&
      narLastWords.some(w => lastWords.includes(w));
  }

  // Check if a name-variant candidate is a distinct family member (e.g., a
  // parent of the narrator who shares the same name pattern).
  function isDistinctFromNarrator(sugNormFull) {
    const narratorName = normalize(`${narrator.firstName} ${narrator.lastName || ''}`);
    // If the suggested name exactly matches the narrator, it IS the narrator
    if (sugNormFull === narratorName) return false;
    const parentTypes = ['parent', 'grandparent', 'great_grandparent', 'great_great_grandparent'];
    for (const rel of (relationships || [])) {
      const normA = normalize(rel.personA);
      const normB = normalize(rel.personB);
      // Case 1: candidate is a parent/ancestor of narrator (or variant)
      if (normA === sugNormFull && parentTypes.includes(rel.relationshipType) &&
          (normB === narratorName || looksLikeNarratorVariant(normB))) {
        return true;
      }
      // Case 1b: reverse — narrator is child of candidate
      if (normB === sugNormFull && rel.relationshipType === 'child' &&
          (normA === narratorName || looksLikeNarratorVariant(normA))) {
        return true;
      }
      // Case 2: candidate has a spouse/ex_spouse relationship
      if ((normA === sugNormFull || normB === sugNormFull) &&
          (rel.relationshipType === 'spouse' || rel.relationshipType === 'ex_spouse')) {
        return true;
      }
      // Case 3: candidate has any direct relationship with narrator's stored name
      if ((normA === sugNormFull && normB === narratorName) ||
          (normB === sugNormFull && normA === narratorName)) {
        return true;
      }
    }
    return false;
  }

  // Pre-seed narrator
  const narratorKey = normalize(`${narrator.firstName} ${narrator.lastName || ''}`);
  const narratorRecord = {
    id: narratorId,
    firstName: stripDisambiguator(narrator.firstName),
    lastName: stripDisambiguator(narrator.lastName),
    gender: narrator.gender,
    isNarrator: true,
  };
  resolved.set(narratorKey, narratorRecord);

  // Pre-seed existing people
  for (const ep of existingPeople) {
    const epKey = normalize(`${ep.first_name} ${ep.last_name || ''}`);
    if (!resolved.has(epKey)) {
      const epRecord = {
        id: ep.id,
        firstName: ep.first_name,
        lastName: ep.last_name,
        nickname: ep.nickname,
        isDeceased: !!ep.is_deceased,
        isNarrator: !!ep.is_narrator,
        birthDate: ep.birth_date || null,
        gender: ep.metadata?.gender || null,
        existing: true,
      };
      resolved.set(epKey, epRecord);
      // Also map first word of first name for abbreviated lookups ("Marco" → "Marco Andrés Bueso")
      const firstWord = normalize(ep.first_name || '').split(/\s+/)[0];
      if (firstWord && !resolved.has(firstWord)) {
        resolved.set(firstWord, epRecord);
      }
      // Also map nickname for resolution ("Bricel" → Brisela)
      if (ep.nickname) {
        const nickKey = normalize(ep.nickname);
        if (!resolved.has(nickKey)) {
          resolved.set(nickKey, epRecord);
        }
      }
    }
  }

  for (const suggested of suggestedPeople) {
    // Strip parenthetical disambiguator for display, keep raw for resolution keys
    const displayFirst = stripDisambiguator(suggested.firstName || '');
    const displayLast = stripDisambiguator(suggested.lastName || '');
    const sugFirst = normalize(suggested.firstName || '');
    const sugLast = normalize(suggested.lastName || '');
    const sugFullKey = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);
    // Also compute the "clean" key without disambiguator for cross-checking
    const cleanKey = normalize(`${displayFirst} ${displayLast}`);

    // ── Narrator variant check (use clean names) ──
    const cleanFirst = normalize(displayFirst);
    const cleanLast = normalize(displayLast);
    const cleanLastWords = cleanLast ? cleanLast.split(/\s+/) : [];
    const cleanFirstWords = cleanFirst.split(/\s+/);
    const firstNameMatches = cleanFirst === narFirst || cleanFirstWords[0] === narFirst;
    const sharesLastName = narLastWords.length > 0 && cleanLastWords.length > 0 &&
      narLastWords.some(w => cleanLastWords.includes(w));
    if (firstNameMatches && sharesLastName) {
      const sugNormFull = normalize(`${displayFirst} ${displayLast}`);
      if (isDistinctFromNarrator(sugNormFull)) {
        console.log(`  ⚠️  Suggested person "${displayFirst} ${displayLast}" shares name pattern with narrator but is a parent/ancestor — treating as distinct person`);
      } else {
        console.log(`  ⚠️  Suggested person "${displayFirst} ${displayLast}" is a name variant of narrator — resolving to narrator`);
        resolved.set(sugFullKey, resolved.get(normNarratorName));
        if (cleanKey !== sugFullKey) resolved.set(cleanKey, resolved.get(normNarratorName));
        const narRecord = resolved.get(normNarratorName);
        if (suggested.birthDate && !narRecord.birthDate) narRecord.birthDate = suggested.birthDate;
        if (suggested.birthPlace && !narRecord.birthPlace) narRecord.birthPlace = suggested.birthPlace;
        if (suggested.profession && !narRecord.profession) narRecord.profession = suggested.profession;
        if (suggested.gender && !narRecord.gender) narRecord.gender = suggested.gender;
        continue;
      }
    }

    // If already resolved and it's clearly the same person, skip
    if (resolved.has(sugFullKey) || resolved.has(sugFirst)) {
      const matchedPerson = resolved.get(sugFullKey) || resolved.get(sugFirst);
      if (!shouldCreateSeparatePerson(suggested, matchedPerson, relationships)) {
        // Same person — merge any new info and skip
        if (suggested.birthDate && !matchedPerson.birthDate) matchedPerson.birthDate = suggested.birthDate;
        if (suggested.birthPlace && !matchedPerson.birthPlace) matchedPerson.birthPlace = suggested.birthPlace;
        if (suggested.gender && !matchedPerson.gender) matchedPerson.gender = suggested.gender;
        if (suggested.nickname && !matchedPerson.nickname) matchedPerson.nickname = suggested.nickname;
        resolved.set(sugFullKey, matchedPerson);
        continue;
      }
      // Otherwise fall through to candidate-based scoring
    }

    // Candidate-based scoring: find ALL matches ≥ 3, then try them in order,
    // skipping any that shouldCreateSeparatePerson rejects.
    {
      const candidates = [];
      for (const [key, person] of resolved) {
        if (person.id === narratorId) continue; // Only skip current narrator, not prior narrators
        const exFirst = normalize(person.firstName || '');
        const exLast = normalize(person.lastName || '');

        // First name matching: exact, compound-name prefix, or nickname
        let firstScore = 0;
        if (cleanFirst && exFirst) {
          if (cleanFirst === exFirst) firstScore = 3;
          else if (exFirst.startsWith(cleanFirst + ' ') || cleanFirst.startsWith(exFirst + ' ')) firstScore = 2;
        }
        if (firstScore === 0 && person.nickname) {
          const exNick = normalize(person.nickname);
          if (exNick && cleanFirst === exNick) firstScore = 3;
        }
        if (firstScore === 0) continue;
        let score = firstScore;

        if (cleanLast && exLast) {
          if (cleanLast === exLast) score += 3;
          else if (cleanLast.includes(exLast) || exLast.includes(cleanLast)) score += 2;
          else score -= 2;
        }

        if (score >= 3) candidates.push({ key, person, score });
      }
      candidates.sort((a, b) => b.score - a.score);

      let merged = false;
      for (const { key, person: existing, score } of candidates) {
        if (shouldCreateSeparatePerson(suggested, existing, relationships)) {
          console.log(`  ⚡ Same-name split: "${displayFirst} ${displayLast}" — score ${score} but detected as different person`);
          continue;
        }
        // Merge into existing
        if (suggested.lastName && !existing.lastName) existing.lastName = displayLast;
        if (suggested.birthDate && !existing.birthDate) existing.birthDate = suggested.birthDate;
        if (suggested.birthPlace && !existing.birthPlace) existing.birthPlace = suggested.birthPlace;
        if (suggested.gender && !existing.gender) existing.gender = suggested.gender;
        if (suggested.nickname && !existing.nickname) {
          existing.nickname = suggested.nickname;
          const nickKey = normalize(suggested.nickname);
          if (!resolved.has(nickKey)) resolved.set(nickKey, existing);
        }
        const existingMapping = resolved.get(sugFullKey);
        if (!existingMapping?.isNarrator) {
          resolved.set(sugFullKey, existing);
        }
        merged = true;
        break;
      }
      if (merged) continue;
    }

    // New person — no existing match found, or all matches were different people
    const newPerson = {
      id: `person-${nextId++}`,
      firstName: displayFirst,
      lastName: displayLast,
      nickname: suggested.nickname,
      birthDate: suggested.birthDate,
      deathDate: suggested.deathDate,
      birthPlace: suggested.birthPlace,
      currentLocation: suggested.currentLocation,
      profession: suggested.profession,
      isDeceased: suggested.isDeceased,
      gender: suggested.gender,
    };
    // Use disambiguated key if the base key is already taken
    const personKey = resolved.has(sugFullKey) ? `${sugFullKey}#${newPerson.id}` : sugFullKey;
    const existingMapping = resolved.get(personKey);
    if (!existingMapping?.isNarrator) {
      resolved.set(personKey, newPerson);
    }
    // Also map the raw key (with disambiguator) so relationship resolution finds it
    if (sugFullKey !== personKey && sugFullKey !== cleanKey) {
      resolved.set(sugFullKey, newPerson);
    }
    // Map first word of first name for abbreviated lookups (consistent with pre-seeding)
    const sugFirstWord = cleanFirst.split(/\s+/)[0];
    if (sugFirstWord && !resolved.has(sugFirstWord)) resolved.set(sugFirstWord, newPerson);
    // Also set cleanKey if different from sugFullKey (for non-disambiguated lookups)
    if (cleanKey !== sugFullKey && !resolved.has(cleanKey)) {
      resolved.set(cleanKey, newPerson);
    }
    // If this person's exact full name matches sugFullKey but the current owner has a
    // longer/different name, this person should own the exact-match key.
    // (e.g., "Alicia Rentería" grandma should own "alicia renteria", not mom whose
    // firstName happens to be "Alicia Rentería" with lastName "Montes de Oca")
    if (personKey !== sugFullKey && resolved.has(sugFullKey)) {
      const currentOwner = resolved.get(sugFullKey);
      const ownerFullKey = normalize(`${currentOwner.firstName || ''} ${currentOwner.lastName || ''}`);
      if (ownerFullKey !== cleanKey) {
        resolved.set(sugFullKey, newPerson);
      }
    }
  }

  return { resolved, nextId };
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i-1][j] + 1,
        dp[i][j-1] + 1,
        dp[i-1][j-1] + (a[i-1] !== b[j-1] ? 1 : 0)
      );
    }
  }
  return dp[m][n];
}

function resolvePersonName(name, resolvedMap, narrator) {
  const selfRefs = ['i', 'me', 'myself', 'narrator', 'the narrator'];
  if (selfRefs.includes(name.toLowerCase().trim())) {
    const narratorKey = normalize(`${narrator.firstName} ${narrator.lastName || ''}`);
    return resolvedMap.get(narratorKey);
  }

  const normName = normalize(name);
  const normParts = normName.split(/\s+/);
  const normFirst = normParts[0];
  const normLast = normParts.length > 1 ? normParts.slice(1).join(' ') : '';

  // Direct key match (works for both plain and disambiguated names)
  if (resolvedMap.has(normName)) return resolvedMap.get(normName);

  // Try stripped version (e.g., "Héctor (padre) Bueso" → "héctor bueso")
  const stripped = normalize(stripDisambiguator(name));
  if (stripped !== normName && resolvedMap.has(stripped)) return resolvedMap.get(stripped);

  // Scoring-based fallback: prefer exact/best matches so "Carlos José Bueso"
  // resolves to the dad, not the narrator "Carlos Bueso".
  let bestPerson = null;
  let bestScore = 0;
  let bestKeyLen = 999;
  for (const [key, person] of resolvedMap) {
    const keyParts = key.split(/\s+/);
    const keyFirst = keyParts[0];
    const keyLast = keyParts.length > 1 ? keyParts.slice(1).join(' ') : '';
    // First name matching: exact, compound-name prefix, nickname, or edit-distance
    let firstMatch = false;
    if (keyFirst === normFirst) firstMatch = true;
    else if (key.startsWith(normFirst + ' ') || normName.startsWith(keyFirst + ' ')) firstMatch = true;
    else {
      const nick = normalize(person.nickname || '');
      if (nick && (nick === normFirst || nick === normName)) firstMatch = true;
    }
    // Edit-distance fallback for voice recognition errors ("Bricel" ↔ "Brisela")
    if (!firstMatch && normFirst.length >= 3 && keyFirst.length >= 3) {
      const dist = editDistance(normFirst, keyFirst);
      if (dist <= 2 && dist / Math.max(normFirst.length, keyFirst.length) < 0.4) {
        firstMatch = true;
      }
    }
    if (!firstMatch) continue;
    // If both have last names, they must share at least one word
    if (normLast && keyLast) {
      const normLastWords = normLast.split(/\s+/);
      const keyLastWords = keyLast.split(/\s+/);
      const hasOverlap = normLastWords.some(w => keyLastWords.includes(w));
      if (!hasOverlap) continue;
    }
    // Score: prefer keys matching more parts of the input
    let score = 1;
    if (key === normName) score = 100;
    else {
      const normWords = normName.split(/\s+/);
      score = keyParts.filter(w => normWords.includes(w)).length;
      const nick = normalize(person.nickname || '');
      if (nick && (nick === normFirst || nick === normName)) score += 2;
    }
    // Tie-break: prefer keys closer in word count to the input
    if (score > bestScore || (score === bestScore && Math.abs(keyParts.length - normParts.length) < Math.abs((bestKeyLen || 999) - normParts.length))) {
      bestScore = score;
      bestPerson = person;
      bestKeyLen = keyParts.length;
    }
  }
  if (bestPerson) return bestPerson;

  return null;
}

// Fix same-name relationship conflicts: when a person has both ancestor-type and
// peer-type relationships (e.g., parent AND sibling of the same target), reassign
// the peer relationships to the other person with the same name.
function fixSameNameRelationships(resolvedPeople, relationships) {
  const ancestorTypes = new Set(['parent', 'grandparent', 'great_grandparent', 'step_parent']);
  const peerTypes = new Set(['sibling', 'half_sibling', 'spouse', 'ex_spouse', 'step_sibling']);

  // Group people by normalized name
  const nameGroups = new Map();
  for (const p of resolvedPeople) {
    const name = normalize(`${p.firstName} ${p.lastName || ''}`);
    if (!nameGroups.has(name)) nameGroups.set(name, []);
    nameGroups.get(name).push(p);
  }

  for (const [, group] of nameGroups) {
    if (group.length < 2) continue;

    for (const person of group) {
      const myRels = relationships
        .map((r, i) => ({ index: i, rel: r }))
        .filter(({ rel }) => rel.personAId === person.id);

      const ancRels = myRels.filter(r => ancestorTypes.has(r.rel.type));
      const peerRels = myRels.filter(r => peerTypes.has(r.rel.type));

      if (ancRels.length > 0 && peerRels.length > 0) {
        // Find the other person with the same name
        const altPerson = person.isDeceased
          ? group.find(p => p.id !== person.id && !p.isDeceased)
          : group.find(p => p.id !== person.id && p.isDeceased);

        if (altPerson) {
          // Deceased person keeps ancestor rels, peer rels go to the alive one
          const relsToReassign = person.isDeceased ? peerRels : ancRels;
          const targetPerson = person.isDeceased ? altPerson : altPerson;
          for (const pr of relsToReassign) {
            const oldId = relationships[pr.index].personAId;
            relationships[pr.index].personAId = targetPerson.id;
            relationships[pr.index].personAName = `${targetPerson.firstName}${targetPerson.lastName ? ' ' + targetPerson.lastName : ''}`;
            console.log(`  🔄 Reassigned ${pr.rel.type} from ${person.firstName} (${oldId}) to ${targetPerson.firstName} (${targetPerson.id})`);
          }
        }
      }
    }
  }
}

// ============================================================
// Transitive Inference (mirrors backend logic)
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

  // Pass 2: Children of same parent → siblings (or half_siblings if half)
  for (const [, children] of childrenOf) {
    const childArr = [...children];
    for (let i = 0; i < childArr.length; i++) {
      for (let j = i + 1; j < childArr.length; j++) {
        const stepFwd = `${childArr[i]}|${childArr[j]}|half_sibling`;
        const stepRev = `${childArr[j]}|${childArr[i]}|half_sibling`;
        if (existingSet.has(stepFwd) || existingSet.has(stepRev)) continue;

        // Check if they're half-siblings: one shared parent but different other parents
        let isHalf = false;
        const aParents = parentsOf.get(childArr[i]) || new Set();
        const bParents = parentsOf.get(childArr[j]) || new Set();
        if (aParents.size > 0 && bParents.size > 0) {
          const shared = [...aParents].filter(p => bParents.has(p)).length;
          if (shared < Math.min(aParents.size, bParents.size)) isHalf = true;
          const totalUnique = new Set([...aParents, ...bParents]).size;
          if (shared > 0 && totalUnique > shared + 1) isHalf = true;
        }
        // Also check transitive half_sibling status
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

  // Pass 5: Uncle/aunt
  for (const [personId, siblings] of siblingsOf) {
    for (const sibId of siblings) {
      const niblings = childrenOf.get(sibId) || new Set();
      for (const nibId of niblings) {
        tryInfer(personId, nibId, 'uncle_aunt');
      }
    }
  }

  // Pass 6: Step uncle/aunt
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
// Visualization
// ============================================================

function printTree(people, relationships) {
  console.log('\n' + '═'.repeat(60));
  console.log('  🌳 FAMILY TREE — EXTRACTED PEOPLE');
  console.log('═'.repeat(60));

  const peopleArr = [...new Map([...people].map(([, v]) => [v.id, v])).values()];

  for (const p of peopleArr) {
    const parts = [];
    if (p.birthDate) parts.push(`b. ${p.birthDate}`);
    if (p.birthPlace) parts.push(`📍 ${p.birthPlace}`);
    if (p.gender) parts.push(p.gender === 'male' ? '♂' : '♀');
    if (p.isDeceased) parts.push('✝️');
    if (p.isNarrator) parts.push('🎙️ NARRATOR');

    const name = `${p.firstName}${p.lastName ? ' ' + p.lastName : ''}`;
    console.log(`\n  👤 ${name}${parts.length ? '  (' + parts.join(', ') + ')' : ''}`);
    if (p.nickname) console.log(`     aka "${p.nickname}"`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  🔗 RELATIONSHIPS');
  console.log('═'.repeat(60));

  const typeEmojis = {
    parent: '👨‍👧',
    child: '👶',
    sibling: '👫',
    step_sibling: '👥',
    half_sibling: '👥',
    parent_in_law: '👨‍👧',
    child_in_law: '👶',
    spouse: '💑',
    grandparent: '👴',
    uncle_aunt: '🧑‍🤝‍🧑',
    nephew_niece: '👦',
    cousin: '🤝',
  };

  for (const r of relationships) {
    const emoji = typeEmojis[r.type] || '🔗';
    const conf = r.confidence ? ` (${Math.round(r.confidence * 100)}%)` : '';
    const source = r.inferred ? ' [INFERRED]' : '';
    console.log(`  ${emoji} ${r.personAName} ──[${r.type}]──▶ ${r.personBName}${conf}${source}`);
  }
}

function printStories(summaryResult) {
  if (!summaryResult) return;

  console.log('\n' + '═'.repeat(60));
  console.log('  📖 SUMMARY');
  console.log('═'.repeat(60));
  console.log(`\n  ${summaryResult.summary}\n`);
  console.log(`  Tone: ${summaryResult.emotionalTone}`);
  console.log(`  Topics: ${summaryResult.keyTopics?.join(', ')}`);

  if (summaryResult.suggestedStories?.length) {
    console.log('\n' + '═'.repeat(60));
    console.log('  📚 STORIES');
    console.log('═'.repeat(60));

    for (const story of summaryResult.suggestedStories) {
      console.log(`\n  📖 "${story.title}"`);
      console.log(`  ${'-'.repeat(40)}`);
      console.log(`  ${story.content}`);
      if (story.involvedPeople?.length) {
        console.log(`  👥 People: ${story.involvedPeople.join(', ')}`);
      }
      if (story.keyMoments?.length) {
        console.log('  💬 Key moments:');
        for (const m of story.keyMoments) {
          if (typeof m === 'string') {
            console.log(`     "${m}"`);
          } else {
            console.log(`     "${m.quote}" — ${m.label}`);
          }
        }
      }
    }
  }
}

function generateHTML(people, relationships, summaryResult) {
  const peopleArr = [...new Map([...people].map(([, v]) => [v.id, v])).values()];

  const nodes = peopleArr.map((p, i) => ({
    id: p.id,
    label: `${p.firstName}${p.lastName ? ' ' + p.lastName : ''}`,
    birth: p.birthDate || '',
    place: p.birthPlace || '',
    gender: p.gender || 'unknown',
    isNarrator: !!p.isNarrator,
  }));

  const edges = relationships.map((r, i) => ({
    from: r.personAId,
    to: r.personBId,
    label: r.type,
    inferred: !!r.inferred,
    confidence: r.confidence || 0,
  }));

  const stories = summaryResult?.suggestedStories || [];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Matra — Pipeline Test Results</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0a1628; color: #e8e0d4; }
  .header { text-align: center; padding: 24px; background: linear-gradient(135deg, #0d1f3c, #1a3a5c); border-bottom: 2px solid #2a5a8a; }
  .header h1 { font-size: 28px; color: #7ec8e3; }
  .header p { color: #8b9baa; margin-top: 4px; }
  .container { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 20px; max-width: 1600px; margin: 0 auto; }
  .full-width { grid-column: 1 / -1; }
  .card { background: #111d2e; border: 1px solid #1e3a5f; border-radius: 12px; padding: 20px; }
  .card h2 { color: #7ec8e3; margin-bottom: 12px; font-size: 18px; }
  .person { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; margin-bottom: 6px; background: #0d1a2d; }
  .person.narrator { border-left: 3px solid #7ec8e3; }
  .person .avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; }
  .person .avatar.male { background: #1e3a5f; }
  .person .avatar.female { background: #5f1e3a; }
  .person .avatar.unknown { background: #3a3a1e; }
  .person .info { flex: 1; }
  .person .name { font-weight: 600; color: #e8e0d4; }
  .person .meta { font-size: 12px; color: #8b9baa; }
  .rel { padding: 6px 10px; margin-bottom: 4px; border-radius: 6px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
  .rel.direct { background: #0d2a1a; border-left: 2px solid #4ade80; }
  .rel.inferred { background: #2a1a0d; border-left: 2px solid #f59e0b; }
  .rel .type { font-weight: 600; color: #7ec8e3; min-width: 100px; }
  .rel .arrow { color: #4a5568; }
  .rel .conf { font-size: 11px; color: #8b9baa; margin-left: auto; }
  .story { margin-bottom: 16px; padding: 14px; background: #0d1a2d; border-radius: 8px; }
  .story h3 { color: #d4a574; margin-bottom: 8px; }
  .story p { line-height: 1.6; color: #c4b8a8; font-size: 14px; }
  .story .moment { margin-top: 8px; padding: 6px 10px; background: #1a2a3d; border-radius: 6px; font-style: italic; font-size: 13px; color: #8baabb; }
  .summary-box { line-height: 1.7; color: #c4b8a8; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; background: #1e3a5f; color: #7ec8e3; margin: 2px; }
  #graph { width: 100%; height: 500px; border: 1px solid #1e3a5f; border-radius: 8px; background: #080f1a; }
  .legend { display: flex; gap: 16px; margin-top: 10px; font-size: 12px; color: #8b9baa; }
  .legend span { display: flex; align-items: center; gap: 4px; }
  .legend .dot { width: 10px; height: 10px; border-radius: 50%; }
</style>
</head>
<body>
<div class="header">
  <h1>🌳 Matra — Pipeline Test Results</h1>
  <p>Extraction + Summarization + Relationship Inference</p>
</div>
<div class="container">
  <div class="card">
    <h2>👥 People (${nodes.length})</h2>
    ${nodes.map(n => `
      <div class="person${n.isNarrator ? ' narrator' : ''}">
        <div class="avatar ${n.gender}">${n.gender === 'male' ? '♂' : n.gender === 'female' ? '♀' : '?'}</div>
        <div class="info">
          <div class="name">${n.label}${n.isNarrator ? ' 🎙️' : ''}</div>
          <div class="meta">${[n.birth, n.place].filter(Boolean).join(' · ') || 'No details'}</div>
        </div>
      </div>
    `).join('')}
  </div>

  <div class="card">
    <h2>🔗 Relationships (${edges.length})</h2>
    ${edges.map(e => {
      const fromNode = nodes.find(n => n.id === e.from);
      const toNode = nodes.find(n => n.id === e.to);
      return `
      <div class="rel ${e.inferred ? 'inferred' : 'direct'}">
        <span class="type">${e.label}</span>
        <span>${fromNode?.label || '?'}</span>
        <span class="arrow">→</span>
        <span>${toNode?.label || '?'}</span>
        <span class="conf">${Math.round(e.confidence * 100)}%${e.inferred ? ' inferred' : ''}</span>
      </div>`;
    }).join('')}
    <div class="legend">
      <span><div class="dot" style="background:#4ade80"></div> Direct (from AI)</span>
      <span><div class="dot" style="background:#f59e0b"></div> Inferred (transitive)</span>
    </div>
  </div>

  ${summaryResult ? `
  <div class="card">
    <h2>📝 Summary</h2>
    <div class="summary-box">${summaryResult.summary}</div>
    <div style="margin-top:12px">
      <strong style="color:#7ec8e3">Tone:</strong> ${summaryResult.emotionalTone}<br>
      <strong style="color:#7ec8e3">Topics:</strong> ${(summaryResult.keyTopics || []).map(t => `<span class="tag">${t}</span>`).join(' ')}
    </div>
  </div>

  <div class="card">
    <h2>📚 Stories (${stories.length})</h2>
    ${stories.map(s => `
      <div class="story">
        <h3>"${s.title}"</h3>
        <p>${s.content}</p>
        ${s.involvedPeople?.length ? `<div style="margin-top:6px;font-size:12px;color:#8b9baa">👥 ${s.involvedPeople.join(', ')}</div>` : ''}
        ${(s.keyMoments || []).map(m => {
          if (typeof m === 'string') return `<div class="moment">"${m}"</div>`;
          return `<div class="moment">"${m.quote}" — <strong>${m.label}</strong></div>`;
        }).join('')}
      </div>
    `).join('')}
  </div>
  ` : ''}
</div>
</body>
</html>`;

  const outPath = path.join(__dirname, 'test-pipeline-output.html');
  fs.writeFileSync(outPath, html, 'utf-8');
  return outPath;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const startTime = Date.now();
  const provider = GROQ_API_KEY ? 'Groq (Llama 3.3 70B)' : 'OpenAI (GPT-4o-mini)';

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        Matra — AI Pipeline Test Harness                 ║');
  console.log('║        Sequential Multi-Interview Mode                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  Provider: ${provider}`);
  console.log(`  Interviews: ${INTERVIEWS.length}`);
  console.log(`  Language: Spanish (es)\n`);

  // Cumulative state across interviews
  let cumulativePeople = new Map();   // normKey → personRecord
  let cumulativeRelationships = [];
  let allStories = [];
  let globalNextId = 1; // Track across interviews to prevent ID collisions

  for (let idx = 0; idx < INTERVIEWS.length; idx++) {
    const interview = INTERVIEWS[idx];
    const NARRATOR = interview.narrator;
    const TRANSCRIPT = interview.transcript;

    console.log('\n' + '▓'.repeat(60));
    console.log(`  INTERVIEW ${idx + 1}/${INTERVIEWS.length}: ${interview.label}`);
    console.log('▓'.repeat(60));
    console.log(`  Narrator: ${NARRATOR.firstName} ${NARRATOR.lastName} (${NARRATOR.gender})`);
    console.log(`  Transcript: ${TRANSCRIPT.length} chars`);

    // Build existing people list from accumulated state (for dedup)
    const existingPeople = [...new Map([...cumulativePeople].map(([, v]) => [v.id, v])).values()]
      .map(p => ({
        id: p.id,
        first_name: p.firstName,
        last_name: p.lastName,
        nickname: p.nickname || null,
        metadata: { gender: p.gender || null },
        is_deceased: !!p.isDeceased,
        is_narrator: !!p.isNarrator,
        birth_date: p.birthDate || null,
      }));

    console.log(`  Existing people from prior interviews: ${existingPeople.length}`);

    // Determine narrator ID: check if narrator matches an existing person from prior interviews
    let narratorId = `person-narrator-${idx + 1}`;
    const narratorNormKey = normalize(`${NARRATOR.firstName} ${NARRATOR.lastName || ''}`);
    for (const [key, person] of cumulativePeople) {
      if (key === narratorNormKey || person.id === narratorNormKey) {
        narratorId = person.id;
        console.log(`  🔗 Narrator matches existing person: ${person.firstName} ${person.lastName || ''} (${narratorId})`);
        break;
      }
    }

    // Build existing family context for AI (same as edge function)
    let existingFamilyContext = '';
    if (existingPeople.length > 0) {
      const existingNames = existingPeople.map(p => {
        const name = `${p.first_name} ${p.last_name || ''}`.trim();
        return p.is_deceased ? `${name} [DECEASED]` : name;
      });
      const existingRelDesc = cumulativeRelationships.map(r => `${r.personAName} is ${r.type} of ${r.personBName}`);
      existingFamilyContext = `\n\n[EXISTING FAMILY MEMBERS already in the family tree — reuse these names exactly when the transcript refers to these people, do NOT create duplicates:\nPeople: ${existingNames.join(', ')}\nRelationships: ${existingRelDesc.join('; ')}]`;

      existingFamilyContext += `\n\nCRITICAL — VOICE RECOGNITION NAME MATCHING:
The transcript comes from voice recognition which may misspell or abbreviate names. When matching names to existing family members:
- Compare phonetically, not just exact spelling
- Common voice recognition errors: consonant swaps (s/z, c/s, l/r), vowel variations, missing/extra syllables
- If a name sounds similar to an existing person AND fits the same family role, it IS the same person
- ALWAYS prefer matching to an existing person over creating a new one
- In relationship personA/personB fields, ALWAYS use the FULL name from the existing family list, even if the transcript uses a nickname or shortened form`;
    }

    // Build narrator context
    const subjectName = `${NARRATOR.firstName} ${NARRATOR.lastName}`;
    const genderHint = NARRATOR.gender
      ? ` Their gender is ${NARRATOR.gender}. Use correct gendered language when referring to ${subjectName}.`
      : '';
    const transcriptForAI = `[Narrator/subject of this interview is ${subjectName}.${genderHint} Any first-person references ("I", "me", "my") refer to ${subjectName}. Do NOT create a separate entry for the narrator — they are ${subjectName}. IMPORTANT: If the narrator introduces themselves by a different or fuller version of their name (e.g., including middle names, maiden names, or additional names), that is STILL the narrator — do NOT create a new suggestedPeople entry for them. The narrator is ALWAYS ${subjectName}, regardless of how they refer to themselves. When the narrator says "my mom", "my dad", "my brother", etc., create relationships between those people and ${subjectName}. Use ${subjectName} as the personA or personB name in relationships — never use "I" or "me" as a person name.]${existingFamilyContext}\n\n${TRANSCRIPT}`;

    // Step 1: Extraction
    console.log('\n  ⏳ Step 1/2: Extracting entities & relationships...');
    const extractionResult = await callLLM(
      EXTRACTION_PROMPT + languageInstruction('es') + '\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
      transcriptForAI
    );

    const extractTime = Date.now();
    console.log(`  ✅ Extraction done`);
    console.log(`     Entities: ${extractionResult.entities?.length || 0}`);
    console.log(`     Relationships: ${extractionResult.relationships?.length || 0}`);
    console.log(`     People: ${extractionResult.suggestedPeople?.length || 0}`);

    // Step 2: Summarization
    console.log('\n  ⏳ Step 2/2: Generating summary & stories...');
    const summaryResult = await callLLM(
      SUMMARY_PROMPT + languageInstruction('es') + '\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
      transcriptForAI
    );

    console.log(`  ✅ Summary done`);
    console.log(`     Stories: ${summaryResult.suggestedStories?.length || 0}`);

    if (summaryResult.suggestedStories) {
      allStories.push(...summaryResult.suggestedStories);
    }

    // Step 3: Person resolution (using existing accumulated people)
    const { resolved: resolvedPeople, nextId: newNextId } = resolvePeople(
      extractionResult.suggestedPeople || [],
      NARRATOR,
      existingPeople,
      extractionResult.relationships || [],
      narratorId,
      globalNextId
    );
    globalNextId = newNextId; // Carry forward so next interview doesn't collide

    // Step 4: Map relationships
    const interviewRels = [];
    for (const rel of (extractionResult.relationships || [])) {
      let personA = resolvePersonName(rel.personA, resolvedPeople, NARRATOR);
      let personB = resolvePersonName(rel.personB, resolvedPeople, NARRATOR);

      // For spouse/ex_spouse, if one side resolved to a deceased person, check if
      // there's a non-deceased person with a more specific name (same base + more words).
      // e.g., "Alicia Rentería" (deceased grandma) → swap to "Alicia Rentería Montes de Oca" (mom)
      if (personA && personB && (rel.relationshipType === 'spouse' || rel.relationshipType === 'ex_spouse')) {
        if (personA.isDeceased) {
          const baseKey = normalize(`${personA.firstName} ${personA.lastName || ''}`);
          for (const [k, p] of resolvedPeople) {
            if (p.id !== personA.id && !p.isDeceased && k.startsWith(baseKey + ' ')) {
              console.log(`  🔀 Spouse swap: using ${p.firstName} ${p.lastName || ''} instead of deceased ${personA.firstName} ${personA.lastName || ''}`);
              personA = p;
              break;
            }
          }
        }
        if (personB.isDeceased) {
          const baseKey = normalize(`${personB.firstName} ${personB.lastName || ''}`);
          for (const [k, p] of resolvedPeople) {
            if (p.id !== personB.id && !p.isDeceased && k.startsWith(baseKey + ' ')) {
              console.log(`  🔀 Spouse swap: using ${p.firstName} ${p.lastName || ''} instead of deceased ${personB.firstName} ${personB.lastName || ''}`);
              personB = p;
              break;
            }
          }
        }
      }
      if (personA && personB && personA.id !== personB.id) {
        // Check for duplicate relationship
        const isDupe = cumulativeRelationships.some(r =>
          r.personAId === personA.id && r.personBId === personB.id && r.type === rel.relationshipType
        ) || cumulativeRelationships.some(r =>
          r.personAId === personB.id && r.personBId === personA.id && r.type === rel.relationshipType
        );
        if (!isDupe) {
          interviewRels.push({
            personAId: personA.id,
            personBId: personB.id,
            personAName: `${personA.firstName}${personA.lastName ? ' ' + personA.lastName : ''}`,
            personBName: `${personB.firstName}${personB.lastName ? ' ' + personB.lastName : ''}`,
            type: rel.relationshipType,
            confidence: rel.confidence,
            inferred: false,
            source: interview.label,
          });
        }
      } else {
        console.log(`  ⚠️  Unresolved: ${rel.personA} ──[${rel.relationshipType}]──▶ ${rel.personB}`);
      }
    }

    // Fix same-name relationship conflicts (e.g., deceased Héctor has sibling+parent → reassign peer rels)
    const resolvedArr = [...new Map([...resolvedPeople].map(([, v]) => [v.id, v])).values()];
    fixSameNameRelationships(resolvedArr, interviewRels);

    // Merge into cumulative state
    for (const [key, person] of resolvedPeople) {
      if (!cumulativePeople.has(key)) {
        cumulativePeople.set(key, person);
      } else {
        // Merge new info into existing
        const existing = cumulativePeople.get(key);
        if (person.birthDate && !existing.birthDate) existing.birthDate = person.birthDate;
        if (person.birthPlace && !existing.birthPlace) existing.birthPlace = person.birthPlace;
        if (person.deathDate && !existing.deathDate) existing.deathDate = person.deathDate;
        if (person.isDeceased && !existing.isDeceased) existing.isDeceased = person.isDeceased;
        if (person.gender && !existing.gender) existing.gender = person.gender;
      }
    }

    cumulativeRelationships.push(...interviewRels);

    // Print per-interview results
    console.log(`\n  📊 Interview ${idx + 1} results:`);
    const uniqueResolved = new Map([...resolvedPeople].map(([, v]) => [v.id, v]));
    console.log(`     New people: ${[...uniqueResolved.values()].filter(p => !existingPeople.find(ep => ep.id === p.id)).length}`);
    console.log(`     New relationships: ${interviewRels.length}`);
    console.log(`     Cumulative people: ${new Map([...cumulativePeople].map(([, v]) => [v.id, v])).size}`);
    console.log(`     Cumulative relationships: ${cumulativeRelationships.length}`);
  }

  // Step 5: Transitive inference on ALL accumulated relationships
  console.log('\n' + '▓'.repeat(60));
  console.log('  TRANSITIVE INFERENCE (all interviews combined)');
  console.log('▓'.repeat(60));

  const inferred = inferTransitiveRelationships(cumulativeRelationships);
  const peopleArr = [...new Map([...cumulativePeople].map(([, v]) => [v.id, v])).values()];
  for (const inf of inferred) {
    const personA = peopleArr.find(p => p.id === inf.personAId);
    const personB = peopleArr.find(p => p.id === inf.personBId);
    cumulativeRelationships.push({
      ...inf,
      personAName: personA ? `${personA.firstName}${personA.lastName ? ' ' + personA.lastName : ''}` : '?',
      personBName: personB ? `${personB.firstName}${personB.lastName ? ' ' + personB.lastName : ''}` : '?',
      inferred: true,
    });
  }
  console.log(`  Inferred ${inferred.length} additional relationships`);

  // Output
  printTree(cumulativePeople, cumulativeRelationships);

  // Print all stories from both interviews
  const combinedSummary = { suggestedStories: allStories, summary: `Combined results from ${INTERVIEWS.length} interviews`, emotionalTone: 'warm', keyTopics: ['family', 'heritage'] };
  printStories(combinedSummary);

  // Generate HTML
  const htmlPath = generateHTML(cumulativePeople, cumulativeRelationships, combinedSummary);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(60));
  console.log(`  ✅ Done in ${totalTime}s`);
  console.log(`  📊 HTML visualization: ${htmlPath}`);
  console.log('═'.repeat(60) + '\n');

  // Dump raw JSON for debugging
  const debugPath = path.join(__dirname, 'test-pipeline-debug.json');
  fs.writeFileSync(debugPath, JSON.stringify({
    resolvedPeople: peopleArr,
    relationships: cumulativeRelationships,
    stories: allStories,
  }, null, 2), 'utf-8');
  console.log(`  🔍 Debug JSON: ${debugPath}\n`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

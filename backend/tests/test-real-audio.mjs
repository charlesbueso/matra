#!/usr/bin/env node
// ============================================================
// Matra — Real Audio Multi-Interview Pipeline Test
// ============================================================
// Run: node test-real-audio.mjs
//
// Processes REAL voice notes through the full pipeline:
//   Audio (Groq Whisper STT) → Transcript → LLM Extraction
//   → Person Resolution → Transitive Inference → Stories
//   → Tree Layout → App-faithful HTML Visualization
//
// Interview 1: charlie-1.m4a — Carlos (primary user) narrates
// Interview 2: papa-2.m4a   — Carlos José Bueso (dad) narrates
//
// Outputs:
//   test-real-audio-output.html  — App-style UI with tree, people, stories
//   test-real-audio-debug.json   — Full debug data
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env ──
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) process.env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!GROQ_API_KEY) { console.error('❌ GROQ_API_KEY required for Whisper STT'); process.exit(1); }

// ── Audio directory ──
const AUDIO_DIR = 'B:\\MobileApps\\matra\\audios';

// ============================================================
// INTERVIEWS — real audio files
// ============================================================

const INTERVIEWS = [
  {
    id: 'interview-1',
    label: 'Interview 1 — Carlos (voice note)',
    audioFile: path.join(AUDIO_DIR, 'charlie-1.m4a'),
    narrator: { firstName: 'Carlos', lastName: 'Bueso', gender: 'male' },
    language: 'es', // Groq Whisper auto-detects, but hint for LLM
  },
  {
    id: 'interview-2',
    label: 'Interview 2 — Papá Carlos José (voice note)',
    audioFile: path.join(AUDIO_DIR, 'papa-2.m4a'),
    narrator: { firstName: 'Carlos José', lastName: 'Bueso', gender: 'male' },
    language: 'es',
  },
];

// ============================================================
// Groq Whisper STT
// ============================================================

async function transcribeAudio(audioPath) {
  const fileName = path.basename(audioPath);
  const fileBuffer = fs.readFileSync(audioPath);
  const blob = new Blob([fileBuffer], { type: 'audio/m4a' });

  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('model', 'whisper-large-v3');
  formData.append('response_format', 'verbose_json');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whisper STT error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return {
    text: data.text,
    language: data.language,
    duration: data.duration,
    segments: data.segments,
  };
}

// ============================================================
// Prompts
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
- Extract ALL relationships stated or strongly implied.
- MULTILINGUAL SUPPORT: Recognize Spanish kinship terms (padre, madre, hermano, abuelo, etc.)
- Deduplicate people — BUT if two different family members share the SAME name (e.g., a deceased father and a living brother both named "Héctor Bueso"), they are SEPARATE people. Create SEPARATE entries in suggestedPeople with distinguishing attributes (isDeceased, birthDate, or a nickname like "Sr." / "Jr." / "(padre)" / "(hijo)"). Also create separate relationship entries for each.
- STEP-PARENT: "padrastro" / "madrastra" = step_parent (NOT parent). A stepfather/stepmother is NOT a biological parent.
- COUSIN vs NEPHEW/NIECE: "primo" / "prima" / "mis primos" = COUSIN (same generation as narrator, children of parent's siblings). "sobrino" / "sobrina" = nephew/niece (children of narrator's OWN siblings). Do NOT confuse these — they are different relationship types.
- When someone is described as having children (e.g., "X tiene dos hijos Y y Z"), ALWAYS extract BOTH the parent→child relationships (X is parent of Y, X is parent of Z) AND any stated relationship of those children to the narrator (e.g., cousin, nephew).
- ALWAYS include a person's full name exactly as mentioned in the transcript, including middle names. For example, use firstName: "Carlos Adri\u00e1n" not just "Carlos"; use firstName: "Marco Andr\u00e9s" not just "Marco".
- Dates: If a year is mentioned without month/day, use ONLY "YYYY" format.
- Ages: calculate approximate birth year from current year (2026). Use "YYYY" format.
- EVERY person in "relationships" MUST appear in "suggestedPeople".
- ALWAYS use the ENGLISH relationship type values listed above, never Spanish translations.

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
// LLM Calls
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
      max_tokens: 8192,
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
      max_tokens: 8192,
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

// ── Normalize Spanish/localized relationship types to English enum ──
const REL_TYPE_ALIASES = {
  padre: 'parent', madre: 'parent', 'papá': 'parent', 'mamá': 'parent', papa: 'parent', mama: 'parent',
  hijo: 'child', hija: 'child',
  hermano: 'sibling', hermana: 'sibling',
  medio_hermano: 'half_sibling', media_hermana: 'half_sibling', hermanastro: 'half_sibling', hermanastra: 'half_sibling',
  abuelo: 'grandparent', abuela: 'grandparent',
  nieto: 'grandchild', nieta: 'grandchild',
  bisabuelo: 'great_grandparent', bisabuela: 'great_grandparent',
  bisnieto: 'great_grandchild', bisnieta: 'great_grandchild',
  'tío': 'uncle_aunt', 'tía': 'uncle_aunt', tio: 'uncle_aunt', tia: 'uncle_aunt',
  sobrino: 'nephew_niece', sobrina: 'nephew_niece',
  primo: 'cousin', prima: 'cousin',
  esposo: 'spouse', esposa: 'spouse', 'cónyuge': 'spouse', conyuge: 'spouse', marido: 'spouse',
  ex_esposo: 'ex_spouse', ex_esposa: 'ex_spouse', exesposo: 'ex_spouse', exesposa: 'ex_spouse',
  padrastro: 'step_parent', madrastra: 'step_parent',
  hijastro: 'step_child', hijastra: 'step_child',
  suegro: 'parent_in_law', suegra: 'parent_in_law',
  yerno: 'child_in_law', nuera: 'child_in_law',
  'cuñado': 'in_law', 'cuñada': 'in_law', cunado: 'in_law', cunada: 'in_law',
  padrino: 'godparent', madrina: 'godparent',
  ahijado: 'godchild', ahijada: 'godchild',
  aunt: 'uncle_aunt', uncle: 'uncle_aunt',
};

function normalizeRelType(type) {
  if (!type) return 'other';
  const key = type.toLowerCase().trim();
  return REL_TYPE_ALIASES[key] || key;
}

// ============================================================
// Person Resolution
// ============================================================

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function stripHonorifics(name) {
  return name.replace(/\b(don|doña|dona|señor|señora|sr\.?|sra\.?|mr\.?|mrs\.?|ms\.?|dr\.?)\s+/gi, '').trim();
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
  return dp[a.length][b.length];
}

function resolvePeople(suggestedPeople, narrator, existingPeople, extractedRels) {
  const resolved = new Map();
  let nextId = existingPeople.length + 1;

  const narratorId = `person-narrator-${normalize(narrator.firstName)}`;
  const narratorKey = normalize(`${narrator.firstName} ${narrator.lastName || ''}`);

  const existingNarrator = existingPeople.find(ep => {
    const epKey = normalize(`${ep.first_name} ${ep.last_name || ''}`);
    const epFirst = normalize(ep.first_name);
    const narFirst = normalize(narrator.firstName);
    const narLast = normalize(narrator.lastName || '');
    if (epKey === narratorKey) return true;
    if (epFirst === narFirst) {
      if (!narLast || !normalize(ep.last_name || '')) return true;
      const narWords = narLast.split(/\s+/);
      const epWords = normalize(ep.last_name || '').split(/\s+/);
      return narWords.some(w => epWords.includes(w));
    }
    return false;
  });

  // Helper: does a suggested person match the narrator? (handles middle names)
  function isNarratorMatch(suggested) {
    const sFirst = normalize(suggested.firstName || '');
    const sLast = normalize(suggested.lastName || '');
    const nFirst = normalize(narrator.firstName);
    const nLast = normalize(narrator.lastName || '');
    if (sFirst === nFirst && sLast === nLast) return true;
    // "Carlos Adrián" → first word "carlos" matches narrator "carlos" + last name overlap
    if (sFirst.split(/\s+/)[0] === nFirst && nLast) {
      const sWords = sLast.split(/\s+/);
      const nWords = nLast.split(/\s+/);
      if (sWords.some(w => nWords.includes(w))) return true;
    }
    return false;
  }

  const narratorRecord = {
    id: existingNarrator?.id || narratorId,
    firstName: narrator.firstName,
    lastName: narrator.lastName,
    gender: narrator.gender,
    isNarrator: true,
    ...(existingNarrator ? {
      birthDate: existingNarrator.birth_date,
      birthPlace: existingNarrator.birth_place,
      nickname: existingNarrator.nickname,
      profession: existingNarrator.metadata?.profession,
      existing: true,
    } : {}),
  };
  resolved.set(narratorKey, narratorRecord);

  for (const ep of existingPeople) {
    const epKey = normalize(`${ep.first_name} ${ep.last_name || ''}`);
    const epRecord = {
      id: ep.id,
      firstName: ep.first_name,
      lastName: ep.last_name,
      nickname: ep.nickname,
      birthDate: ep.birth_date,
      birthPlace: ep.birth_place,
      deathDate: ep.death_date,
      gender: ep.metadata?.gender,
      profession: ep.metadata?.profession,
      isDeceased: ep.metadata?.is_deceased,
      currentLocation: ep.current_location,
      existing: true,
    };
    if (resolved.has(epKey)) {
      // Same-name duplicate (e.g., deceased grandfather and living uncle both named "Héctor Bueso")
      const disambigKey = epKey + '-2';
      if (!resolved.has(disambigKey)) resolved.set(disambigKey, epRecord);
      continue;
    }
    resolved.set(epKey, epRecord);
    const epFirst = normalize(ep.first_name);
    if (!resolved.has(epFirst)) resolved.set(epFirst, resolved.get(epKey));
    // Also register under first word of first name (e.g., "marco" for "Marco Andrés")
    const epFirstWord = epFirst.split(/\s+/)[0];
    if (epFirstWord !== epFirst && !resolved.has(epFirstWord)) resolved.set(epFirstWord, resolved.get(epKey));
  }

  let narratorMatched = false;
  for (const suggested of suggestedPeople) {
    // If this suggested person IS the narrator (with middle name), merge into narrator record
    if (!narratorMatched && isNarratorMatch(suggested)) {
      // Guard: if the extraction has a relationship between this person and a name already
      // resolved to the narrator, they are distinct people (e.g. father "Carlos José Bueso"
      // is NOT narrator "Carlos Bueso" even though names overlap)
      const sugNameNorm = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);
      const hasRelWithNarrator = extractedRels?.some(r => {
        const rA = normalize(r.personA || '');
        const rB = normalize(r.personB || '');
        const otherName = rA === sugNameNorm ? rB : (rB === sugNameNorm ? rA : null);
        if (!otherName) return false;
        return resolved.get(otherName)?.isNarrator;
      });
      if (hasRelWithNarrator) { /* fall through to normal resolution */ }
      else {
      const nr = resolved.get(narratorKey);
      if (nr) {
        if (suggested.birthDate && !nr.birthDate) nr.birthDate = suggested.birthDate;
        if (suggested.birthPlace && !nr.birthPlace) nr.birthPlace = suggested.birthPlace;
        if (suggested.gender && !nr.gender) nr.gender = suggested.gender;
        if (suggested.profession && !nr.profession) nr.profession = suggested.profession;
        if (suggested.nickname && !nr.nickname) nr.nickname = suggested.nickname;
        if (suggested.deathDate && !nr.deathDate) nr.deathDate = suggested.deathDate;
        if (suggested.isDeceased && !nr.isDeceased) nr.isDeceased = suggested.isDeceased;
        if (suggested.currentLocation && !nr.currentLocation) nr.currentLocation = suggested.currentLocation;
        // Register under the full name key so relationship resolution finds the narrator
        const sugFullKeyNarr = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);
        if (!resolved.has(sugFullKeyNarr)) resolved.set(sugFullKeyNarr, nr);
        narratorMatched = true;
        continue;
      }
      } // end else (no rel with narrator)
    }
    const sugFirst = normalize(suggested.firstName || '');
    const sugLast = normalize(suggested.lastName || '');
    const sugFullKey = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);

    if (resolved.has(sugFullKey)) {
      const existing = resolved.get(sugFullKey);
      // If extraction has a direct relationship between these two people, they are DISTINCT
      const existingFullName = normalize(`${existing.firstName} ${existing.lastName || ''}`);
      const sugNameForRel = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);
      const haveDirectRel = extractedRels?.some(r => {
        const a = normalize(r.personA || '');
        const b = normalize(r.personB || '');
        return (a === sugNameForRel || a === existingFullName) && (b === sugNameForRel || b === existingFullName) && a !== b;
      });
      if (haveDirectRel) {
        // Fall through to scoring — they are different people
      // Conflict detection: if one is deceased and the other isn't,
      // they are different people with the same name — fall through to scoring
      } else if ((existing.isDeceased && !suggested.isDeceased) || (suggested.isDeceased && !existing.isDeceased)) {
        // Don't merge — fall through to scoring loop below
      } else {
        if (suggested.birthDate && !existing.birthDate) existing.birthDate = suggested.birthDate;
        if (suggested.birthPlace && !existing.birthPlace) existing.birthPlace = suggested.birthPlace;
        if (suggested.gender && !existing.gender) existing.gender = suggested.gender;
        if (suggested.profession && !existing.profession) existing.profession = suggested.profession;
        if (suggested.nickname && !existing.nickname) existing.nickname = suggested.nickname;
        if (suggested.deathDate && !existing.deathDate) existing.deathDate = suggested.deathDate;
        if (suggested.isDeceased && !existing.isDeceased) existing.isDeceased = suggested.isDeceased;
        if (suggested.currentLocation && !existing.currentLocation) existing.currentLocation = suggested.currentLocation;
        continue;
      }
    }

    let matchKey = null;
    let bestScore = 0;

    for (const [key, person] of resolved) {
      if (person.isNarrator) continue;
      const exFirst = normalize(person.firstName || '');
      const exLast = normalize(person.lastName || '');
      const exNick = normalize(person.nickname || '');

      let score = 0;
      const sugFirstWord = sugFirst.split(/\s+/)[0];
      const exFirstWord = exFirst.split(/\s+/)[0];
      if (sugFirst && exFirst && sugFirst === exFirst) score += 3;
      else if (sugFirstWord && exFirstWord && sugFirstWord === exFirstWord) score += 3;
      else if (sugFirstWord && exFirstWord && sugFirstWord.length >= 4 && exFirstWord.length >= 4) {
        const dist = levenshtein(sugFirstWord, exFirstWord);
        const maxLen = Math.max(sugFirstWord.length, exFirstWord.length);
        if (dist / maxLen <= 0.3) score += 3;
      }
      else if (sugFirst && exNick && sugFirst === exNick) score += 2;
      else if (normalize(suggested.nickname || '') && exFirst && normalize(suggested.nickname) === exFirst) score += 2;
      if (score === 0) continue;

      if (sugLast && exLast) {
        if (sugLast === exLast) score += 3;
        else {
          const sugWords = sugLast.split(/\s+/);
          const exWords = exLast.split(/\s+/);
          if (sugWords.some(w => exWords.includes(w))) score += 2;
          else score -= 2;
        }
      }

      if (score > bestScore) { bestScore = score; matchKey = key; }
    }

    // If best match has deceased conflict, try to find a non-conflicting match instead
    if (matchKey && bestScore >= 3) {
      const bestPerson = resolved.get(matchKey);
      if ((suggested.isDeceased && !bestPerson.isDeceased) || (!suggested.isDeceased && bestPerson.isDeceased === true)) {
        // Deceased conflict — find best NON-conflicting match
        let altKey = null, altScore = 0;
        for (const [key, person] of resolved) {
          if (person.isNarrator) continue;
          if (key === matchKey) continue;
          if ((suggested.isDeceased && !person.isDeceased) || (!suggested.isDeceased && person.isDeceased === true)) continue;
          const exFirst = normalize(person.firstName || '');
          const exLast = normalize(person.lastName || '');
          const exNick = normalize(person.nickname || '');
          let sc = 0;
          const sfW = sugFirst.split(/\s+/)[0];
          const efW = exFirst.split(/\s+/)[0];
          if (sugFirst && exFirst && sugFirst === exFirst) sc += 3;
          else if (sfW && efW && sfW === efW) sc += 3;
          else if (sfW && efW && sfW.length >= 4 && efW.length >= 4 && levenshtein(sfW, efW) / Math.max(sfW.length, efW.length) <= 0.3) sc += 3;
          else if (sugFirst && exNick && sugFirst === exNick) sc += 2;
          if (sc === 0) continue;
          if (sugLast && exLast) {
            if (sugLast === exLast) sc += 3;
            else { const sw2 = sugLast.split(/\s+/); const ew2 = exLast.split(/\s+/); if (sw2.some(w => ew2.includes(w))) sc += 2; else sc -= 2; }
          }
          if (sc > altScore && sc >= 3) { altScore = sc; altKey = key; }
        }
        if (altKey) { matchKey = altKey; bestScore = altScore; }
        else {
          // No non-conflicting match found — create separate person
          matchKey = null; bestScore = 0;
        }
      }
    }

    if (matchKey && bestScore >= 3) {
      const existing = resolved.get(matchKey);
      if (suggested.lastName && !existing.lastName) existing.lastName = suggested.lastName;
      if (suggested.birthDate && !existing.birthDate) existing.birthDate = suggested.birthDate;
      if (suggested.birthPlace && !existing.birthPlace) existing.birthPlace = suggested.birthPlace;
      if (suggested.gender && !existing.gender) existing.gender = suggested.gender;
      if (suggested.profession && !existing.profession) existing.profession = suggested.profession;
      if (suggested.nickname && !existing.nickname) existing.nickname = suggested.nickname;
      if (suggested.deathDate && !existing.deathDate) existing.deathDate = suggested.deathDate;
      if (suggested.isDeceased && !existing.isDeceased) existing.isDeceased = suggested.isDeceased;
      if (suggested.currentLocation && !existing.currentLocation) existing.currentLocation = suggested.currentLocation;
      if (!resolved.get(sugFullKey)?.isNarrator) resolved.set(sugFullKey, existing);
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
      if (!resolved.get(sugFullKey)?.isNarrator) {
        // If key already exists (same-name, different person — e.g., deceased conflict), use -2 suffix
        if (resolved.has(sugFullKey) && resolved.get(sugFullKey).id !== newPerson.id) {
          resolved.set(sugFullKey + '-2', newPerson);
        } else {
          resolved.set(sugFullKey, newPerson);
        }
      }
      if (!resolved.has(sugFirst)) resolved.set(sugFirst, newPerson);
    }
  }

  return resolved;
}

function resolvePersonName(name, resolvedMap, narrator, relContext) {
  const selfRefs = ['i', 'me', 'myself', 'narrator', 'the narrator', 'yo'];
  if (selfRefs.includes(name.toLowerCase().trim())) {
    return resolvedMap.get(normalize(`${narrator.firstName} ${narrator.lastName || ''}`));
  }
  const normName = normalize(name);

  // Check for same-name disambiguation: if there are two entries (e.g., "hector bueso" and "hector bueso-2"),
  // use relationship context to pick the right one
  if (resolvedMap.has(normName) && resolvedMap.has(normName + '-2') && relContext) {
    const person1 = resolvedMap.get(normName);
    const person2 = resolvedMap.get(normName + '-2');
    // If one is deceased and the relationship is sibling/spouse (living person contexts), prefer the living one
    const livingRelTypes = ['sibling', 'half_sibling', 'spouse', 'ex_spouse', 'in_law'];
    if (livingRelTypes.includes(relContext.type) && person1.isDeceased && !person2.isDeceased) return person2;
    if (livingRelTypes.includes(relContext.type) && person2.isDeceased && !person1.isDeceased) return person1;
    // If relationship is parent, prefer the deceased one (if applicable)
    if (relContext.type === 'parent' && person1.isDeceased) return person1;
    if (relContext.type === 'parent' && person2.isDeceased) return person2;
  }

  if (resolvedMap.has(normName)) return resolvedMap.get(normName);
  const stripped = normalize(stripHonorifics(name));
  if (stripped !== normName && resolvedMap.has(stripped)) return resolvedMap.get(stripped);
  const normFirst = stripped.split(/\s+/)[0];
  let bestPerson = null, bestScore = 0;
  for (const [key, person] of resolvedMap) {
    const keyFirst = key.split(/\s+/)[0];
    if (keyFirst !== normFirst && normalize(person.firstName) !== normFirst) continue;
    let score = key === stripped ? 100 : stripped.split(/\s+/).filter(w => key.split(/\s+/).includes(w)).length;
    if (score > bestScore) { bestScore = score; bestPerson = person; }
  }
  return bestPerson || null;
}

// ============================================================
// Transitive Inference
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
    const fwd = `${a}|${b}|${type}`, rev = `${b}|${a}|${type}`;
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
        const sp = parentsOf.get(sibId) || new Set();
        for (const pid of myParents) { if (sp.size < 2 && tryInfer(pid, sibId, 'parent')) { addToSetMap(parentsOf, sibId, pid); addToSetMap(childrenOf, pid, sibId); changed = true; } }
        for (const pid of (parentsOf.get(sibId) || new Set())) { const mp = parentsOf.get(personId) || new Set(); if (mp.size < 2 && tryInfer(pid, personId, 'parent')) { addToSetMap(parentsOf, personId, pid); addToSetMap(childrenOf, pid, personId); changed = true; } }
      }
    }
  }

  // Pass 2: Children of same parent → siblings
  for (const [, children] of childrenOf) {
    const arr = [...children];
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      const stepFwd = `${a}|${b}|half_sibling`, stepRev = `${b}|${a}|half_sibling`;
      if (existingSet.has(stepFwd) || existingSet.has(stepRev)) continue;
      const aP = parentsOf.get(a) || new Set(), bP = parentsOf.get(b) || new Set();
      let isHalf = false;
      if (aP.size > 0 && bP.size > 0) {
        const shared = [...aP].filter(p => bP.has(p)).length;
        if (shared > 0 && shared < Math.max(aP.size, bP.size)) isHalf = true;
        if (shared > 0 && new Set([...aP, ...bP]).size > shared + 1) isHalf = true;
      }
      if (isHalf) {
        for (const k of [`${a}|${b}|sibling`, `${b}|${a}|sibling`]) existingSet.delete(k);
        if (tryInfer(a, b, 'half_sibling')) { addToSetMap(stepSiblingsOf, a, b); addToSetMap(stepSiblingsOf, b, a); }
      } else {
        const sf = `${a}|${b}|sibling`, sr = `${b}|${a}|sibling`;
        if (!existingSet.has(sf) && !existingSet.has(sr) && tryInfer(a, b, 'sibling')) { addToSetMap(siblingsOf, a, b); addToSetMap(siblingsOf, b, a); }
      }
    }
  }

  // Pass 3: Half-sibling propagation
  for (const [pid, stepSibs] of stepSiblingsOf) {
    for (const ssid of stepSibs) for (const fsid of (siblingsOf.get(pid) || new Set())) {
      if (tryInfer(ssid, fsid, 'half_sibling')) { addToSetMap(stepSiblingsOf, ssid, fsid); addToSetMap(stepSiblingsOf, fsid, ssid); }
    }
  }

  // Pass 4: Co-parents → spouse
  for (const [, parents] of parentsOf) {
    const arr = [...parents];
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) tryInfer(arr[i], arr[j], 'spouse');
  }

  // Pass 5: Grandparent
  for (const [pid, kids] of childrenOf) for (const kid of kids) for (const gc of (childrenOf.get(kid) || new Set())) tryInfer(pid, gc, 'grandparent');

  // Pass 5b: Great-grandparent
  for (const [gp, kids] of childrenOf) for (const kid of kids) for (const gc of (childrenOf.get(kid) || new Set())) for (const ggc of (childrenOf.get(gc) || new Set())) tryInfer(gp, ggc, 'great_grandparent');

  // Pass 6: Uncle/aunt via full siblings
  for (const [pid, sibs] of siblingsOf) for (const sib of sibs) for (const nib of (childrenOf.get(sib) || new Set())) tryInfer(pid, nib, 'uncle_aunt');

  // Pass 7: Uncle/aunt via half-siblings
  for (const [pid, stepSibs] of stepSiblingsOf) for (const ss of stepSibs) for (const nib of (childrenOf.get(ss) || new Set())) tryInfer(pid, nib, 'uncle_aunt');

  // Pass 8: Cousins — children of siblings are cousins
  for (const [pid, sibs] of siblingsOf) for (const sib of sibs) {
    for (const mk of (childrenOf.get(pid) || new Set())) for (const sk of (childrenOf.get(sib) || new Set())) tryInfer(mk, sk, 'cousin');
  }
  for (const [pid, stepSibs] of stepSiblingsOf) for (const ss of stepSibs) {
    for (const mk of (childrenOf.get(pid) || new Set())) for (const sk of (childrenOf.get(ss) || new Set())) tryInfer(mk, sk, 'cousin');
  }

  return inferred;
}

// ============================================================
// Simulated Database
// ============================================================

class SimulatedDB {
  constructor() { this.people = []; this.relationships = []; this.stories = []; this.interviewResults = []; }

  mergePeople(resolvedMap) {
    const peopleArr = [...new Map([...resolvedMap].map(([, v]) => [v.id, v])).values()];
    for (const p of peopleArr) {
      const idx = this.people.findIndex(ep => ep.id === p.id);
      const rec = {
        id: p.id, first_name: p.firstName, last_name: p.lastName || null, nickname: p.nickname || null,
        birth_date: p.birthDate || null, death_date: p.deathDate || null, birth_place: p.birthPlace || null,
        current_location: p.currentLocation || null,
        metadata: { gender: p.gender || null, profession: p.profession || null, is_deceased: p.isDeceased || null },
      };
      if (idx >= 0) {
        const ex = this.people[idx];
        if (rec.last_name && !ex.last_name) ex.last_name = rec.last_name;
        if (rec.nickname && !ex.nickname) ex.nickname = rec.nickname;
        if (rec.birth_date && !ex.birth_date) ex.birth_date = rec.birth_date;
        if (rec.death_date && !ex.death_date) ex.death_date = rec.death_date;
        if (rec.birth_place && !ex.birth_place) ex.birth_place = rec.birth_place;
        if (rec.current_location && !ex.current_location) ex.current_location = rec.current_location;
        if (rec.metadata.gender && !ex.metadata?.gender) ex.metadata = { ...ex.metadata, gender: rec.metadata.gender };
        if (rec.metadata.profession && !ex.metadata?.profession) ex.metadata = { ...ex.metadata, profession: rec.metadata.profession };
        if (rec.metadata.is_deceased && !ex.metadata?.is_deceased) ex.metadata = { ...ex.metadata, is_deceased: rec.metadata.is_deceased };
      } else this.people.push(rec);
    }
  }

  mergeRelationships(rels) {
    for (const r of rels) {
      if (!this.relationships.find(x => x.person_a_id === r.personAId && x.person_b_id === r.personBId && x.relationship_type === r.type)) {
        this.relationships.push({
          person_a_id: r.personAId, person_b_id: r.personBId, relationship_type: r.type,
          confidence: r.confidence, inferred: r.inferred || false, verified: !r.inferred,
          personAName: r.personAName, personBName: r.personBName,
        });
      }
    }
  }

  addStories(stories, source) {
    for (const s of stories) this.stories.push({
      title: s.title, content: s.content, involvedPeople: s.involvedPeople || [],
      location: s.location || null, approximateDate: s.approximateDate || null, source,
    });
  }

  buildExistingTreeContext() {
    if (this.people.length === 0) return '';
    const pl = this.people.map(p => {
      const parts = [`${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`];
      if (p.nickname) parts.push(`aka "${p.nickname}"`);
      if (p.birth_date) parts.push(`b. ${p.birth_date}`);
      if (p.birth_place) parts.push(`from ${p.birth_place}`);
      if (p.metadata?.gender) parts.push(p.metadata.gender);
      if (p.metadata?.profession) parts.push(p.metadata.profession);
      return `  - ${parts.join(', ')} [id:${p.id}]`;
    }).join('\n');
    const rl = this.relationships.map(r => {
      const a = this.people.find(p => p.id === r.person_a_id);
      const b = this.people.find(p => p.id === r.person_b_id);
      return a && b ? `  - ${a.first_name}${a.last_name ? ' ' + a.last_name : ''} is ${r.relationship_type} of ${b.first_name}${b.last_name ? ' ' + b.last_name : ''}` : null;
    }).filter(Boolean).join('\n');
    let ctx = `\n[EXISTING FAMILY TREE — These people already exist.\nKnown people:\n${pl}`;
    if (rl) ctx += `\nKnown relationships:\n${rl}`;
    if (this.stories.length > 0) ctx += `\nExisting stories:\n${this.stories.map(s => `  - "${s.title}"`).join('\n')}`;
    return ctx + ']\n';
  }
}

// ============================================================
// Process Interview (with STT)
// ============================================================

async function processInterview(interviewDef, db) {
  const { narrator, label, language, audioFile } = interviewDef;
  const startTime = Date.now();

  console.log(`\n${'▓'.repeat(60)}`);
  console.log(`  🎙️  ${label}`);
  console.log(`  Audio: ${path.basename(audioFile)} (${(fs.statSync(audioFile).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  Narrator: ${narrator.firstName} ${narrator.lastName} (${narrator.gender})`);
  console.log(`  Existing: ${db.people.length} people, ${db.relationships.length} relationships`);
  console.log(`${'▓'.repeat(60)}`);

  // Step 1: STT — Transcribe audio
  console.log('\n  ⏳ Transcribing audio (Groq Whisper)...');
  const sttResult = await transcribeAudio(audioFile);
  const sttTime = Date.now();
  console.log(`  ✅ Transcription done (${((sttTime - startTime) / 1000).toFixed(1)}s)`);
  console.log(`     Language: ${sttResult.language} · Duration: ${sttResult.duration?.toFixed(1)}s`);
  console.log(`     Preview: "${sttResult.text.substring(0, 120)}..."`);

  const transcript = sttResult.text;

  // Step 2: Extraction
  const subjectName = `${narrator.firstName} ${narrator.lastName}`;
  const genderHint = narrator.gender ? ` Their gender is ${narrator.gender}. Use correct gendered language when referring to ${subjectName}.` : '';
  const existingTreeCtx = db.buildExistingTreeContext();
  const transcriptForAI = `[Narrator/subject of this interview is ${subjectName}.${genderHint} Any first-person references ("I", "me", "my", "yo", "mi") refer to ${subjectName}. Do NOT create a separate entry for the narrator — they are ${subjectName}. IMPORTANT: When the narrator says "mi mamá", "my dad", "mi hermano", etc., create relationships between those people and ${subjectName}.]${existingTreeCtx}\n\n${transcript}`;

  console.log('\n  ⏳ Extracting entities & relationships...');
  const lang = sttResult.language || language || 'es';
  const extractionResult = await callLLM(
    EXTRACTION_PROMPT + languageInstruction(lang) + '\n\nIMPORTANT: Respond ONLY with valid JSON.',
    transcriptForAI
  );
  const extractTime = Date.now();
  console.log(`  ✅ Extraction done (${((extractTime - sttTime) / 1000).toFixed(1)}s) — ${extractionResult.suggestedPeople?.length || 0} people, ${extractionResult.relationships?.length || 0} rels`);

  // Step 3: Summary & stories
  console.log('  ⏳ Generating summary & stories...');
  const summaryResult = await callLLM(
    SUMMARY_PROMPT + languageInstruction(lang) + '\n\nIMPORTANT: Respond ONLY with valid JSON.',
    transcriptForAI
  );
  const summaryTime = Date.now();
  console.log(`  ✅ Summary done (${((summaryTime - extractTime) / 1000).toFixed(1)}s) — ${summaryResult.suggestedStories?.length || 0} stories`);

  // Step 4: Person resolution
  const resolvedPeople = resolvePeople(extractionResult.suggestedPeople || [], narrator, db.people, extractionResult.relationships);

  // Step 5: Map relationships
  const newRelationships = [];
  let unresolvedCount = 0;
  for (const rel of (extractionResult.relationships || [])) {
    const normalizedType = normalizeRelType(rel.relationshipType);
    const relContext = { type: normalizedType };
    const personA = resolvePersonName(rel.personA, resolvedPeople, narrator, relContext);
    const personB = resolvePersonName(rel.personB, resolvedPeople, narrator, relContext);
    if (personA && personB && personA.id !== personB.id) {
      newRelationships.push({
        personAId: personA.id, personBId: personB.id,
        personAName: `${personA.firstName}${personA.lastName ? ' ' + personA.lastName : ''}`,
        personBName: `${personB.firstName}${personB.lastName ? ' ' + personB.lastName : ''}`,
        type: normalizedType, confidence: rel.confidence, inferred: false,
      });
    } else unresolvedCount++;
  }
  if (unresolvedCount > 0) console.log(`  ⚠️  ${unresolvedCount} unresolved relationship(s)`);

  // Step 6: Merge
  db.mergePeople(resolvedPeople);
  db.mergeRelationships(newRelationships);
  db.relationships = db.relationships.filter(r => !r.inferred);

  // Step 7: Transitive inference
  const allRels = db.relationships.map(r => ({ personAId: r.person_a_id, personBId: r.person_b_id, type: r.relationship_type, confidence: r.confidence, inferred: r.inferred }));
  const inferredRaw = inferTransitiveRelationships(allRels);
  const inferredWithNames = inferredRaw.map(inf => {
    const pA = db.people.find(p => p.id === inf.personAId);
    const pB = db.people.find(p => p.id === inf.personBId);
    return { ...inf, personAName: pA ? `${pA.first_name}${pA.last_name ? ' ' + pA.last_name : ''}` : '?', personBName: pB ? `${pB.first_name}${pB.last_name ? ' ' + pB.last_name : ''}` : '?', inferred: true };
  });
  db.mergeRelationships(inferredWithNames);

  // Step 7b: Cousin-parent inference
  // If X is cousin of Y, X has no parents, Z is uncle_aunt of Y, Z has no children,
  // and last names don't conflict → infer Z is parent of X
  const allRelsForCousin = db.relationships.map(r => ({ aId: r.person_a_id, bId: r.person_b_id, type: r.relationship_type }));
  const cousinPairs = allRelsForCousin.filter(r => r.type === 'cousin');
  if (cousinPairs.length > 0) {
    const parentRels = allRelsForCousin.filter(r => r.type === 'parent');
    const uaRels = allRelsForCousin.filter(r => r.type === 'uncle_aunt');
    let cousinInferred = 0;
    for (const cp of cousinPairs) {
      for (const [cousinId, partnerId] of [[cp.aId, cp.bId], [cp.bId, cp.aId]]) {
        // Does cousinId already have parents?
        if (parentRels.some(r => r.bId === cousinId)) continue;
        // Find all uncle_aunts of partnerId who have no children yet
        const uncleAunts = uaRels
          .filter(r => r.bId === partnerId)
          .map(r => r.aId)
          .filter(uaId => !parentRels.some(r => r.aId === uaId));
        for (const uaId of uncleAunts) {
          // Check last name conflict
          const uaPerson = db.people.find(p => p.id === uaId);
          const cousinPerson = db.people.find(p => p.id === cousinId);
          if (uaPerson?.last_name && cousinPerson?.last_name &&
            normalize(uaPerson.last_name) !== normalize(cousinPerson.last_name)) continue;
          // Infer parent
          if (!db.relationships.some(r => r.person_a_id === uaId && r.person_b_id === cousinId && r.relationship_type === 'parent')) {
            db.relationships.push({
              person_a_id: uaId, person_b_id: cousinId, relationship_type: 'parent',
              confidence: 0.8, inferred: true, verified: false,
              personAName: uaPerson ? `${uaPerson.first_name}${uaPerson.last_name ? ' ' + uaPerson.last_name : ''}` : '?',
              personBName: cousinPerson ? `${cousinPerson.first_name}${cousinPerson.last_name ? ' ' + cousinPerson.last_name : ''}` : '?',
            });
            cousinInferred++;
          }
        }
      }
    }
    if (cousinInferred > 0) console.log(`  ✅ Inferred ${cousinInferred} cousin-parent relationships`);
  }

  // Step 7c: Reverse grandparent inference
  // If X is grandparent of Y, and Z is parent of Y, and X is NOT already parent of Z,
  // and X/Z share a last name component → infer X is parent of Z
  {
    const allRelsRG = db.relationships.map(r => ({ aId: r.person_a_id, bId: r.person_b_id, type: r.relationship_type }));
    const gpRels = allRelsRG.filter(r => r.type === 'grandparent');
    const parentRelsRG = allRelsRG.filter(r => r.type === 'parent');
    let rgInferred = 0;
    for (const gp of gpRels) {
      const gpId = gp.aId, gcId = gp.bId;
      // Already parent of any of gc's parents?
      const gcParentIds = parentRelsRG.filter(r => r.bId === gcId).map(r => r.aId);
      if (gcParentIds.some(pid => parentRelsRG.some(r => r.aId === gpId && r.bId === pid))) continue;
      // Try to link to a parent that shares a last name component
      const gpPerson = db.people.find(p => p.id === gpId);
      for (const parentId of gcParentIds) {
        if (parentId === gpId) continue;
        if (db.relationships.some(r => r.person_a_id === gpId && r.person_b_id === parentId && r.relationship_type === 'parent')) continue;
        const parentPerson = db.people.find(p => p.id === parentId);
        // Check name overlap (full name, not just last_name, since name splits vary)
        const gpFullNorm = normalize(`${gpPerson?.first_name || ''} ${gpPerson?.last_name || ''}`);
        const pFullNorm = normalize(`${parentPerson?.first_name || ''} ${parentPerson?.last_name || ''}`);
        const gpNameWords = gpFullNorm.split(/\s+/).filter(w => w.length > 2);
        const pNameWords = pFullNorm.split(/\s+/).filter(w => w.length > 2);
        if (!gpNameWords.some(w => pNameWords.includes(w))) continue;
        db.relationships.push({
          person_a_id: gpId, person_b_id: parentId, relationship_type: 'parent',
          confidence: 0.8, inferred: true, verified: false,
          personAName: gpPerson ? `${gpPerson.first_name}${gpPerson.last_name ? ' ' + gpPerson.last_name : ''}` : '?',
          personBName: parentPerson ? `${parentPerson.first_name}${parentPerson.last_name ? ' ' + parentPerson.last_name : ''}` : '?',
        });
        rgInferred++;
      }
    }
    if (rgInferred > 0) console.log(`  ✅ Inferred ${rgInferred} reverse-grandparent parent relationships`);
  }

  // Step 7d: Sibling parent sharing (post-inference)
  // If X is parent of A, and A is sibling of B, and X is not yet parent of B → infer
  {
    const allRelsSP = db.relationships.map(r => ({ aId: r.person_a_id, bId: r.person_b_id, type: r.relationship_type }));
    const sibRelsSP = allRelsSP.filter(r => r.type === 'sibling');
    const parentRelsSP = allRelsSP.filter(r => r.type === 'parent');
    let spInferred = 0;
    for (const sib of sibRelsSP) {
      for (const [personId, siblingId] of [[sib.aId, sib.bId], [sib.bId, sib.aId]]) {
        const parents = parentRelsSP.filter(r => r.bId === personId).map(r => r.aId);
        for (const pid of parents) {
          if (db.relationships.some(r => r.person_a_id === pid && r.person_b_id === siblingId && r.relationship_type === 'parent')) continue;
          const pPerson = db.people.find(p => p.id === pid);
          const sPerson = db.people.find(p => p.id === siblingId);
          db.relationships.push({
            person_a_id: pid, person_b_id: siblingId, relationship_type: 'parent',
            confidence: 0.75, inferred: true, verified: false,
            personAName: pPerson ? `${pPerson.first_name}${pPerson.last_name ? ' ' + pPerson.last_name : ''}` : '?',
            personBName: sPerson ? `${sPerson.first_name}${sPerson.last_name ? ' ' + sPerson.last_name : ''}` : '?',
          });
          spInferred++;
        }
      }
    }
    if (spInferred > 0) console.log(`  ✅ Inferred ${spInferred} sibling-parent sharing relationships`);
  }

  // Step 8: Stories
  if (summaryResult.suggestedStories?.length) db.addStories(summaryResult.suggestedStories, label);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ✅ Interview fully processed in ${totalTime}s`);
  console.log(`  📊 This interview: ${newRelationships.length} direct + ${inferredWithNames.length} inferred rels`);
  console.log(`  📊 Cumulative: ${db.people.length} people, ${db.relationships.length} rels, ${db.stories.length} stories`);

  db.interviewResults.push({
    interviewId: interviewDef.id, label, narrator, language: lang,
    audioFile: path.basename(audioFile), audioDuration: sttResult.duration,
    sttLanguage: sttResult.language, transcript,
    extraction: extractionResult, summary: summaryResult,
    newRelationships, inferredRelationships: inferredWithNames,
    peopleCountAfter: db.people.length, relCountAfter: db.relationships.length,
    timeSeconds: parseFloat(totalTime),
  });

  return { sttResult, extractionResult, summaryResult, resolvedPeople, newRelationships, inferredWithNames };
}

// ============================================================
// Tree Layout Algorithm (faithful port from tree.tsx)
// ============================================================

const NODE_RADIUS = 28, HORIZONTAL_SPACING = 140, VERTICAL_SPACING = 160, COUPLE_GAP = 100, PADDING = 80;

function layoutTree(people, relationships, selfPersonId) {
  const positions = new Map(), roleLabels = new Map(), generation = new Map();
  if (people.length === 0) return { positions, roleLabels, generation, width: 800, height: 600, people, relationships, selfPersonId };

  const peopleById = new Map(people.map(p => [p.id, p]));
  const childrenOf = new Map(), parentOf = new Map(), spouseOf = new Map(), exSpousePairs = new Set();

  for (const rel of relationships) {
    const { person_a_id: a, person_b_id: b, relationship_type: type } = rel;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    if (type === 'parent') { if (!childrenOf.has(a)) childrenOf.set(a, []); childrenOf.get(a).push(b); if (!parentOf.has(b)) parentOf.set(b, []); parentOf.get(b).push(a); }
    else if (type === 'child') { if (!childrenOf.has(b)) childrenOf.set(b, []); childrenOf.get(b).push(a); if (!parentOf.has(a)) parentOf.set(a, []); parentOf.get(a).push(b); }
    else if (type === 'spouse' || type === 'ex_spouse') {
      if (!spouseOf.has(a)) spouseOf.set(a, new Set()); if (!spouseOf.has(b)) spouseOf.set(b, new Set());
      spouseOf.get(a).add(b); spouseOf.get(b).add(a);
      if (type === 'ex_spouse') exSpousePairs.add([a, b].sort().join('|'));
    } else if (['step_parent', 'adopted_parent'].includes(type)) {
      if (!childrenOf.has(a)) childrenOf.set(a, []); childrenOf.get(a).push(b); if (!parentOf.has(b)) parentOf.set(b, []); parentOf.get(b).push(a);
    } else if (['step_child', 'adopted_child'].includes(type)) {
      if (!childrenOf.has(b)) childrenOf.set(b, []); childrenOf.get(b).push(a); if (!parentOf.has(a)) parentOf.set(a, []); parentOf.get(a).push(b);
    }
  }

  const directParentOf = new Map();
  for (const [cid, parents] of parentOf) directParentOf.set(cid, [...parents]);

  // Multi-gen ancestor/descendant
  for (const rel of relationships) {
    const { person_a_id: a, person_b_id: b, relationship_type: type } = rel;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    let ancestorId = '', descendantId = '';
    if (['grandparent', 'great_grandparent', 'great_great_grandparent'].includes(type)) { ancestorId = a; descendantId = b; }
    else if (['grandchild', 'great_grandchild', 'great_great_grandchild'].includes(type)) { ancestorId = b; descendantId = a; }
    if (ancestorId) { if (!parentOf.has(descendantId)) parentOf.set(descendantId, []); if (!parentOf.get(descendantId).includes(ancestorId)) parentOf.get(descendantId).push(ancestorId); }
  }

  // Sibling adjacency
  const siblingOf = new Map(), fullSiblingOf = new Map();
  for (const rel of relationships) {
    const { person_a_id: a, person_b_id: b, relationship_type: type } = rel;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    if (['sibling', 'half_sibling', 'step_sibling'].includes(type)) {
      if (!siblingOf.has(a)) siblingOf.set(a, new Set()); if (!siblingOf.has(b)) siblingOf.set(b, new Set());
      siblingOf.get(a).add(b); siblingOf.get(b).add(a);
    }
    if (type === 'sibling') {
      if (!fullSiblingOf.has(a)) fullSiblingOf.set(a, new Set()); if (!fullSiblingOf.has(b)) fullSiblingOf.set(b, new Set());
      fullSiblingOf.get(a).add(b); fullSiblingOf.get(b).add(a);
    }
  }

  // Propagate parents through full siblings
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, sibs] of fullSiblingOf) for (const sid of sibs) {
      for (const ppid of (directParentOf.get(sid) || [])) {
        if (!parentOf.has(pid)) parentOf.set(pid, []);
        if (!parentOf.get(pid).includes(ppid)) {
          parentOf.get(pid).push(ppid);
          if (!childrenOf.has(ppid)) childrenOf.set(ppid, []);
          if (!childrenOf.get(ppid).includes(pid)) childrenOf.get(ppid).push(pid);
          if (!directParentOf.has(pid)) directParentOf.set(pid, []);
          if (!directParentOf.get(pid).includes(ppid)) directParentOf.get(pid).push(ppid);
          changed = true;
        }
      }
    }
  }

  // BFS gen assignment
  const GEN_OFFSET_A = { parent: -1, child: 1, spouse: 0, ex_spouse: 0, sibling: 0, half_sibling: 0, step_sibling: 0, grandparent: -2, grandchild: 2, great_grandparent: -3, great_grandchild: 3, great_great_grandparent: -4, great_great_grandchild: 4, uncle_aunt: -1, nephew_niece: 1, cousin: 0, in_law: 0, parent_in_law: -1, child_in_law: 1, step_parent: -1, step_child: 1, adopted_parent: -1, adopted_child: 1, godparent: -1, godchild: 1, other: 0 };
  const adjList = new Map();
  for (const rel of relationships) {
    const { person_a_id: a, person_b_id: b, relationship_type: type } = rel;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    const off = GEN_OFFSET_A[type] ?? 0;
    if (!adjList.has(b)) adjList.set(b, []); adjList.get(b).push({ targetId: a, offset: off });
    if (!adjList.has(a)) adjList.set(a, []); adjList.get(a).push({ targetId: b, offset: -off });
  }

  const visited = new Set();
  const startNode = selfPersonId && peopleById.has(selfPersonId) ? selfPersonId : null;
  if (startNode) {
    const queue = [{ id: startNode, gen: 0 }]; visited.add(startNode);
    while (queue.length > 0) {
      const { id: nid, gen } = queue.shift(); generation.set(nid, gen);
      for (const { targetId, offset } of (adjList.get(nid) || [])) if (!visited.has(targetId)) { visited.add(targetId); queue.push({ id: targetId, gen: gen + offset }); }
    }
  }
  for (const p of people) {
    if (visited.has(p.id)) continue;
    const nbrs = adjList.get(p.id) || [];
    const placed = nbrs.find(n => generation.has(n.targetId));
    if (placed) {
      const queue = [{ id: p.id, gen: generation.get(placed.targetId) + placed.offset }]; visited.add(p.id);
      while (queue.length > 0) {
        const { id: nid, gen } = queue.shift(); generation.set(nid, gen);
        for (const { targetId, offset } of (adjList.get(nid) || [])) if (!visited.has(targetId)) { visited.add(targetId); queue.push({ id: targetId, gen: gen + offset }); }
      }
    } else generation.set(p.id, 0);
  }

  let minGen = 0;
  for (const g of generation.values()) if (g < minGen) minGen = g;
  if (minGen < 0) for (const [pid, g] of generation) generation.set(pid, g - minGen);

  const genGroups = new Map();
  for (const [pid, g] of generation) { if (!genGroups.has(g)) genGroups.set(g, []); genGroups.get(g).push(pid); }
  const sortedGens = [...genGroups.keys()].sort((a, b) => a - b);
  let maxRowWidth = 0;

  function reorderSelfGen(ids) {
    if (!selfPersonId || !ids.includes(selfPersonId)) return ids;
    const selfSpouses = spouseOf.get(selfPersonId);
    const selfAllSpousesInRow = selfSpouses ? [...selfSpouses].filter(s => ids.includes(s)) : [];
    const selfCurrentSpouseInRow = selfAllSpousesInRow.find(s => !exSpousePairs.has([selfPersonId, s].sort().join('|'))) || null;
    const assigned = new Set([selfPersonId, ...selfAllSpousesInRow]);
    const narratorSide = [];
    const mySibs = siblingOf.get(selfPersonId) ? [...siblingOf.get(selfPersonId)].filter(s => ids.includes(s) && !assigned.has(s)) : [];
    for (const sib of mySibs) {
      assigned.add(sib);
      const sibSp = spouseOf.get(sib);
      const sibSpousesInRow = [];
      if (sibSp) for (const sp of sibSp) if (ids.includes(sp) && !assigned.has(sp)) { assigned.add(sp); sibSpousesInRow.push(sp); }
      narratorSide.push(...sibSpousesInRow, sib);
    }
    const spouseSide = [];
    if (selfCurrentSpouseInRow) {
      const spSibs = siblingOf.get(selfCurrentSpouseInRow) ? [...siblingOf.get(selfCurrentSpouseInRow)].filter(s => ids.includes(s) && !assigned.has(s)) : [];
      for (const sib of spSibs) {
        assigned.add(sib);
        const sibSp = spouseOf.get(sib);
        const sibSpousesInRow = [];
        if (sibSp) for (const sp of sibSp) if (ids.includes(sp) && !assigned.has(sp)) { assigned.add(sp); sibSpousesInRow.push(sp); }
        spouseSide.push(sib, ...sibSpousesInRow);
      }
    }
    // Extended family: unassigned people whose parent is a sibling of narrator's parent → put on matching side
    const narParents = parentOf.get(selfPersonId) || [];
    const parentSideExtended = [];
    for (const uid of ids) {
      if (assigned.has(uid)) continue;
      const uParents = parentOf.get(uid) || [];
      let onNarSide = false;
      for (const up of uParents) {
        const upSibs = siblingOf.get(up);
        if (upSibs) for (const np of narParents) { if (upSibs.has(np)) { onNarSide = true; break; } }
        if (onNarSide) break;
      }
      if (onNarSide) {
        assigned.add(uid);
        const uSp = spouseOf.get(uid);
        if (uSp) for (const sp of uSp) if (ids.includes(sp) && !assigned.has(sp)) { assigned.add(sp); parentSideExtended.push(sp); }
        parentSideExtended.push(uid);
      }
    }
    return [...parentSideExtended, ...narratorSide, selfPersonId, ...selfAllSpousesInRow, ...spouseSide, ...ids.filter(id => !assigned.has(id))];
  }

  const selfGen = selfPersonId ? generation.get(selfPersonId) : null;
  let selfGenOrder = null;
  if (selfPersonId && selfGen != null) {
    const ordered = reorderSelfGen(genGroups.get(selfGen));
    selfGenOrder = new Map(); ordered.forEach((id, idx) => selfGenOrder.set(id, idx));
  }

  function getMinSelfGenDescIdx(pid) {
    if (!selfGenOrder) return Infinity;
    if (selfGenOrder.has(pid)) return selfGenOrder.get(pid);
    const v = new Set([pid]), q = [pid];
    let minIdx = Infinity;
    while (q.length > 0) { const c = q.shift(); for (const k of (childrenOf.get(c) || [])) { if (v.has(k)) continue; v.add(k); if (selfGenOrder.has(k)) minIdx = Math.min(minIdx, selfGenOrder.get(k)); else q.push(k); } }
    return minIdx;
  }
  function getMaxSelfGenDescIdx(pid) {
    if (!selfGenOrder) return -Infinity;
    if (selfGenOrder.has(pid)) return selfGenOrder.get(pid);
    const v = new Set([pid]), q = [pid];
    let maxIdx = -Infinity;
    while (q.length > 0) { const c = q.shift(); for (const k of (childrenOf.get(c) || [])) { if (v.has(k)) continue; v.add(k); if (selfGenOrder.has(k)) maxIdx = Math.max(maxIdx, selfGenOrder.get(k)); else q.push(k); } }
    return maxIdx;
  }

  function buildUnits(ids) {
    const placed = new Set(), units = [];
    for (const pid of ids) {
      if (placed.has(pid)) continue;
      const sp = spouseOf.get(pid);
      const spInRow = sp ? [...sp].filter(s => ids.includes(s) && !placed.has(s)) : [];
      if (spInRow.length >= 2) {
        placed.add(pid); const exes = [], currs = [];
        for (const s of spInRow) { placed.add(s); if (exSpousePairs.has([pid, s].sort().join('|'))) exes.push(s); else currs.push(s); }
        const uids = [...exes, pid, ...currs];
        if (exes.length === 0 && currs.length >= 2) { uids.length = 0; const mid = Math.floor(currs.length / 2); uids.push(...currs.slice(0, mid), pid, ...currs.slice(mid)); }
        units.push({ ids: uids, width: (uids.length - 1) * COUPLE_GAP });
      } else if (spInRow.length === 1) {
        placed.add(pid); placed.add(spInRow[0]);
        if (pid === selfPersonId || spInRow[0] === selfPersonId) {
          const self = pid === selfPersonId ? pid : spInRow[0], other = pid === selfPersonId ? spInRow[0] : pid;
          units.push({ ids: [self, other], width: COUPLE_GAP });
        } else {
          const pHasSib = siblingOf.get(pid)?.size ? [...siblingOf.get(pid)].some(s => ids.includes(s)) : false;
          const sHasSib = siblingOf.get(spInRow[0])?.size ? [...siblingOf.get(spInRow[0])].some(s => ids.includes(s)) : false;
          if (pHasSib && sHasSib) {
            // Both have siblings — put the one whose parents are more to the LEFT on the left side
            const pParents = parentOf.get(pid) || [], sParents = parentOf.get(spInRow[0]) || [];
            const pPx = pParents.length > 0 ? Math.min(...pParents.map(p => positions.get(p)?.x ?? Infinity)) : Infinity;
            const sPx = sParents.length > 0 ? Math.min(...sParents.map(p => positions.get(p)?.x ?? Infinity)) : Infinity;
            units.push(pPx <= sPx ? { ids: [pid, spInRow[0]], width: COUPLE_GAP } : { ids: [spInRow[0], pid], width: COUPLE_GAP });
          } else {
            // Determine which side the sibling is on, put the sibling-having person nearest their sibling
            if (pHasSib && !sHasSib) {
              const pSibs = [...siblingOf.get(pid)].filter(s => ids.includes(s));
              const sibMinIdx = Math.min(...pSibs.map(s => ids.indexOf(s)));
              units.push(sibMinIdx < ids.indexOf(pid) ? { ids: [pid, spInRow[0]], width: COUPLE_GAP } : { ids: [spInRow[0], pid], width: COUPLE_GAP });
            } else if (!pHasSib && sHasSib) {
              const sSibs = [...siblingOf.get(spInRow[0])].filter(s => ids.includes(s));
              const sibMinIdx = Math.min(...sSibs.map(s => ids.indexOf(s)));
              units.push(sibMinIdx < ids.indexOf(spInRow[0]) ? { ids: [spInRow[0], pid], width: COUPLE_GAP } : { ids: [pid, spInRow[0]], width: COUPLE_GAP });
            } else {
              units.push({ ids: [pid, spInRow[0]], width: COUPLE_GAP });
            }
          }
        }
      } else { placed.add(pid); units.push({ ids: [pid], width: 0 }); }
    }
    return units;
  }

  // Place each generation
  const multiGroupGens = new Set();
  for (let gi = 0; gi < sortedGens.length; gi++) {
    const gen = sortedGens[gi], row = genGroups.get(gen);
    const y = PADDING + (gen - sortedGens[0]) * VERTICAL_SPACING;
    if (gi === 0) {
      let orderedRow = reorderSelfGen(row);
      if (selfGenOrder && !row.includes(selfPersonId)) orderedRow = [...row].sort((a, b) => {
        const minA = getMinSelfGenDescIdx(a), minB = getMinSelfGenDescIdx(b);
        if (minA !== minB) return minA - minB;
        return getMaxSelfGenDescIdx(b) - getMaxSelfGenDescIdx(a);
      });
      const units = buildUnits(orderedRow);
      const tw = units.reduce((s, u) => s + u.width, 0) + (units.length - 1) * HORIZONTAL_SPACING;
      maxRowWidth = Math.max(maxRowWidth, tw);
      let x = PADDING + (Math.max(maxRowWidth, 800) - tw) / 2;
      for (const u of units) { for (let i = 0; i < u.ids.length; i++) positions.set(u.ids[i], { x: x + i * COUPLE_GAP, y }); x += u.width + HORIZONTAL_SPACING; }
      continue;
    }
    if (selfPersonId && row.includes(selfPersonId)) {
      const orderedRow = reorderSelfGen(row), rowUnits = buildUnits(orderedRow);
      const allPX = []; for (const c of orderedRow) for (const p of (parentOf.get(c) || [])) { const pp = positions.get(p); if (pp) allPX.push(pp.x); }
      const cx = allPX.length > 0 ? (Math.min(...allPX) + Math.max(...allPX)) / 2 : PADDING + 400;
      const tw = rowUnits.reduce((s, u) => s + u.width, 0) + (rowUnits.length - 1) * HORIZONTAL_SPACING;
      let rx = Math.max(cx - tw / 2, PADDING), rw = 0;
      for (const u of rowUnits) { for (let i = 0; i < u.ids.length; i++) positions.set(u.ids[i], { x: rx + i * COUPLE_GAP, y }); rw = Math.max(rw, rx + u.width); rx += u.width + HORIZONTAL_SPACING; }
      maxRowWidth = Math.max(maxRowWidth, rw + PADDING); continue;
    }

    const parentUnitMap = new Map(), orphans = [];
    for (const cid of row) {
      const parents = parentOf.get(cid) || [], pp = parents.find(p => positions.has(p));
      if (pp) {
        const sp = spouseOf.get(pp), sid = sp ? [...sp].find(s => positions.has(s)) : null;
        const key = sid ? [pp, sid].sort().join('|') : pp;
        if (!parentUnitMap.has(key)) parentUnitMap.set(key, []); parentUnitMap.get(key).push(cid);
      } else orphans.push(cid);
    }
    const remainingOrphans = [];
    for (const oid of orphans) {
      let placed = false;
      const sibs = siblingOf.get(oid);
      if (sibs) for (const sid of sibs) { for (const [, ch] of parentUnitMap) if (ch.includes(sid)) { ch.push(oid); placed = true; break; } if (placed) break; }
      if (!placed) { const sps = spouseOf.get(oid); if (sps) for (const sp of sps) { for (const [, ch] of parentUnitMap) if (ch.includes(sp)) { ch.push(oid); placed = true; break; } if (placed) break; } }
      if (!placed) remainingOrphans.push(oid);
    }

    if (parentUnitMap.size > 1) multiGroupGens.add(gen);
    const isAncGen = selfGen != null && gen < selfGen;
    const sortedKeys = [...parentUnitMap.keys()].sort((a, b) => {
      if (isAncGen && selfGenOrder) {
        const aD = Math.min(...parentUnitMap.get(a).map(c => getMinSelfGenDescIdx(c)));
        const bD = Math.min(...parentUnitMap.get(b).map(c => getMinSelfGenDescIdx(c)));
        if (aD !== bD) return aD - bD;
      }
      return Math.min(...a.split('|').map(id => positions.get(id)?.x ?? 0)) - Math.min(...b.split('|').map(id => positions.get(id)?.x ?? 0));
    });

    // Reorder children within each group: cross-group spouses go to the matching edge
    if (sortedKeys.length > 1) {
      const allGroupMembers = new Map();
      for (const key of sortedKeys) for (const cid of parentUnitMap.get(key)) allGroupMembers.set(cid, key);
      const keyOrder = new Map(); sortedKeys.forEach((k, i) => keyOrder.set(k, i));
      for (const key of sortedKeys) {
        const children = parentUnitMap.get(key);
        if (children.length < 2) continue;
        const ki = keyOrder.get(key);
        const rightEdge = [], leftEdge = [], middle = [];
        for (const cid of children) {
          const sp = spouseOf.get(cid);
          let goRight = false, goLeft = false;
          if (sp) for (const s of sp) {
            const sKey = allGroupMembers.get(s);
            if (sKey && sKey !== key) { if (keyOrder.get(sKey) > ki) goRight = true; else goLeft = true; }
          }
          if (goRight) rightEdge.push(cid);
          else if (goLeft) leftEdge.push(cid);
          else middle.push(cid);
        }
        parentUnitMap.set(key, [...leftEdge, ...middle, ...rightEdge]);
      }
    }

    const groupPlacements = [];
    if (isAncGen && selfGenOrder && remainingOrphans.length > 0) {
      const oUnits = buildUnits(remainingOrphans);
      const items = sortedKeys.map(k => ({ type: 'k', key: k, dIdx: Math.min(...parentUnitMap.get(k).map(c => getMinSelfGenDescIdx(c))) }));
      for (const u of oUnits) items.push({ type: 'o', unit: u, dIdx: Math.min(...u.ids.map(id => getMinSelfGenDescIdx(id))) });
      items.sort((a, b) => a.dIdx - b.dIdx);
      for (const item of items) {
        if (item.type === 'k') {
          const gUnits = buildUnits(parentUnitMap.get(item.key));
          const pids = item.key.split('|'), pcx = pids.map(id => positions.get(id)?.x ?? 0).reduce((a, b) => a + b, 0) / pids.length;
          const gtw = gUnits.reduce((s, u) => s + u.width, 0) + (gUnits.length - 1) * HORIZONTAL_SPACING;
          let gx = pcx - gtw / 2; const placed = [];
          for (const u of gUnits) { placed.push({ ids: u.ids, width: u.width, x: gx }); gx += u.width + HORIZONTAL_SPACING; }
          groupPlacements.push(placed);
        } else groupPlacements.push([{ ids: item.unit.ids, width: item.unit.width, x: PADDING }]);
      }
    } else {
      for (const key of sortedKeys) {
        const gUnits = buildUnits(parentUnitMap.get(key));
        const pids = key.split('|'), pcx = pids.map(id => positions.get(id)?.x ?? 0).reduce((a, b) => a + b, 0) / pids.length;
        const gtw = gUnits.reduce((s, u) => s + u.width, 0) + (gUnits.length - 1) * HORIZONTAL_SPACING;
        let gx = pcx - gtw / 2; const placed = [];
        for (const u of gUnits) { placed.push({ ids: u.ids, width: u.width, x: gx }); gx += u.width + HORIZONTAL_SPACING; }
        groupPlacements.push(placed);
      }
      if (remainingOrphans.length > 0) { const oUnits = buildUnits(remainingOrphans); let ox = PADDING; const placed = []; for (const u of oUnits) { placed.push({ ids: u.ids, width: u.width, x: ox }); ox += u.width + HORIZONTAL_SPACING; } groupPlacements.push(placed); }
    }

    // Overlap resolution
    for (let g = 0; g < groupPlacements.length; g++) {
      const grp = groupPlacements[g];
      if (grp.length > 0 && grp[0].x < PADDING) { const sh = PADDING - grp[0].x; for (const pu of grp) pu.x += sh; }
      if (g > 0) {
        const prev = groupPlacements[g - 1], pl = prev[prev.length - 1];
        let crossSpouse = false;
        for (const pid of pl.ids) { const sp = spouseOf.get(pid); if (sp) for (const s of grp[0].ids) { if (sp.has(s)) { crossSpouse = true; break; } } if (crossSpouse) break; }
        const gap = crossSpouse ? COUPLE_GAP : HORIZONTAL_SPACING;
        const minX = pl.x + pl.width + gap;
        if (grp[0].x < minX) { const sh = minX - grp[0].x; for (const pu of grp) pu.x += sh; }
      }
    }

    let rw = 0;
    for (const grp of groupPlacements) for (const pu of grp) { for (let i = 0; i < pu.ids.length; i++) positions.set(pu.ids[i], { x: pu.x + i * COUPLE_GAP, y }); rw = Math.max(rw, pu.x + pu.width); }
    for (const key of sortedKeys) { const pids = key.split('|'); if (pids.length !== 1) continue; const pp = positions.get(pids[0]); if (!pp) continue; const ch = parentUnitMap.get(key); const cxs = ch.map(c => positions.get(c)?.x ?? 0); const cc = (Math.min(...cxs) + Math.max(...cxs)) / 2; if (cc > pp.x) pp.x = cc; }
    maxRowWidth = Math.max(maxRowWidth, rw + PADDING);
  }

  // Bottom-up re-centering
  for (let gi = sortedGens.length - 2; gi >= 0; gi--) {
    const gen = sortedGens[gi];
    if (multiGroupGens.has(gen)) continue;
    const row = genGroups.get(gen);
    for (const pid of row) {
      const kids = childrenOf.get(pid); if (!kids?.length) continue;
      const pos = positions.get(pid); if (!pos) continue;
      const kxs = kids.map(c => positions.get(c)?.x).filter(x => x !== undefined); if (!kxs.length) continue;
      const sp = spouseOf.get(pid), spInRow = sp ? [...sp].find(s => row.includes(s) && positions.has(s)) : null;
      const cc = (Math.min(...kxs) + Math.max(...kxs)) / 2;
      if (spInRow) { const spos = positions.get(spInRow); const coupC = (Math.min(pos.x, spos.x) + Math.max(pos.x, spos.x)) / 2; const sh = cc - coupC; if (sh > 0) { pos.x += sh; spos.x += sh; } }
      else if (cc > pos.x) pos.x = cc;
    }
  }

  // Post-layout overlap deconfliction
  const MIN_DIST = NODE_RADIUS * 2 + 20;
  for (const gen of sortedGens) {
    const row = genGroups.get(gen).map(id => ({ id, pos: positions.get(id) })).filter(n => n.pos).sort((a, b) => a.pos.x - b.pos.x);
    for (let i = 1; i < row.length; i++) { const gap = row[i].pos.x - row[i - 1].pos.x; if (gap < MIN_DIST) { const push = MIN_DIST - gap; for (let j = i; j < row.length; j++) row[j].pos.x += push; } }
  }

  // Post-deconfliction ancestor couple re-ordering
  if (selfGenOrder) {
    for (const gen of sortedGens) {
      if (selfGen == null || gen >= selfGen) continue;
      if (multiGroupGens.has(gen)) continue;
      const row = genGroups.get(gen), placed = new Set(), coupleUnits = [];
      for (const pid of row) {
        if (placed.has(pid)) continue; placed.add(pid);
        const sp = spouseOf.get(pid), spInRow = sp ? [...sp].find(s => row.includes(s) && !placed.has(s)) : null;
        if (spInRow) { placed.add(spInRow); coupleUnits.push({ ids: [pid, spInRow], descIdx: Math.min(getMinSelfGenDescIdx(pid), getMinSelfGenDescIdx(spInRow)), maxDescIdx: Math.max(getMaxSelfGenDescIdx(pid), getMaxSelfGenDescIdx(spInRow)) }); }
        else coupleUnits.push({ ids: [pid], descIdx: getMinSelfGenDescIdx(pid), maxDescIdx: getMaxSelfGenDescIdx(pid) });
      }
      if (coupleUnits.length < 2) continue;
      coupleUnits.sort((a, b) => a.descIdx !== b.descIdx ? a.descIdx - b.descIdx : b.maxDescIdx - a.maxDescIdx);
      for (const u of coupleUnits) {
        const akx = []; for (const id of u.ids) for (const k of (childrenOf.get(id) || [])) { const kp = positions.get(k); if (kp) akx.push(kp.x); }
        u.desiredCenter = akx.length > 0 ? (Math.min(...akx) + Math.max(...akx)) / 2 : positions.get(u.ids[0]).x + ((u.ids.length - 1) * COUPLE_GAP) / 2;
        u.width = (u.ids.length - 1) * COUPLE_GAP;
      }
      for (let i = 0; i < coupleUnits.length; i++) {
        const u = coupleUnits[i]; let lx = Math.max(u.desiredCenter - u.width / 2, PADDING);
        if (i > 0) { const prev = coupleUnits[i - 1]; const prx = positions.get(prev.ids[prev.ids.length - 1]).x; lx = Math.max(lx, prx + HORIZONTAL_SPACING); }
        for (let j = 0; j < u.ids.length; j++) positions.get(u.ids[j]).x = lx + j * COUPLE_GAP;
      }
    }
  }

  let actualMaxX = 0, actualMaxY = 0;
  for (const pos of positions.values()) { if (pos.x > actualMaxX) actualMaxX = pos.x; if (pos.y > actualMaxY) actualMaxY = pos.y; }
  const genRange = sortedGens.length > 0 ? (sortedGens[sortedGens.length - 1] - sortedGens[0] + 1) : 1;
  const graphWidth = Math.max(actualMaxX + PADDING * 3, maxRowWidth + PADDING * 2, 800);
  const graphHeight = Math.max(actualMaxY + PADDING * 3, PADDING * 2 + genRange * VERTICAL_SPACING, 600);

  // Role labels via BFS
  const inverseLabel = { parent: 'Child', child: 'Parent', spouse: 'Spouse', ex_spouse: 'Ex-Spouse', sibling: 'Sibling', step_sibling: 'Step Sib', half_sibling: 'Half Sib', grandparent: 'Grandchild', grandchild: 'Grandparent', great_grandparent: 'Gt-Grandchild', great_grandchild: 'Gt-Grandparent', uncle_aunt: 'Nephew/Niece', nephew_niece: 'Uncle/Aunt', cousin: 'Cousin', in_law: 'In-law', parent_in_law: "Spouse's Child", child_in_law: "Child's Spouse", step_parent: 'Step Child', step_child: 'Step Parent', adopted_parent: 'Adopted Child', adopted_child: 'Adopted Parent', godparent: 'Godchild', godchild: 'Godparent' };
  const directLabel = { parent: 'Parent', child: 'Child', spouse: 'Spouse', ex_spouse: 'Ex-Spouse', sibling: 'Sibling', step_sibling: 'Step Sib', half_sibling: 'Half Sib', grandparent: 'Grandparent', grandchild: 'Grandchild', great_grandparent: 'Gt-Grandparent', great_grandchild: 'Gt-Grandchild', uncle_aunt: 'Uncle/Aunt', nephew_niece: 'Nephew/Niece', cousin: 'Cousin', in_law: 'In-law', parent_in_law: "Spouse's Parent", child_in_law: "Child's Spouse", step_parent: 'Step Parent', step_child: 'Step Child', adopted_parent: 'Adopted Parent', adopted_child: 'Adopted Child', godparent: 'Godparent', godchild: 'Godchild' };

  if (selfPersonId) {
    roleLabels.set(selfPersonId, 'Me');
    const relsByP = new Map();
    for (const r of relationships) { if (!relsByP.has(r.person_a_id)) relsByP.set(r.person_a_id, []); if (!relsByP.has(r.person_b_id)) relsByP.set(r.person_b_id, []); relsByP.get(r.person_a_id).push(r); relsByP.get(r.person_b_id).push(r); }
    const vis = new Set([selfPersonId]), queue = [{ id: selfPersonId, prefix: '' }];
    while (queue.length > 0) {
      const { id: curId, prefix } = queue.shift();
      for (const r of (relsByP.get(curId) || [])) {
        let otherId, label;
        if (r.person_a_id === curId && !vis.has(r.person_b_id)) { otherId = r.person_b_id; label = inverseLabel[r.relationship_type]; }
        else if (r.person_b_id === curId && !vis.has(r.person_a_id)) { otherId = r.person_a_id; label = directLabel[r.relationship_type]; }
        else continue;
        if (!label || vis.has(otherId)) continue;
        vis.add(otherId);
        const fl = prefix ? `${prefix}${label}` : label;
        roleLabels.set(otherId, fl);
        queue.push({ id: otherId, prefix: `${fl}'s ` });
      }
    }
  }

  return { positions, roleLabels, generation, width: graphWidth, height: graphHeight, people, relationships, selfPersonId };
}

// ============================================================
// HTML Generation — App-faithful Matra UI
// ============================================================

function escapeHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function generateTreeSVG(layout) {
  const { positions, roleLabels, generation, people, relationships, selfPersonId } = layout;
  let svg = `<defs>
    <radialGradient id="nodeGlowG" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#6B8F3C" stop-opacity="0.15"/><stop offset="100%" stop-color="#6B8F3C" stop-opacity="0"/></radialGradient>
    <radialGradient id="selfGlowG" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#C49A3C" stop-opacity="0.25"/><stop offset="100%" stop-color="#C49A3C" stop-opacity="0"/></radialGradient>
  </defs>\n`;

  for (const r of relationships) {
    const posA = positions.get(r.person_a_id), posB = positions.get(r.person_b_id);
    if (!posA || !posB) continue;
    const type = r.relationship_type, verified = r.verified !== false;
    if (type === 'spouse') { const lx = Math.min(posA.x, posB.x) + NODE_RADIUS, rx = Math.max(posA.x, posB.x) - NODE_RADIUS; svg += `<line x1="${lx}" y1="${posA.y}" x2="${rx}" y2="${posB.y}" stroke="#C49A3C" stroke-width="2"/>\n`; continue; }
    if (type === 'ex_spouse') { const lx = Math.min(posA.x, posB.x) + NODE_RADIUS, rx = Math.max(posA.x, posB.x) - NODE_RADIUS; svg += `<line x1="${lx}" y1="${posA.y}" x2="${rx}" y2="${posB.y}" stroke="#C4665A" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.6"/>\n`; continue; }
    if (['sibling', 'half_sibling', 'step_sibling'].includes(type)) continue;
    if (!['parent', 'child', 'step_parent', 'step_child', 'adopted_parent', 'adopted_child'].includes(type)) {
      const gA = generation.get(r.person_a_id) ?? 0, gB = generation.get(r.person_b_id) ?? 0;
      const hasBridge = relationships.some(r2 => { if (r2 === r) return false; const oid = r2.person_a_id === r.person_a_id || r2.person_a_id === r.person_b_id ? r2.person_b_id : r2.person_b_id === r.person_a_id || r2.person_b_id === r.person_b_id ? r2.person_a_id : null; if (!oid) return false; const og = generation.get(oid) ?? -999; return og > Math.min(gA, gB) && og < Math.max(gA, gB); });
      if (hasBridge) continue;
    }
    const parent = posA.y < posB.y ? posA : posB, child = posA.y < posB.y ? posB : posA;
    const midY = parent.y + (child.y - parent.y) / 2;
    const color = verified ? 'rgba(107,143,60,0.6)' : 'rgba(107,143,60,0.18)';
    const dash = verified ? '' : 'stroke-dasharray="4 4"';
    svg += `<path d="M ${parent.x} ${parent.y + NODE_RADIUS} L ${parent.x} ${midY} L ${child.x} ${midY} L ${child.x} ${child.y - NODE_RADIUS}" stroke="${color}" stroke-width="2" ${dash} fill="none"/>\n`;
  }

  for (const r of relationships) {
    if (!['sibling', 'half_sibling', 'step_sibling'].includes(r.relationship_type)) continue;
    const posA = positions.get(r.person_a_id), posB = positions.get(r.person_b_id);
    if (!posA || !posB) continue;
    const lx = Math.min(posA.x, posB.x) + NODE_RADIUS, rx = Math.max(posA.x, posB.x) - NODE_RADIUS;
    if (lx >= rx) continue;
    svg += `<line x1="${lx}" y1="${posA.y}" x2="${rx}" y2="${posB.y}" stroke="rgba(107,143,60,0.5)" stroke-width="1.5" ${r.relationship_type !== 'sibling' ? 'stroke-dasharray="6 3"' : ''}/>\n`;
  }

  for (const p of people) {
    const pos = positions.get(p.id); if (!pos) continue;
    const isSelf = p.id === selfPersonId, initials = (p.first_name?.[0] || '') + (p.last_name?.[0] || '');
    const role = roleLabels.get(p.id) || '', isDeceased = p.metadata?.is_deceased || !!p.death_date;
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${NODE_RADIUS * 2}" fill="url(#${isSelf ? 'selfGlowG' : 'nodeGlowG'})"/>\n`;
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${NODE_RADIUS}" fill="#FFFFFF" stroke="${isSelf ? '#C49A3C' : '#6B8F3C'}" stroke-width="${isSelf ? 3 : 2}"${isDeceased ? ' opacity="0.6"' : ''}/>\n`;
    svg += `<text x="${pos.x}" y="${pos.y + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="#3B2E1E" font-family="Inter, system-ui">${escapeHtml(initials)}</text>\n`;
    svg += `<text x="${pos.x}" y="${pos.y + NODE_RADIUS + 16}" text-anchor="middle" font-size="12" font-weight="600" fill="#3B2E1E" font-family="Inter, system-ui">${escapeHtml(p.first_name)}</text>\n`;
    if (p.last_name) svg += `<text x="${pos.x}" y="${pos.y + NODE_RADIUS + 29}" text-anchor="middle" font-size="10" fill="#6B5D4F" font-family="Inter, system-ui">${escapeHtml(p.last_name)}</text>\n`;
    if (role) { const ry = p.last_name ? pos.y + NODE_RADIUS + 42 : pos.y + NODE_RADIUS + 32; svg += `<text x="${pos.x}" y="${ry}" text-anchor="middle" font-size="9" fill="${isSelf ? '#C49A3C' : '#6B8F3C'}" font-weight="600" font-family="Inter, system-ui">${escapeHtml(role)}</text>\n`; }
    if (isDeceased) svg += `<text x="${pos.x + NODE_RADIUS - 4}" y="${pos.y - NODE_RADIUS + 10}" text-anchor="middle" font-size="10" fill="#C4665A">✝</text>\n`;
  }
  return svg;
}

function generateHTML(db, layout) {
  const { people, relationships: rels, stories, interviewResults } = db;
  const treeSvg = generateTreeSVG(layout);
  const selfPerson = people.find(p => normalize(p.first_name) === 'carlos' && normalize(p.last_name || '').includes('bueso') && !normalize(p.first_name).includes('jose'));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Matra — Real Audio Pipeline Test</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #EDE6D8; color: #3B2E1E; }
  .page-header { background: #F7F2EA; border-bottom: 1px solid rgba(139,115,85,0.15); padding: 20px 32px; display: flex; align-items: center; justify-content: space-between; }
  .page-header h1 { font-family: 'Space Grotesk', sans-serif; font-size: 28px; color: #3B2E1E; }
  .page-header .subtitle { color: #6B5D4F; font-size: 14px; margin-top: 2px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .badge-green { background: rgba(107,143,60,0.12); color: #6B8F3C; }
  .badge-amber { background: rgba(196,154,60,0.12); color: #C49A3C; }
  .stats-bar { display: flex; gap: 24px; padding: 16px 32px; background: #F7F2EA; border-bottom: 1px solid rgba(139,115,85,0.1); flex-wrap: wrap; }
  .stat-item { text-align: center; }
  .stat-num { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 700; color: #6B8F3C; }
  .stat-label { font-size: 11px; color: #9B8E7E; text-transform: uppercase; letter-spacing: 0.5px; }
  .app-tabs { display: flex; gap: 0; background: #FFFFFF; border-bottom: 1px solid rgba(139,115,85,0.1); position: sticky; top: 0; z-index: 100; }
  .app-tab { flex: 1; padding: 14px 8px; text-align: center; cursor: pointer; border: none; background: none; font-size: 12px; font-weight: 500; color: #9B8E7E; transition: all 0.2s; border-bottom: 3px solid transparent; font-family: 'Inter', system-ui, sans-serif; }
  .app-tab:hover { color: #6B5D4F; }
  .app-tab.active { color: #6B8F3C; border-bottom-color: #6B8F3C; }
  .app-tab .tab-icon { font-size: 20px; display: block; margin-bottom: 2px; }
  .tab-panel { display: none; } .tab-panel.active { display: block; }
  .tree-container { padding: 16px; overflow: auto; background: #F7F2EA; min-height: 500px; }
  .tree-container svg { display: block; margin: 0 auto; }
  .tree-controls { display: flex; gap: 8px; padding: 8px 16px; background: #FFFFFF; border-bottom: 1px solid rgba(139,115,85,0.08); }
  .tree-controls button { background: #F0EADE; border: 1px solid rgba(139,115,85,0.12); border-radius: 8px; padding: 6px 14px; cursor: pointer; font-size: 12px; color: #6B5D4F; font-family: 'Inter', system-ui, sans-serif; }
  .tree-controls button:hover { background: #E5DDD0; }
  .legend { display: flex; gap: 16px; padding: 8px 16px; background: #FFFFFF; border-bottom: 1px solid rgba(139,115,85,0.08); font-size: 11px; color: #9B8E7E; flex-wrap: wrap; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 4px; }
  .legend-line { width: 20px; height: 2px; display: inline-block; margin-right: 4px; }
  .people-grid { padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
  .person-card { background: #FFFFFF; border-radius: 20px; padding: 16px; border: 1px solid rgba(139,115,85,0.08); box-shadow: 0 1px 6px rgba(139,115,85,0.06); display: flex; gap: 12px; align-items: flex-start; }
  .person-card.deceased { opacity: 0.7; }
  .person-avatar { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; flex-shrink: 0; border: 2px solid #6B8F3C; background: #F0EADE; color: #6B8F3C; }
  .person-avatar.self { border-color: #C49A3C; color: #C49A3C; }
  .person-info { flex: 1; min-width: 0; }
  .person-name { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; color: #3B2E1E; }
  .person-role { font-size: 11px; font-weight: 600; color: #6B8F3C; text-transform: uppercase; letter-spacing: 0.5px; }
  .person-role.self-role { color: #C49A3C; }
  .person-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 16px; background: #F0EADE; font-size: 11px; color: #6B5D4F; }
  .stories-list { padding: 16px; display: grid; gap: 12px; }
  .story-card { background: #FFFFFF; border-radius: 20px; padding: 20px; border: 1px solid rgba(107,143,60,0.18); box-shadow: 0 4px 16px rgba(139,115,85,0.15); }
  .story-badge { font-size: 10px; font-weight: 600; color: #8BAF5C; background: rgba(107,143,60,0.12); padding: 2px 8px; border-radius: 12px; display: inline-block; margin-bottom: 8px; }
  .story-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 20px; color: #3B2E1E; margin-bottom: 8px; }
  .story-meta { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .story-meta .chip { background: rgba(107,143,60,0.08); }
  .story-content { font-size: 14px; line-height: 1.75; color: #6B5D4F; }
  .interviews-list { padding: 16px; display: grid; gap: 16px; }
  .interview-card { background: #FFFFFF; border-radius: 20px; padding: 20px; border: 1px solid rgba(139,115,85,0.08); box-shadow: 0 1px 6px rgba(139,115,85,0.06); }
  .interview-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .interview-icon { width: 44px; height: 44px; border-radius: 50%; background: rgba(107,143,60,0.12); display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .interview-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 18px; color: #3B2E1E; }
  .interview-stats { font-size: 12px; color: #9B8E7E; }
  .interview-transcript { background: #F7F2EA; border-radius: 12px; padding: 16px; margin-top: 12px; font-size: 13px; line-height: 1.8; color: #6B5D4F; max-height: 300px; overflow-y: auto; border: 1px solid rgba(139,115,85,0.08); }
  .extraction-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .extraction-table th { background: #F0EADE; color: #6B5D4F; padding: 8px 12px; text-align: left; font-weight: 600; border-bottom: 1px solid rgba(139,115,85,0.12); }
  .extraction-table td { padding: 6px 12px; border-bottom: 1px solid rgba(139,115,85,0.06); color: #3B2E1E; }
  .extraction-table code { background: rgba(107,143,60,0.08); padding: 2px 6px; border-radius: 4px; font-size: 11px; color: #6B8F3C; }
  .rels-container { padding: 16px; }
  .rel-group { margin-bottom: 16px; }
  .rel-group-header { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px; color: #6B8F3C; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 0; border-bottom: 1px solid rgba(107,143,60,0.15); margin-bottom: 8px; }
  .rel-row { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #FFFFFF; border-radius: 10px; margin-bottom: 4px; font-size: 13px; border: 1px solid rgba(139,115,85,0.06); }
  .rel-row.inferred { background: rgba(196,154,60,0.04); border-left: 3px solid #C49A3C; }
  .rel-arrow { color: #9B8E7E; font-size: 16px; }
  .waveform-bar { display: flex; gap: 2px; align-items: center; height: 36px; padding: 8px 0; }
  .waveform-bar span { display: inline-block; width: 3px; border-radius: 2px; background: #6B8F3C; opacity: 0.6; }
  details summary { cursor: pointer; font-weight: 500; color: #6B5D4F; padding: 8px 0; }
  details summary:hover { color: #3B2E1E; }
  .audio-info { background: rgba(107,143,60,0.06); border-radius: 12px; padding: 12px 16px; margin-top: 8px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .audio-info .chip { background: rgba(107,143,60,0.12); }
</style>
</head>
<body>
<div class="page-header">
  <div>
    <h1>🌿 Matra — Real Audio Pipeline Test</h1>
    <div class="subtitle">Voice notes → Whisper STT → AI Extraction → Family Tree</div>
  </div>
  <div>
    <span class="badge badge-green">✓ ${interviewResults.length} INTERVIEWS</span>
    <span class="badge badge-amber">${people.length} PEOPLE</span>
  </div>
</div>
<div class="stats-bar">
  <div class="stat-item"><div class="stat-num">${people.length}</div><div class="stat-label">People</div></div>
  <div class="stat-item"><div class="stat-num">${rels.filter(r => !r.inferred).length}</div><div class="stat-label">Direct Rels</div></div>
  <div class="stat-item"><div class="stat-num">${rels.filter(r => r.inferred).length}</div><div class="stat-label">Inferred Rels</div></div>
  <div class="stat-item"><div class="stat-num">${stories.length}</div><div class="stat-label">Stories</div></div>
  <div class="stat-item"><div class="stat-num">${interviewResults.reduce((s, i) => s + (i.audioDuration || 0), 0).toFixed(0)}s</div><div class="stat-label">Audio</div></div>
  <div class="stat-item"><div class="stat-num">${interviewResults.reduce((s, i) => s + i.timeSeconds, 0).toFixed(1)}s</div><div class="stat-label">Processing</div></div>
</div>

<div class="app-tabs">
  <button class="app-tab active" onclick="showTab('tree')"><span class="tab-icon">🌳</span>Lineage</button>
  <button class="app-tab" onclick="showTab('people')"><span class="tab-icon">👥</span>People</button>
  <button class="app-tab" onclick="showTab('stories')"><span class="tab-icon">📖</span>Stories</button>
  <button class="app-tab" onclick="showTab('interviews')"><span class="tab-icon">🎙️</span>Interviews</button>
  <button class="app-tab" onclick="showTab('relationships')"><span class="tab-icon">🔗</span>Relationships</button>
</div>

<div class="tab-panel active" id="tab-tree">
  <div class="legend">
    <span><span class="legend-dot" style="border: 2px solid #C49A3C; background: #FFF;"></span> Self</span>
    <span><span class="legend-dot" style="border: 2px solid #6B8F3C; background: #FFF;"></span> Family</span>
    <span><span class="legend-line" style="background: #C49A3C;"></span> Spouse</span>
    <span><span class="legend-line" style="background: rgba(107,143,60,0.6);"></span> Parent→Child</span>
  </div>
  <div class="tree-controls">
    <button onclick="zoomTree(1.2)">🔍+ Zoom In</button>
    <button onclick="zoomTree(0.8)">🔍− Zoom Out</button>
    <button onclick="treeScale=1;applyTreeScale()">↺ Reset</button>
  </div>
  <div class="tree-container" id="tree-container">
    <svg width="${layout.width}" height="${layout.height}" xmlns="http://www.w3.org/2000/svg" style="background: #F7F2EA;">${treeSvg}</svg>
  </div>
</div>

<div class="tab-panel" id="tab-people">
  <div class="people-grid">
    ${people.map(p => {
      const isSelf = p.id === selfPerson?.id;
      const role = layout.roleLabels.get(p.id) || '';
      const isDeceased = p.metadata?.is_deceased || !!p.death_date;
      const initials = (p.first_name?.[0] || '') + (p.last_name?.[0] || '');
      const name = `${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`;
      const chips = [];
      if (p.birth_date) chips.push('🎂 ' + p.birth_date);
      if (p.death_date) chips.push('🕊️ ' + p.death_date);
      if (p.birth_place) chips.push('📍 ' + p.birth_place);
      if (p.current_location) chips.push('🏠 ' + p.current_location);
      if (p.metadata?.profession) chips.push('💼 ' + p.metadata.profession);
      if (p.metadata?.gender) chips.push('👤 ' + p.metadata.gender);
      return `<div class="person-card${isDeceased ? ' deceased' : ''}">
        <div class="person-avatar${isSelf ? ' self' : ''}">${escapeHtml(initials)}</div>
        <div class="person-info">
          <div class="person-name">${escapeHtml(name)}${p.nickname ? ' <span style="color:#9B8E7E;font-weight:400;font-size:13px">— "' + escapeHtml(p.nickname) + '"</span>' : ''}</div>
          ${role ? '<div class="person-role' + (isSelf ? ' self-role' : '') + '">' + escapeHtml(role) + '</div>' : ''}
          <div class="person-chips">${chips.map(c => '<span class="chip">' + c + '</span>').join('')}</div>
        </div>
      </div>`;
    }).join('')}
  </div>
</div>

<div class="tab-panel" id="tab-stories">
  <div class="stories-list">
    ${stories.map(s => `<div class="story-card">
      <div class="story-badge">✨ AI-crafted</div>
      <div class="story-title">${escapeHtml(s.title)}</div>
      <div class="story-meta">
        ${(s.involvedPeople || []).map(p => '<span class="chip">👤 ' + escapeHtml(p) + '</span>').join('')}
        ${s.location ? '<span class="chip">📍 ' + escapeHtml(s.location) + '</span>' : ''}
        <span class="chip">📖 ${escapeHtml(s.source || '')}</span>
      </div>
      <div class="story-content">${escapeHtml(typeof s.content === 'string' ? s.content : JSON.stringify(s.content))}</div>
    </div>`).join('')}
  </div>
</div>

<div class="tab-panel" id="tab-interviews">
  <div class="interviews-list">
    ${interviewResults.map(ir => `<div class="interview-card">
      <div class="interview-header">
        <div class="interview-icon">🎙️</div>
        <div>
          <div class="interview-title">${escapeHtml(ir.label)}</div>
          <div class="interview-stats">
            ⏱️ ${ir.timeSeconds}s · 🎵 ${ir.audioFile} · ${(ir.audioDuration || 0).toFixed(1)}s audio · 🌐 ${(ir.sttLanguage || ir.language || '').toUpperCase()}
          </div>
        </div>
      </div>
      <div class="audio-info">
        <span class="chip">📁 ${escapeHtml(ir.audioFile)}</span>
        <span class="chip">⏱️ ${(ir.audioDuration || 0).toFixed(1)}s</span>
        <span class="chip">🌐 Detected: ${escapeHtml(ir.sttLanguage || '?')}</span>
        <span class="chip">👥 ${ir.extraction?.suggestedPeople?.length || 0} people</span>
        <span class="chip">🔗 ${ir.newRelationships?.length || 0} direct + ${ir.inferredRelationships?.length || 0} inferred</span>
        <span class="chip">📖 ${ir.summary?.suggestedStories?.length || 0} stories</span>
      </div>
      <details open>
        <summary>📝 Transcript (Whisper STT)</summary>
        <div class="interview-transcript">${escapeHtml(ir.transcript)}</div>
      </details>
      <details>
        <summary>🔍 Extracted Relationships (${ir.extraction?.relationships?.length || 0})</summary>
        <table class="extraction-table">
          <tr><th>Person A</th><th>→</th><th>Person B</th><th>Type</th><th>Conf</th></tr>
          ${(ir.extraction?.relationships || []).map(r => `<tr><td>${escapeHtml(r.personA)}</td><td style="color:#9B8E7E">→</td><td>${escapeHtml(r.personB)}</td><td><code>${escapeHtml(r.relationshipType)}</code></td><td>${Math.round((r.confidence || 0) * 100)}%</td></tr>`).join('')}
        </table>
      </details>
      <details>
        <summary>👥 Extracted People (${ir.extraction?.suggestedPeople?.length || 0})</summary>
        <table class="extraction-table">
          <tr><th>Name</th><th>Birth</th><th>Place</th><th>Profession</th><th>Gender</th></tr>
          ${(ir.extraction?.suggestedPeople || []).map(p => `<tr><td>${escapeHtml(p.firstName)}${p.lastName ? ' ' + escapeHtml(p.lastName) : ''}</td><td>${escapeHtml(p.birthDate || '')}</td><td>${escapeHtml(p.birthPlace || '')}</td><td>${escapeHtml(p.profession || '')}</td><td>${escapeHtml(p.gender || '')}</td></tr>`).join('')}
        </table>
      </details>
    </div>`).join('')}
  </div>
</div>

<div class="tab-panel" id="tab-relationships">
  <div class="rels-container">
    ${(() => {
      const byType = {};
      for (const r of rels) { if (!byType[r.relationship_type]) byType[r.relationship_type] = []; byType[r.relationship_type].push(r); }
      return Object.entries(byType).sort((a, b) => a[0].localeCompare(b[0])).map(([type, tRels]) => `<div class="rel-group">
        <div class="rel-group-header">${escapeHtml(type)} (${tRels.length})</div>
        ${tRels.map(r => {
          const pA = people.find(p => p.id === r.person_a_id), pB = people.find(p => p.id === r.person_b_id);
          return `<div class="rel-row${r.inferred ? ' inferred' : ''}">
            <span>${escapeHtml(pA ? pA.first_name + (pA.last_name ? ' ' + pA.last_name : '') : r.personAName || '?')}</span>
            <span class="rel-arrow">→</span>
            <span>${escapeHtml(pB ? pB.first_name + (pB.last_name ? ' ' + pB.last_name : '') : r.personBName || '?')}</span>
            <span class="chip" style="margin-left:auto">${Math.round((r.confidence || 0) * 100)}%${r.inferred ? ' · inferred' : ''}</span>
          </div>`;
        }).join('')}
      </div>`).join('');
    })()}
  </div>
</div>

<script>
  let treeScale = 1;
  function showTab(name) {
    document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    const tabs = ['tree', 'people', 'stories', 'interviews', 'relationships'];
    document.querySelectorAll('.app-tab')[tabs.indexOf(name)].classList.add('active');
  }
  function zoomTree(f) { treeScale = Math.min(Math.max(treeScale * f, 0.2), 4); applyTreeScale(); }
  function applyTreeScale() { const svg = document.querySelector('#tree-container svg'); if (svg) { svg.style.transform = 'scale(' + treeScale + ')'; svg.style.transformOrigin = '0 0'; } }
  document.querySelector('#tree-container')?.addEventListener('wheel', e => { e.preventDefault(); zoomTree(e.deltaY > 0 ? 0.9 : 1.1); }, { passive: false });
</script>
</body></html>`;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Matra — Real Audio Multi-Interview Pipeline Test      ║');
  console.log('║   Voice Notes → Whisper STT → AI → Family Tree         ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║   Interview 1: charlie-1.m4a (Carlos — primary user)    ║');
  console.log('║   Interview 2: papa-2.m4a (Carlos José Bueso — dad)     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Verify audio files exist
  for (const iv of INTERVIEWS) {
    if (!fs.existsSync(iv.audioFile)) {
      console.error(`❌ Audio file not found: ${iv.audioFile}`);
      process.exit(1);
    }
    const size = (fs.statSync(iv.audioFile).size / 1024 / 1024).toFixed(2);
    console.log(`  ✅ Found: ${path.basename(iv.audioFile)} (${size} MB)`);
  }

  const db = new SimulatedDB();
  const cachePath = path.join(__dirname, 'test-real-audio-cache.json');
  const useFresh = process.argv.includes('--fresh');

  if (!useFresh && fs.existsSync(cachePath)) {
    console.log('  📦 Using cached data (pass --fresh to re-run APIs)');
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    db.people = cached.people;
    db.relationships = cached.relationships;
    db.stories = cached.stories || [];
    db.interviewResults = cached.interviewResults || [];
  } else {
    // Process each interview sequentially
    for (const iv of INTERVIEWS) {
      await processInterview(iv, db);
      console.log(`  ──── After ${iv.narrator.firstName}: ${db.people.length} people, ${db.relationships.length} rels ────`);
    }
    fs.writeFileSync(cachePath, JSON.stringify({ people: db.people, relationships: db.relationships, stories: db.stories, interviewResults: db.interviewResults }, null, 2), 'utf-8');
    console.log(`  💾 Cached results to ${path.basename(cachePath)}`);
  }

  // Determine self person (Carlos Bueso, NOT Carlos José)
  const selfPerson = db.people.find(p =>
    normalize(p.first_name) === 'carlos' &&
    normalize(p.last_name || '').includes('bueso') &&
    !normalize(p.first_name).includes('jose')
  ) || db.people[0];

  console.log(`\n  👤 Self person: ${selfPerson.first_name} ${selfPerson.last_name || ''} (${selfPerson.id})`);

  // Layout
  console.log('  ⏳ Computing tree layout...');
  const layoutPeople = db.people.map(p => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, nickname: p.nickname, birth_date: p.birth_date, death_date: p.death_date, metadata: p.metadata }));
  const layoutRels = db.relationships.map(r => ({ person_a_id: r.person_a_id, person_b_id: r.person_b_id, relationship_type: r.relationship_type, verified: !r.inferred }));
  const layout = layoutTree(layoutPeople, layoutRels, selfPerson?.id);
  console.log(`  ✅ Layout: ${layout.width.toFixed(0)}×${layout.height.toFixed(0)} canvas`);

  // Overlap check
  const positioned = [...layout.positions.entries()];
  let overlapCount = 0;
  for (let i = 0; i < positioned.length; i++) for (let j = i + 1; j < positioned.length; j++) {
    const dist = Math.sqrt((positioned[i][1].x - positioned[j][1].x) ** 2 + (positioned[i][1].y - positioned[j][1].y) ** 2);
    if (dist < NODE_RADIUS * 2 + 10) overlapCount++;
  }
  console.log(`  ${overlapCount === 0 ? '✅' : '❌'} Overlaps: ${overlapCount}`);

  // Generate HTML
  const html = generateHTML(db, layout);
  const htmlPath = path.join(__dirname, 'test-real-audio-output.html');
  fs.writeFileSync(htmlPath, html, 'utf-8');

  // Debug JSON
  const debugPath = path.join(__dirname, 'test-real-audio-debug.json');
  fs.writeFileSync(debugPath, JSON.stringify({
    totalTimeSeconds: parseFloat(((Date.now() - startTime) / 1000).toFixed(1)),
    interviews: db.interviewResults,
    finalPeople: db.people,
    finalRelationships: db.relationships,
    finalStories: db.stories,
    treeLayout: { width: layout.width, height: layout.height, positions: Object.fromEntries(layout.positions), roleLabels: Object.fromEntries(layout.roleLabels), overlaps: overlapCount },
  }, null, 2), 'utf-8');

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(60));
  console.log(`  ✅ All ${INTERVIEWS.length} voice notes processed in ${totalTime}s`);
  console.log(`  📊 Final: ${db.people.length} people, ${db.relationships.length} rels, ${db.stories.length} stories`);
  console.log(`  🌳 Tree: ${overlapCount} overlaps, ${layout.width.toFixed(0)}×${layout.height.toFixed(0)}`);
  console.log(`  📄 HTML: ${htmlPath}`);
  console.log(`  🔍 JSON: ${debugPath}`);
  console.log('═'.repeat(60) + '\n');
}

main().catch(err => { console.error('❌ Fatal error:', err); process.exit(1); });

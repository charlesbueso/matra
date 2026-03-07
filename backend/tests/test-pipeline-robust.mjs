#!/usr/bin/env node
// ============================================================
// MATRA — ROBUST AI Pipeline Test
// ============================================================
// Run: node test-pipeline-robust.mjs
//
// A comprehensive test with a large, multi-generational family
// that exercises every relationship type, dedup logic,
// transitive inference, and story generation.
//
// Family: The Rodriguez-Chen clan (22+ people, 4 generations)
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env from .env.local ──
const envPath = path.join(__dirname, '.env.local');
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

// ============================================================
// TEST DATA — The Rodriguez-Chen Family
// ============================================================
// 4 generations, 22+ people
//
// Gen 1 (Great-Grandparents):
//   Antonio Rodriguez (b.1920, d.1995, baker, Guadalajara) + Elena Morales (b.1923, d.2010)
//
// Gen 2 (Grandparents):
//   Roberto Rodriguez (b.1945, son of Antonio & Elena)
//     1st marriage: Marta Ruiz (ex-spouse) → Andrés Rodriguez (b.1965, half-bro of Jorge)
//     2nd marriage: Carmen Vega (b.1948)
//   Miguel Chen (b.1947, chino-mexicano) + Lucía Fernández (b.1950, Oaxaca)
//
// Gen 3 (Parents/Aunts/Uncles):
//   Jorge Rodriguez Vega (b.1970, engineer, son of Roberto & Carmen) + Sofía Chen Fernández (b.1973, doctor)
//   Patricia Rodriguez Vega (b.1968, Jorge's sister) + Ricardo Mendoza
//   Eduardo Chen Fernández (b.1975, Sofía's brother) + Teresa Gutiérrez
//   Andrés Rodriguez (b.1965, Roberto & Marta's son — half-sibling of Jorge & Patricia)
//
// Gen 4 (Narrator + siblings + cousins):
//   NARRATOR: Valentina Rodriguez Chen (female, b.1998, CDMX)
//   Diego Rodriguez Chen (b.1995, brother) + Ana López → baby Matías (b.2024)
//   Isabella Rodriguez Chen (b.2001, sister, nickname "Isa")
//   Lucas Mendoza Rodriguez (b.1997, cousin, Patricia's son)
//   Camila Mendoza Rodriguez (b.2000, cousin, Patricia's daughter)
//   Daniel Chen Gutiérrez (b.~2004, age 22, cousin, Eduardo's son)
//
// Special relationships:
//   Patricia = godmother of Valentina
//   Roberto + Marta Ruiz = ex_spouse
//   Andrés = half_sibling of Jorge (shared father Roberto)
// ============================================================

const NARRATOR = { firstName: 'Valentina', lastName: 'Rodriguez Chen', gender: 'female' };

const TRANSCRIPT = `Bueno, me llamo Valentina Rodriguez Chen, soy mujer, nací en 1998 en la Ciudad de México. Mi familia es enorme y muy diversa, así que voy a tratar de explicar todo.

Mi papá se llama Jorge Rodriguez Vega, nació en 1970 en Guadalajara y es ingeniero civil. Mi mamá se llama Sofía Chen Fernández, ella nació en 1973 en la Ciudad de México y es doctora. Mis papás se casaron en 1996 aquí en la Ciudad de México.

Tengo un hermano mayor que se llama Diego Rodriguez Chen, él nació en 1995. Diego estudió medicina igual que mi mamá. Se casó el año pasado con Ana López y ya tienen un bebé que se llama Matías, el bebé tiene un año. También tengo una hermana menor que se llama Isabella, pero todos le decimos Isa, ella nació en 2001.

Por el lado de mi papá, mis abuelos paternos son Don Roberto Rodriguez, nacido en 1945 en Guadalajara, y Doña Carmen Vega, nacida en 1948. Pero resulta que mi abuelo Roberto estuvo casado antes con una señora que se llama Marta Ruiz. De ese primer matrimonio nació Andrés Rodriguez en 1965. O sea que Andrés es medio hermano de mi papá Jorge porque comparten el mismo padre que es Roberto. Marta y Roberto se divorciaron antes de que mi abuelo conociera a mi abuela Carmen. Andrés vive en Monterrey.

Los papás de mi abuelo Roberto, o sea mis bisabuelos, fueron Don Antonio Rodriguez y Doña Elena Morales. Mi bisabuelo Antonio nació en 1920 en Guadalajara y era panadero, tenía una panadería en el centro de Guadalajara que era famosa en todo el barrio. Él falleció en 1995. Mi bisabuela Elena nació en 1923 y también ya falleció, ella murió en 2010.

Por el lado de mi mamá, mis abuelos maternos son Don Miguel Chen, que nació en 1947. Él es chino-mexicano y su familia vino de Cantón. Y mi abuela materna es Doña Lucía Fernández, nacida en 1950 en Oaxaca.

Mi papá tiene una hermana mayor que se llama Patricia Rodriguez Vega, ella nació en 1968. Mi tía Patricia está casada con mi tío Ricardo Mendoza. Ellos tienen dos hijos: mi primo Lucas, que nació en 1997, y mi prima Camila, que nació en 2000. Mi tía Patricia también es mi madrina, desde que nací ella siempre ha sido muy especial conmigo.

Mi mamá tiene un hermano menor que se llama Eduardo Chen Fernández, nacido en 1975. Mi tío Eduardo se casó con Teresa Gutiérrez. Tienen un hijo que se llama Daniel, que tiene veintidós años. Mi tío Eduardo y su familia viven en Canadá.

Uno de mis recuerdos más bonitos es cuando íbamos a visitar la panadería de mi bisabuelo Antonio en Guadalajara. Cada verano mis papás nos llevaban y el olor a pan recién horneado llenaba toda la calle. Mi primo Lucas también venía con nosotros y jugábamos en el patio mientras mi bisabuelo nos daba conchas y cuernos recién hechos. Mi bisabuela Elena nos contaba historias de cuando ella y Antonio eran jóvenes y apenas abrieron el negocio.

Cuando nació mi sobrino Matías fue un momento increíble. Toda la familia se reunió en Guadalajara para conocerlo. Hasta mi abuela Carmen lloró de la emoción. Mi bisabuela Elena, que en paz descanse, hubiera estado tan feliz de conocer a su tataranieto. Recuerdo que mi papá Jorge abrazó a Diego y le dijo que estaba muy orgulloso de él.

Las Navidades siempre son especiales porque hacemos videollamada con mi tío Eduardo, mi tía Teresa y mi primo Daniel en Canadá. Mi abuela Lucía prepara mole oaxaqueño y mi abuelo Miguel hace arroz frito. Es una mezcla de tradiciones mexicanas y chinas que hacen nuestra familia tan única. Mi prima Camila siempre organiza los juegos y mi hermana Isa le ayuda con la decoración.`;

// Simulate a partially-known tree to test dedup
const EXISTING_PEOPLE = [
  { id: 'existing-jorge', first_name: 'Jorge', last_name: 'Rodriguez', nickname: null, birth_date: '1970', birth_place: 'Guadalajara', metadata: { gender: 'male', profession: 'Ingeniero' } },
  { id: 'existing-sofia', first_name: 'Sofía', last_name: 'Chen', nickname: null, birth_date: '1973', metadata: { gender: 'female' } },
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
- Deduplicate people.
- Dates: If a year is mentioned without month/day, use ONLY "YYYY" format. Do NOT add "-01-01". "born in 1968" → "1968", NOT "1968-01-01".
- Ages: "tiene seis años" → calculate approximate birth year from current year. Use "YYYY" format.
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

// ============================================================
// Person Resolution (mirrors backend)
// ============================================================

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

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
    const sugFirst = normalize(suggested.firstName || '');
    const sugLast = normalize(suggested.lastName || '');
    const sugFullKey = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);

    if (resolved.has(sugFullKey)) {
      // Merge new data into existing
      const existing = resolved.get(sugFullKey);
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

function stripHonorifics(name) {
  return name
    .replace(/\b(don|doña|dona|señor|señora|sr\.?|sra\.?)\s+/gi, '')
    .trim();
}

function resolvePersonName(name, resolvedMap, narrator) {
  const selfRefs = ['i', 'me', 'myself', 'narrator', 'the narrator'];
  if (selfRefs.includes(name.toLowerCase().trim())) {
    const narratorKey = normalize(`${narrator.firstName} ${narrator.lastName || ''}`);
    return resolvedMap.get(narratorKey);
  }

  // Try raw name first
  const normName = normalize(name);
  if (resolvedMap.has(normName)) return resolvedMap.get(normName);

  // Try stripping honorifics
  const stripped = normalize(stripHonorifics(name));
  if (stripped !== normName && resolvedMap.has(stripped)) return resolvedMap.get(stripped);

  // Scoring-based fallback: prefer exact/best matches so "Carlos José Bueso"
  // resolves to the dad, not the narrator "Carlos Bueso".
  const normFirst = stripped.split(/\s+/)[0];
  const normLast = stripped.split(/\s+/).length > 1 ? stripped.split(/\s+/).slice(1).join(' ') : '';
  let bestPerson = null;
  let bestScore = 0;
  for (const [key, person] of resolvedMap) {
    const keyParts = key.split(/\s+/);
    const keyFirst = keyParts[0];
    const keyLast = keyParts.length > 1 ? keyParts.slice(1).join(' ') : '';
    if (keyFirst !== normFirst && normalize(person.firstName) !== normFirst) continue;
    // If both have last names, they must share at least one word
    if (normLast && keyLast) {
      const normLastWords = normLast.split(/\s+/);
      const keyLastWords = keyLast.split(/\s+/);
      const hasOverlap = normLastWords.some(w => keyLastWords.includes(w));
      if (!hasOverlap) continue;
    }
    // Score: prefer keys matching more parts of the input
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

  // Pass 6: Uncle/aunt (sibling of parent → uncle/aunt of parent's children)
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
// ASSERTIONS
// ============================================================

function runAssertions(resolvedPeople, allRelationships, extractionResult, summaryResult) {
  const results = { passed: 0, failed: 0, warnings: 0, errors: [], warns: [] };

  const peopleArr = [...new Map([...resolvedPeople].map(([, v]) => [v.id, v])).values()];
  const peopleFirstNames = peopleArr.map(p => normalize(p.firstName));

  function assert(condition, msg) {
    if (condition) results.passed++;
    else { results.failed++; results.errors.push(msg); }
  }

  function warn(condition, msg) {
    if (condition) results.passed++;
    else { results.warnings++; results.warns.push(msg); }
  }

  function hasPerson(firstName) {
    return peopleFirstNames.includes(normalize(firstName));
  }

  function hasRelOfType(type) {
    return allRelationships.some(r => r.type === type);
  }

  // Check direction-agnostic: does a rel exist between personA (first name) and personB (first name) of given type?
  function hasRel(personAFirst, personBFirst, type) {
    const a = normalize(personAFirst);
    const b = normalize(personBFirst);
    return allRelationships.some(r => {
      const ra = normalize((r.personAName || '').split(' ')[0]);
      const rb = normalize((r.personBName || '').split(' ')[0]);
      return r.type === type && ((ra === a && rb === b) || (ra === b && rb === a));
    });
  }

  // Directional check: personA is [type] of personB
  function hasRelDirectional(personAFirst, personBFirst, type) {
    const a = normalize(personAFirst);
    const b = normalize(personBFirst);
    return allRelationships.some(r => {
      const ra = normalize((r.personAName || '').split(' ')[0]);
      const rb = normalize((r.personBName || '').split(' ')[0]);
      return r.type === type && ra === a && rb === b;
    });
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  🧪 ASSERTIONS');
  console.log('═'.repeat(60));

  // ── SECTION 1: People Extraction ──
  console.log('\n  📋 People Extraction:');

  const requiredPeople = [
    'Valentina', 'Jorge', 'Sofía', 'Diego', 'Isabella', 'Ana',
    'Matías', 'Roberto', 'Carmen', 'Antonio', 'Elena', 'Miguel',
    'Lucía', 'Patricia', 'Ricardo', 'Lucas', 'Camila', 'Eduardo',
    'Teresa', 'Daniel', 'Andrés', 'Marta',
  ];

  for (const name of requiredPeople) {
    assert(hasPerson(name), `Person missing: ${name}`);
  }

  assert(peopleArr.length >= 18, `Too few unique people: got ${peopleArr.length}, expected ≥18`);
  warn(peopleArr.length <= 25, `Too many unique people: got ${peopleArr.length} (possible duplication)`);

  // Check narrator was properly identified
  const narratorPerson = peopleArr.find(p => p.isNarrator);
  assert(!!narratorPerson, 'Narrator person not found in resolved people');
  assert(narratorPerson?.firstName === 'Valentina', `Narrator should be Valentina, got ${narratorPerson?.firstName}`);

  // ── SECTION 2: Dedup with existing people ──
  console.log('  🔄 Dedup with existing people:');

  const jorgeMatches = peopleArr.filter(p => normalize(p.firstName) === 'jorge');
  warn(jorgeMatches.length === 1, `Jorge should be deduped to 1 entry, found ${jorgeMatches.length}`);
  const jorgeRecord = jorgeMatches[0];
  if (jorgeRecord) {
    warn(jorgeRecord.id === 'existing-jorge' || jorgeRecord.existing === true,
      'Jorge should map to existing person (existing-jorge)');
  }

  const sofiaMatches = peopleArr.filter(p => normalize(p.firstName) === 'sofia');
  warn(sofiaMatches.length === 1, `Sofía should be deduped to 1 entry, found ${sofiaMatches.length}`);

  // ── SECTION 3: Metadata extraction ──
  console.log('  📝 Metadata:');

  const antonio = peopleArr.find(p => normalize(p.firstName) === 'antonio');
  if (antonio) {
    warn(!!antonio.isDeceased || !!antonio.deathDate, 'Antonio should be marked deceased or have death date');
    warn(antonio.birthDate === '1920' || antonio.birthDate === '1920-01-01', `Antonio birth should be 1920, got ${antonio.birthDate}`);
    warn(antonio.profession?.toLowerCase()?.includes('panadero') || antonio.profession?.toLowerCase()?.includes('baker'),
      `Antonio profession should be panadero/baker, got "${antonio.profession}"`);
  }

  const elena = peopleArr.find(p => normalize(p.firstName) === 'elena');
  if (elena) {
    warn(!!elena.isDeceased || !!elena.deathDate, 'Elena should be marked deceased or have death date');
  }

  // Check year-only date format (should be "YYYY" not "YYYY-01-01")
  const jorge2 = peopleArr.find(p => normalize(p.firstName) === 'jorge');
  if (jorge2?.birthDate) {
    warn(!jorge2.birthDate.includes('-01-01'), `Jorge birth date should be year-only "1970", got "${jorge2.birthDate}"`);
  }

  // Check nickname extraction
  const isabella = peopleArr.find(p => normalize(p.firstName) === 'isabella');
  if (isabella) {
    warn(isabella.nickname === 'Isa' || isabella.nickname === 'isa',
      `Isabella nickname should be "Isa", got "${isabella.nickname}"`);
  }

  // Check age-to-year calculation: Daniel "tiene veintidós años" → ~2004
  const daniel = peopleArr.find(p => normalize(p.firstName) === 'daniel');
  if (daniel?.birthDate) {
    const danielYear = parseInt(daniel.birthDate);
    warn(danielYear >= 2002 && danielYear <= 2005,
      `Daniel birth year from age should be ~2003-2004, got ${daniel.birthDate}`);
  }

  // Check age-to-year calculation: Matías "tiene un año" → ~2024-2025
  const matias = peopleArr.find(p => normalize(p.firstName) === 'matias');
  if (matias?.birthDate) {
    const matiasYear = parseInt(matias.birthDate);
    warn(matiasYear >= 2024 && matiasYear <= 2026,
      `Matías birth year from age should be ~2024-2025, got ${matias.birthDate}`);
  }

  // ── SECTION 4: Core direct relationships ──
  console.log('  🔗 Direct relationships:');

  // Parents of narrator
  assert(hasRel('Jorge', 'Valentina', 'parent'), 'Jorge → parent of Valentina');
  assert(hasRel('Sofía', 'Valentina', 'parent') || hasRel('Sofia', 'Valentina', 'parent'),
    'Sofía → parent of Valentina');

  // Siblings of narrator
  assert(hasRel('Diego', 'Valentina', 'sibling'), 'Diego ↔ sibling of Valentina');
  assert(hasRel('Isabella', 'Valentina', 'sibling'), 'Isabella ↔ sibling of Valentina');

  // Spouse
  assert(hasRelOfType('spouse'), 'At least one spouse relationship exists');
  warn(hasRel('Jorge', 'Sofía', 'spouse') || hasRel('Jorge', 'Sofia', 'spouse'),
    'Jorge ↔ Sofía spouse (direct or inferred)');
  warn(hasRel('Diego', 'Ana', 'spouse'), 'Diego ↔ Ana spouse');

  // Parents of narrator's siblings (via inference or direct)
  // Jorge & Sofía → parent of Diego and Isabella

  // Grandparents
  assert(hasRel('Roberto', 'Jorge', 'parent') ||
    hasRel('Roberto', 'Valentina', 'grandparent'),
    'Roberto is parent of Jorge or grandparent of Valentina');
  assert(hasRel('Carmen', 'Jorge', 'parent') ||
    hasRel('Carmen', 'Valentina', 'grandparent'),
    'Carmen is parent of Jorge or grandparent of Valentina');

  // Maternal grandparents
  assert(hasRel('Miguel', 'Sofía', 'parent') || hasRel('Miguel', 'Sofia', 'parent') ||
    hasRel('Miguel', 'Valentina', 'grandparent'),
    'Miguel is parent of Sofía or grandparent of Valentina');
  assert(hasRel('Lucía', 'Sofía', 'parent') || hasRel('Lucia', 'Sofia', 'parent') ||
    hasRel('Lucía', 'Valentina', 'grandparent') || hasRel('Lucia', 'Valentina', 'grandparent'),
    'Lucía is parent of Sofía or grandparent of Valentina');

  // Great-grandparents
  assert(hasRel('Antonio', 'Roberto', 'parent') ||
    hasRel('Antonio', 'Valentina', 'great_grandparent'),
    'Antonio is parent of Roberto or great-grandparent of Valentina');
  assert(hasRel('Elena', 'Roberto', 'parent') ||
    hasRel('Elena', 'Valentina', 'great_grandparent'),
    'Elena is parent of Roberto or great-grandparent of Valentina');

  // Half-sibling
  assert(hasRel('Andrés', 'Jorge', 'half_sibling') || hasRel('Andres', 'Jorge', 'half_sibling'),
    'Andrés ↔ Jorge half_sibling');

  // Half-sibling parent attribution: Roberto → parent of Andrés
  warn(hasRel('Roberto', 'Andrés', 'parent') || hasRel('Roberto', 'Andres', 'parent'),
    'Roberto → parent of Andrés (half-sibling parent attribution)');

  // Ex-spouse
  warn(hasRel('Roberto', 'Marta', 'ex_spouse'), 'Roberto ↔ Marta ex_spouse');

  // Godparent
  warn(hasRel('Patricia', 'Valentina', 'godparent'), 'Patricia → godparent of Valentina');

  // Patricia sibling of Jorge
  assert(hasRel('Patricia', 'Jorge', 'sibling'), 'Patricia ↔ Jorge sibling');

  // Patricia's children
  assert(hasRel('Patricia', 'Lucas', 'parent') || hasRel('Lucas', 'Patricia', 'child') ||
    hasRel('Ricardo', 'Lucas', 'parent'),
    'Patricia or Ricardo → parent of Lucas');
  assert(hasRel('Patricia', 'Camila', 'parent') || hasRel('Camila', 'Patricia', 'child') ||
    hasRel('Ricardo', 'Camila', 'parent'),
    'Patricia or Ricardo → parent of Camila');

  // Eduardo sibling of Sofía
  assert(hasRel('Eduardo', 'Sofía', 'sibling') || hasRel('Eduardo', 'Sofia', 'sibling'),
    'Eduardo ↔ Sofía sibling');

  // Eduardo's child
  assert(hasRel('Eduardo', 'Daniel', 'parent') || hasRel('Daniel', 'Eduardo', 'child') ||
    hasRel('Teresa', 'Daniel', 'parent'),
    'Eduardo or Teresa → parent of Daniel');

  // Diego's child
  warn(hasRel('Diego', 'Matías', 'parent') || hasRel('Diego', 'Matias', 'parent') ||
    hasRel('Ana', 'Matías', 'parent') || hasRel('Ana', 'Matias', 'parent') ||
    hasRel('Matías', 'Diego', 'child') || hasRel('Matias', 'Diego', 'child') ||
    hasRel('Matías', 'Ana', 'child') || hasRel('Matias', 'Ana', 'child'),
    'Diego or Ana → parent of Matías (or Matías child of Diego/Ana)');

  // Patricia ↔ Ricardo spouse
  warn(hasRel('Patricia', 'Ricardo', 'spouse'), 'Patricia ↔ Ricardo spouse');

  // Eduardo ↔ Teresa spouse
  warn(hasRel('Eduardo', 'Teresa', 'spouse'), 'Eduardo ↔ Teresa spouse');

  // ── SECTION 5: Relationship type coverage ──
  console.log('  📊 Relationship type coverage:');

  const allTypes = allRelationships.map(r => r.type);
  const uniqueTypes = [...new Set(allTypes)];

  const expectedTypes = ['parent', 'sibling', 'spouse', 'half_sibling'];
  for (const t of expectedTypes) {
    assert(uniqueTypes.includes(t), `Relationship type '${t}' should be present`);
  }

  const bonusTypes = ['grandparent', 'great_grandparent', 'uncle_aunt', 'ex_spouse', 'godparent'];
  for (const t of bonusTypes) {
    warn(uniqueTypes.includes(t), `Bonus relationship type '${t}' should appear (direct or inferred)`);
  }

  console.log(`     Types found: ${uniqueTypes.sort().join(', ')}`);

  // ── SECTION 6: Inferred relationships ──
  console.log('  🔮 Transitive inference:');

  const inferredRels = allRelationships.filter(r => r.inferred);
  assert(inferredRels.length >= 3, `Should have ≥3 inferred relationships, got ${inferredRels.length}`);
  warn(inferredRels.length >= 8, `Should have ≥8 inferred relationships for this family, got ${inferredRels.length}`);

  // Check some expected inferences
  warn(hasRel('Diego', 'Isabella', 'sibling'), 'Diego ↔ Isabella should be inferred as siblings');
  warn(hasRel('Lucas', 'Camila', 'sibling'), 'Lucas ↔ Camila should be inferred as siblings');

  // ── SECTION 7: Stories and summary ──
  console.log('  📖 Stories & summary:');

  assert(!!summaryResult, 'Summary result should exist');
  assert(!!summaryResult?.summary, 'Summary text should exist');
  assert(summaryResult?.suggestedStories?.length >= 1, 'At least 1 story should be generated');
  warn(summaryResult?.suggestedStories?.length >= 2, 'At least 2 stories expected for this rich transcript');
  assert(summaryResult?.keyTopics?.length >= 2, 'At least 2 key topics');
  assert(!!summaryResult?.emotionalTone, 'Emotional tone should be set');

  // Check stories have required fields
  if (summaryResult?.suggestedStories?.length) {
    const firstStory = summaryResult.suggestedStories[0];
    assert(!!firstStory.title, 'First story should have a title');
    assert(!!firstStory.content, 'First story should have content');
    warn(firstStory.involvedPeople?.length >= 1, 'First story should reference at least 1 person');
  }

  // ── SECTION 8: Extraction result structure ──
  console.log('  🏗️  Extraction structure:');

  assert(Array.isArray(extractionResult.entities), 'entities should be an array');
  assert(Array.isArray(extractionResult.relationships), 'relationships should be an array');
  assert(Array.isArray(extractionResult.suggestedPeople), 'suggestedPeople should be an array');
  assert(extractionResult.suggestedPeople.length >= 15,
    `suggestedPeople should have ≥15 entries, got ${extractionResult.suggestedPeople?.length}`);
  assert(extractionResult.relationships.length >= 10,
    `relationships should have ≥10 entries, got ${extractionResult.relationships?.length}`);

  // Check that all relationship types are valid
  const VALID_TYPES = new Set([
    'parent', 'child', 'spouse', 'ex_spouse', 'sibling', 'half_sibling',
    'grandparent', 'grandchild', 'great_grandparent', 'great_grandchild',
    'great_great_grandparent', 'great_great_grandchild',
    'uncle_aunt', 'nephew_niece', 'cousin',
    'in_law', 'parent_in_law', 'child_in_law',
    'step_parent', 'step_child', 'step_sibling',
    'adopted_parent', 'adopted_child',
    'godparent', 'godchild', 'other',
  ]);
  for (const rel of extractionResult.relationships) {
    assert(VALID_TYPES.has(rel.relationshipType),
      `Invalid relationship type: "${rel.relationshipType}" (${rel.personA} → ${rel.personB})`);
  }

  // Check confidence scores are in range
  for (const rel of extractionResult.relationships) {
    assert(rel.confidence >= 0 && rel.confidence <= 1,
      `Confidence out of range: ${rel.confidence} for ${rel.personA} → ${rel.personB}`);
  }

  // ── PRINT RESULTS ──
  console.log('\n' + '─'.repeat(60));

  if (results.errors.length) {
    console.log(`\n  ❌ FAILURES (${results.failed}):`);
    for (const e of results.errors) console.log(`     ✗ ${e}`);
  }
  if (results.warns.length) {
    console.log(`\n  ⚠️  WARNINGS (${results.warnings}):`);
    for (const w of results.warns) console.log(`     ⚠ ${w}`);
  }

  const total = results.passed + results.failed + results.warnings;
  const passRate = total > 0 ? ((results.passed / total) * 100).toFixed(1) : 0;

  console.log(`\n  ═══════════════════════════════════════`);
  console.log(`  ✅ Passed:   ${results.passed}`);
  console.log(`  ❌ Failed:   ${results.failed}`);
  console.log(`  ⚠️  Warnings: ${results.warnings}`);
  console.log(`  📊 Pass rate: ${passRate}% (${results.passed}/${total})`);
  console.log(`  ═══════════════════════════════════════`);

  if (results.failed === 0) {
    console.log('\n  🎉 ALL ASSERTIONS PASSED!\n');
  } else {
    console.log(`\n  💥 ${results.failed} assertion(s) failed.\n`);
  }

  return results;
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
    if (p.deathDate) parts.push(`d. ${p.deathDate}`);
    if (p.birthPlace) parts.push(`📍 ${p.birthPlace}`);
    if (p.gender) parts.push(p.gender === 'male' ? '♂' : '♀');
    if (p.profession) parts.push(`💼 ${p.profession}`);
    if (p.isDeceased) parts.push('✝️');
    if (p.isNarrator) parts.push('🎙️ NARRATOR');
    if (p.existing) parts.push('📌 EXISTING');

    const name = `${p.firstName}${p.lastName ? ' ' + p.lastName : ''}`;
    console.log(`\n  👤 ${name}${parts.length ? '  (' + parts.join(', ') + ')' : ''}`);
    if (p.nickname) console.log(`     aka "${p.nickname}"`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  🔗 RELATIONSHIPS');
  console.log('═'.repeat(60));

  const typeEmojis = {
    parent: '👨‍👧', child: '👶', sibling: '👫', step_sibling: '👥',
    half_sibling: '🔀', parent_in_law: '👨‍👧', child_in_law: '👶',
    spouse: '💑', ex_spouse: '💔', grandparent: '👴', great_grandparent: '👑',
    uncle_aunt: '🧑‍🤝‍🧑', nephew_niece: '👦', cousin: '🤝', godparent: '🙏',
    godchild: '👼', in_law: '🤝',
  };

  // Group by type for readability
  const byType = {};
  for (const r of relationships) {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r);
  }

  for (const [type, rels] of Object.entries(byType).sort()) {
    const emoji = typeEmojis[type] || '🔗';
    console.log(`\n  ${emoji} ${type.toUpperCase()} (${rels.length}):`);
    for (const r of rels) {
      const conf = r.confidence ? ` ${Math.round(r.confidence * 100)}%` : '';
      const source = r.inferred ? ' [INFERRED]' : '';
      console.log(`     ${r.personAName} → ${r.personBName}${conf}${source}`);
    }
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
          if (typeof m === 'string') console.log(`     "${m}"`);
          else console.log(`     "${m.quote}" — ${m.label}`);
        }
      }
    }
  }
}

function generateHTML(people, relationships, summaryResult) {
  const peopleArr = [...new Map([...people].map(([, v]) => [v.id, v])).values()];
  const nodes = peopleArr.map(p => ({
    id: p.id,
    label: `${p.firstName}${p.lastName ? ' ' + p.lastName : ''}`,
    birth: p.birthDate || '',
    death: p.deathDate || '',
    place: p.birthPlace || '',
    gender: p.gender || 'unknown',
    profession: p.profession || '',
    isNarrator: !!p.isNarrator,
    isDeceased: !!p.isDeceased || !!p.deathDate,
    nickname: p.nickname || '',
  }));

  const edges = relationships.map(r => ({
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
<title>MATRA — Robust Pipeline Test Results</title>
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
  .person.deceased { opacity: 0.7; }
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
  .rel .type { font-weight: 600; color: #7ec8e3; min-width: 120px; }
  .rel .arrow { color: #4a5568; }
  .rel .conf { font-size: 11px; color: #8b9baa; margin-left: auto; }
  .story { margin-bottom: 16px; padding: 14px; background: #0d1a2d; border-radius: 8px; }
  .story h3 { color: #d4a574; margin-bottom: 8px; }
  .story p { line-height: 1.6; color: #c4b8a8; font-size: 14px; }
  .story .moment { margin-top: 8px; padding: 6px 10px; background: #1a2a3d; border-radius: 6px; font-style: italic; font-size: 13px; color: #8baabb; }
  .summary-box { line-height: 1.7; color: #c4b8a8; }
  .tag { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; background: #1e3a5f; color: #7ec8e3; margin: 2px; }
  .legend { display: flex; gap: 16px; margin-top: 10px; font-size: 12px; color: #8b9baa; }
  .legend span { display: flex; align-items: center; gap: 4px; }
  .legend .dot { width: 10px; height: 10px; border-radius: 50%; }
</style>
</head>
<body>
<div class="header">
  <h1>🌳 MATRA — Robust Pipeline Test (Rodriguez-Chen Family)</h1>
  <p>4 generations · 22+ people · ${edges.length} relationships (${edges.filter(e=>e.inferred).length} inferred)</p>
</div>
<div class="container">
  <div class="card">
    <h2>👥 People (${nodes.length})</h2>
    ${nodes.map(n => `
      <div class="person${n.isNarrator ? ' narrator' : ''}${n.isDeceased ? ' deceased' : ''}">
        <div class="avatar ${n.gender}">${n.gender === 'male' ? '♂' : n.gender === 'female' ? '♀' : '?'}${n.isDeceased ? '✝' : ''}</div>
        <div class="info">
          <div class="name">${n.label}${n.isNarrator ? ' 🎙️' : ''}${n.nickname ? ' ("' + n.nickname + '")' : ''}</div>
          <div class="meta">${[n.birth ? 'b.' + n.birth : '', n.death ? 'd.' + n.death : '', n.place, n.profession].filter(Boolean).join(' · ') || 'No details'}</div>
        </div>
      </div>
    `).join('')}
  </div>

  <div class="card" style="max-height: 800px; overflow-y: auto;">
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
      <span><div class="dot" style="background:#4ade80"></div> Direct (AI)</span>
      <span><div class="dot" style="background:#f59e0b"></div> Inferred</span>
    </div>
  </div>

  ${summaryResult ? `
  <div class="card">
    <h2>📝 Summary</h2>
    <div class="summary-box">${summaryResult.summary}</div>
    <div style="margin-top:12px">
      <strong style="color:#7ec8e3">Tone:</strong> ${summaryResult.emotionalTone}<br>
      <strong style="color:#7ec8e3">Topics:</strong> ${(summaryResult.keyTopics || []).map(t => '<span class="tag">' + t + '</span>').join(' ')}
    </div>
  </div>

  <div class="card">
    <h2>📚 Stories (${stories.length})</h2>
    ${stories.map(s => `
      <div class="story">
        <h3>"${s.title}"</h3>
        <p>${s.content}</p>
        ${s.involvedPeople?.length ? '<div style="margin-top:6px;font-size:12px;color:#8b9baa">👥 ' + s.involvedPeople.join(', ') + '</div>' : ''}
        ${(s.keyMoments || []).map(m => {
          if (typeof m === 'string') return '<div class="moment">"' + m + '"</div>';
          return '<div class="moment">"' + m.quote + '" — <strong>' + m.label + '</strong></div>';
        }).join('')}
      </div>
    `).join('')}
  </div>
  ` : ''}
</div>
</body>
</html>`;

  const outPath = path.join(__dirname, 'test-pipeline-robust-output.html');
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
  console.log('║   MATRA — ROBUST AI Pipeline Test (Rodriguez-Chen)      ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║   22+ people · 4 generations · all relationship types   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  Provider: ${provider}`);
  console.log(`  Narrator: ${NARRATOR.firstName} ${NARRATOR.lastName} (${NARRATOR.gender})`);
  console.log(`  Language: Spanish (es)`);
  console.log(`  Transcript: ${TRANSCRIPT.length} chars`);
  console.log(`  Existing people: ${EXISTING_PEOPLE.length}`);
  console.log('');

  // Build narrator context
  const subjectName = `${NARRATOR.firstName} ${NARRATOR.lastName}`;
  const genderHint = NARRATOR.gender
    ? ` Their gender is ${NARRATOR.gender}. Use correct gendered language when referring to ${subjectName}.`
    : '';

  // Build existing tree context
  let existingTreeContext = '';
  if (EXISTING_PEOPLE.length > 0) {
    const peopleLines = EXISTING_PEOPLE.map(p => {
      const parts = [p.first_name + (p.last_name ? ' ' + p.last_name : '')];
      if (p.birth_date) parts.push(`b. ${p.birth_date}`);
      if (p.birth_place) parts.push(`from ${p.birth_place}`);
      if (p.metadata?.gender) parts.push(p.metadata.gender);
      return `  - ${parts.join(', ')} [id:${p.id}]`;
    }).join('\n');
    existingTreeContext = `\n\n[EXISTING FAMILY TREE — These people already exist in the database. When you detect a person who matches an existing entry, use their exact name. Do NOT create duplicates.\nKnown people:\n${peopleLines}\n]`;
  }

  const transcriptForAI = `[Narrator/subject of this interview is ${subjectName}.${genderHint} Any first-person references ("I", "me", "my") refer to ${subjectName}. Do NOT create a separate entry for the narrator — they are ${subjectName}. IMPORTANT: When the narrator says "my mom", "my dad", "my brother", etc., create relationships between those people and ${subjectName}. Use ${subjectName} as the personA or personB name in relationships — never use "I" or "me" as a person name.]${existingTreeContext}\n\n${TRANSCRIPT}`;

  // Step 1: Extraction
  console.log('  ⏳ Step 1/2: Extracting entities & relationships...');
  const extractionResult = await callLLM(
    EXTRACTION_PROMPT + languageInstruction('es') + '\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
    transcriptForAI
  );

  const extractTime = Date.now();
  console.log(`  ✅ Extraction done (${((extractTime - startTime) / 1000).toFixed(1)}s)`);
  console.log(`     Entities: ${extractionResult.entities?.length || 0}`);
  console.log(`     Relationships: ${extractionResult.relationships?.length || 0}`);
  console.log(`     People: ${extractionResult.suggestedPeople?.length || 0}`);

  // Step 2: Summarization
  console.log('\n  ⏳ Step 2/2: Generating summary & stories...');
  const summaryResult = await callLLM(
    SUMMARY_PROMPT + languageInstruction('es') + '\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
    transcriptForAI
  );

  const summaryTime = Date.now();
  console.log(`  ✅ Summary done (${((summaryTime - extractTime) / 1000).toFixed(1)}s)`);
  console.log(`     Stories: ${summaryResult.suggestedStories?.length || 0}`);

  // Step 3: Person resolution
  console.log('\n  ⏳ Resolving people...');
  const resolvedPeople = resolvePeople(
    extractionResult.suggestedPeople || [],
    NARRATOR,
    EXISTING_PEOPLE
  );

  // Step 4: Map relationships
  const allRelationships = [];
  let unresolvedCount = 0;
  for (const rel of (extractionResult.relationships || [])) {
    const personA = resolvePersonName(rel.personA, resolvedPeople, NARRATOR);
    const personB = resolvePersonName(rel.personB, resolvedPeople, NARRATOR);
    if (personA && personB && personA.id !== personB.id) {
      allRelationships.push({
        personAId: personA.id,
        personBId: personB.id,
        personAName: `${personA.firstName}${personA.lastName ? ' ' + personA.lastName : ''}`,
        personBName: `${personB.firstName}${personB.lastName ? ' ' + personB.lastName : ''}`,
        type: rel.relationshipType,
        confidence: rel.confidence,
        inferred: false,
      });
    } else {
      unresolvedCount++;
      console.log(`  ⚠️  Unresolved: ${rel.personA} ──[${rel.relationshipType}]──▶ ${rel.personB}`);
    }
  }

  if (unresolvedCount > 0) {
    console.log(`  ⚠️  ${unresolvedCount} relationship(s) could not be resolved`);
  }

  // Step 5: Transitive inference
  console.log('  ⏳ Running transitive inference...');
  const inferred = inferTransitiveRelationships(allRelationships);
  for (const inf of inferred) {
    const peopleArr = [...new Map([...resolvedPeople].map(([, v]) => [v.id, v])).values()];
    const personA = peopleArr.find(p => p.id === inf.personAId);
    const personB = peopleArr.find(p => p.id === inf.personBId);
    allRelationships.push({
      ...inf,
      personAName: personA ? `${personA.firstName}${personA.lastName ? ' ' + personA.lastName : ''}` : '?',
      personBName: personB ? `${personB.firstName}${personB.lastName ? ' ' + personB.lastName : ''}` : '?',
      inferred: true,
    });
  }

  console.log(`  ✅ Inferred ${inferred.length} additional relationships`);

  const directCount = allRelationships.filter(r => !r.inferred).length;
  const inferredCount = allRelationships.filter(r => r.inferred).length;
  console.log(`  📊 Total: ${allRelationships.length} relationships (${directCount} direct + ${inferredCount} inferred)`);

  // Step 6: Run assertions
  const assertionResults = runAssertions(resolvedPeople, allRelationships, extractionResult, summaryResult);

  // Step 7: Output visualization
  printTree(resolvedPeople, allRelationships);
  printStories(summaryResult);

  // Generate HTML
  const htmlPath = generateHTML(resolvedPeople, allRelationships, summaryResult);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(60));
  console.log(`  ✅ Done in ${totalTime}s`);
  console.log(`  📊 HTML visualization: ${htmlPath}`);
  console.log('═'.repeat(60) + '\n');

  // Dump debug JSON
  const debugPath = path.join(__dirname, 'test-pipeline-robust-debug.json');
  fs.writeFileSync(debugPath, JSON.stringify({
    narrator: NARRATOR,
    extraction: extractionResult,
    summary: summaryResult,
    resolvedPeople: [...new Map([...resolvedPeople].map(([, v]) => [v.id, v])).values()],
    relationships: allRelationships,
    assertions: assertionResults,
  }, null, 2), 'utf-8');
  console.log(`  🔍 Debug JSON: ${debugPath}\n`);

  // Exit with error code if assertions failed
  if (assertionResults.failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

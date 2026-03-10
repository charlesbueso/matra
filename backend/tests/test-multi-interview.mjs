#!/usr/bin/env node
// ============================================================
// Matra — Multi-Interview Pipeline Test
// ============================================================
// Run: node test-multi-interview.mjs
//
// Simulates the real app flow where the primary user records
// their interview first, then family members are invited and
// each record their own interview. Each subsequent interview
// sees the existing people/relationships accumulated so far,
// mirroring how the edge function works in production.
//
// Family: The Rodriguez-Chen clan (same family, 4 narrators)
//
// Interview 1: Valentina (primary user) — establishes the tree
// Interview 2: Jorge (father) — adds childhood stories, new details
// Interview 3: Diego (brother) — adds his own perspective, wife's family
// Interview 4: Patricia (aunt) — adds Ricardo's family, Andrés backstory
//
// Outputs:
//   1. Per-interview extraction + dedup + inference results
//   2. Cumulative tree visualization after each interview
//   3. Cross-interview assertions (dedup, enrichment, new people)
//   4. Final HTML visualization and JSON debug dump
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env from .env.local ──
const envPath = path.join(__dirname, '../.env.local');
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
// INTERVIEW DEFINITIONS
// ============================================================
// Each interview has a narrator, a transcript, and optionally
// existing story titles (to test story dedup guidance).
// The existing people/relationships are built cumulatively
// from prior interview results.
// ============================================================

const INTERVIEWS = [
  // ────────────────────────────────────────────────
  // INTERVIEW 1: Valentina (primary user)
  // Establishes the core family tree
  // ────────────────────────────────────────────────
  {
    id: 'interview-1',
    label: 'Interview 1 — Valentina (primary user)',
    narrator: { firstName: 'Valentina', lastName: 'Rodriguez Chen', gender: 'female' },
    transcript: `Bueno, me llamo Valentina Rodriguez Chen, soy mujer, nací en 1998 en la Ciudad de México. Mi familia es enorme y muy diversa.

Mi papá se llama Jorge Rodriguez Vega, nació en 1970 en Guadalajara y es ingeniero civil. Mi mamá se llama Sofía Chen Fernández, ella nació en 1973 en la Ciudad de México y es doctora.

Tengo un hermano mayor que se llama Diego Rodriguez Chen, él nació en 1995. Se casó el año pasado con Ana López y ya tienen un bebé que se llama Matías, el bebé tiene un año. También tengo una hermana menor que se llama Isabella, pero todos le decimos Isa, ella nació en 2001.

Por el lado de mi papá, mis abuelos paternos son Roberto Rodriguez, nacido en 1945 en Guadalajara, y Carmen Vega, nacida en 1948. Mi abuelo Roberto estuvo casado antes con Marta Ruiz. De ese primer matrimonio nació Andrés Rodriguez en 1965. Andrés es medio hermano de mi papá Jorge porque comparten el mismo padre Roberto.

Los papás de mi abuelo Roberto, o sea mis bisabuelos, fueron Antonio Rodriguez y Elena Morales. Mi bisabuelo Antonio nació en 1920 en Guadalajara y era panadero, falleció en 1995. Mi bisabuela Elena nació en 1923 y murió en 2010.

Por el lado de mi mamá, mis abuelos maternos son Miguel Chen, nacido en 1947, es chino-mexicano, y Lucía Fernández, nacida en 1950 en Oaxaca.

Mi papá tiene una hermana Patricia Rodriguez Vega, nacida en 1968. Patricia está casada con Ricardo Mendoza. Tienen dos hijos: Lucas nacido en 1997 y Camila nacida en 2000. Mi tía Patricia es mi madrina.

Mi mamá tiene un hermano Eduardo Chen Fernández, nacido en 1975. Eduardo se casó con Teresa Gutiérrez. Tienen un hijo Daniel que tiene veintidós años. Ellos viven en Canadá.`,
  },

  // ────────────────────────────────────────────────
  // INTERVIEW 2: Jorge (father)
  // Adds: childhood memories, bakery stories,
  // parents' courtship, new details about his
  // engineering career, and his perspective on Andrés
  // ────────────────────────────────────────────────
  {
    id: 'interview-2',
    label: 'Interview 2 — Jorge (father)',
    narrator: { firstName: 'Jorge', lastName: 'Rodriguez Vega', gender: 'male' },
    transcript: `Me llamo Jorge Rodriguez Vega, soy hombre, nací en 1970 en Guadalajara, Jalisco. Soy ingeniero civil y vivo en la Ciudad de México con mi esposa Sofía y nuestros tres hijos.

Mis papás son Roberto Rodriguez y Carmen Vega. Mi papá Roberto nació en 1945 y mi mamá Carmen en 1948. Se conocieron en una fiesta en 1966 y se casaron en 1967. Mi mamá Carmen era maestra de primaria antes de jubilarse.

Tengo una hermana mayor que se llama Patricia, nació en 1968. Ella siempre fue la más responsable de los dos. Patricia se casó con Ricardo Mendoza, que es contador. Tienen dos hijos, mis sobrinos Lucas y Camila.

Mi medio hermano Andrés Rodriguez nació en 1965. Él es hijo de mi papá Roberto con su primera esposa Marta Ruiz. Andrés y yo siempre tuvimos buena relación a pesar de que crecimos separados. Él vive en Monterrey y trabaja como arquitecto. La mamá de Andrés, Marta, vive en Puebla.

Mis abuelos paternos, Antonio Rodriguez y Elena Morales, fueron personas increíbles. Mi abuelo Antonio tenía una panadería famosa en el centro de Guadalajara, la Panadería Rodriguez, que abrió en 1950. Era el mejor panadero de todo el barrio. Murió en 1995 y mi abuela Elena en 2010. Mi abuelo Antonio también era músico, tocaba la guitarra en fiestas del pueblo.

Yo estudié ingeniería civil en la UNAM y me gradué en 1993. Conocí a mi esposa Sofía Chen en 1994 en un congreso médico donde ella estaba presentando. Nos casamos en 1996. Sofía es doctora, trabaja en el Hospital General.

Nuestro hijo mayor Diego nació en 1995, estudió medicina igual que su mamá. Diego se casó con Ana López y tuvieron a Matías. Nuestra segunda hija es Valentina, nació en 1998, y la más chica es Isabella a quien le decimos Isa, nació en 2001.

Por el lado de mi esposa, sus papás son Miguel Chen y Lucía Fernández. Miguel es un hombre increíble, su familia vino de Cantón, China. Y Lucía es de Oaxaca, cocina un mole espectacular. Sofía tiene un hermano menor, Eduardo, que vive en Canadá con su esposa Teresa y su hijo Daniel.`,
  },

  // ────────────────────────────────────────────────
  // INTERVIEW 3: Diego (brother)
  // Adds: Ana's parents (NEW people), medical school
  // stories, new perspective on baby Matías, Daniel's
  // life in Canada, his own friendship with Lucas
  // ────────────────────────────────────────────────
  {
    id: 'interview-3',
    label: 'Interview 3 — Diego (brother)',
    narrator: { firstName: 'Diego', lastName: 'Rodriguez Chen', gender: 'male' },
    transcript: `Soy Diego Rodriguez Chen, hombre, nací en 1995 en la Ciudad de México. Estudié medicina en la UNAM, igual que mi mamá Sofía. Me casé con Ana López en 2024 y tenemos un hijo que se llama Matías, nació en 2025.

Mis papás son Jorge Rodriguez Vega y Sofía Chen Fernández. Mi papá es ingeniero y mi mamá es doctora. Tengo dos hermanas: Valentina que nació en 1998 y Isabella, le decimos Isa, que nació en 2001.

Mi esposa Ana viene de una familia de Puebla. Los papás de Ana se llaman Fernando López Martínez y Rosa García de López. Don Fernando es abogado y tiene 58 años, Doña Rosa es enfermera. Ana tiene una hermana menor que se llama Mónica López García, ella tiene 25 años y estudia psicología.

Los abuelos de mi papá, o sea mis bisabuelos, fueron Antonio Rodriguez y Elena Morales. Mi bisabuelo Antonio era panadero en Guadalajara. Me contaban que la panadería era el corazón del barrio.

Mi primo Lucas y yo somos muy cercanos, casi como hermanos. Lucas es hijo de mi tía Patricia y mi tío Ricardo Mendoza. Mi prima Camila también es genial, ella siempre organiza las reuniones familiares.

En las Navidades hacemos videollamada con mi tío Eduardo, mi tía Teresa y mi primo Daniel en Canadá. Daniel está estudiando ingeniería informática en Toronto. Mi abuela Lucía prepara mole y mi abuelo Miguel hace arroz frito, la mejor combinación de dos culturas.

Me acuerdo que cuando yo era chico, mi abuelo Roberto nos llevaba al mercado en Guadalajara. Mi abuela Carmen hacía las mejores tortillas. El abuelo Roberto siempre nos contaba historias de su papá Antonio y la panadería.

El nacimiento de mi hijo Matías fue el momento más especial de mi vida. Ana y yo estábamos tan nerviosos. Mi mamá Sofía nos ayudó mucho, siendo doctora nos daba tranquilidad. Mi papá Jorge lloró cuando cargó a Matías por primera vez.`,
  },

  // ────────────────────────────────────────────────
  // INTERVIEW 4: Patricia (aunt)
  // Adds: Ricardo's parents (NEW people), new details
  // about growing up with Jorge, godmother perspective,
  // Andrés backstory, and Marta Ruiz enrichment
  // ────────────────────────────────────────────────
  {
    id: 'interview-4',
    label: 'Interview 4 — Patricia (aunt)',
    narrator: { firstName: 'Patricia', lastName: 'Rodriguez Vega', gender: 'female' },
    transcript: `Me llamo Patricia Rodriguez Vega, soy mujer, nací en 1968 en Guadalajara. Soy la hermana mayor de Jorge.

Mis papás son Roberto Rodriguez y Carmen Vega. Mi mamá Carmen fue maestra de primaria durante 30 años en Guadalajara, se jubiló en 2008. Mi papá Roberto trabajó en una fábrica de textiles.

Mi hermanito Jorge nació en 1970, dos años después de mí. Crecimos juntos en Guadalajara, jugando en el patio de la casa de mis abuelos Antonio y Elena. Mi abuelo Antonio nos enseñó a hacer pan. Elena era una mujer muy sabia, siempre nos contaba historias de la Revolución que le contó su mamá.

Nuestro medio hermano Andrés, hijo de mi papá Roberto con Marta Ruiz, vivía con su mamá en Puebla. Marta es profesora de historia en una universidad en Puebla. Andrés nos visitaba en vacaciones de verano. Es arquitecto y vive en Monterrey con su esposa Laura Sánchez. Andrés y Laura tienen una hija que se llama Sofía Valentina Rodriguez Sánchez, tiene ocho años. Le pusieron Sofía por la esposa de Jorge y Valentina por su sobrina.

Mi esposo es Ricardo Mendoza, nos casamos en 1995. Ricardo es contador. Los papás de Ricardo son Héctor Mendoza y Gloria Estrada. Don Héctor es de Morelia, Michoacán y era profesor de matemáticas. Doña Gloria es ama de casa y la mejor cocinera de tamales que he conocido. Héctor tiene 80 años y Gloria tiene 78.

Tenemos dos hijos: Lucas nació en 1997 y Camila en 2000. Lucas estudió derecho y Camila está estudiando diseño gráfico.

Soy la madrina de Valentina, la hija de Jorge y Sofía. Desde que nació siempre he sido muy cercana a ella. Me acuerdo cuando Valentina tenía cinco años y me dijo que yo era su segunda mamá, me hizo llorar de emoción.

La cuñada de Jorge, o sea Teresa Gutiérrez la esposa de Eduardo, es una mujer muy simpática. Ella y Eduardo se conocieron en la universidad en Canadá. Su hijo Daniel es muy inteligente, estudia ingeniería en Toronto.

Las fiestas navideñas de nuestra familia son legendarias. Toda la familia se reúne en la casa de mis papás en Guadalajara. Mi mamá Carmen prepara pozole, mi cuñada Sofía trae los tamales que le enseñó Doña Gloria, y mi suegra Gloria siempre manda una charola extra de tamales. La vez que conectamos por videollamada con Eduardo y Teresa en Canadá, Daniel cantó una canción en mandarín que le enseñó su abuelo Miguel, fue muy bonito.`,
  },
];

// ============================================================
// PROMPTS (mirrored from backend/_shared/ai/prompts.ts)
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
// Person Resolution (mirrors backend/process-interview)
// ============================================================

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function stripHonorifics(name) {
  return name
    .replace(/\b(don|doña|dona|señor|señora|sr\.?|sra\.?)\s+/gi, '')
    .trim();
}

/**
 * Resolve AI-suggested people against the existing known tree.
 * Returns a Map of normalizedKey → personRecord.
 *
 * This mirrors the production logic in process-interview/index.ts:
 * - Pre-seed narrator so they're never duplicated
 * - Pre-seed existing people from the "database"
 * - For each suggested person, score against existing; merge or create
 */
function resolvePeople(suggestedPeople, narrator, existingPeople) {
  const resolved = new Map();
  let nextId = existingPeople.length + 1;

  // Pre-seed narrator
  const narratorId = `person-narrator-${normalize(narrator.firstName)}`;
  const narratorKey = normalize(`${narrator.firstName} ${narrator.lastName || ''}`);

  // Check if the narrator already exists in the tree (invited family member)
  const existingNarrator = existingPeople.find(ep => {
    const epKey = normalize(`${ep.first_name} ${ep.last_name || ''}`);
    const epFirst = normalize(ep.first_name);
    const narFirst = normalize(narrator.firstName);
    const narLast = normalize(narrator.lastName || '');
    if (epKey === narratorKey) return true;
    if (epFirst === narFirst) {
      if (!narLast || !normalize(ep.last_name || '')) return true;
      // Check last name overlap
      const narWords = narLast.split(/\s+/);
      const epWords = normalize(ep.last_name || '').split(/\s+/);
      return narWords.some(w => epWords.includes(w));
    }
    return false;
  });

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

  // Pre-seed all existing people
  for (const ep of existingPeople) {
    const epKey = normalize(`${ep.first_name} ${ep.last_name || ''}`);
    if (resolved.has(epKey)) continue; // narrator already seeded
    const epFirst = normalize(ep.first_name);
    resolved.set(epKey, {
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
    });
    // Also seed first-name-only for short-form resolution
    if (!resolved.has(epFirst)) {
      resolved.set(epFirst, resolved.get(epKey));
    }
  }

  // Process AI-suggested people
  for (const suggested of suggestedPeople) {
    const sugFirst = normalize(suggested.firstName || '');
    const sugLast = normalize(suggested.lastName || '');
    const sugFullKey = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);

    // If already resolved, merge any new data
    if (resolved.has(sugFullKey)) {
      const existing = resolved.get(sugFullKey);
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

    // Check first-name-only match — skip if it's the narrator
    if (resolved.has(sugFirst)) {
      const existing = resolved.get(sugFirst);
      if (existing?.isNarrator) {
        // Fall through for disambiguation — might be a different person
      } else {
        // Score-based matching below
      }
    }

    // Score against all existing resolved people (skip narrator)
    let matchKey = null;
    let bestScore = 0;

    for (const [key, person] of resolved) {
      if (person.isNarrator) continue;
      const exFirst = normalize(person.firstName || '');
      const exLast = normalize(person.lastName || '');
      const exNick = normalize(person.nickname || '');

      let score = 0;
      if (sugFirst && exFirst && sugFirst === exFirst) score += 3;
      else if (sugFirst && exNick && sugFirst === exNick) score += 2;
      else if (normalize(suggested.nickname || '') && exFirst && normalize(suggested.nickname) === exFirst) score += 2;
      if (score === 0) continue;

      if (sugLast && exLast) {
        if (sugLast === exLast) score += 3;
        else {
          // Check word overlap in last names
          const sugWords = sugLast.split(/\s+/);
          const exWords = exLast.split(/\s+/);
          const hasOverlap = sugWords.some(w => exWords.includes(w));
          if (hasOverlap) score += 2;
          else score -= 2;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        matchKey = key;
      }
    }

    if (matchKey && bestScore >= 3) {
      // Merge into existing
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
      // Map the full key to the same person
      const existingMapping = resolved.get(sugFullKey);
      if (!existingMapping?.isNarrator) {
        resolved.set(sugFullKey, existing);
      }
    } else {
      // New person
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
      const existingMapping = resolved.get(sugFullKey);
      if (!existingMapping?.isNarrator) {
        resolved.set(sugFullKey, newPerson);
      }
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

  // Try raw name first
  const normName = normalize(name);
  if (resolvedMap.has(normName)) return resolvedMap.get(normName);

  // Try stripping honorifics
  const stripped = normalize(stripHonorifics(name));
  if (stripped !== normName && resolvedMap.has(stripped)) return resolvedMap.get(stripped);

  // Scoring-based fallback
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

  // Pass 1: Full siblings share parents (with max-2-parents guard)
  let changed = true;
  while (changed) {
    changed = false;
    for (const [personId, siblings] of siblingsOf) {
      const myParents = parentsOf.get(personId) || new Set();
      for (const sibId of siblings) {
        const sibCurrentParents = parentsOf.get(sibId) || new Set();
        for (const parentId of myParents) {
          // Guard: no one can have more than 2 biological parents
          if (sibCurrentParents.size >= 2) break;
          if (tryInfer(parentId, sibId, 'parent')) {
            addToSetMap(parentsOf, sibId, parentId);
            sibCurrentParents.add(parentId);
            addToSetMap(childrenOf, parentId, sibId);
            changed = true;
          }
        }
        const sibParents = parentsOf.get(sibId) || new Set();
        const myCurrentParents = parentsOf.get(personId) || new Set();
        for (const parentId of sibParents) {
          // Guard: no one can have more than 2 biological parents
          if (myCurrentParents.size >= 2) break;
          if (tryInfer(parentId, personId, 'parent')) {
            addToSetMap(parentsOf, personId, parentId);
            myCurrentParents.add(parentId);
            addToSetMap(childrenOf, parentId, personId);
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
        const a = childArr[i];
        const b = childArr[j];
        const stepFwd = `${a}|${b}|half_sibling`;
        const stepRev = `${b}|${a}|half_sibling`;
        if (existingSet.has(stepFwd) || existingSet.has(stepRev)) continue;

        let isHalf = false;
        const aParents = parentsOf.get(a) || new Set();
        const bParents = parentsOf.get(b) || new Set();
        if (aParents.size > 0 && bParents.size > 0) {
          const shared = [...aParents].filter(p => bParents.has(p)).length;
          // If one child has a parent the other doesn't → half-sibling
          // (conservative: use Math.max to catch asymmetric parent knowledge)
          if (shared > 0 && shared < Math.max(aParents.size, bParents.size)) isHalf = true;
          const totalUnique = new Set([...aParents, ...bParents]).size;
          if (shared > 0 && totalUnique > shared + 1) isHalf = true;
        }
        const aStepSibs = stepSiblingsOf.get(a) || new Set();
        const bStepSibs = stepSiblingsOf.get(b) || new Set();
        const aSibs = siblingsOf.get(a) || new Set();
        const bSibs = siblingsOf.get(b) || new Set();
        for (const bSib of bSibs) { if (aStepSibs.has(bSib)) { isHalf = true; break; } }
        for (const aSib of aSibs) { if (bStepSibs.has(aSib)) { isHalf = true; break; } }

        if (isHalf) {
          // If a full sibling relationship exists, upgrade it to half_sibling
          const sibFwd = `${a}|${b}|sibling`;
          const sibRev = `${b}|${a}|sibling`;
          if (existingSet.has(sibFwd) || existingSet.has(sibRev)) {
            existingSet.delete(sibFwd);
            existingSet.delete(sibRev);
            const aSiblings = siblingsOf.get(a);
            if (aSiblings) aSiblings.delete(b);
            const bSiblings = siblingsOf.get(b);
            if (bSiblings) bSiblings.delete(a);
          }
          if (tryInfer(a, b, 'half_sibling')) {
            addToSetMap(stepSiblingsOf, a, b);
            addToSetMap(stepSiblingsOf, b, a);
          }
        } else {
          // Don't re-infer sibling if already exists
          const sibFwd = `${a}|${b}|sibling`;
          const sibRev = `${b}|${a}|sibling`;
          if (!existingSet.has(sibFwd) && !existingSet.has(sibRev)) {
            if (tryInfer(a, b, 'sibling')) {
              addToSetMap(siblingsOf, a, b);
              addToSetMap(siblingsOf, b, a);
            }
          }
        }
      }
    }
  }

  // Pass 3: Half siblings propagate to full siblings
  for (const [personId, stepSibs] of stepSiblingsOf) {
    const fullSibs = siblingsOf.get(personId) || new Set();
    for (const stepSibId of stepSibs) {
      for (const fullSibId of fullSibs) {
        if (tryInfer(stepSibId, fullSibId, 'half_sibling')) {
          addToSetMap(stepSiblingsOf, stepSibId, fullSibId);
          addToSetMap(stepSiblingsOf, fullSibId, stepSibId);
        }
      }
      const stepSibFullSibs = siblingsOf.get(stepSibId) || new Set();
      for (const otherSibId of stepSibFullSibs) {
        if (tryInfer(personId, otherSibId, 'half_sibling')) {
          addToSetMap(stepSiblingsOf, personId, otherSibId);
          addToSetMap(stepSiblingsOf, otherSibId, personId);
        }
      }
    }
  }

  // Pass 4: Co-parents → spouse
  for (const [, parents] of parentsOf) {
    const parentArr = [...parents];
    for (let i = 0; i < parentArr.length; i++) {
      for (let j = i + 1; j < parentArr.length; j++) {
        tryInfer(parentArr[i], parentArr[j], 'spouse');
      }
    }
  }

  // Pass 5: Grandparent
  for (const [parentId, children] of childrenOf) {
    for (const childId of children) {
      const grandchildren = childrenOf.get(childId) || new Set();
      for (const gcId of grandchildren) {
        tryInfer(parentId, gcId, 'grandparent');
      }
    }
  }

  // Pass 5b: Great-grandparent
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

  // Pass 6: Uncle/aunt (sibling of parent → uncle/aunt of children)
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
// Simulated Database (accumulates across interviews)
// ============================================================

class SimulatedDB {
  constructor() {
    this.people = [];         // Array of { id, first_name, last_name, ... }
    this.relationships = [];  // Array of { person_a_id, person_b_id, relationship_type, ... }
    this.stories = [];        // Array of { title, content }
    this.interviewResults = []; // Per-interview debug data
  }

  /** Convert resolved people map to DB format and merge new people in */
  mergePeople(resolvedMap) {
    const peopleArr = [...new Map([...resolvedMap].map(([, v]) => [v.id, v])).values()];
    for (const p of peopleArr) {
      const existingIdx = this.people.findIndex(ep => ep.id === p.id);
      const record = {
        id: p.id,
        first_name: p.firstName,
        last_name: p.lastName || null,
        nickname: p.nickname || null,
        birth_date: p.birthDate || null,
        death_date: p.deathDate || null,
        birth_place: p.birthPlace || null,
        current_location: p.currentLocation || null,
        metadata: {
          gender: p.gender || null,
          profession: p.profession || null,
          is_deceased: p.isDeceased || null,
        },
      };
      if (existingIdx >= 0) {
        // Merge: fill gaps
        const existing = this.people[existingIdx];
        if (record.last_name && !existing.last_name) existing.last_name = record.last_name;
        if (record.nickname && !existing.nickname) existing.nickname = record.nickname;
        if (record.birth_date && !existing.birth_date) existing.birth_date = record.birth_date;
        if (record.death_date && !existing.death_date) existing.death_date = record.death_date;
        if (record.birth_place && !existing.birth_place) existing.birth_place = record.birth_place;
        if (record.current_location && !existing.current_location) existing.current_location = record.current_location;
        if (record.metadata.gender && !existing.metadata?.gender) {
          existing.metadata = { ...existing.metadata, gender: record.metadata.gender };
        }
        if (record.metadata.profession && !existing.metadata?.profession) {
          existing.metadata = { ...existing.metadata, profession: record.metadata.profession };
        }
        if (record.metadata.is_deceased && !existing.metadata?.is_deceased) {
          existing.metadata = { ...existing.metadata, is_deceased: record.metadata.is_deceased };
        }
      } else {
        this.people.push(record);
      }
    }
  }

  /** Merge relationships (upsert by person_a_id + person_b_id + type) */
  mergeRelationships(relationships) {
    for (const rel of relationships) {
      const existing = this.relationships.find(
        r => r.person_a_id === rel.personAId &&
             r.person_b_id === rel.personBId &&
             r.relationship_type === rel.type
      );
      if (!existing) {
        this.relationships.push({
          person_a_id: rel.personAId,
          person_b_id: rel.personBId,
          relationship_type: rel.type,
          confidence: rel.confidence,
          inferred: rel.inferred || false,
          personAName: rel.personAName,
          personBName: rel.personBName,
        });
      }
    }
  }

  /** Add stories */
  addStories(stories) {
    for (const s of stories) {
      this.stories.push({ title: s.title, content: s.content });
    }
  }

  /** Build existing tree context string (same as production edge function) */
  buildExistingTreeContext() {
    if (this.people.length === 0) return '';

    const peopleLines = this.people.map(p => {
      const parts = [`${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`];
      if (p.nickname) parts.push(`aka "${p.nickname}"`);
      if (p.birth_date) parts.push(`b. ${p.birth_date}`);
      if (p.birth_place) parts.push(`from ${p.birth_place}`);
      if (p.metadata?.gender) parts.push(p.metadata.gender);
      if (p.metadata?.profession) parts.push(p.metadata.profession);
      return `  - ${parts.join(', ')} [id:${p.id}]`;
    }).join('\n');

    const relLines = this.relationships.map(r => {
      const a = this.people.find(p => p.id === r.person_a_id);
      const b = this.people.find(p => p.id === r.person_b_id);
      if (!a || !b) return null;
      const aName = `${a.first_name}${a.last_name ? ' ' + a.last_name : ''}`;
      const bName = `${b.first_name}${b.last_name ? ' ' + b.last_name : ''}`;
      return `  - ${aName} is ${r.relationship_type} of ${bName}`;
    }).filter(Boolean).join('\n');

    let ctx = `\n[EXISTING FAMILY TREE — These people already exist in the database. When extracting, use the EXACT same names for people who match. Do NOT create duplicates. If the transcript mentions someone who matches an existing person, use their name as listed here.\nKnown people:\n${peopleLines}`;
    if (relLines) {
      ctx += `\nKnown relationships:\n${relLines}`;
    }
    if (this.stories.length > 0) {
      const storyTitles = this.stories.map(s => `  - "${s.title}"`).join('\n');
      ctx += `\nExisting stories (avoid duplicating these themes):\n${storyTitles}`;
    }
    ctx += ']\n';
    return ctx;
  }
}

// ============================================================
// Process a single interview (mirrors production flow)
// ============================================================

async function processInterview(interviewDef, db) {
  const { narrator, transcript, label } = interviewDef;
  const startTime = Date.now();

  console.log(`\n${'▓'.repeat(60)}`);
  console.log(`  🎙️  ${label}`);
  console.log(`  Narrator: ${narrator.firstName} ${narrator.lastName} (${narrator.gender})`);
  console.log(`  Existing people: ${db.people.length}`);
  console.log(`  Existing relationships: ${db.relationships.length}`);
  console.log(`${'▓'.repeat(60)}`);

  // Build narrator context (same as production edge function)
  const subjectName = `${narrator.firstName} ${narrator.lastName}`;
  const genderHint = narrator.gender
    ? ` Their gender is ${narrator.gender}. Use correct gendered language when referring to ${subjectName}.`
    : '';

  const existingTreeContext = db.buildExistingTreeContext();

  const transcriptForAI = `[Narrator/subject of this interview is ${subjectName}.${genderHint} Any first-person references ("I", "me", "my") refer to ${subjectName}. Do NOT create a separate entry for the narrator — they are ${subjectName}. IMPORTANT: When the narrator says "my mom", "my dad", "my brother", etc., create relationships between those people and ${subjectName}. Use ${subjectName} as the personA or personB name in relationships — never use "I" or "me" as a person name.]${existingTreeContext}\n\n${transcript}`;

  // Step 1: Extraction
  console.log('\n  ⏳ Extracting entities & relationships...');
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
  console.log('\n  ⏳ Generating summary & stories...');
  const summaryResult = await callLLM(
    SUMMARY_PROMPT + languageInstruction('es') + '\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
    transcriptForAI
  );
  const summaryTime = Date.now();
  console.log(`  ✅ Summary done (${((summaryTime - extractTime) / 1000).toFixed(1)}s)`);
  console.log(`     Stories: ${summaryResult.suggestedStories?.length || 0}`);

  // Step 3: Person resolution against existing tree
  console.log('\n  ⏳ Resolving people against existing tree...');
  const resolvedPeople = resolvePeople(
    extractionResult.suggestedPeople || [],
    narrator,
    db.people
  );

  // Step 4: Map relationships
  const newRelationships = [];
  let unresolvedCount = 0;
  for (const rel of (extractionResult.relationships || [])) {
    const personA = resolvePersonName(rel.personA, resolvedPeople, narrator);
    const personB = resolvePersonName(rel.personB, resolvedPeople, narrator);
    if (personA && personB && personA.id !== personB.id) {
      newRelationships.push({
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

  // Step 5: Merge into DB (before inference, so inference uses full graph)
  db.mergePeople(resolvedPeople);
  db.mergeRelationships(newRelationships);

  // Step 5b: Clear previously inferred relationships before re-inferring
  // This prevents stale inferences from poisoning new inference runs
  // (e.g., a wrong 'sibling' blocking a correct 'half_sibling' after new data)
  db.relationships = db.relationships.filter(r => !r.inferred);

  // Step 6: Transitive inference on the FULL accumulated relationship set
  // Re-format DB relationships for the inference function
  const allRelsForInference = db.relationships.map(r => ({
    personAId: r.person_a_id,
    personBId: r.person_b_id,
    type: r.relationship_type,
    confidence: r.confidence,
    inferred: r.inferred,
  }));

  const inferred = inferTransitiveRelationships(allRelsForInference);

  // Convert inferred back to relationship format and merge
  const inferredWithNames = inferred.map(inf => {
    const personA = db.people.find(p => p.id === inf.personAId);
    const personB = db.people.find(p => p.id === inf.personBId);
    return {
      personAId: inf.personAId,
      personBId: inf.personBId,
      personAName: personA ? `${personA.first_name}${personA.last_name ? ' ' + personA.last_name : ''}` : '?',
      personBName: personB ? `${personB.first_name}${personB.last_name ? ' ' + personB.last_name : ''}` : '?',
      type: inf.type,
      confidence: inf.confidence,
      inferred: true,
    };
  });
  db.mergeRelationships(inferredWithNames);

  // Step 7: Add stories
  if (summaryResult.suggestedStories?.length) {
    db.addStories(summaryResult.suggestedStories);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  const directCount = newRelationships.length;
  const inferredCount = inferredWithNames.length;
  console.log(`\n  ✅ Interview processed in ${totalTime}s`);
  console.log(`  📊 This interview: ${directCount} direct + ${inferredCount} inferred relationships`);
  console.log(`  📊 Cumulative: ${db.people.length} people, ${db.relationships.length} relationships, ${db.stories.length} stories`);

  // Store per-interview results for debugging
  db.interviewResults.push({
    interviewId: interviewDef.id,
    label,
    narrator,
    extraction: extractionResult,
    summary: summaryResult,
    newRelationships,
    inferredRelationships: inferredWithNames,
    peopleCountAfter: db.people.length,
    relCountAfter: db.relationships.length,
    timeSeconds: parseFloat(totalTime),
  });

  return { extractionResult, summaryResult, resolvedPeople, newRelationships, inferredWithNames };
}

// ============================================================
// ASSERTIONS
// ============================================================

function runAssertions(db) {
  const results = { passed: 0, failed: 0, warnings: 0, errors: [], warns: [] };

  const people = db.people;
  const rels = db.relationships;

  function assert(condition, msg) {
    if (condition) results.passed++;
    else { results.failed++; results.errors.push(msg); }
  }

  function warn(condition, msg) {
    if (condition) results.passed++;
    else { results.warnings++; results.warns.push(msg); }
  }

  function hasPerson(firstName) {
    return people.some(p => normalize(p.first_name) === normalize(firstName));
  }

  function getPersonCount(firstName) {
    const normFirst = normalize(firstName);
    const uniqueIds = new Set(
      people
        .filter(p => normalize(p.first_name) === normFirst)
        .map(p => p.id)
    );
    return uniqueIds.size;
  }

  function getPerson(firstName) {
    return people.find(p => normalize(p.first_name) === normalize(firstName));
  }

  function hasRel(personAFirst, personBFirst, type) {
    const a = normalize(personAFirst);
    const b = normalize(personBFirst);
    return rels.some(r => {
      const pA = people.find(p => p.id === r.person_a_id);
      const pB = people.find(p => p.id === r.person_b_id);
      if (!pA || !pB) return false;
      const ra = normalize(pA.first_name);
      const rb = normalize(pB.first_name);
      return r.relationship_type === type && ((ra === a && rb === b) || (ra === b && rb === a));
    });
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  🧪 MULTI-INTERVIEW ASSERTIONS');
  console.log('═'.repeat(60));

  // ═══════════════════════════════════════════
  // SECTION 1: Core people from Interview 1
  // ═══════════════════════════════════════════
  console.log('\n  📋 Section 1: Core people (from Valentina\'s interview)');

  const corePeople = [
    'Valentina', 'Jorge', 'Sofía', 'Diego', 'Isabella', 'Ana', 'Matías',
    'Roberto', 'Carmen', 'Antonio', 'Elena', 'Miguel', 'Lucía',
    'Patricia', 'Ricardo', 'Lucas', 'Camila', 'Eduardo', 'Teresa',
    'Daniel', 'Andrés', 'Marta',
  ];
  for (const name of corePeople) {
    assert(hasPerson(name), `Core person missing: ${name}`);
  }

  // ═══════════════════════════════════════════
  // SECTION 2: NEW people from later interviews
  // ═══════════════════════════════════════════
  console.log('\n  📋 Section 2: New people from family interviews');

  // Interview 3 (Diego): Ana's parents and sister
  assert(hasPerson('Fernando'), 'Fernando (Ana\'s father) should exist from Diego\'s interview');
  assert(hasPerson('Rosa'), 'Rosa (Ana\'s mother) should exist from Diego\'s interview');
  warn(hasPerson('Mónica') || hasPerson('Monica'), 'Mónica (Ana\'s sister) should exist from Diego\'s interview');

  // Interview 4 (Patricia): Ricardo's parents, Andrés's wife/daughter
  assert(hasPerson('Héctor') || hasPerson('Hector'), 'Héctor (Ricardo\'s father) should exist from Patricia\'s interview');
  assert(hasPerson('Gloria'), 'Gloria (Ricardo\'s mother) should exist from Patricia\'s interview');
  assert(hasPerson('Laura'), 'Laura (Andrés\'s wife) should exist from Patricia\'s interview');
  warn(hasPerson('Sofía Valentina') || people.some(p =>
    normalize(p.first_name).includes('sofia') && normalize(p.last_name || '').includes('rodriguez') &&
    normalize(p.last_name || '').includes('sanchez')
  ), 'Sofía Valentina (Andrés\'s daughter) should exist from Patricia\'s interview');

  // ═══════════════════════════════════════════
  // SECTION 3: DEDUPLICATION (critical!)
  // Each core person should appear exactly once
  // ═══════════════════════════════════════════
  console.log('\n  🔄 Section 3: Cross-interview deduplication');

  // These people are mentioned in MULTIPLE interviews — they must NOT be duplicated
  const multiMentionPeople = [
    'Jorge', 'Roberto', 'Carmen', 'Patricia', 'Ricardo',
    'Diego', 'Isabella', 'Antonio', 'Elena', 'Lucas', 'Camila',
    'Eduardo', 'Teresa', 'Daniel', 'Miguel', 'Lucía', 'Andrés', 'Marta',
  ];
  for (const name of multiMentionPeople) {
    const count = getPersonCount(name);
    assert(count <= 1, `DEDUP FAILURE: ${name} appears ${count} times (should be 1)`);
  }

  // Special: Sofía Chen (narrator's mom) should not be duped with Sofía Valentina (Andrés's daughter)
  // This is tricky because both have "Sofía" as first name
  const sofias = people.filter(p => normalize(p.first_name).includes('sofia'));
  warn(sofias.length >= 1, 'At least one Sofía should exist');
  // We accept 1-2 Sofías (Sofía Chen and possibly Sofía Valentina as separate person)

  // Total people count sanity check
  // Core (22) + Fernando + Rosa + Mónica + Héctor + Gloria + Laura + Sofía Valentina = ~29
  assert(people.length >= 22, `Too few people: ${people.length}, expected ≥22`);
  warn(people.length <= 35, `Possible over-duplication: ${people.length} people (expected ~25-30)`);

  // ═══════════════════════════════════════════
  // SECTION 4: Data enrichment across interviews
  // New info from later narrators fills gaps
  // ═══════════════════════════════════════════
  console.log('\n  📝 Section 4: Cross-interview data enrichment');

  // Carmen: Valentina doesn't mention her profession, Jorge says "maestra de primaria", Patricia confirms
  const carmen = getPerson('Carmen');
  if (carmen) {
    warn(
      carmen.metadata?.profession?.toLowerCase()?.includes('maestra') ||
      carmen.metadata?.profession?.toLowerCase()?.includes('teacher'),
      `Carmen's profession should be enriched to "maestra" from Jorge's interview, got "${carmen.metadata?.profession}"`
    );
  }

  // Andrés: Valentina says he was born 1965, Patricia says he's an architect, lives in Monterrey
  const andres = getPerson('Andrés') || getPerson('Andres');
  if (andres) {
    warn(
      andres.metadata?.profession?.toLowerCase()?.includes('arquitecto') ||
      andres.metadata?.profession?.toLowerCase()?.includes('architect'),
      `Andrés should be enriched with profession "arquitecto" from later interviews, got "${andres.metadata?.profession}"`
    );
    warn(
      andres.current_location?.toLowerCase()?.includes('monterrey'),
      `Andrés should have currentLocation "Monterrey", got "${andres.current_location}"`
    );
  }

  // Daniel: age-based year from Valentina ("veintidós años"), career from Diego ("ingeniería informática")
  const daniel = getPerson('Daniel');
  if (daniel?.birth_date) {
    const danielYear = parseInt(daniel.birth_date);
    warn(danielYear >= 2002 && danielYear <= 2005,
      `Daniel birth year should be ~2003-2004, got ${daniel.birth_date}`);
  }

  // Antonio: bakery confirmed by multiple narrators, musician detail from Jorge
  const antonio = getPerson('Antonio');
  if (antonio) {
    warn(!!antonio.metadata?.is_deceased || !!antonio.death_date,
      'Antonio should be marked as deceased');
  }

  // Marta: Valentina only says her name, Patricia enriches with "profesora de historia en Puebla"
  const marta = getPerson('Marta');
  if (marta) {
    warn(
      marta.metadata?.profession?.toLowerCase()?.includes('profesora') ||
      marta.metadata?.profession?.toLowerCase()?.includes('historia') ||
      marta.metadata?.profession?.toLowerCase()?.includes('teacher') ||
      marta.metadata?.profession?.toLowerCase()?.includes('professor'),
      `Marta should be enriched with profession from Patricia's interview, got "${marta.metadata?.profession}"`
    );
  }

  // ═══════════════════════════════════════════
  // SECTION 5: Core relationships
  // ═══════════════════════════════════════════
  console.log('\n  🔗 Section 5: Core relationships');

  // Parent relationships
  assert(hasRel('Jorge', 'Valentina', 'parent'), 'Jorge → parent of Valentina');
  assert(hasRel('Sofía', 'Valentina', 'parent') || hasRel('Sofia', 'Valentina', 'parent'),
    'Sofía → parent of Valentina');
  assert(hasRel('Jorge', 'Diego', 'parent') || hasRel('Sofía', 'Diego', 'parent') || hasRel('Sofia', 'Diego', 'parent'),
    'Jorge or Sofía → parent of Diego');
  assert(hasRel('Roberto', 'Jorge', 'parent'), 'Roberto → parent of Jorge');
  assert(hasRel('Carmen', 'Jorge', 'parent'), 'Carmen → parent of Jorge');
  assert(hasRel('Antonio', 'Roberto', 'parent'), 'Antonio → parent of Roberto');

  // Siblings
  assert(hasRel('Diego', 'Valentina', 'sibling'), 'Diego ↔ sibling of Valentina');
  assert(hasRel('Isabella', 'Valentina', 'sibling'), 'Isabella ↔ sibling of Valentina');
  assert(hasRel('Patricia', 'Jorge', 'sibling'), 'Patricia ↔ Jorge sibling');

  // Half-sibling
  assert(hasRel('Andrés', 'Jorge', 'half_sibling') || hasRel('Andres', 'Jorge', 'half_sibling'),
    'Andrés ↔ Jorge half_sibling');

  // Spouses
  warn(hasRel('Jorge', 'Sofía', 'spouse') || hasRel('Jorge', 'Sofia', 'spouse'),
    'Jorge ↔ Sofía spouse');
  warn(hasRel('Diego', 'Ana', 'spouse'), 'Diego ↔ Ana spouse');
  warn(hasRel('Patricia', 'Ricardo', 'spouse'), 'Patricia ↔ Ricardo spouse');

  // Ex-spouse
  warn(hasRel('Roberto', 'Marta', 'ex_spouse'), 'Roberto ↔ Marta ex_spouse');

  // Godparent
  warn(hasRel('Patricia', 'Valentina', 'godparent'), 'Patricia → godparent of Valentina');

  // ═══════════════════════════════════════════
  // SECTION 6: Relationships from later interviews
  // ═══════════════════════════════════════════
  console.log('\n  🔗 Section 6: Relationships from family interviews');

  // From Diego's interview: Ana's parents
  warn(hasRel('Fernando', 'Ana', 'parent'), 'Fernando → parent of Ana');
  warn(hasRel('Rosa', 'Ana', 'parent'), 'Rosa → parent of Ana');

  // From Patricia's interview: Ricardo's parents
  warn(hasRel('Héctor', 'Ricardo', 'parent') || hasRel('Hector', 'Ricardo', 'parent'),
    'Héctor → parent of Ricardo');
  warn(hasRel('Gloria', 'Ricardo', 'parent'), 'Gloria → parent of Ricardo');

  // From Patricia's interview: Andrés's wife + child
  warn(hasRel('Andrés', 'Laura', 'spouse') || hasRel('Andres', 'Laura', 'spouse'),
    'Andrés ↔ Laura spouse');

  // ═══════════════════════════════════════════
  // SECTION 7: Inferred relationships
  // ═══════════════════════════════════════════
  console.log('\n  🔮 Section 7: Transitive inference');

  const inferredRels = rels.filter(r => r.inferred);
  assert(inferredRels.length >= 5, `Should have ≥5 inferred relationships, got ${inferredRels.length}`);

  // Grandparents should be inferred
  warn(hasRel('Roberto', 'Valentina', 'grandparent'), 'Roberto → grandparent of Valentina (inferred)');
  warn(hasRel('Carmen', 'Valentina', 'grandparent'), 'Carmen → grandparent of Valentina (inferred)');

  // Great-grandparents inferred
  warn(hasRel('Antonio', 'Valentina', 'great_grandparent') || hasRel('Antonio', 'Jorge', 'grandparent'),
    'Antonio → great_grandparent of Valentina or grandparent of Jorge');

  // Sibling inference: Diego ↔ Isabella
  warn(hasRel('Diego', 'Isabella', 'sibling'), 'Diego ↔ Isabella sibling (inferred)');

  // Uncle/aunt inference: Patricia → uncle_aunt of Valentina
  warn(hasRel('Patricia', 'Valentina', 'uncle_aunt'), 'Patricia → uncle_aunt of Valentina (inferred)');
  warn(hasRel('Eduardo', 'Valentina', 'uncle_aunt') || hasRel('Eduardo', 'Diego', 'uncle_aunt'),
    'Eduardo → uncle_aunt of narrator or siblings (inferred)');

  // ═══════════════════════════════════════════
  // SECTION 8: Relationship types coverage
  // ═══════════════════════════════════════════
  console.log('\n  📊 Section 8: Relationship type coverage');

  const allTypes = [...new Set(rels.map(r => r.relationship_type))];
  const expectedTypes = ['parent', 'sibling', 'spouse', 'half_sibling'];
  for (const t of expectedTypes) {
    assert(allTypes.includes(t), `Relationship type '${t}' should be present`);
  }

  const bonusTypes = ['grandparent', 'great_grandparent', 'uncle_aunt', 'ex_spouse', 'godparent'];
  for (const t of bonusTypes) {
    warn(allTypes.includes(t), `Bonus type '${t}' should appear (direct or inferred)`);
  }

  console.log(`     Types found: ${allTypes.sort().join(', ')}`);

  // ═══════════════════════════════════════════
  // SECTION 9: Stories across interviews
  // ═══════════════════════════════════════════
  console.log('\n  📖 Section 9: Stories');

  assert(db.stories.length >= 4, `Should have ≥4 stories across all interviews, got ${db.stories.length}`);
  warn(db.stories.length >= 8, `Expected ≥8 stories for 4 interviews, got ${db.stories.length}`);

  // Check each interview produced at least 1 story
  for (const ir of db.interviewResults) {
    const storyCount = ir.summary?.suggestedStories?.length || 0;
    assert(storyCount >= 1, `${ir.label} should produce ≥1 story, got ${storyCount}`);
  }

  // ═══════════════════════════════════════════
  // SECTION 10: Structural integrity
  // ═══════════════════════════════════════════
  console.log('\n  🏗️  Section 10: Structural integrity');

  // All relationship person IDs should reference existing people
  let orphanedRels = 0;
  for (const r of rels) {
    const hasA = people.some(p => p.id === r.person_a_id);
    const hasB = people.some(p => p.id === r.person_b_id);
    if (!hasA || !hasB) orphanedRels++;
  }
  assert(orphanedRels === 0, `${orphanedRels} relationships reference non-existent people`);

  // No self-referencing relationships
  const selfRefs = rels.filter(r => r.person_a_id === r.person_b_id);
  assert(selfRefs.length === 0, `${selfRefs.length} self-referencing relationships found`);

  // Extraction results should have valid structure
  for (const ir of db.interviewResults) {
    assert(Array.isArray(ir.extraction.entities), `${ir.label}: entities should be an array`);
    assert(Array.isArray(ir.extraction.relationships), `${ir.label}: relationships should be an array`);
    assert(Array.isArray(ir.extraction.suggestedPeople), `${ir.label}: suggestedPeople should be an array`);
  }

  // Check all relationship types are valid
  const VALID_TYPES = new Set([
    'parent', 'child', 'spouse', 'ex_spouse', 'sibling', 'half_sibling',
    'grandparent', 'grandchild', 'great_grandparent', 'great_grandchild',
    'great_great_grandparent', 'great_great_grandchild',
    'uncle_aunt', 'nephew_niece', 'cousin',
    'in_law', 'parent_in_law', 'child_in_law',
    'step_parent', 'step_child', 'step_sibling',
    'adopted_parent', 'adopted_child', 'godparent', 'godchild', 'other',
  ]);
  for (const ir of db.interviewResults) {
    for (const rel of ir.extraction.relationships) {
      assert(VALID_TYPES.has(rel.relationshipType),
        `Invalid type: "${rel.relationshipType}" in ${ir.label}`);
    }
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

function printFinalTree(db) {
  const { people, relationships: rels } = db;

  console.log('\n' + '═'.repeat(60));
  console.log('  🌳 FINAL CUMULATIVE FAMILY TREE');
  console.log('═'.repeat(60));

  for (const p of people) {
    const parts = [];
    if (p.birth_date) parts.push(`b. ${p.birth_date}`);
    if (p.death_date) parts.push(`d. ${p.death_date}`);
    if (p.birth_place) parts.push(`📍 ${p.birth_place}`);
    if (p.metadata?.gender) parts.push(p.metadata.gender === 'male' ? '♂' : '♀');
    if (p.metadata?.profession) parts.push(`💼 ${p.metadata.profession}`);
    if (p.metadata?.is_deceased) parts.push('✝️');
    if (p.current_location) parts.push(`📌 ${p.current_location}`);

    const name = `${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`;
    console.log(`\n  👤 ${name}${parts.length ? '  (' + parts.join(', ') + ')' : ''}`);
    if (p.nickname) console.log(`     aka "${p.nickname}"`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  🔗 ALL RELATIONSHIPS');
  console.log('═'.repeat(60));

  const typeEmojis = {
    parent: '👨‍👧', child: '👶', sibling: '👫', step_sibling: '👥',
    half_sibling: '🔀', parent_in_law: '👨‍👧', child_in_law: '👶',
    spouse: '💑', ex_spouse: '💔', grandparent: '👴', great_grandparent: '👑',
    uncle_aunt: '🧑‍🤝‍🧑', nephew_niece: '👦', cousin: '🤝', godparent: '🙏',
    godchild: '👼', in_law: '🤝',
  };

  // Group by type
  const byType = {};
  for (const r of rels) {
    if (!byType[r.relationship_type]) byType[r.relationship_type] = [];
    byType[r.relationship_type].push(r);
  }

  for (const [type, typeRels] of Object.entries(byType).sort()) {
    const emoji = typeEmojis[type] || '🔗';
    console.log(`\n  ${emoji} ${type.toUpperCase()} (${typeRels.length}):`);
    for (const r of typeRels) {
      const pA = people.find(p => p.id === r.person_a_id);
      const pB = people.find(p => p.id === r.person_b_id);
      const aName = pA ? `${pA.first_name}${pA.last_name ? ' ' + pA.last_name : ''}` : r.personAName || '?';
      const bName = pB ? `${pB.first_name}${pB.last_name ? ' ' + pB.last_name : ''}` : r.personBName || '?';
      const conf = r.confidence ? ` ${Math.round(r.confidence * 100)}%` : '';
      const source = r.inferred ? ' [INFERRED]' : '';
      console.log(`     ${aName} → ${bName}${conf}${source}`);
    }
  }
}

function generateHTML(db) {
  const { people, relationships: rels, stories, interviewResults } = db;

  const nodes = people.map(p => ({
    id: p.id,
    label: `${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`,
    birth: p.birth_date || '',
    death: p.death_date || '',
    place: p.birth_place || '',
    gender: p.metadata?.gender || 'unknown',
    profession: p.metadata?.profession || '',
    isDeceased: !!p.metadata?.is_deceased || !!p.death_date,
    nickname: p.nickname || '',
    location: p.current_location || '',
  }));

  const edges = rels.map(r => ({
    from: r.person_a_id,
    to: r.person_b_id,
    label: r.relationship_type,
    inferred: !!r.inferred,
    confidence: r.confidence || 0,
  }));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Matra — Multi-Interview Pipeline Test Results</title>
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
  .tag { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; background: #1e3a5f; color: #7ec8e3; margin: 2px; }
  .interview-card { background: #0d1a2d; border: 1px solid #1e3a5f; border-radius: 8px; padding: 14px; margin-bottom: 10px; }
  .interview-card h3 { color: #d4a574; margin-bottom: 6px; }
  .interview-card .stats { font-size: 12px; color: #8b9baa; }
  .legend { display: flex; gap: 16px; margin-top: 10px; font-size: 12px; color: #8b9baa; }
  .legend span { display: flex; align-items: center; gap: 4px; }
  .legend .dot { width: 10px; height: 10px; border-radius: 50%; }
  .progress { display: flex; gap: 4px; margin: 10px 0; }
  .progress .step { flex: 1; height: 4px; border-radius: 2px; }
  .progress .step.done { background: #4ade80; }
</style>
</head>
<body>
<div class="header">
  <h1>🌳 Matra — Multi-Interview Pipeline Test</h1>
  <p>${interviewResults.length} interviews · ${nodes.length} people · ${edges.length} relationships (${edges.filter(e=>e.inferred).length} inferred) · ${stories.length} stories</p>
  <div class="progress">
    ${interviewResults.map(() => '<div class="step done"></div>').join('')}
  </div>
</div>
<div class="container">
  <!-- Interview Timeline -->
  <div class="card full-width">
    <h2>📅 Interview Timeline</h2>
    ${interviewResults.map((ir, i) => `
      <div class="interview-card">
        <h3>${i + 1}. ${ir.label}</h3>
        <div class="stats">
          ⏱️ ${ir.timeSeconds}s · 
          👥 ${ir.extraction.suggestedPeople?.length || 0} people extracted · 
          🔗 ${ir.newRelationships.length} direct + ${ir.inferredRelationships.length} inferred rels · 
          📖 ${ir.summary?.suggestedStories?.length || 0} stories ·
          📊 Cumulative: ${ir.peopleCountAfter} people, ${ir.relCountAfter} rels
        </div>
      </div>
    `).join('')}
  </div>

  <!-- People -->
  <div class="card" style="max-height: 800px; overflow-y: auto;">
    <h2>👥 People (${nodes.length})</h2>
    ${nodes.map(n => `
      <div class="person${n.isDeceased ? ' deceased' : ''}">
        <div class="avatar ${n.gender}">${n.gender === 'male' ? '♂' : n.gender === 'female' ? '♀' : '?'}${n.isDeceased ? '✝' : ''}</div>
        <div class="info">
          <div class="name">${n.label}${n.nickname ? ' ("' + n.nickname + '")' : ''}</div>
          <div class="meta">${[n.birth ? 'b.' + n.birth : '', n.death ? 'd.' + n.death : '', n.place, n.profession, n.location].filter(Boolean).join(' · ') || 'No details'}</div>
        </div>
      </div>
    `).join('')}
  </div>

  <!-- Relationships -->
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
        <span class="conf">${Math.round(e.confidence * 100)}%${e.inferred ? ' inf' : ''}</span>
      </div>`;
    }).join('')}
    <div class="legend">
      <span><div class="dot" style="background:#4ade80"></div> Direct (AI)</span>
      <span><div class="dot" style="background:#f59e0b"></div> Inferred</span>
    </div>
  </div>

  <!-- Stories -->
  <div class="card full-width" style="max-height: 600px; overflow-y: auto;">
    <h2>📚 Stories (${stories.length})</h2>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
    ${stories.map(s => `
      <div class="story">
        <h3>"${s.title}"</h3>
        <p>${typeof s.content === 'string' ? s.content.substring(0, 300) + (s.content.length > 300 ? '...' : '') : ''}</p>
      </div>
    `).join('')}
    </div>
  </div>
</div>
</body>
</html>`;

  const outPath = path.join(__dirname, 'test-multi-interview-output.html');
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
  console.log('║   Matra — Multi-Interview Pipeline Test                 ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║   4 narrators · sequential interviews · cumulative tree ║');
  console.log('║   Tests: dedup, enrichment, inference, story gen        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  Provider: ${provider}`);
  console.log(`  Interviews: ${INTERVIEWS.length}`);
  console.log(`  Narrators: ${INTERVIEWS.map(i => i.narrator.firstName).join(' → ')}\n`);

  const db = new SimulatedDB();

  // Process each interview sequentially (like the real app)
  for (let i = 0; i < INTERVIEWS.length; i++) {
    const interview = INTERVIEWS[i];
    await processInterview(interview, db);

    // Print cumulative snapshot after each interview
    console.log(`\n  ──── Snapshot after ${interview.narrator.firstName}'s interview ────`);
    console.log(`  People: ${db.people.length}`);
    console.log(`  Relationships: ${db.relationships.length}`);
    console.log(`  Stories: ${db.stories.length}`);
    console.log(`  ────────────────────────────────────────────────`);
  }

  // Run comprehensive assertions on the final state
  const assertionResults = runAssertions(db);

  // Print final tree
  printFinalTree(db);

  // Generate HTML
  const htmlPath = generateHTML(db);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(60));
  console.log(`  ✅ All ${INTERVIEWS.length} interviews processed in ${totalTime}s`);
  console.log(`  📊 Final: ${db.people.length} people, ${db.relationships.length} relationships, ${db.stories.length} stories`);
  console.log(`  📊 HTML visualization: ${htmlPath}`);
  console.log('═'.repeat(60) + '\n');

  // Dump debug JSON
  const debugPath = path.join(__dirname, 'test-multi-interview-debug.json');
  fs.writeFileSync(debugPath, JSON.stringify({
    provider,
    totalTimeSeconds: parseFloat(totalTime),
    interviews: db.interviewResults,
    finalPeople: db.people,
    finalRelationships: db.relationships,
    finalStories: db.stories,
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

#!/usr/bin/env node
// ============================================================
// Matra — Full Pipeline Stress Test with App UI Visualization
// ============================================================
// Run: node test-stress-app.mjs
//
// This test combines:
//   1. Full AI pipeline (extraction → resolution → inference → stories)
//   2. Multi-interview sequential processing (like the real app)
//   3. Tree layout algorithm (faithful port from tree.tsx)
//   4. App-faithful HTML visualization showing tree, people, stories
//
// Family: The Bueso–Reyes Bilingual Clan (EN/ES mixed)
//
// Interview 1: Carlos Bueso (primary user, EN) — core tree
// Interview 2: María Elena Reyes (wife, ES) — her side of family
// Interview 3: Abuela Rosa (grandmother, ES) — deep history + ex-spouses
// Interview 4: James Bueso (brother, EN) — blended family, in-laws
//
// Outputs:
//   test-stress-app-output.html  — App-style UI visualization
//   test-stress-app-debug.json   — Full debug data
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

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!GROQ_API_KEY && !OPENAI_API_KEY) {
  console.error('❌ No API keys found. Set GROQ_API_KEY or OPENAI_API_KEY in .env.local');
  process.exit(1);
}

// ============================================================
// INTERVIEW DEFINITIONS
// ============================================================

const INTERVIEWS = [
  // ────────────────────────────────────────────────
  // INTERVIEW 1: Carlos Bueso (EN) — Primary User
  // Establishes core tree: parents, siblings, wife, kids,
  // paternal grandparents, one deceased great-grandfather
  // ────────────────────────────────────────────────
  {
    id: 'interview-1',
    label: 'Interview 1 — Carlos Bueso (primary user, English)',
    narrator: { firstName: 'Carlos', lastName: 'Bueso', gender: 'male' },
    language: 'en',
    transcript: `My name is Carlos Bueso, I'm a man, born in 1990 in Houston, Texas. I work as a software engineer.

My dad is Roberto Bueso, born in 1962 in San Pedro Sula, Honduras. He's a mechanical engineer and came to the US in 1985. My mom is Patricia Hernández de Bueso, born in 1965 in Guatemala City. She's a teacher.

I have an older brother named James, born in 1987. James is married to Stephanie Kim — she's Korean-American, a pharmacist. They have two kids: Mia, who's six, and little Ethan who just turned two.

I also have a younger sister, Daniela Bueso, born in 1993. She's single and lives in New York, works in finance.

My wife is María Elena Reyes. We got married in 2018. Elena — that's what we call her — was born in 1992 in Tegucigalpa, Honduras. She's a pediatrician. We have a daughter named Sofia, she's three years old, and a son named Mateo who's one.

On my dad's side, my grandfather is Ernesto Bueso, born in 1935 in La Ceiba, Honduras. He was a coffee farmer, a real patriarch. My grandmother is Carmen Flores de Bueso, born in 1938. Grandma Carmen is the heart of the family, she still makes the best baleadas in the world.

My great-grandfather on my dad's side was Don Miguel Bueso, born in 1905. He founded the family coffee plantation in the mountains near La Ceiba. He passed away in 1980.

On my mom's side, I don't know much about her parents. I think my maternal grandfather's name was Alfredo but he passed before I was born.`,
  },

  // ────────────────────────────────────────────────
  // INTERVIEW 2: María Elena Reyes (ES) — Wife
  // Adds: her parents, siblings, paternal grandparents,
  // her uncle's family, enriches the children
  // ────────────────────────────────────────────────
  {
    id: 'interview-2',
    label: 'Interview 2 — María Elena Reyes (wife, Spanish)',
    narrator: { firstName: 'María Elena', lastName: 'Reyes', gender: 'female' },
    language: 'es',
    transcript: `Me llamo María Elena Reyes, soy mujer, nací en 1992 en Tegucigalpa, Honduras. Soy pediatra y vivo en Houston con mi esposo Carlos Bueso.

Mi papá es Fernando Reyes Aguilar, nació en 1960 en Tegucigalpa. Es abogado y tiene su propio bufete. Mi mamá se llama Lucía Mendoza de Reyes, nació en 1963 en Comayagua, Honduras. Ella es ama de casa pero antes era enfermera.

Tengo un hermano mayor, Andrés Reyes Mendoza, nació en 1988. Andrés es médico cirujano, está casado con Valentina Torres. Tienen un hijo que se llama Sebastián, tiene cuatro años. Andrés y su familia viven en Tegucigalpa.

También tengo una hermana menor, Isabel Reyes Mendoza, nació en 1995. Isabel vive en Madrid, España, trabaja en una empresa de tecnología. Ella tiene novio pero no está casada.

Por el lado de mi papá, mis abuelos paternos son Don Ramón Reyes, nació en 1932, y Doña Esperanza Aguilar de Reyes, nació en 1936. Mi abuelo Ramón fue juez en Tegucigalpa durante cuarenta años. Mi abuela Esperanza falleció en 2018, descanse en paz.

Mi papá tiene un hermano, mi tío Marcos Reyes Aguilar, nació en 1958. El tío Marcos es empresario, está casado con Gloria Pineda. Tienen dos hijos: mi prima Carolina, que tiene treinta años, y mi primo Diego, que tiene veinticinco.

Mi esposo Carlos es increíble. Nos conocimos en un congreso médico en 2016. Él es ingeniero de software. Tenemos a Sofía que tiene tres añitos y a Mateo que tiene un año. La familia de Carlos es muy linda — mis suegros Roberto y Patricia son como mis segundos padres. Mi cuñado James y su esposa Stephanie son muy buena onda.

Los abuelos de Carlos, Don Ernesto y Doña Carmen, me recibieron con mucho cariño. La primera vez que probé las baleadas de Doña Carmen, supe que había encontrado mi familia.`,
  },

  // ────────────────────────────────────────────────
  // INTERVIEW 3: Abuela Rosa (ES) — Carlos's maternal
  // grandmother, reveals deep family history
  // Adds: maternal grandparents fully, great-grandparents,
  // ex-spouse drama, deceased relatives
  // ────────────────────────────────────────────────
  {
    id: 'interview-3',
    label: 'Interview 3 — Rosa Martínez (maternal grandmother, Spanish)',
    narrator: { firstName: 'Rosa', lastName: 'Martínez', gender: 'female' },
    language: 'es',
    transcript: `Me llamo Rosa Martínez viuda de Hernández, soy mujer, nací en 1940 en Quetzaltenango, Guatemala.

Mi esposo fue Alfredo Hernández, que en paz descanse. Alfredo nació en 1937 en la Ciudad de Guatemala. Nos casamos en 1960. Era profesor de historia en la Universidad de San Carlos. Falleció en 1988, un infarto.

Tuvimos tres hijos. La mayor es mi hija Patricia, que nació en 1965. Patricia se casó con Roberto Bueso, un hondureño. Tienen tres hijos preciosos: James, Carlos y Daniela. Carlos se casó con una muchacha hondureña muy linda, Elena. Ya tienen dos hijos, imagínense, soy bisabuela — Sofía y Mateo.

Mi segundo hijo es Eduardo Hernández Martínez, nació en 1967. Eduardo vive en Los Ángeles. Se casó con una americana, Jennifer Wilson, pero se divorciaron en 2010. Tienen una hija, Natalie, que tiene veinte años. Eduardo después se casó con Claudia López en 2015. Con Claudia tienen un hijo, Gabriel, que tiene seis años.

Mi hijo menor es Ricardo Hernández Martínez, nació en 1970. Ricardo nunca se casó, vive en Guatemala y es artista, pintor. Tiene un estudio en Antigua Guatemala.

Mi papá fue Don Tomás Martínez, nacido en 1912 en Quetzaltenango. Era comerciante, vendía café y cacao. Falleció en 1985. Mi mamá fue Doña Consuelo Vásquez de Martínez, nacida en 1915. Ella murió en 2000. Mis papás tuvieron una vida dura pero bonita.

Antes de Alfredo, yo estuve brevemente casada con un hombre llamado Héctor Solís, en 1958. Fue un error de juventud, nos divorciamos al año. Héctor se fue a México y nunca más supe de él.

Lo que más me enorgullece es ver a mi familia crecer. Patricia es maestra, como yo quise ser. Eduardo tuvo sus problemas pero salió adelante. Y Ricardo, aunque no tiene familia propia, tiene un talento increíble. Sus cuadros están en galerías de todo Centroamérica.

Mis bisnietos Sofía y Mateo son mi mayor alegría. Cuando Carlos me habla por videollamada y Sofía me dice "hola abuelita Rosa", se me llena el corazón.`,
  },

  // ────────────────────────────────────────────────
  // INTERVIEW 4: James Bueso (EN) — Carlos's brother
  // Adds: Stephanie's parents (Korean-American),
  // work stories, enriches kids, adds godparent
  // ────────────────────────────────────────────────
  {
    id: 'interview-4',
    label: 'Interview 4 — James Bueso (brother, English)',
    narrator: { firstName: 'James', lastName: 'Bueso', gender: 'male' },
    language: 'en',
    transcript: `I'm James Bueso, born in 1987 in Houston, Texas. I'm a man and I'm a dentist.

My parents are Roberto Bueso and Patricia Hernández. Dad came from Honduras, Mom from Guatemala. They met at a church event in Houston in 1985 and got married in 1986.

I have a younger brother Carlos, born in 1990, and a younger sister Daniela, born in 1993. Carlos married Elena Reyes, they have Sofia and Mateo. Daniela lives in New York, she's in finance, doing really well.

My wife is Stephanie Kim, we got married in 2016. Steph was born in 1989 in Los Angeles. Her parents are Joon-Ho Kim and Sung-Hee Park. Mr. Kim — I call him appa — was born in 1958 in Seoul, South Korea. He's a retired electronics engineer. Mrs. Park was born in 1961, also in Seoul. She's a piano teacher [laughter]. They moved to LA in 1985.

Stephanie has an older brother, David Kim, born in 1985. David's a data scientist in San Francisco, married to Lisa Chen. They have a baby girl named Emily, she was born last year.

Our daughter Mia was born in 2019, she's six and already reading chapter books. Our son Ethan was born in 2023, he's two and is the most energetic kid I've ever seen [laughs].

My grandfather Ernesto Bueso is ninety years old now and still sharp as a tack. He tells stories about the coffee plantation. Grandma Carmen still makes baleadas every Sunday — it's the family tradition. My great-grandfather Don Miguel apparently survived a hurricane in 1935 that destroyed half of La Ceiba. He rebuilt everything from scratch.

My grandmother Rosa on my mom's side is incredible. She's eighty-five and still calls us every week from Guatemala. Grandpa Alfredo died before I was born, but Grandma Rosa always tells us stories about him. He was a university professor.

My uncle Eduardo lives in LA with his second wife Claudia and their son Gabriel. Eduardo's daughter Natalie from his first marriage sometimes babysits for us when she visits. She's great with kids.

My uncle Ricardo is the artist of the family. He made a portrait of our grandparents Alfredo and Rosa that hangs in my parents' house. It's beautiful.

Elena's parents, Don Fernando and Doña Lucía, are wonderful people. We visit them in Tegucigalpa during Christmas. Don Fernando always wants to discuss law with me even though I'm a dentist [laughs].

I'm Daniela's godfather. I take that responsibility seriously. She was a difficult teenager but she's turned into an amazing woman. I'm so proud of her.

One thing about our family — we're a real mix of cultures. We have Honduran, Guatemalan, Korean, and American traditions all blending together. Thanksgiving at our house has baleadas, kimchi, tamales, and turkey. It's chaos and I love it.`,
  },
];

// ============================================================
// PROMPTS
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
- MULTILINGUAL SUPPORT: Recognize Spanish kinship terms.
- Deduplicate people.
- Dates: If a year is mentioned without month/day, use ONLY "YYYY" format.
- Ages: calculate approximate birth year from current year (2026). Use "YYYY" format.
- EVERY person in "relationships" MUST appear in "suggestedPeople".

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
// Person Resolution
// ============================================================

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function stripHonorifics(name) {
  return name.replace(/\b(don|doña|dona|señor|señora|sr\.?|sra\.?|mr\.?|mrs\.?|ms\.?|dr\.?)\s+/gi, '').trim();
}

function resolvePeople(suggestedPeople, narrator, existingPeople) {
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
    if (resolved.has(epKey)) continue;
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
    if (!resolved.has(epFirst)) {
      resolved.set(epFirst, resolved.get(epKey));
    }
  }

  for (const suggested of suggestedPeople) {
    const sugFirst = normalize(suggested.firstName || '');
    const sugLast = normalize(suggested.lastName || '');
    const sugFullKey = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);

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
      const existingMapping = resolved.get(sugFullKey);
      if (!existingMapping?.isNarrator) {
        resolved.set(sugFullKey, existing);
      }
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
  const normName = normalize(name);
  if (resolvedMap.has(normName)) return resolvedMap.get(normName);
  const stripped = normalize(stripHonorifics(name));
  if (stripped !== normName && resolvedMap.has(stripped)) return resolvedMap.get(stripped);
  const normFirst = stripped.split(/\s+/)[0];
  let bestPerson = null;
  let bestScore = 0;
  for (const [key, person] of resolvedMap) {
    const keyParts = key.split(/\s+/);
    const keyFirst = keyParts[0];
    if (keyFirst !== normFirst && normalize(person.firstName) !== normFirst) continue;
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
        const sibCurrentParents = parentsOf.get(sibId) || new Set();
        for (const parentId of myParents) {
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

  // Pass 2: Children of same parent → siblings
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
          if (shared > 0 && shared < Math.max(aParents.size, bParents.size)) isHalf = true;
          const totalUnique = new Set([...aParents, ...bParents]).size;
          if (shared > 0 && totalUnique > shared + 1) isHalf = true;
        }

        if (isHalf) {
          const sibFwd = `${a}|${b}|sibling`;
          const sibRev = `${b}|${a}|sibling`;
          if (existingSet.has(sibFwd) || existingSet.has(sibRev)) {
            existingSet.delete(sibFwd);
            existingSet.delete(sibRev);
          }
          if (tryInfer(a, b, 'half_sibling')) {
            addToSetMap(stepSiblingsOf, a, b);
            addToSetMap(stepSiblingsOf, b, a);
          }
        } else {
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

  // Pass 3: Half siblings propagate
  for (const [personId, stepSibs] of stepSiblingsOf) {
    const fullSibs = siblingsOf.get(personId) || new Set();
    for (const stepSibId of stepSibs) {
      for (const fullSibId of fullSibs) {
        if (tryInfer(stepSibId, fullSibId, 'half_sibling')) {
          addToSetMap(stepSiblingsOf, stepSibId, fullSibId);
          addToSetMap(stepSiblingsOf, fullSibId, stepSibId);
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

  // Pass 6: Uncle/aunt
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
// Simulated Database
// ============================================================

class SimulatedDB {
  constructor() {
    this.people = [];
    this.relationships = [];
    this.stories = [];
    this.interviewResults = [];
  }

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
        const existing = this.people[existingIdx];
        if (record.last_name && !existing.last_name) existing.last_name = record.last_name;
        if (record.nickname && !existing.nickname) existing.nickname = record.nickname;
        if (record.birth_date && !existing.birth_date) existing.birth_date = record.birth_date;
        if (record.death_date && !existing.death_date) existing.death_date = record.death_date;
        if (record.birth_place && !existing.birth_place) existing.birth_place = record.birth_place;
        if (record.current_location && !existing.current_location) existing.current_location = record.current_location;
        if (record.metadata.gender && !existing.metadata?.gender)
          existing.metadata = { ...existing.metadata, gender: record.metadata.gender };
        if (record.metadata.profession && !existing.metadata?.profession)
          existing.metadata = { ...existing.metadata, profession: record.metadata.profession };
        if (record.metadata.is_deceased && !existing.metadata?.is_deceased)
          existing.metadata = { ...existing.metadata, is_deceased: record.metadata.is_deceased };
      } else {
        this.people.push(record);
      }
    }
  }

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
          verified: !rel.inferred,
          personAName: rel.personAName,
          personBName: rel.personBName,
        });
      }
    }
  }

  addStories(stories, interviewLabel) {
    for (const s of stories) {
      this.stories.push({
        title: s.title,
        content: s.content,
        involvedPeople: s.involvedPeople || [],
        location: s.location || null,
        approximateDate: s.approximateDate || null,
        source: interviewLabel,
      });
    }
  }

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
      return `  - ${a.first_name}${a.last_name ? ' ' + a.last_name : ''} is ${r.relationship_type} of ${b.first_name}${b.last_name ? ' ' + b.last_name : ''}`;
    }).filter(Boolean).join('\n');

    let ctx = `\n[EXISTING FAMILY TREE — These people already exist.\nKnown people:\n${peopleLines}`;
    if (relLines) ctx += `\nKnown relationships:\n${relLines}`;
    if (this.stories.length > 0) {
      ctx += `\nExisting stories:\n${this.stories.map(s => `  - "${s.title}"`).join('\n')}`;
    }
    ctx += ']\n';
    return ctx;
  }
}

// ============================================================
// Process Interview
// ============================================================

async function processInterview(interviewDef, db) {
  const { narrator, transcript, label, language } = interviewDef;
  const startTime = Date.now();

  console.log(`\n${'▓'.repeat(60)}`);
  console.log(`  🎙️  ${label}`);
  console.log(`  Narrator: ${narrator.firstName} ${narrator.lastName} (${narrator.gender})`);
  console.log(`  Language: ${language || 'en'}`);
  console.log(`  Existing: ${db.people.length} people, ${db.relationships.length} relationships`);
  console.log(`${'▓'.repeat(60)}`);

  const subjectName = `${narrator.firstName} ${narrator.lastName}`;
  const genderHint = narrator.gender
    ? ` Their gender is ${narrator.gender}. Use correct gendered language when referring to ${subjectName}.`
    : '';
  const existingTreeContext = db.buildExistingTreeContext();

  const transcriptForAI = `[Narrator/subject of this interview is ${subjectName}.${genderHint} Any first-person references ("I", "me", "my") refer to ${subjectName}. Do NOT create a separate entry for the narrator — they are ${subjectName}. IMPORTANT: When the narrator says "my mom", "my dad", "my brother", etc., create relationships between those people and ${subjectName}.]${existingTreeContext}\n\n${transcript}`;

  // Extraction
  console.log('\n  ⏳ Extracting entities & relationships...');
  const lang = language || 'en';
  const extractionResult = await callLLM(
    EXTRACTION_PROMPT + languageInstruction(lang) + '\n\nIMPORTANT: Respond ONLY with valid JSON.',
    transcriptForAI
  );
  const extractTime = Date.now();
  console.log(`  ✅ Extraction done (${((extractTime - startTime) / 1000).toFixed(1)}s) — ${extractionResult.suggestedPeople?.length || 0} people, ${extractionResult.relationships?.length || 0} rels`);

  // Summarization
  console.log('  ⏳ Generating summary & stories...');
  const summaryResult = await callLLM(
    SUMMARY_PROMPT + languageInstruction(lang) + '\n\nIMPORTANT: Respond ONLY with valid JSON.',
    transcriptForAI
  );
  const summaryTime = Date.now();
  console.log(`  ✅ Summary done (${((summaryTime - extractTime) / 1000).toFixed(1)}s) — ${summaryResult.suggestedStories?.length || 0} stories`);

  // Person resolution
  const resolvedPeople = resolvePeople(
    extractionResult.suggestedPeople || [],
    narrator,
    db.people
  );

  // Map relationships
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
    }
  }
  if (unresolvedCount > 0) console.log(`  ⚠️  ${unresolvedCount} unresolved relationship(s)`);

  // Merge into DB
  db.mergePeople(resolvedPeople);
  db.mergeRelationships(newRelationships);

  // Clear previously inferred relationships
  db.relationships = db.relationships.filter(r => !r.inferred);

  // Transitive inference
  const allRelsForInference = db.relationships.map(r => ({
    personAId: r.person_a_id,
    personBId: r.person_b_id,
    type: r.relationship_type,
    confidence: r.confidence,
    inferred: r.inferred,
  }));
  const inferred = inferTransitiveRelationships(allRelsForInference);
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

  // Add stories
  if (summaryResult.suggestedStories?.length) {
    db.addStories(summaryResult.suggestedStories, label);
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ✅ Interview processed in ${totalTime}s`);
  console.log(`  📊 This: ${newRelationships.length} direct + ${inferredWithNames.length} inferred rels`);
  console.log(`  📊 Cumulative: ${db.people.length} people, ${db.relationships.length} rels, ${db.stories.length} stories`);

  db.interviewResults.push({
    interviewId: interviewDef.id,
    label,
    narrator,
    language: lang,
    transcript,
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
  const { people, relationships: rels } = db;

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
    return new Set(people.filter(p => normalize(p.first_name) === normFirst).map(p => p.id)).size;
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
  console.log('  🧪 STRESS TEST ASSERTIONS');
  console.log('═'.repeat(60));

  // Section 1: Core people from Carlos's interview
  console.log('\n  📋 Section 1: Core people (from Carlos)');
  for (const name of ['Carlos', 'Roberto', 'Patricia', 'James', 'Daniela', 'Ernesto', 'Carmen', 'Sofia', 'Mateo']) {
    assert(hasPerson(name), `Core person: ${name}`);
  }
  assert(hasPerson('María Elena') || hasPerson('Maria Elena') || hasPerson('Elena'), 'María Elena (wife)');

  // Section 2: NEW people from wife's interview
  console.log('\n  📋 Section 2: People from Elena\'s interview');
  assert(hasPerson('Fernando'), 'Fernando (Elena\'s father)');
  assert(hasPerson('Lucía') || hasPerson('Lucia'), 'Lucía (Elena\'s mother)');
  assert(hasPerson('Andrés') || hasPerson('Andres'), 'Andrés (Elena\'s brother)');
  assert(hasPerson('Isabel'), 'Isabel (Elena\'s sister)');
  warn(hasPerson('Ramón') || hasPerson('Ramon'), 'Ramón (Elena\'s grandfather)');
  warn(hasPerson('Marcos'), 'Marcos (Elena\'s uncle)');

  // Section 3: People from Abuela Rosa's interview
  console.log('\n  📋 Section 3: People from Abuela Rosa');
  assert(hasPerson('Rosa'), 'Rosa (maternal grandmother)');
  assert(hasPerson('Alfredo'), 'Alfredo (maternal grandfather, deceased)');
  assert(hasPerson('Eduardo'), 'Eduardo (uncle)');
  assert(hasPerson('Ricardo'), 'Ricardo (uncle, artist)');
  warn(hasPerson('Jennifer') || hasPerson('Claudia'), 'Jennifer or Claudia (Eduardo\'s wives)');
  warn(hasPerson('Natalie'), 'Natalie (Eduardo\'s daughter)');
  warn(hasPerson('Héctor') || hasPerson('Hector'), 'Héctor (Rosa\'s ex-husband)');

  // Section 4: People from James's interview
  console.log('\n  📋 Section 4: People from James');
  assert(hasPerson('Stephanie'), 'Stephanie (James\'s wife)');
  assert(hasPerson('Mia'), 'Mia (James\'s daughter)');
  assert(hasPerson('Ethan'), 'Ethan (James\'s son)');
  warn(hasPerson('Joon-Ho') || hasPerson('Joon'), 'Joon-Ho Kim (Stephanie\'s father)');
  warn(hasPerson('Sung-Hee') || hasPerson('Sung'), 'Sung-Hee Park (Stephanie\'s mother)');
  warn(hasPerson('David'), 'David Kim (Stephanie\'s brother)');

  // Section 5: Deduplication
  console.log('\n  🔄 Section 5: Cross-interview deduplication');
  for (const name of ['Carlos', 'Roberto', 'Patricia', 'James', 'Daniela', 'Ernesto', 'Carmen']) {
    const count = getPersonCount(name);
    assert(count <= 1, `DEDUP: ${name} appears ${count} times`);
  }
  assert(people.length >= 20, `Too few people: ${people.length}, expected ≥20`);
  warn(people.length <= 45, `Possible over-duplication: ${people.length} people`);

  // Section 6: Core relationships
  console.log('\n  🔗 Section 6: Core relationships');
  assert(hasRel('Roberto', 'Carlos', 'parent'), 'Roberto → parent of Carlos');
  assert(hasRel('Patricia', 'Carlos', 'parent') || hasRel('Rosa', 'Patricia', 'parent'), 'Patricia → parent of Carlos OR Rosa → parent of Patricia');
  assert(hasRel('James', 'Carlos', 'sibling'), 'James ↔ Carlos sibling');
  warn(hasRel('Carlos', 'Elena', 'spouse') || hasRel('Carlos', 'María Elena', 'spouse') || hasRel('Carlos', 'Maria Elena', 'spouse'), 'Carlos ↔ Elena spouse');
  warn(hasRel('Ernesto', 'Roberto', 'parent') || hasRel('Ernesto', 'Carlos', 'grandparent'), 'Ernesto → parent of Roberto or grandparent of Carlos');

  // Section 7: Ex-spouse detection
  console.log('\n  💔 Section 7: Ex-spouse & blended family');
  warn(hasRel('Rosa', 'Héctor', 'ex_spouse') || hasRel('Rosa', 'Hector', 'ex_spouse'), 'Rosa ↔ Héctor ex_spouse');
  warn(hasRel('Eduardo', 'Jennifer', 'ex_spouse'), 'Eduardo ↔ Jennifer ex_spouse');

  // Section 8: Inferred relationships
  console.log('\n  🔮 Section 8: Transitive inference');
  const inferredRels = rels.filter(r => r.inferred);
  assert(inferredRels.length >= 3, `Should have ≥3 inferred rels, got ${inferredRels.length}`);
  warn(hasRel('Ernesto', 'Carlos', 'grandparent'), 'Ernesto → grandparent of Carlos (inferred)');
  warn(hasRel('Daniela', 'James', 'sibling') || hasRel('Daniela', 'Carlos', 'sibling'), 'Daniela ↔ siblings (inferred)');

  // Section 9: Godparent
  console.log('\n  🙏 Section 9: Godparent');
  warn(hasRel('James', 'Daniela', 'godparent'), 'James → godparent of Daniela');

  // Section 10: Stories
  console.log('\n  📖 Section 10: Stories');
  assert(db.stories.length >= 4, `Should have ≥4 stories, got ${db.stories.length}`);
  for (const ir of db.interviewResults) {
    const storyCount = ir.summary?.suggestedStories?.length || 0;
    assert(storyCount >= 1, `${ir.label} should produce ≥1 story, got ${storyCount}`);
  }

  // Section 11: Structural integrity
  console.log('\n  🏗️  Section 11: Structural integrity');
  let orphanedRels = 0;
  for (const r of rels) {
    if (!people.some(p => p.id === r.person_a_id) || !people.some(p => p.id === r.person_b_id)) orphanedRels++;
  }
  assert(orphanedRels === 0, `${orphanedRels} orphaned relationships`);
  assert(rels.filter(r => r.person_a_id === r.person_b_id).length === 0, 'No self-referencing rels');

  // Section 12: Type coverage
  console.log('\n  📊 Section 12: Relationship type coverage');
  const allTypes = [...new Set(rels.map(r => r.relationship_type))];
  for (const t of ['parent', 'sibling', 'spouse']) {
    assert(allTypes.includes(t), `Type '${t}' should be present`);
  }
  for (const t of ['grandparent', 'uncle_aunt', 'ex_spouse', 'godparent']) {
    warn(allTypes.includes(t), `Bonus type '${t}'`);
  }
  console.log(`  Types found: ${allTypes.sort().join(', ')}`);

  // Print results
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
  if (results.failed === 0) console.log('\n  🎉 ALL ASSERTIONS PASSED!\n');
  else console.log(`\n  💥 ${results.failed} assertion(s) failed.\n`);

  return results;
}

// ============================================================
// TREE LAYOUT ALGORITHM (faithful port from tree.tsx)
// ============================================================

const NODE_RADIUS = 28;
const HORIZONTAL_SPACING = 140;
const VERTICAL_SPACING = 160;
const COUPLE_GAP = 100;
const PADDING = 80;
const CANVAS_MIN_WIDTH = 800;
const CANVAS_MIN_HEIGHT = 600;

function layoutTree(people, relationships, selfPersonId) {
  const positions = new Map();
  const roleLabels = new Map();
  const generation = new Map();
  if (people.length === 0) return { positions, roleLabels, generation, width: CANVAS_MIN_WIDTH, height: CANVAS_MIN_HEIGHT, people, relationships, selfPersonId };

  const peopleById = new Map(people.map(p => [p.id, p]));

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
      if (type === 'ex_spouse') exSpousePairs.add([a, b].sort().join('|'));
    } else if (['step_parent', 'adopted_parent'].includes(type)) {
      if (!childrenOf.has(a)) childrenOf.set(a, []);
      childrenOf.get(a).push(b);
      if (!parentOf.has(b)) parentOf.set(b, []);
      parentOf.get(b).push(a);
    } else if (['step_child', 'adopted_child'].includes(type)) {
      if (!childrenOf.has(b)) childrenOf.set(b, []);
      childrenOf.get(b).push(a);
      if (!parentOf.has(a)) parentOf.set(a, []);
      parentOf.get(a).push(b);
    }
  }

  const directParentOf = new Map();
  for (const [childId, parents] of parentOf) directParentOf.set(childId, [...parents]);

  // Multi-gen ancestor/descendant
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
      if (!parentOf.has(descendantId)) parentOf.set(descendantId, []);
      if (!parentOf.get(descendantId).includes(ancestorId)) parentOf.get(descendantId).push(ancestorId);
    }
  }

  // Sibling adjacency
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

  // Propagate parents through full siblings
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
            if (!childrenOf.get(parentId).includes(personId)) childrenOf.get(parentId).push(personId);
            if (!directParentOf.has(personId)) directParentOf.set(personId, []);
            if (!directParentOf.get(personId).includes(parentId)) directParentOf.get(personId).push(parentId);
            changed = true;
          }
        }
      }
    }
  }

  // BFS generation assignment
  const GEN_OFFSET_A = {
    parent: -1, child: 1, spouse: 0, ex_spouse: 0,
    sibling: 0, half_sibling: 0, step_sibling: 0,
    grandparent: -2, grandchild: 2,
    great_grandparent: -3, great_grandchild: 3,
    great_great_grandparent: -4, great_great_grandchild: 4,
    uncle_aunt: -1, nephew_niece: 1, cousin: 0,
    in_law: 0, parent_in_law: -1, child_in_law: 1,
    step_parent: -1, step_child: 1,
    adopted_parent: -1, adopted_child: 1,
    godparent: -1, godchild: 1, other: 0,
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

  const visited = new Set();
  const startNode = selfPersonId && peopleById.has(selfPersonId) ? selfPersonId : null;
  if (startNode) {
    const queue = [{ id: startNode, gen: 0 }];
    visited.add(startNode);
    while (queue.length > 0) {
      const { id: nid, gen } = queue.shift();
      generation.set(nid, gen);
      for (const { targetId, offset } of (adjList.get(nid) || [])) {
        if (!visited.has(targetId)) {
          visited.add(targetId);
          queue.push({ id: targetId, gen: gen + offset });
        }
      }
    }
  }

  for (const p of people) {
    if (visited.has(p.id)) continue;
    const neighbors = adjList.get(p.id) || [];
    const placedNeighbor = neighbors.find(n => generation.has(n.targetId));
    if (placedNeighbor) {
      const queue = [{ id: p.id, gen: generation.get(placedNeighbor.targetId) + placedNeighbor.offset }];
      visited.add(p.id);
      while (queue.length > 0) {
        const { id: nid, gen } = queue.shift();
        generation.set(nid, gen);
        for (const { targetId, offset } of (adjList.get(nid) || [])) {
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

  let minGen = 0;
  for (const gen of generation.values()) if (gen < minGen) minGen = gen;
  if (minGen < 0) for (const [pid, gen] of generation) generation.set(pid, gen - minGen);

  const genGroups = new Map();
  for (const [personId, gen] of generation) {
    if (!genGroups.has(gen)) genGroups.set(gen, []);
    genGroups.get(gen).push(personId);
  }
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
    return [...narratorSide, selfPersonId, ...selfAllSpousesInRow, ...spouseSide, ...ids.filter(id => !assigned.has(id))];
  }

  const selfGen = selfPersonId ? generation.get(selfPersonId) : null;
  let selfGenOrder = null;
  if (selfPersonId && selfGen != null) {
    const selfGenRow = genGroups.get(selfGen);
    if (selfGenRow) {
      const ordered = reorderSelfGen(selfGenRow);
      selfGenOrder = new Map();
      ordered.forEach((id, idx) => selfGenOrder.set(id, idx));
    }
  }

  function getMinSelfGenDescIdx(personId) {
    if (!selfGenOrder) return Infinity;
    if (selfGenOrder.has(personId)) return selfGenOrder.get(personId);
    const v = new Set([personId]);
    const q = [personId];
    let minIdx = Infinity;
    while (q.length > 0) {
      const current = q.shift();
      const kids = childrenOf.get(current) || [];
      for (const c of kids) {
        if (v.has(c)) continue;
        v.add(c);
        if (selfGenOrder.has(c)) minIdx = Math.min(minIdx, selfGenOrder.get(c));
        else q.push(c);
      }
    }
    return minIdx;
  }

  function buildUnits(ids) {
    const placed = new Set();
    const units = [];
    for (const personId of ids) {
      if (placed.has(personId)) continue;
      const spouses = spouseOf.get(personId);
      const spousesInRow = spouses ? [...spouses].filter(s => ids.includes(s) && !placed.has(s)) : [];
      if (spousesInRow.length >= 2) {
        placed.add(personId);
        const exes = [], currents = [];
        for (const sp of spousesInRow) {
          placed.add(sp);
          if (exSpousePairs.has([personId, sp].sort().join('|'))) exes.push(sp);
          else currents.push(sp);
        }
        const unitIds = [...exes, personId, ...currents];
        if (exes.length === 0 && currents.length >= 2) {
          unitIds.length = 0;
          const mid = Math.floor(currents.length / 2);
          unitIds.push(...currents.slice(0, mid), personId, ...currents.slice(mid));
        }
        units.push({ ids: unitIds, width: (unitIds.length - 1) * COUPLE_GAP });
      } else if (spousesInRow.length === 1) {
        const spouseInRow = spousesInRow[0];
        placed.add(personId);
        placed.add(spouseInRow);
        if (personId === selfPersonId || spouseInRow === selfPersonId) {
          const self = personId === selfPersonId ? personId : spouseInRow;
          const sp = personId === selfPersonId ? spouseInRow : personId;
          units.push({ ids: [self, sp], width: COUPLE_GAP });
        } else {
          const personHasSib = siblingOf.get(personId)?.size ? [...siblingOf.get(personId)].some(s => ids.includes(s)) : false;
          const spouseHasSib = siblingOf.get(spouseInRow)?.size ? [...siblingOf.get(spouseInRow)].some(s => ids.includes(s)) : false;
          if (personHasSib && !spouseHasSib) units.push({ ids: [spouseInRow, personId], width: COUPLE_GAP });
          else units.push({ ids: [personId, spouseInRow], width: COUPLE_GAP });
        }
      } else {
        placed.add(personId);
        units.push({ ids: [personId], width: 0 });
      }
    }
    return units;
  }

  // Place each generation
  for (let gi = 0; gi < sortedGens.length; gi++) {
    const gen = sortedGens[gi];
    const row = genGroups.get(gen);
    const minGenForY = sortedGens[0];
    const y = PADDING + (gen - minGenForY) * VERTICAL_SPACING;

    if (gi === 0) {
      let orderedRow = reorderSelfGen(row);
      if (selfGenOrder && !row.includes(selfPersonId)) {
        orderedRow = [...row].sort((a, b) => getMinSelfGenDescIdx(a) - getMinSelfGenDescIdx(b));
      }
      const units = buildUnits(orderedRow);
      const totalWidth = units.reduce((sum, u) => sum + u.width, 0) + (units.length - 1) * HORIZONTAL_SPACING;
      maxRowWidth = Math.max(maxRowWidth, totalWidth);
      let x = PADDING + (Math.max(maxRowWidth, CANVAS_MIN_WIDTH) - totalWidth) / 2;
      for (const unit of units) {
        for (let i = 0; i < unit.ids.length; i++) positions.set(unit.ids[i], { x: x + i * COUPLE_GAP, y });
        x += unit.width + HORIZONTAL_SPACING;
      }
      continue;
    }

    if (selfPersonId && row.includes(selfPersonId)) {
      const orderedRow = reorderSelfGen(row);
      const rowUnits = buildUnits(orderedRow);
      const allParentXs = [];
      for (const childId of orderedRow) {
        for (const pid of (parentOf.get(childId) || [])) {
          const pp = positions.get(pid);
          if (pp) allParentXs.push(pp.x);
        }
      }
      const centerX = allParentXs.length > 0 ? (Math.min(...allParentXs) + Math.max(...allParentXs)) / 2 : PADDING + CANVAS_MIN_WIDTH / 2;
      const totalWidth = rowUnits.reduce((sum, u) => sum + u.width, 0) + (rowUnits.length - 1) * HORIZONTAL_SPACING;
      let rx = centerX - totalWidth / 2;
      if (rx < PADDING) rx = PADDING;
      let rowWidth = 0;
      for (const unit of rowUnits) {
        for (let i = 0; i < unit.ids.length; i++) positions.set(unit.ids[i], { x: rx + i * COUPLE_GAP, y });
        rowWidth = Math.max(rowWidth, rx + unit.width);
        rx += unit.width + HORIZONTAL_SPACING;
      }
      maxRowWidth = Math.max(maxRowWidth, rowWidth + PADDING);
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
        const key = spouseId ? [positionedParent, spouseId].sort().join('|') : positionedParent;
        if (!parentUnitMap.has(key)) parentUnitMap.set(key, []);
        parentUnitMap.get(key).push(childId);
      } else orphans.push(childId);
    }

    const remainingOrphans = [];
    for (const orphanId of orphans) {
      const sibs = siblingOf.get(orphanId);
      let placed = false;
      if (sibs) for (const sibId of sibs) {
        for (const [, children] of parentUnitMap) {
          if (children.includes(sibId)) { children.push(orphanId); placed = true; break; }
        }
        if (placed) break;
      }
      if (!placed) {
        const spouses = spouseOf.get(orphanId);
        if (spouses) for (const spId of spouses) {
          for (const [, children] of parentUnitMap) {
            if (children.includes(spId)) { children.push(orphanId); placed = true; break; }
          }
          if (placed) break;
        }
      }
      if (!placed) remainingOrphans.push(orphanId);
    }

    const isAncestorGen = selfGen != null && gen < selfGen;
    const sortedParentKeys = [...parentUnitMap.keys()].sort((a, b) => {
      if (isAncestorGen && selfGenOrder) {
        const aDescIdx = Math.min(...parentUnitMap.get(a).map(c => getMinSelfGenDescIdx(c)));
        const bDescIdx = Math.min(...parentUnitMap.get(b).map(c => getMinSelfGenDescIdx(c)));
        if (aDescIdx !== bDescIdx) return aDescIdx - bDescIdx;
      }
      const aIds = a.split('|');
      const bIds = b.split('|');
      return Math.min(...aIds.map(id => positions.get(id)?.x ?? 0)) - Math.min(...bIds.map(id => positions.get(id)?.x ?? 0));
    });

    const groupPlacements = [];

    if (isAncestorGen && selfGenOrder && remainingOrphans.length > 0) {
      const orphanUnits = buildUnits(remainingOrphans);
      const allGroupItems = sortedParentKeys.map(key => ({
        type: 'keyed', key,
        descIdx: Math.min(...parentUnitMap.get(key).map(c => getMinSelfGenDescIdx(c)))
      }));
      for (const unit of orphanUnits) {
        allGroupItems.push({ type: 'orphan', unit, descIdx: Math.min(...unit.ids.map(id => getMinSelfGenDescIdx(id))) });
      }
      allGroupItems.sort((a, b) => a.descIdx - b.descIdx);

      for (const item of allGroupItems) {
        if (item.type === 'keyed') {
          const groupChildren = parentUnitMap.get(item.key);
          const groupUnits = buildUnits(groupChildren);
          const parentIds = item.key.split('|');
          const parentCenterX = parentIds.map(id => positions.get(id)?.x ?? 0).reduce((a, b) => a + b, 0) / parentIds.length;
          const groupTotalWidth = groupUnits.reduce((sum, u) => sum + u.width, 0) + (groupUnits.length - 1) * HORIZONTAL_SPACING;
          let gx = parentCenterX - groupTotalWidth / 2;
          const placed = [];
          for (const unit of groupUnits) {
            placed.push({ ids: unit.ids, width: unit.width, x: gx });
            gx += unit.width + HORIZONTAL_SPACING;
          }
          groupPlacements.push(placed);
        } else {
          groupPlacements.push([{ ids: item.unit.ids, width: item.unit.width, x: PADDING }]);
        }
      }
    } else {
      for (const key of sortedParentKeys) {
        const groupChildren = parentUnitMap.get(key);
        const groupUnits = buildUnits(groupChildren);
        const parentIds = key.split('|');
        const parentCenterX = parentIds.map(id => positions.get(id)?.x ?? 0).reduce((a, b) => a + b, 0) / parentIds.length;
        const groupTotalWidth = groupUnits.reduce((sum, u) => sum + u.width, 0) + (groupUnits.length - 1) * HORIZONTAL_SPACING;
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

    let rowWidth = 0;
    for (const group of groupPlacements) {
      for (const pu of group) {
        for (let i = 0; i < pu.ids.length; i++) positions.set(pu.ids[i], { x: pu.x + i * COUPLE_GAP, y });
        rowWidth = Math.max(rowWidth, pu.x + pu.width);
      }
    }

    for (const key of sortedParentKeys) {
      const parentIds = key.split('|');
      if (parentIds.length !== 1) continue;
      const parentPos = positions.get(parentIds[0]);
      if (!parentPos) continue;
      const children = parentUnitMap.get(key);
      const childXs = children.map(c => positions.get(c)?.x ?? 0);
      const childCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
      if (childCenter > parentPos.x) parentPos.x = childCenter;
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
        if (shift > 0) { pos.x += shift; spousePos.x += shift; }
      } else {
        if (childCenter > pos.x) pos.x = childCenter;
      }
    }
  }

  // Post-layout overlap deconfliction
  const MIN_NODE_DISTANCE = NODE_RADIUS * 2 + 20;
  for (const gen of sortedGens) {
    const row = genGroups.get(gen);
    const rowNodes = row.map(id => ({ id, pos: positions.get(id) })).filter(n => n.pos).sort((a, b) => a.pos.x - b.pos.x);
    for (let i = 1; i < rowNodes.length; i++) {
      const gap = rowNodes[i].pos.x - rowNodes[i - 1].pos.x;
      if (gap < MIN_NODE_DISTANCE) {
        const push = MIN_NODE_DISTANCE - gap;
        for (let j = i; j < rowNodes.length; j++) rowNodes[j].pos.x += push;
      }
    }
  }

  // Post-deconfliction ancestor couple re-ordering
  if (selfGenOrder) {
    for (const gen of sortedGens) {
      if (selfGen == null || gen >= selfGen) continue;
      const row = genGroups.get(gen);
      const placed = new Set();
      const coupleUnits = [];
      for (const personId of row) {
        if (placed.has(personId)) continue;
        placed.add(personId);
        const sp = spouseOf.get(personId);
        const spouseInRow = sp ? [...sp].find(s => row.includes(s) && !placed.has(s)) : null;
        if (spouseInRow) {
          placed.add(spouseInRow);
          coupleUnits.push({ ids: [personId, spouseInRow], descIdx: Math.min(getMinSelfGenDescIdx(personId), getMinSelfGenDescIdx(spouseInRow)) });
        } else {
          coupleUnits.push({ ids: [personId], descIdx: getMinSelfGenDescIdx(personId) });
        }
      }
      if (coupleUnits.length < 2) continue;
      coupleUnits.sort((a, b) => a.descIdx - b.descIdx);
      for (const unit of coupleUnits) {
        const allKidXs = [];
        for (const id of unit.ids) {
          for (const k of (childrenOf.get(id) || [])) {
            const kp = positions.get(k);
            if (kp) allKidXs.push(kp.x);
          }
        }
        unit.desiredCenter = allKidXs.length > 0 ? (Math.min(...allKidXs) + Math.max(...allKidXs)) / 2 : positions.get(unit.ids[0]).x + ((unit.ids.length - 1) * COUPLE_GAP) / 2;
        unit.width = (unit.ids.length - 1) * COUPLE_GAP;
      }
      for (let i = 0; i < coupleUnits.length; i++) {
        const unit = coupleUnits[i];
        let leftX = unit.desiredCenter - unit.width / 2;
        if (leftX < PADDING) leftX = PADDING;
        if (i > 0) {
          const prev = coupleUnits[i - 1];
          const prevRightX = positions.get(prev.ids[prev.ids.length - 1]).x;
          const minX = prevRightX + HORIZONTAL_SPACING;
          if (leftX < minX) leftX = minX;
        }
        for (let j = 0; j < unit.ids.length; j++) positions.get(unit.ids[j]).x = leftX + j * COUPLE_GAP;
      }
    }
  }

  let actualMaxX = 0, actualMaxY = 0;
  for (const pos of positions.values()) {
    if (pos.x > actualMaxX) actualMaxX = pos.x;
    if (pos.y > actualMaxY) actualMaxY = pos.y;
  }
  const genRange = sortedGens.length > 0 ? (sortedGens[sortedGens.length - 1] - sortedGens[0] + 1) : 1;
  const graphWidth = Math.max(actualMaxX + PADDING * 3, maxRowWidth + PADDING * 2, CANVAS_MIN_WIDTH);
  const graphHeight = Math.max(actualMaxY + PADDING * 3, PADDING * 2 + genRange * VERTICAL_SPACING, CANVAS_MIN_HEIGHT);

  // Role labels via BFS
  const inverseLabel = {
    parent: 'Child', child: 'Parent', spouse: 'Spouse', ex_spouse: 'Ex-Spouse',
    sibling: 'Sibling', step_sibling: 'Step Sib', half_sibling: 'Half Sib',
    grandparent: 'Grandchild', grandchild: 'Grandparent',
    great_grandparent: 'Gt-Grandchild', great_grandchild: 'Gt-Grandparent',
    uncle_aunt: 'Nephew/Niece', nephew_niece: 'Uncle/Aunt', cousin: 'Cousin',
    in_law: 'In-law', parent_in_law: "Spouse's Child", child_in_law: "Child's Spouse",
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
    in_law: 'In-law', parent_in_law: "Spouse's Parent", child_in_law: "Child's Spouse",
    step_parent: 'Step Parent', step_child: 'Step Child',
    adopted_parent: 'Adopted Parent', adopted_child: 'Adopted Child',
    godparent: 'Godparent', godchild: 'Godchild',
  };

  if (selfPersonId) {
    roleLabels.set(selfPersonId, 'Me');
    const relsByPerson = new Map();
    for (const r of relationships) {
      if (!relsByPerson.has(r.person_a_id)) relsByPerson.set(r.person_a_id, []);
      if (!relsByPerson.has(r.person_b_id)) relsByPerson.set(r.person_b_id, []);
      relsByPerson.get(r.person_a_id).push(r);
      relsByPerson.get(r.person_b_id).push(r);
    }
    const visitedLabels = new Set([selfPersonId]);
    const queue = [{ id: selfPersonId, prefix: '' }];
    while (queue.length > 0) {
      const { id: curId, prefix } = queue.shift();
      for (const r of (relsByPerson.get(curId) || [])) {
        let otherId, label;
        if (r.person_a_id === curId && !visitedLabels.has(r.person_b_id)) {
          otherId = r.person_b_id;
          label = inverseLabel[r.relationship_type];
        } else if (r.person_b_id === curId && !visitedLabels.has(r.person_a_id)) {
          otherId = r.person_a_id;
          label = directLabel[r.relationship_type];
        } else continue;
        if (!label || visitedLabels.has(otherId)) continue;
        visitedLabels.add(otherId);
        const fullLabel = prefix ? `${prefix}${label}` : label;
        roleLabels.set(otherId, fullLabel);
        queue.push({ id: otherId, prefix: `${fullLabel}'s ` });
      }
    }
  }

  return { positions, roleLabels, generation, width: graphWidth, height: graphHeight, people, relationships, selfPersonId };
}

// ============================================================
// HTML GENERATION — App-faithful Matra UI
// ============================================================

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateTreeSVG(layout) {
  const { positions, roleLabels, generation, people, relationships, selfPersonId } = layout;
  let svg = '';
  const genColors = ['#6B8F3C', '#8BAF5C', '#C49A3C', '#A0B878', '#8B7355', '#C4665A', '#6B8F3C'];

  svg += `<defs>
    <radialGradient id="nodeGlowG" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#6B8F3C" stop-opacity="0.15"/><stop offset="100%" stop-color="#6B8F3C" stop-opacity="0"/></radialGradient>
    <radialGradient id="selfGlowG" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#C49A3C" stop-opacity="0.25"/><stop offset="100%" stop-color="#C49A3C" stop-opacity="0"/></radialGradient>
  </defs>\n`;

  // Parent-child edges
  for (const r of relationships) {
    const posA = positions.get(r.person_a_id);
    const posB = positions.get(r.person_b_id);
    if (!posA || !posB) continue;
    const type = r.relationship_type;
    const verified = r.verified !== false;
    if (type === 'spouse') {
      const leftX = Math.min(posA.x, posB.x) + NODE_RADIUS;
      const rightX = Math.max(posA.x, posB.x) - NODE_RADIUS;
      svg += `<line x1="${leftX}" y1="${posA.y}" x2="${rightX}" y2="${posB.y}" stroke="#C49A3C" stroke-width="2"/>\n`;
      continue;
    }
    if (type === 'ex_spouse') {
      const leftX = Math.min(posA.x, posB.x) + NODE_RADIUS;
      const rightX = Math.max(posA.x, posB.x) - NODE_RADIUS;
      svg += `<line x1="${leftX}" y1="${posA.y}" x2="${rightX}" y2="${posB.y}" stroke="#C4665A" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.6"/>\n`;
      continue;
    }
    if (['sibling', 'half_sibling', 'step_sibling'].includes(type)) continue;
    const ancestorTypes = ['parent', 'child', 'grandparent', 'grandchild', 'great_grandparent', 'great_grandchild', 'step_parent', 'step_child', 'adopted_parent', 'adopted_child'];
    if (!ancestorTypes.includes(type)) continue;
    if (!['parent', 'child', 'step_parent', 'step_child', 'adopted_parent', 'adopted_child'].includes(type)) {
      const genA = generation.get(r.person_a_id) ?? 0;
      const genB = generation.get(r.person_b_id) ?? 0;
      const minG = Math.min(genA, genB), maxG = Math.max(genA, genB);
      const hasBridge = relationships.some(r2 => {
        if (r2 === r) return false;
        const otherId = r2.person_a_id === r.person_a_id || r2.person_a_id === r.person_b_id ? r2.person_b_id : r2.person_b_id === r.person_a_id || r2.person_b_id === r.person_b_id ? r2.person_a_id : null;
        if (!otherId) return false;
        const otherGen = generation.get(otherId) ?? -999;
        return otherGen > minG && otherGen < maxG;
      });
      if (hasBridge) continue;
    }
    const parent = posA.y < posB.y ? posA : posB;
    const child = posA.y < posB.y ? posB : posA;
    const midY = parent.y + (child.y - parent.y) / 2;
    const color = verified ? 'rgba(107,143,60,0.6)' : 'rgba(107,143,60,0.18)';
    const dash = verified ? '' : 'stroke-dasharray="4 4"';
    svg += `<path d="M ${parent.x} ${parent.y + NODE_RADIUS} L ${parent.x} ${midY} L ${child.x} ${midY} L ${child.x} ${child.y - NODE_RADIUS}" stroke="${color}" stroke-width="2" ${dash} fill="none"/>\n`;
  }

  // Sibling lines
  for (const r of relationships) {
    if (!['sibling', 'half_sibling', 'step_sibling'].includes(r.relationship_type)) continue;
    const posA = positions.get(r.person_a_id);
    const posB = positions.get(r.person_b_id);
    if (!posA || !posB) continue;
    const leftX = Math.min(posA.x, posB.x) + NODE_RADIUS;
    const rightX = Math.max(posA.x, posB.x) - NODE_RADIUS;
    if (leftX >= rightX) continue;
    const sibColor = 'rgba(107,143,60,0.5)';
    const dashAttr = r.relationship_type !== 'sibling' ? 'stroke-dasharray="6 3"' : '';
    svg += `<line x1="${leftX}" y1="${posA.y}" x2="${rightX}" y2="${posB.y}" stroke="${sibColor}" stroke-width="1.5" ${dashAttr}/>\n`;
  }

  // Nodes
  for (const p of people) {
    const pos = positions.get(p.id);
    if (!pos) continue;
    const isSelf = p.id === selfPersonId;
    const initials = (p.first_name?.[0] || '') + (p.last_name?.[0] || '');
    const role = roleLabels.get(p.id) || '';
    const isDeceased = p.metadata?.is_deceased || !!p.death_date;

    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${NODE_RADIUS * 2}" fill="url(#${isSelf ? 'selfGlowG' : 'nodeGlowG'})"/>\n`;
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${NODE_RADIUS}" fill="#FFFFFF" stroke="${isSelf ? '#C49A3C' : '#6B8F3C'}" stroke-width="${isSelf ? 3 : 2}"${isDeceased ? ' opacity="0.6"' : ''}/>\n`;
    svg += `<text x="${pos.x}" y="${pos.y + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="#3B2E1E" font-family="Inter, system-ui">${escapeHtml(initials)}</text>\n`;
    svg += `<text x="${pos.x}" y="${pos.y + NODE_RADIUS + 16}" text-anchor="middle" font-size="12" font-weight="600" fill="#3B2E1E" font-family="Inter, system-ui">${escapeHtml(p.first_name)}</text>\n`;
    if (p.last_name) {
      svg += `<text x="${pos.x}" y="${pos.y + NODE_RADIUS + 29}" text-anchor="middle" font-size="10" fill="#6B5D4F" font-family="Inter, system-ui">${escapeHtml(p.last_name)}</text>\n`;
    }
    if (role) {
      const roleColor = isSelf ? '#C49A3C' : '#6B8F3C';
      const roleY = p.last_name ? pos.y + NODE_RADIUS + 42 : pos.y + NODE_RADIUS + 32;
      svg += `<text x="${pos.x}" y="${roleY}" text-anchor="middle" font-size="9" fill="${roleColor}" font-weight="600" text-transform="uppercase" font-family="Inter, system-ui">${escapeHtml(role)}</text>\n`;
    }
    if (isDeceased) {
      svg += `<text x="${pos.x + NODE_RADIUS - 4}" y="${pos.y - NODE_RADIUS + 10}" text-anchor="middle" font-size="10" fill="#C4665A">✝</text>\n`;
    }
  }

  return svg;
}

function generateHTML(db, layout, assertions) {
  const { people, relationships: rels, stories, interviewResults } = db;
  const treeSvg = generateTreeSVG(layout);

  // Self person for the tree
  const selfPerson = people.find(p =>
    normalize(p.first_name) === 'carlos' && normalize(p.last_name || '').includes('bueso')
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Matra — Stress Test App Preview</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #EDE6D8; color: #3B2E1E; }

  .page-header {
    background: #F7F2EA; border-bottom: 1px solid rgba(139,115,85,0.15); padding: 20px 32px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .page-header h1 { font-family: 'Space Grotesk', sans-serif; font-size: 28px; color: #3B2E1E; }
  .page-header .subtitle { color: #6B5D4F; font-size: 14px; margin-top: 2px; }
  .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .badge-green { background: rgba(107,143,60,0.12); color: #6B8F3C; }
  .badge-amber { background: rgba(196,154,60,0.12); color: #C49A3C; }
  .badge-red { background: rgba(196,102,90,0.12); color: #C4665A; }

  .stats-bar {
    display: flex; gap: 24px; padding: 16px 32px; background: #F7F2EA;
    border-bottom: 1px solid rgba(139,115,85,0.1); flex-wrap: wrap;
  }
  .stat-item { text-align: center; }
  .stat-num { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 700; color: #6B8F3C; }
  .stat-label { font-size: 11px; color: #9B8E7E; text-transform: uppercase; letter-spacing: 0.5px; }

  /* Tab Navigation mimicking Matra's bottom tabs */
  .app-tabs {
    display: flex; gap: 0; background: #FFFFFF; border-bottom: 1px solid rgba(139,115,85,0.1);
    position: sticky; top: 0; z-index: 100;
  }
  .app-tab {
    flex: 1; padding: 14px 8px; text-align: center; cursor: pointer; border: none; background: none;
    font-size: 12px; font-weight: 500; color: #9B8E7E; transition: all 0.2s;
    border-bottom: 3px solid transparent; font-family: 'Inter', system-ui, sans-serif;
  }
  .app-tab:hover { color: #6B5D4F; }
  .app-tab.active { color: #6B8F3C; border-bottom-color: #6B8F3C; }
  .app-tab .tab-icon { font-size: 20px; display: block; margin-bottom: 2px; }

  .tab-panel { display: none; }
  .tab-panel.active { display: block; }

  /* ── Tree Tab ── */
  .tree-container {
    padding: 16px; overflow: auto; background: #F7F2EA;
    min-height: 500px; position: relative;
  }
  .tree-container svg { display: block; margin: 0 auto; }
  .tree-controls {
    display: flex; gap: 8px; padding: 8px 16px; background: #FFFFFF;
    border-bottom: 1px solid rgba(139,115,85,0.08);
  }
  .tree-controls button {
    background: #F0EADE; border: 1px solid rgba(139,115,85,0.12); border-radius: 8px;
    padding: 6px 14px; cursor: pointer; font-size: 12px; color: #6B5D4F;
    font-family: 'Inter', system-ui, sans-serif; transition: all 0.15s;
  }
  .tree-controls button:hover { background: #E5DDD0; }

  /* ── People Tab ── */
  .people-grid { padding: 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
  .person-card {
    background: #FFFFFF; border-radius: 20px; padding: 16px; border: 1px solid rgba(139,115,85,0.08);
    box-shadow: 0 1px 6px rgba(139,115,85,0.06); display: flex; gap: 12px; align-items: flex-start;
    transition: transform 0.1s;
  }
  .person-card:hover { transform: scale(0.995); }
  .person-card.deceased { opacity: 0.7; }
  .person-avatar {
    width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center;
    justify-content: center; font-weight: 700; font-size: 16px; flex-shrink: 0;
    border: 2px solid #6B8F3C; background: #F0EADE; color: #6B8F3C;
  }
  .person-avatar.self { border-color: #C49A3C; color: #C49A3C; }
  .person-info { flex: 1; min-width: 0; }
  .person-name { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; color: #3B2E1E; }
  .person-role { font-size: 11px; font-weight: 600; color: #6B8F3C; text-transform: uppercase; letter-spacing: 0.5px; }
  .person-role.self-role { color: #C49A3C; }
  .person-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .chip {
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px;
    border-radius: 16px; background: #F0EADE; font-size: 11px; color: #6B5D4F;
  }

  /* ── Stories Tab ── */
  .stories-list { padding: 16px; display: grid; gap: 12px; }
  .story-card {
    background: #FFFFFF; border-radius: 20px; padding: 20px;
    border: 1px solid rgba(107,143,60,0.18); box-shadow: 0 4px 16px rgba(139,115,85,0.15);
  }
  .story-badge { font-size: 10px; font-weight: 600; color: #8BAF5C; background: rgba(107,143,60,0.12); padding: 2px 8px; border-radius: 12px; display: inline-block; margin-bottom: 8px; }
  .story-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 20px; color: #3B2E1E; margin-bottom: 8px; }
  .story-meta { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .story-meta .chip { background: rgba(107,143,60,0.08); }
  .story-content { font-size: 14px; line-height: 1.75; color: #6B5D4F; }

  /* ── Interviews Tab ── */
  .interviews-list { padding: 16px; display: grid; gap: 16px; }
  .interview-card {
    background: #FFFFFF; border-radius: 20px; padding: 20px;
    border: 1px solid rgba(139,115,85,0.08); box-shadow: 0 1px 6px rgba(139,115,85,0.06);
  }
  .interview-header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .interview-icon { width: 44px; height: 44px; border-radius: 50%; background: rgba(107,143,60,0.12); display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .interview-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 18px; color: #3B2E1E; }
  .interview-stats { font-size: 12px; color: #9B8E7E; }
  .interview-transcript {
    background: #F7F2EA; border-radius: 12px; padding: 16px; margin-top: 12px;
    font-size: 13px; line-height: 1.8; color: #6B5D4F; max-height: 200px; overflow-y: auto;
    border: 1px solid rgba(139,115,85,0.08);
  }
  .interview-extraction { margin-top: 12px; }
  .extraction-table {
    width: 100%; border-collapse: collapse; font-size: 12px;
  }
  .extraction-table th {
    background: #F0EADE; color: #6B5D4F; padding: 8px 12px; text-align: left;
    font-weight: 600; border-bottom: 1px solid rgba(139,115,85,0.12);
  }
  .extraction-table td {
    padding: 6px 12px; border-bottom: 1px solid rgba(139,115,85,0.06); color: #3B2E1E;
  }
  .extraction-table code { background: rgba(107,143,60,0.08); padding: 2px 6px; border-radius: 4px; font-size: 11px; color: #6B8F3C; }

  /* ── Relationships Tab ── */
  .rels-container { padding: 16px; }
  .rel-group { margin-bottom: 16px; }
  .rel-group-header {
    font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px;
    color: #6B8F3C; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 0;
    border-bottom: 1px solid rgba(107,143,60,0.15); margin-bottom: 8px;
  }
  .rel-row {
    display: flex; align-items: center; gap: 8px; padding: 6px 12px;
    background: #FFFFFF; border-radius: 10px; margin-bottom: 4px; font-size: 13px;
    border: 1px solid rgba(139,115,85,0.06);
  }
  .rel-row.inferred { background: rgba(196,154,60,0.04); border-left: 3px solid #C49A3C; }
  .rel-arrow { color: #9B8E7E; font-size: 16px; }

  /* ── Assertions Tab ── */
  .assertions-container { padding: 16px; }
  .assertion-section { margin-bottom: 16px; }
  .assertion-section h3 { font-family: 'Space Grotesk', sans-serif; font-size: 16px; color: #3B2E1E; margin-bottom: 8px; }
  .assertion-item { padding: 6px 12px; border-radius: 8px; margin-bottom: 3px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
  .assertion-pass { background: rgba(107,143,60,0.06); }
  .assertion-fail { background: rgba(196,102,90,0.08); }
  .assertion-warn { background: rgba(196,154,60,0.06); }

  details summary { cursor: pointer; font-weight: 500; color: #6B5D4F; padding: 8px 0; }
  details summary:hover { color: #3B2E1E; }

  .legend {
    display: flex; gap: 16px; padding: 8px 16px; background: #FFFFFF; border-bottom: 1px solid rgba(139,115,85,0.08);
    font-size: 11px; color: #9B8E7E; flex-wrap: wrap; align-items: center;
  }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 4px; }
  .legend-line { width: 20px; height: 2px; display: inline-block; margin-right: 4px; }
</style>
</head>
<body>

<!-- Header -->
<div class="page-header">
  <div>
    <h1>🌿 Matra — Stress Test Results</h1>
    <div class="subtitle">${interviewResults.length} interviews · ${people.length} people · ${rels.length} relationships · ${stories.length} stories</div>
  </div>
  <div>
    <span class="badge ${assertions.failed === 0 ? 'badge-green' : 'badge-red'}">
      ${assertions.failed === 0 ? '✓ ALL PASSED' : assertions.failed + ' FAILED'}
    </span>
    <span class="badge badge-amber">${assertions.warnings} warnings</span>
  </div>
</div>

<!-- Stats Bar -->
<div class="stats-bar">
  <div class="stat-item"><div class="stat-num">${people.length}</div><div class="stat-label">People</div></div>
  <div class="stat-item"><div class="stat-num">${rels.filter(r => !r.inferred).length}</div><div class="stat-label">Direct Rels</div></div>
  <div class="stat-item"><div class="stat-num">${rels.filter(r => r.inferred).length}</div><div class="stat-label">Inferred Rels</div></div>
  <div class="stat-item"><div class="stat-num">${stories.length}</div><div class="stat-label">Stories</div></div>
  <div class="stat-item"><div class="stat-num">${interviewResults.reduce((s, i) => s + i.timeSeconds, 0).toFixed(1)}s</div><div class="stat-label">Total Time</div></div>
  <div class="stat-item"><div class="stat-num">${new Set(rels.map(r => r.relationship_type)).size}</div><div class="stat-label">Rel Types</div></div>
  <div class="stat-item"><div class="stat-num">${assertions.passed}/${assertions.passed + assertions.failed + assertions.warnings}</div><div class="stat-label">Pass Rate</div></div>
</div>

<!-- App-style Tab Navigation -->
<div class="app-tabs">
  <button class="app-tab active" onclick="showTab('tree')"><span class="tab-icon">🌳</span>Lineage</button>
  <button class="app-tab" onclick="showTab('people')"><span class="tab-icon">👥</span>People</button>
  <button class="app-tab" onclick="showTab('stories')"><span class="tab-icon">📖</span>Stories</button>
  <button class="app-tab" onclick="showTab('interviews')"><span class="tab-icon">🎙️</span>Interviews</button>
  <button class="app-tab" onclick="showTab('relationships')"><span class="tab-icon">🔗</span>Relationships</button>
  <button class="app-tab" onclick="showTab('assertions')"><span class="tab-icon">🧪</span>Tests</button>
</div>

<!-- ═══════════ TREE TAB ═══════════ -->
<div class="tab-panel active" id="tab-tree">
  <div class="legend">
    <span><span class="legend-dot" style="border: 2px solid #C49A3C; background: #FFF;"></span> Self (narrator)</span>
    <span><span class="legend-dot" style="border: 2px solid #6B8F3C; background: #FFF;"></span> Family member</span>
    <span><span class="legend-line" style="background: #C49A3C;"></span> Spouse</span>
    <span><span class="legend-line" style="background: #C4665A; border-top: 1.5px dashed #C4665A; height: 0;"></span> Ex-Spouse</span>
    <span><span class="legend-line" style="background: rgba(107,143,60,0.6);"></span> Parent→Child</span>
  </div>
  <div class="tree-controls">
    <button onclick="zoomTree(1.2)">🔍+ Zoom In</button>
    <button onclick="zoomTree(0.8)">🔍− Zoom Out</button>
    <button onclick="treeScale=1;applyTreeScale()">↺ Reset</button>
  </div>
  <div class="tree-container" id="tree-container">
    <svg width="${layout.width}" height="${layout.height}" xmlns="http://www.w3.org/2000/svg" style="background: #F7F2EA;">
      ${treeSvg}
    </svg>
  </div>
</div>

<!-- ═══════════ PEOPLE TAB ═══════════ -->
<div class="tab-panel" id="tab-people">
  <div class="people-grid">
    ${people.map(p => {
      const isSelf = p.id === selfPerson?.id;
      const role = layout.roleLabels.get(p.id) || '';
      const isDeceased = p.metadata?.is_deceased || !!p.death_date;
      const initials = (p.first_name?.[0] || '') + (p.last_name?.[0] || '');
      const name = `${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`;
      const chips = [];
      if (p.birth_date) chips.push(`🎂 ${p.birth_date}`);
      if (p.death_date) chips.push(`🕊️ ${p.death_date}`);
      if (p.birth_place) chips.push(`📍 ${p.birth_place}`);
      if (p.current_location) chips.push(`🏠 ${p.current_location}`);
      if (p.metadata?.profession) chips.push(`💼 ${p.metadata.profession}`);
      if (p.metadata?.gender) chips.push(`👤 ${p.metadata.gender}`);
      if (isDeceased && !p.death_date) chips.push('🕊️ Deceased');
      return `
      <div class="person-card${isDeceased ? ' deceased' : ''}">
        <div class="person-avatar${isSelf ? ' self' : ''}">${escapeHtml(initials)}</div>
        <div class="person-info">
          <div class="person-name">${escapeHtml(name)}${p.nickname ? ' <span style="color:#9B8E7E;font-weight:400;font-size:13px">— "${escapeHtml(p.nickname)}"</span>' : ''}</div>
          ${role ? `<div class="person-role${isSelf ? ' self-role' : ''}">${escapeHtml(role)}</div>` : ''}
          <div class="person-chips">${chips.map(c => `<span class="chip">${c}</span>`).join('')}</div>
        </div>
      </div>`;
    }).join('')}
  </div>
</div>

<!-- ═══════════ STORIES TAB ═══════════ -->
<div class="tab-panel" id="tab-stories">
  <div class="stories-list">
    ${stories.map(s => `
    <div class="story-card">
      <div class="story-badge">✨ AI-crafted</div>
      <div class="story-title">${escapeHtml(s.title)}</div>
      <div class="story-meta">
        ${(s.involvedPeople || []).map(p => `<span class="chip">👤 ${escapeHtml(p)}</span>`).join('')}
        ${s.location ? `<span class="chip">📍 ${escapeHtml(s.location)}</span>` : ''}
        ${s.approximateDate ? `<span class="chip">📅 ${escapeHtml(s.approximateDate)}</span>` : ''}
        <span class="chip">📖 ${escapeHtml(s.source || '')}</span>
      </div>
      <div class="story-content">${escapeHtml(typeof s.content === 'string' ? s.content : JSON.stringify(s.content)).substring(0, 500)}${(typeof s.content === 'string' && s.content.length > 500) ? '...' : ''}</div>
    </div>`).join('')}
  </div>
</div>

<!-- ═══════════ INTERVIEWS TAB ═══════════ -->
<div class="tab-panel" id="tab-interviews">
  <div class="interviews-list">
    ${interviewResults.map((ir, idx) => `
    <div class="interview-card">
      <div class="interview-header">
        <div class="interview-icon">🎙️</div>
        <div>
          <div class="interview-title">${escapeHtml(ir.label)}</div>
          <div class="interview-stats">
            ⏱️ ${ir.timeSeconds}s · 🌐 ${ir.language.toUpperCase()} ·
            👥 ${ir.extraction?.suggestedPeople?.length || 0} people ·
            🔗 ${ir.newRelationships?.length || 0} direct + ${ir.inferredRelationships?.length || 0} inferred ·
            📖 ${ir.summary?.suggestedStories?.length || 0} stories ·
            📊 Cumulative: ${ir.peopleCountAfter} ppl / ${ir.relCountAfter} rels
          </div>
        </div>
      </div>
      <details>
        <summary>📝 Transcript</summary>
        <div class="interview-transcript">${escapeHtml(ir.transcript)}</div>
      </details>
      <details class="interview-extraction">
        <summary>🔍 Extracted Relationships (${ir.extraction?.relationships?.length || 0})</summary>
        <table class="extraction-table">
          <tr><th>Person A</th><th>→</th><th>Person B</th><th>Type</th><th>Confidence</th></tr>
          ${(ir.extraction?.relationships || []).map(r => `
          <tr>
            <td>${escapeHtml(r.personA)}</td>
            <td style="color:#9B8E7E">→</td>
            <td>${escapeHtml(r.personB)}</td>
            <td><code>${escapeHtml(r.relationshipType)}</code></td>
            <td>${Math.round((r.confidence || 0) * 100)}%</td>
          </tr>`).join('')}
        </table>
      </details>
      <details class="interview-extraction">
        <summary>👥 Extracted People (${ir.extraction?.suggestedPeople?.length || 0})</summary>
        <table class="extraction-table">
          <tr><th>Name</th><th>Birth</th><th>Place</th><th>Profession</th><th>Gender</th></tr>
          ${(ir.extraction?.suggestedPeople || []).map(p => `
          <tr>
            <td>${escapeHtml(p.firstName)}${p.lastName ? ' ' + escapeHtml(p.lastName) : ''}</td>
            <td>${escapeHtml(p.birthDate || '')}</td>
            <td>${escapeHtml(p.birthPlace || '')}</td>
            <td>${escapeHtml(p.profession || '')}</td>
            <td>${escapeHtml(p.gender || '')}</td>
          </tr>`).join('')}
        </table>
      </details>
    </div>`).join('')}
  </div>
</div>

<!-- ═══════════ RELATIONSHIPS TAB ═══════════ -->
<div class="tab-panel" id="tab-relationships">
  <div class="rels-container">
    ${(() => {
      const byType = {};
      for (const r of rels) {
        if (!byType[r.relationship_type]) byType[r.relationship_type] = [];
        byType[r.relationship_type].push(r);
      }
      return Object.entries(byType).sort((a, b) => a[0].localeCompare(b[0])).map(([type, typeRels]) => `
        <div class="rel-group">
          <div class="rel-group-header">${escapeHtml(type)} (${typeRels.length})</div>
          ${typeRels.map(r => {
            const pA = people.find(p => p.id === r.person_a_id);
            const pB = people.find(p => p.id === r.person_b_id);
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

<!-- ═══════════ ASSERTIONS TAB ═══════════ -->
<div class="tab-panel" id="tab-assertions">
  <div class="assertions-container">
    <div style="display: flex; gap: 16px; margin-bottom: 16px;">
      <span class="badge badge-green">✅ ${assertions.passed} Passed</span>
      <span class="badge badge-red">❌ ${assertions.failed} Failed</span>
      <span class="badge badge-amber">⚠️ ${assertions.warnings} Warnings</span>
    </div>
    ${assertions.errors.length > 0 ? `
    <div class="assertion-section">
      <h3>❌ Failures</h3>
      ${assertions.errors.map(e => `<div class="assertion-item assertion-fail">✗ ${escapeHtml(e)}</div>`).join('')}
    </div>` : ''}
    ${assertions.warns.length > 0 ? `
    <div class="assertion-section">
      <h3>⚠️ Warnings</h3>
      ${assertions.warns.map(w => `<div class="assertion-item assertion-warn">⚠ ${escapeHtml(w)}</div>`).join('')}
    </div>` : ''}
    <div class="assertion-section">
      <h3>📊 Summary</h3>
      <div class="assertion-item assertion-pass">Pass rate: ${((assertions.passed / (assertions.passed + assertions.failed + assertions.warnings)) * 100).toFixed(1)}%</div>
    </div>
  </div>
</div>

<script>
  let treeScale = 1;

  function showTab(name) {
    document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + name).classList.add('active');
    const tabs = document.querySelectorAll('.app-tab');
    const tabNames = ['tree', 'people', 'stories', 'interviews', 'relationships', 'assertions'];
    tabs[tabNames.indexOf(name)].classList.add('active');
  }

  function zoomTree(factor) {
    treeScale = Math.min(Math.max(treeScale * factor, 0.2), 4);
    applyTreeScale();
  }

  function applyTreeScale() {
    const svg = document.querySelector('#tree-container svg');
    if (svg) svg.style.transform = 'scale(' + treeScale + ')';
    svg.style.transformOrigin = '0 0';
  }

  document.querySelector('#tree-container')?.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomTree(e.deltaY > 0 ? 0.9 : 1.1);
  }, { passive: false });
</script>

</body>
</html>`;

  return html;
}

// ============================================================
// Main
// ============================================================

async function main() {
  const startTime = Date.now();
  const provider = GROQ_API_KEY ? 'Groq (Llama 3.3 70B)' : 'OpenAI (GPT-4o-mini)';

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║   Matra — Full Pipeline Stress Test                     ║');
  console.log('║   with App UI Visualization                             ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║   4 narrators · EN/ES bilingual · multi-generational    ║');
  console.log('║   Tests: extraction, dedup, inference, stories, layout  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  Provider: ${provider}`);
  console.log(`  Interviews: ${INTERVIEWS.length}`);
  console.log(`  Narrators: ${INTERVIEWS.map(i => i.narrator.firstName).join(' → ')}\n`);

  const db = new SimulatedDB();

  // Process each interview sequentially
  for (let i = 0; i < INTERVIEWS.length; i++) {
    await processInterview(INTERVIEWS[i], db);
    console.log(`  ──── After ${INTERVIEWS[i].narrator.firstName}: ${db.people.length} people, ${db.relationships.length} rels ────`);
  }

  // Run assertions
  const assertionResults = runAssertions(db);

  // Find Carlos as the self person for tree layout
  const selfPerson = db.people.find(p =>
    normalize(p.first_name) === 'carlos' && normalize(p.last_name || '').includes('bueso')
  );

  // Convert DB format to layout format
  const layoutPeople = db.people.map(p => ({
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    nickname: p.nickname,
    birth_date: p.birth_date,
    death_date: p.death_date,
    metadata: p.metadata,
  }));

  const layoutRels = db.relationships.map(r => ({
    person_a_id: r.person_a_id,
    person_b_id: r.person_b_id,
    relationship_type: r.relationship_type,
    verified: !r.inferred,
  }));

  console.log('\n  ⏳ Computing tree layout...');
  const layout = layoutTree(layoutPeople, layoutRels, selfPerson?.id);
  console.log(`  ✅ Layout computed — canvas ${layout.width.toFixed(0)}×${layout.height.toFixed(0)}`);

  // Check for overlaps
  const positioned = [...layout.positions.entries()];
  let overlapCount = 0;
  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      const [, posA] = positioned[i];
      const [, posB] = positioned[j];
      const dist = Math.sqrt((posA.x - posB.x) ** 2 + (posA.y - posB.y) ** 2);
      if (dist < NODE_RADIUS * 2 + 10) overlapCount++;
    }
  }
  console.log(`  ${overlapCount === 0 ? '✅' : '❌'} Tree overlaps: ${overlapCount}`);

  // Generate HTML
  const html = generateHTML(db, layout, assertionResults);
  const htmlPath = path.join(__dirname, 'test-stress-app-output.html');
  fs.writeFileSync(htmlPath, html, 'utf-8');

  // Dump debug JSON
  const debugPath = path.join(__dirname, 'test-stress-app-debug.json');
  fs.writeFileSync(debugPath, JSON.stringify({
    provider,
    totalTimeSeconds: parseFloat(((Date.now() - startTime) / 1000).toFixed(1)),
    interviews: db.interviewResults,
    finalPeople: db.people,
    finalRelationships: db.relationships,
    finalStories: db.stories,
    assertions: assertionResults,
    treeLayout: {
      width: layout.width,
      height: layout.height,
      positions: Object.fromEntries(layout.positions),
      roleLabels: Object.fromEntries(layout.roleLabels),
      generations: Object.fromEntries(layout.generation),
      overlaps: overlapCount,
    },
  }, null, 2), 'utf-8');

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '═'.repeat(60));
  console.log(`  ✅ All ${INTERVIEWS.length} interviews processed in ${totalTime}s`);
  console.log(`  📊 Final: ${db.people.length} people, ${db.relationships.length} rels, ${db.stories.length} stories`);
  console.log(`  🌳 Tree: ${overlapCount} overlaps, ${layout.width.toFixed(0)}×${layout.height.toFixed(0)} canvas`);
  console.log(`  📄 HTML: ${htmlPath}`);
  console.log(`  🔍 JSON: ${debugPath}`);
  console.log('═'.repeat(60) + '\n');

  if (assertionResults.failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

#!/usr/bin/env node
// ============================================================
// MATRA — Comprehensive Relationship Extraction Test Suite
// ============================================================
// Run: node test-relationship-extraction.mjs
//
// Tests the AI model's ability to extract family relationships
// from transcripts with extreme precision. Covers every
// relationship type, edge case, and ambiguity — in both
// English and Spanish.
//
// 10 Test scenarios organized by difficulty:
//   1. EN — Nuclear family basics
//   2. ES — Nuclear family basics
//   3. EN — Blended family (divorce, remarriage, step/half)
//   4. ES — Blended family (divorce, remarriage, step/half)
//   5. EN — In-laws, multi-generational
//   6. ES — In-laws, multi-generational
//   7. EN — Adoption, godparents, ambiguous references
//   8. ES — Adoption, godparents, ambiguous references
//   9. EN — Extreme: 5 generations, naming collisions, possessive chains
//  10. ES — Extreme: 5 generations, naming collisions, possessive chains
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env from .env.local ──
// Try tests/.env.local first, then backend/.env.local
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
   - birthDate: ISO date string (optional, only if explicitly mentioned — e.g. "born on March 5, 1990" → "1990-03-05", "born in 1965" → "1965")
   - deathDate: ISO date string (optional, only if explicitly mentioned)
   - birthPlace: string (optional — city, country, or region)
   - currentLocation: string (optional — where they live now)
   - profession: string (optional — job, career, occupation)
   - isDeceased: boolean (optional)
   - gender: "male" | "female" | null (IMPORTANT — actively infer gender from ALL available clues. Set this for EVERY person when possible. Clues include: gendered kinship terms (hermana→female, hermano→male, madre/mom/mother→female, padre/dad/father→male, hijo/son→male, hija/daughter→female, tío/uncle→male, tía/aunt→female, abuelo/grandfather→male, abuela/grandmother→female, esposo/husband→male, esposa/wife→female), gendered adjectives in Spanish (nacido→male, nacida→female, casado→male, casada→female), pronouns (he/him→male, she/her→female, él→male, ella→female), and culturally gendered names. Only set null if truly ambiguous.)

Rules:
- Be conservative with confidence scores. Only use 0.9+ when explicitly stated.
- Extract ALL relationships that are stated or strongly implied. Possessive references like "my mom", "my dad", "my brother", "my wife" are EXPLICIT statements of relationship — extract them with high confidence (0.9+).
- When someone says "my parents" or refers to someone as a parent figure (mom, dad, mother, father, mama, papa, etc.), ALWAYS create a parent relationship.
- When someone says "my [relation]" (brother, sister, uncle, aunt, cousin, grandma, grandpa, great-grandma, great-grandpa, etc.), ALWAYS extract that relationship.
- Multi-generational references: "my grandma's mother" or "my great-grandmother" → use "great_grandparent". "My great-grandmother's mother" or "my great-great-grandmother" → use "great_great_grandparent". Apply the same logic for grandchildren going downward.
- LINEAGE CHAINS (CRITICAL for tree placement): When extracting multi-generational relationships (grandparent, great_grandparent, uncle_aunt, etc.), ALSO create intermediate parent/sibling links so the family tree knows which side they belong to. Examples:
  - "my dad's mom María" → create THREE relationships: (1) María is grandparent of [narrator], (2) María is parent of [dad's name], (3) [dad's name] is parent of [narrator]
  - "my mom's brother José" → create THREE relationships: (1) José is uncle_aunt of [narrator], (2) José is sibling of [mom's name], (3) [mom's name] is parent of [narrator]
  - "my grandpa's father" → create: (1) [person] is great_grandparent of [narrator], (2) [person] is parent of [grandpa's name], (3) [grandpa's name] is grandparent of [narrator]
  - When the intermediate person (parent, grandparent) is already known by name, use their name. When not named, skip the intermediate links rather than guessing.
  - This ensures ancestors are placed on the correct maternal/paternal side of the tree.
- MULTILINGUAL SUPPORT: The interview may be in ANY language. Recognize kinship terms in all languages, especially Spanish:
  - Parents: papá, mamá, padre, madre, papi, mami, pa, ma
  - Siblings: hermano, hermana
  - Half/step siblings: medio hermano, media hermana, medio(a) hermano(a), hermanastro, hermanastra
  - Grandparents: abuelo, abuela, abuelito, abuelita
  - Great-grandparents: bisabuelo, bisabuela → use "great_grandparent" relationship type
  - Great-great-grandparents: tatarabuelo, tatarabuela → use "great_great_grandparent" relationship type
  - Uncle/aunt: tío, tía
  - Cousin: primo, prima
  - Spouse: esposo, esposa, marido, mujer
  - Ex-spouse: ex esposo, ex esposa, ex marido, ex mujer, "se divorciaron", "divorced", "separated" → use "ex_spouse" relationship type
  - Child: hijo, hija
  - "mi papá" = "my dad", "mi mamá" = "my mom", "mi hermano" = "my brother", etc.
  - "medio hermano" or "media hermana" = half sibling → use "half_sibling" relationship type.
  - "hermanastro" or "hermanastra" = step sibling → use "step_sibling" relationship type.
  - CRITICAL for half-siblings: when the narrator specifies WHICH PARENT the half-sibling comes from (e.g., "medio hermano de parte de mi mamá", "half-brother on my mom's side", "my dad's son from his second marriage"), you MUST extract a parent relationship between that parent and the half-sibling.
    Examples:
    * "tengo un medio hermano de parte de mi mamá que se llama Cristian" → create TWO relationships: (1) Cristian is half_sibling of [narrator], AND (2) [mother's name] is parent of Cristian.
    * "my dad Michael had a son Ryan with his ex-wife Jennifer" or "my half-brother Ryan on my dad's side" → create: (1) Ryan is half_sibling of [narrator], AND (2) Michael is parent of Ryan.
    * "medio hermano de parte de mi papá" → create: (1) half_sibling of [narrator], AND (2) [father's name] is parent of the half-sibling.
    This parent link is ESSENTIAL for placing the half-sibling on the correct side of the family tree. Never skip it.
  - In-laws: suegro, suegra → use "parent_in_law" relationship type. nuero, nuera, yerno → use "child_in_law" relationship type. "cuñado", "cuñada" (brother/sister-in-law) → use "in_law" relationship type.
  - English in-laws: "father-in-law", "mother-in-law" → use "parent_in_law". "son-in-law", "daughter-in-law" → use "child_in_law". "brother-in-law", "sister-in-law" → use "in_law".
  - CRITICAL IN-LAW RULE: When the transcript EXPLICITLY uses an in-law term (suegro, suegra, cuñado, cuñada, father-in-law, mother-in-law, brother-in-law, sister-in-law), you MUST create the in-law relationship IN ADDITION to any parent/sibling links.
    Examples:
    * "Don Takeshi es el suegro de mi papá Rodrigo" → create BOTH: (1) Takeshi parent of Keiko, AND (2) Takeshi parent_in_law of Rodrigo
    * "María Elena es su suegra" → create parent_in_law between María Elena and Rodrigo
    * "Yuki es la cuñada de mi papá" → create BOTH: (1) Yuki sibling of Keiko, AND (2) Yuki in_law of Rodrigo
    * "My father-in-law John" → create parent_in_law between John and the speaker's spouse
    Do NOT skip the in-law relationship just because you already captured the underlying family structure.
  Treat all such kinship terms with the SAME confidence as their English equivalents.
- Deduplicate people (e.g., "Grandma Rose" and "Rose" are likely the same person).
- NAMES — do NOT include honorifics (Don, Doña, Señor, Señora, Sr., Sra., Mr., Mrs., Ms., Miss, Sir, etc.) in firstName or lastName. Strip them. Example: "Don Fernando Morales" → firstName: "Fernando", lastName: "Morales". "Doña Rosa Herrera" → firstName: "Rosa", lastName: "Herrera".
- NICKNAMES: When someone is referred to by a nickname ("everyone called her Maggie", "todos le dicen Isa", "le dicen Pepe"), ALWAYS set the nickname field. The firstName should be the formal name, nickname should be the informal one.
- DECEASED & PROFESSION: When someone is described as having died/passed away/"falleció"/"murió"/"en paz descanse", ALWAYS set isDeceased: true AND set deathDate if a year is given. When a profession/job/occupation is mentioned, ALWAYS set the profession field.
- Dates should be in ISO 8601 format when possible.
- If a year is mentioned without month/day, use ONLY the "YYYY" format (e.g., "1968"). Do NOT add "-01-01" or any month/day. "born in 1968" → birthDate: "1968", NOT "1968-01-01". "born in the year 97" or "nació en el 97" → birthDate: "1997".
- When ages are given relative to today instead of birth years (e.g., "tiene seis años", "is ten years old"), calculate the approximate birth year. The current year is 2026. Examples:
  - "is four years old" or "tiene cuatro años" → birthDate: "2022"
  - "has two years" or "tiene dos años" → birthDate: "2024"
  - "is ten years old" or "tiene diez años" → birthDate: "2016"
  - "tiene cinco años" → birthDate: "2021"
  - "tiene tres años" → birthDate: "2023"
  - "is twenty-two" or "tiene veintidós años" → birthDate: "2004"
  Formula: birthDate = 2026 - age. ALWAYS set birthDate when an age is mentioned. Use "YYYY" format.
- Make sure to include the narrator/subject in relationships — if the narrator says "my mom is Rosa", create a relationship between Rosa and the narrator.

CRITICAL — suggestedPeople completeness:
- EVERY person referenced in "relationships" (personA or personB) MUST also appear in "suggestedPeople". Do NOT reference a person in a relationship without adding them to suggestedPeople first.
- When a person is mentioned but NOT named (e.g., "my older brother", "un hermano mayor", "a younger sister"), still add them to suggestedPeople using a descriptive firstName (e.g., firstName: "Hermano Mayor", or firstName: "Unnamed Older Brother") and a low confidence score. Use the SAME descriptive name in the corresponding relationship entries.
- When someone's children are mentioned (e.g., "his children are named X and Y"), the relationship is parent→child between THAT person and the children — NOT between the narrator and those children.
  Examples:
  * "my half-brother David has children named Emma and Lucas" → David is parent of Emma AND David is parent of Lucas. David is half_sibling of narrator. Emma/Lucas are NOT siblings of the narrator.
  * "mi tía Rosa tiene dos hijos, Andrés y Valentina" → Rosa is parent of Andrés AND Rosa is parent of Valentina. Andrés and Valentina are cousins of the narrator.
  * "my uncle has three kids" → uncle is parent of each kid.
  ALWAYS create the parent→child link for the person whose children/kids/hijos are being described.
- Pay careful attention to possessive chains: "his/her/their children", "sus hijos", "tienen dos hijos" refers to the LAST mentioned person's children, not the narrator's.
- Do NOT confuse the narrator with other people who share the same first name. If the narrator is "John Test" and his father is "John William Smith", these are two DIFFERENT people. Always use full names to disambiguate.
- SAME-NAME DISAMBIGUATION: When multiple people share the same first name (e.g., grandfather and grandson named after him), create SEPARATE entries in suggestedPeople with different full names, birth dates, or suffixes (Jr., Sr., III, etc.). Never merge two distinct people just because they share a first name.
- ADOPTION: When someone is described as adopted ("was adopted", "adoptive father/mother", "padre/madre adoptivo/a", "fue adoptado"), use "adopted_parent" for the adoptive parents and "adopted_child" for the adopted person. For adopted siblings, use "sibling" (there is NO "adopted_sibling" type). Also create the parent→child link: if "my parents adopted my sister Hope", create both (1) Hope sibling of narrator AND (2) adopted_parent relationships between each parent and Hope.
- FIGURATIVE LANGUAGE: Phrases like "is like a brother", "como un hermano", "is like family" are NOT actual relationships. Do NOT create sibling/family relationships from figurative comparisons. Only extract ACTUAL family relationships.

Respond with a JSON object matching the schema above. No other text.`;

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
// Utilities
// ============================================================

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function stripHonorifics(name) {
  return name.replace(/\b(don|doña|dona|señor|señora|sr\.?|sra\.?|mr\.?|mrs\.?|ms\.?|miss)\s+/gi, '').trim();
}

// ============================================================
// TEST SCENARIOS
// ============================================================
// Each scenario has:
//   name, language, narrator, transcript, existingPeople,
//   assertions: function(extraction, people, relationships) → results
// ============================================================

const SCENARIOS = [];

// ────────────────────────────────────────────────────────────
// SCENARIO 1: English — Nuclear Family Basics
// ────────────────────────────────────────────────────────────
// Tests: parent, child, sibling, spouse, year-only dates,
//        gender inference, profession extraction
// Family: The Williams family (8 people, 3 generations)
//
// Gen 1: Robert Williams (b.1940, d.2018, farmer, Iowa) + Margaret "Maggie" O'Brien (b.1943, nurse)
// Gen 2: David Williams (b.1968, teacher) + Karen Park (b.1970, accountant)
//        Thomas Williams (b.1972, David's brother)
// Gen 3: NARRATOR: Sarah Williams (female, b.1995, NYC)
//        James Williams (b.1993, Sarah's brother, doctor)
//        Emily Williams (b.1999, Sarah's sister)
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '1. EN — Nuclear Family Basics',
  language: 'en',
  narrator: { firstName: 'Sarah', lastName: 'Williams', gender: 'female' },
  existingPeople: [],
  transcript: `My name is Sarah Williams, I was born in 1995 in New York City. I'm a woman.

My dad is David Williams, he was born in 1968 in Des Moines, Iowa. He's a high school teacher. My mom is Karen Park, she was born in 1970 in Chicago. She's an accountant. My parents got married in 1992.

I have an older brother named James Williams, born in 1993. James is a doctor, he works at Mount Sinai Hospital. I also have a younger sister, Emily, she was born in 1999. Emily is still in grad school.

My dad has a brother named Thomas Williams, born in 1972. Uncle Tom never got married, he lives in Denver.

On my dad's side, my grandparents were Robert Williams and Margaret O'Brien. Everyone called her Maggie. Grandpa Robert was born in 1940 in a small town in Iowa, he was a farmer his whole life. He passed away in 2018. Grandma Maggie was born in 1943 and she used to be a nurse.

Some of my best memories are going to my grandfather Robert's farm every summer. The smell of hay and the sound of roosters in the morning — James and I would run around the fields all day while Grandpa showed us how to care for the animals. He was the most patient man I ever knew.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    // People extraction
    section(R, 'People Extraction');
    for (const name of ['Sarah', 'David', 'Karen', 'James', 'Emily', 'Thomas', 'Robert', 'Margaret']) {
      assert(R, pNames.includes(normalize(name)), `Person missing: ${name}`);
    }
    assert(R, people.length >= 7, `Expected ≥7 people, got ${people.length}`);
    warn(R, people.length <= 10, `Possible duplication: got ${people.length} people`);

    // Nickname
    section(R, 'Metadata');
    const margaret = people.find(p => normalize(p.firstName) === 'margaret');
    warn(R, margaret?.nickname?.toLowerCase() === 'maggie', `Margaret nickname should be "Maggie", got "${margaret?.nickname}"`);

    // Deceased
    const robert = people.find(p => normalize(p.firstName) === 'robert');
    warn(R, robert?.isDeceased || !!robert?.deathDate, 'Robert should be marked deceased');

    // Year-only dates
    const david = people.find(p => normalize(p.firstName) === 'david');
    if (david?.birthDate) warn(R, !david.birthDate.includes('-01-01'), `David birthDate should be year-only, got "${david.birthDate}"`);

    // Gender inference
    warn(R, david?.gender === 'male', `David should be male, got "${david?.gender}"`);
    warn(R, margaret?.gender === 'female', `Margaret should be female, got "${margaret?.gender}"`);

    // Profession
    warn(R, david?.profession?.toLowerCase()?.includes('teacher'), `David profession should include "teacher", got "${david?.profession}"`);
    const james = people.find(p => normalize(p.firstName) === 'james');
    warn(R, james?.profession?.toLowerCase()?.includes('doctor'), `James profession should include "doctor", got "${james?.profession}"`);

    // Relationships
    section(R, 'Direct Relationships');
    assert(R, hasRel(allRelationships, 'David', 'Sarah', 'parent'), 'David → parent of Sarah');
    assert(R, hasRel(allRelationships, 'Karen', 'Sarah', 'parent'), 'Karen → parent of Sarah');
    assert(R, hasRel(allRelationships, 'James', 'Sarah', 'sibling'), 'James ↔ sibling of Sarah');
    assert(R, hasRel(allRelationships, 'Emily', 'Sarah', 'sibling'), 'Emily ↔ sibling of Sarah');
    assert(R, hasRelOfType(allRelationships, 'spouse'), 'At least one spouse exists');
    warn(R, hasRel(allRelationships, 'David', 'Karen', 'spouse'), 'David ↔ Karen spouse');
    assert(R, hasRel(allRelationships, 'Thomas', 'David', 'sibling'), 'Thomas ↔ David sibling');

    // Grandparents
    section(R, 'Grandparent Chain');
    assert(R, hasRel(allRelationships, 'Robert', 'David', 'parent') || hasRel(allRelationships, 'Robert', 'Sarah', 'grandparent'),
      'Robert → parent of David or grandparent of Sarah');
    assert(R, hasRel(allRelationships, 'Margaret', 'David', 'parent') || hasRel(allRelationships, 'Margaret', 'Sarah', 'grandparent'),
      'Margaret → parent of David or grandparent of Sarah');

    // Uncle inference
    section(R, 'Inferred Relationships');
    warn(R, hasRel(allRelationships, 'Thomas', 'Sarah', 'uncle_aunt'), 'Thomas should be uncle_aunt of Sarah (inferred)');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 2: Spanish — Nuclear Family Basics
// ────────────────────────────────────────────────────────────
// Same logical family as #1 but in Spanish, different names.
// Tests: papá/mamá, hermano/hermana, abuelo/abuela,
//        gender from gendered adjectives (nacido/nacida)
//
// Family: The Morales family
// Gen 1: Fernando Morales (b.1938, d.2015, carpintero, Puebla) + Rosa Herrera (b.1941, costurera)
// Gen 2: Luis Morales (b.1966, maestro) + Ana Gómez (b.1969, enfermera)
//        Isabel Morales (b.1971, Luis's sister)
// Gen 3: NARRATOR: Mariana Morales Gómez (female, b.1996, Puebla)
//        Pablo Morales (b.1994, brother, arquitecto)
//        Lucía Morales (b.2000, sister)
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '2. ES — Nuclear Family Basics',
  language: 'es',
  narrator: { firstName: 'Mariana', lastName: 'Morales Gómez', gender: 'female' },
  existingPeople: [],
  transcript: `Me llamo Mariana Morales Gómez, nací en 1996 en Puebla. Soy mujer.

Mi papá se llama Luis Morales, nació en 1966 en Puebla y es maestro de primaria. Mi mamá se llama Ana Gómez, nacida en 1969 en Oaxaca, ella es enfermera. Mis papás se casaron en 1993.

Tengo un hermano mayor que se llama Pablo Morales, nacido en 1994. Pablo es arquitecto y vive en Monterrey. También tengo una hermana menor, Lucía, nacida en el 2000. Lucía estudia derecho.

Mi papá tiene una hermana que se llama Isabel Morales, nacida en 1971. Mi tía Isabel vive en Guadalajara, nunca se casó.

Mis abuelos paternos eran Don Fernando Morales y Doña Rosa Herrera. Mi abuelito Fernando nació en 1938 en Puebla y fue carpintero toda su vida, tenía un taller en el centro. Él falleció en 2015. Mi abuelita Rosa nació en 1941 y era costurera.

Recuerdo mucho ir con mi hermano Pablo al taller de mi abuelo Fernando. El olor a madera y el sonido del serrucho. Mi abuelo nos enseñaba a lijar y barnizar muebles. Pablo siempre decía que quería ser como el abuelo, y al final estudió arquitectura.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Mariana', 'Luis', 'Ana', 'Pablo', 'Lucía', 'Isabel', 'Fernando', 'Rosa']) {
      assert(R, pNames.includes(normalize(name)), `Person missing: ${name}`);
    }
    assert(R, people.length >= 7, `Expected ≥7 people, got ${people.length}`);

    section(R, 'Spanish Kinship Terms');
    assert(R, hasRel(allRelationships, 'Luis', 'Mariana', 'parent'), 'Luis (papá) → parent of Mariana');
    assert(R, hasRel(allRelationships, 'Ana', 'Mariana', 'parent'), 'Ana (mamá) → parent of Mariana');
    assert(R, hasRel(allRelationships, 'Pablo', 'Mariana', 'sibling'), 'Pablo (hermano) ↔ sibling of Mariana');
    assert(R, hasRel(allRelationships, 'Lucía', 'Mariana', 'sibling') || hasRel(allRelationships, 'Lucia', 'Mariana', 'sibling'),
      'Lucía (hermana) ↔ sibling of Mariana');
    assert(R, hasRel(allRelationships, 'Isabel', 'Luis', 'sibling'), 'Isabel (tía) ↔ sibling of Luis');

    section(R, 'Grandparent Chain — Abuelos');
    assert(R, hasRel(allRelationships, 'Fernando', 'Luis', 'parent') || hasRel(allRelationships, 'Fernando', 'Mariana', 'grandparent'),
      'Fernando (abuelo) → parent of Luis or grandparent of Mariana');
    assert(R, hasRel(allRelationships, 'Rosa', 'Luis', 'parent') || hasRel(allRelationships, 'Rosa', 'Mariana', 'grandparent'),
      'Rosa (abuela) → parent of Luis or grandparent of Mariana');

    section(R, 'Metadata — Spanish');
    const fernando = people.find(p => normalize(p.firstName) === 'fernando');
    warn(R, fernando?.isDeceased || !!fernando?.deathDate, 'Fernando should be deceased');
    warn(R, fernando?.profession?.toLowerCase()?.includes('carpintero') || fernando?.profession?.toLowerCase()?.includes('carpenter'),
      `Fernando profession should be carpintero, got "${fernando?.profession}"`);
    const pablo = people.find(p => normalize(p.firstName) === 'pablo');
    warn(R, pablo?.gender === 'male', `Pablo should be inferred male, got "${pablo?.gender}"`);

    section(R, 'Inferred');
    warn(R, hasRel(allRelationships, 'Isabel', 'Mariana', 'uncle_aunt'), 'Isabel should be uncle_aunt of Mariana');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 3: English — Blended Family
// ────────────────────────────────────────────────────────────
// Tests: ex_spouse, half_sibling, step_parent, step_child,
//        half-sibling parent attribution, divorce language,
//        age-to-year calculation, possessive chain ownership
//
// Family: The Carter-Bennett blended family (14 people)
//
// Gen 1: William Carter (b.1940, d.2005) + Helen Carter née Davis (b.1943)
// Gen 2:
//   Michael Carter (b.1965, William & Helen's son)
//     1st marriage: Jennifer Lopez (ex-wife, divorced 1998) → Ryan Carter (b.1992, half-bro of narrator)
//     2nd marriage: Susan Bennett (b.1970, narrator's mom) → NARRATOR + sister
//   Kevin Carter (b.1970, Michael's brother)
// Gen 3:
//   NARRATOR: Ethan Carter (male, b.2000, Boston)
//   Sophie Carter (b.2003, Ethan's full sister)
//   Ryan Carter (b.1992, Ethan's half-brother from dad's 1st marriage)
//     Ryan's children: Olivia (age 4), Noah (age 2)
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '3. EN — Blended Family (Divorce, Half-siblings)',
  language: 'en',
  narrator: { firstName: 'Ethan', lastName: 'Carter', gender: 'male' },
  existingPeople: [],
  transcript: `I'm Ethan Carter, born in 2000 in Boston. I'm male.

My dad is Michael Carter, born in 1965 in Philadelphia. He works as an engineer. My mom is Susan Bennett, born in 1970 in Boston, she's a nurse.

But here's the thing — my dad was married before. His first wife was Jennifer Lopez. Not the celebrity, obviously! They got married in 1990 and divorced in 1998. From that first marriage, my dad had a son named Ryan Carter, born in 1992. So Ryan is my half-brother on my dad's side. Ryan grew up mostly with his mom Jennifer, so I didn't see him a lot growing up, but we've gotten closer as adults.

Ryan is married now and has two kids. His daughter Olivia is four years old, and his son Noah is two. They're adorable. Those are my half-nephew and half-niece I guess, though we just call them nephew and niece.

I have a full sister named Sophie Carter, born in 2003. Sophie and I are super close. She's studying biology at BU right now.

My dad also has a younger brother named Kevin Carter, born in 1970. Uncle Kevin is a chef, he runs his own restaurant in Philly.

My grandparents on my dad's side were William Carter and Helen Davis. Grandpa William was born in 1940 and passed away in 2005. He was a veteran — served in the military. Grandma Helen was born in 1943, she's still with us, lives in a retirement community in Florida.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Ethan', 'Michael', 'Susan', 'Ryan', 'Sophie', 'Jennifer', 'Kevin', 'William', 'Helen', 'Olivia', 'Noah']) {
      assert(R, pNames.includes(normalize(name)), `Person missing: ${name}`);
    }
    assert(R, people.length >= 10, `Expected ≥10 people, got ${people.length}`);

    section(R, 'Core Family');
    assert(R, hasRel(allRelationships, 'Michael', 'Ethan', 'parent'), 'Michael → parent of Ethan');
    assert(R, hasRel(allRelationships, 'Susan', 'Ethan', 'parent'), 'Susan → parent of Ethan');
    assert(R, hasRel(allRelationships, 'Sophie', 'Ethan', 'sibling'), 'Sophie ↔ sibling of Ethan');

    section(R, 'Divorce & Half-siblings');
    // Ex-spouse
    assert(R, hasRel(allRelationships, 'Michael', 'Jennifer', 'ex_spouse'), 'Michael ↔ Jennifer ex_spouse');
    // Half-sibling
    assert(R, hasRel(allRelationships, 'Ryan', 'Ethan', 'half_sibling'), 'Ryan ↔ Ethan half_sibling');
    // Half-sibling parent attribution: Michael → parent of Ryan
    assert(R, hasRel(allRelationships, 'Michael', 'Ryan', 'parent'), 'Michael → parent of Ryan (half-sibling parent attribution)');

    section(R, 'Possessive Chain — Ryan\'s Children');
    // Ryan is parent of Olivia and Noah, NOT Ethan
    assert(R, hasRel(allRelationships, 'Ryan', 'Olivia', 'parent') || hasRel(allRelationships, 'Olivia', 'Ryan', 'child'),
      'Ryan → parent of Olivia (possessive chain)');
    assert(R, hasRel(allRelationships, 'Ryan', 'Noah', 'parent') || hasRel(allRelationships, 'Noah', 'Ryan', 'child'),
      'Ryan → parent of Noah (possessive chain)');
    // Ethan should NOT be parent of Olivia/Noah
    assert(R, !hasRelDirectional(allRelationships, 'Ethan', 'Olivia', 'parent') && !hasRelDirectional(allRelationships, 'Ethan', 'Noah', 'parent'),
      'Ethan should NOT be parent of Olivia/Noah (possessive chain test)');

    section(R, 'Age-to-Year Calculation');
    const olivia = people.find(p => normalize(p.firstName) === 'olivia');
    if (olivia?.birthDate) {
      const year = parseInt(olivia.birthDate);
      warn(R, year >= 2021 && year <= 2023, `Olivia "four years old" → ~2021-2022, got ${olivia.birthDate}`);
    } else {
      warn(R, false, 'Olivia birth year not calculated from age');
    }
    const noah = people.find(p => normalize(p.firstName) === 'noah');
    if (noah?.birthDate) {
      const year = parseInt(noah.birthDate);
      warn(R, year >= 2023 && year <= 2025, `Noah "two years old" → ~2023-2024, got ${noah.birthDate}`);
    } else {
      warn(R, false, 'Noah birth year not calculated from age');
    }

    section(R, 'Grandparents & Uncle');
    assert(R, hasRel(allRelationships, 'William', 'Michael', 'parent') || hasRel(allRelationships, 'William', 'Ethan', 'grandparent'),
      'William → parent of Michael or grandparent of Ethan');
    assert(R, hasRel(allRelationships, 'Helen', 'Michael', 'parent') || hasRel(allRelationships, 'Helen', 'Ethan', 'grandparent'),
      'Helen → parent of Michael or grandparent of Ethan');
    assert(R, hasRel(allRelationships, 'Kevin', 'Michael', 'sibling'), 'Kevin ↔ sibling of Michael');
    warn(R, hasRel(allRelationships, 'Kevin', 'Ethan', 'uncle_aunt'), 'Kevin should be uncle_aunt of Ethan');

    section(R, 'Deceased Status');
    const william = people.find(p => normalize(p.firstName) === 'william');
    warn(R, william?.isDeceased || !!william?.deathDate, 'William should be deceased');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 4: Spanish — Blended Family
// ────────────────────────────────────────────────────────────
// Tests: "se divorciaron", "medio hermano de parte de",
//        "hermanastro", ex esposa, possessive chains in Spanish,
//        age calculation from "tiene X años"
//
// Family: The Reyes-Soto blended family
// Gen 2: Carlos Reyes (b.1963) — 1st marriage: Laura Vega (ex, divorced)
//          → Alejandro Reyes (b.1990, half-bro of narrator, on dad's side)
//            Alejandro's children: Mateo (tiene 5 años), Sofía (tiene 3 años)
//        Carlos — 2nd marriage: Beatriz Soto (b.1968, narrator's mom)
//          → NARRATOR + sister
//        Manuel Reyes (b.1967, Carlos's brother)
// Gen 3: NARRATOR: Daniela Reyes Soto (female, b.1998, Monterrey)
//        Camila Reyes Soto (b.2001, sister)
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '4. ES — Blended Family (Divorcio, Medio Hermanos)',
  language: 'es',
  narrator: { firstName: 'Daniela', lastName: 'Reyes Soto', gender: 'female' },
  existingPeople: [],
  transcript: `Soy Daniela Reyes Soto, nací en 1998 en Monterrey. Soy mujer.

Mi papá es Carlos Reyes, nacido en 1963 en Saltillo. Es abogado. Mi mamá es Beatriz Soto, nacida en 1968 en Monterrey, ella es contadora.

Pero mi papá estuvo casado antes. Su primera esposa se llamaba Laura Vega. Se casaron en 1988 y se divorciaron en 1995. De ese matrimonio nació mi medio hermano Alejandro Reyes en 1990. O sea que Alejandro es medio hermano mío de parte de mi papá, porque compartimos al mismo padre Carlos. Alejandro creció con su mamá Laura, pero siempre nos visitaba en vacaciones.

Alejandro ya está casado y tiene dos hijos. Su hija Mateo tiene cinco años y su hija Sofía tiene tres años. Son bien bonitos. Esos son mis sobrinos postizos, aunque yo les digo sobrinos nomás.

Tengo una hermana que se llama Camila Reyes Soto, nació en 2001. Camila y yo somos muy unidas.

Mi papá tiene un hermano menor que se llama Manuel Reyes, nacido en 1967. Mi tío Manuel es dentista y vive en Saltillo.

Recuerdo que cuando Alejandro nos visitaba en Navidad, mi mamá Beatriz siempre preparaba tamales y ponche. Aunque no somos hermanos completos, Alejandro siempre me trató como si fuéramos de la misma mamá. Mi tío Manuel también venía con sus chistes malos y hacía reír a todos.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Daniela', 'Carlos', 'Beatriz', 'Alejandro', 'Camila', 'Laura', 'Manuel', 'Mateo', 'Sofía']) {
      assert(R, pNames.includes(normalize(name)), `Person missing: ${name}`);
    }

    section(R, 'Divorcio & Medio Hermanos');
    assert(R, hasRel(allRelationships, 'Carlos', 'Laura', 'ex_spouse'), 'Carlos ↔ Laura ex_spouse (se divorciaron)');
    assert(R, hasRel(allRelationships, 'Alejandro', 'Daniela', 'half_sibling'), 'Alejandro ↔ Daniela half_sibling (medio hermano)');
    assert(R, hasRel(allRelationships, 'Carlos', 'Alejandro', 'parent'),
      'Carlos → parent of Alejandro (medio hermano de parte de mi papá)');

    section(R, 'Possessive Chain — hijos de Alejandro');
    assert(R, hasRel(allRelationships, 'Alejandro', 'Mateo', 'parent') || hasRel(allRelationships, 'Mateo', 'Alejandro', 'child'),
      'Alejandro → parent of Mateo');
    assert(R, hasRel(allRelationships, 'Alejandro', 'Sofía', 'parent') || hasRel(allRelationships, 'Alejandro', 'Sofia', 'parent') ||
      hasRel(allRelationships, 'Sofía', 'Alejandro', 'child') || hasRel(allRelationships, 'Sofia', 'Alejandro', 'child'),
      'Alejandro → parent of Sofía');
    assert(R, !hasRelDirectional(allRelationships, 'Daniela', 'Mateo', 'parent'),
      'Daniela should NOT be parent of Mateo');

    section(R, 'Age → Year (tiene X años)');
    const mateo = people.find(p => normalize(p.firstName) === 'mateo');
    if (mateo?.birthDate) {
      const year = parseInt(mateo.birthDate);
      warn(R, year >= 2020 && year <= 2022, `Mateo "tiene cinco años" → ~2020-2021, got ${mateo.birthDate}`);
    } else {
      warn(R, false, 'Mateo birth year not calculated from "tiene cinco años"');
    }

    section(R, 'Family Structure');
    assert(R, hasRel(allRelationships, 'Carlos', 'Daniela', 'parent'), 'Carlos → parent of Daniela');
    assert(R, hasRel(allRelationships, 'Beatriz', 'Daniela', 'parent'), 'Beatriz → parent of Daniela');
    assert(R, hasRel(allRelationships, 'Camila', 'Daniela', 'sibling'), 'Camila ↔ sibling of Daniela');
    assert(R, hasRel(allRelationships, 'Manuel', 'Carlos', 'sibling'), 'Manuel ↔ sibling of Carlos');
    warn(R, hasRel(allRelationships, 'Manuel', 'Daniela', 'uncle_aunt'), 'Manuel should be uncle_aunt of Daniela');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 5: English — In-laws & Multi-generational
// ────────────────────────────────────────────────────────────
// Tests: parent_in_law, child_in_law, in_law (sibling-in-law),
//        great_grandparent, great_great_grandparent,
//        multiple marriage in-law chains
//
// Family: The Singh-O'Connor multi-generational family
//
// Gen 0: Great-great-grandpa: Rajan Singh (b.1890, d.1970)
// Gen 1: Vikram Singh (b.1920, d.2000, great-grandpa, son of Rajan)
//        + Priya Mehta (b.1925, d.2010)
// Gen 2: Arjun Singh (b.1950, grandpa) + Meera Rao (b.1953, grandma)
// Gen 3: Nikhil Singh (b.1978, dad) + Claire O'Connor (b.1980, mom)
//        Anita Singh (b.1975, dad's sister)
// Gen 4: NARRATOR: Maya Singh (female, b.2002, London)
//        Rajan Singh II (b.2005, brother — named after great-great-grandpa!)
//
// In-law chain:
//   Claire's parents: Patrick O'Connor (b.1955, father-in-law of Nikhil)
//                     + Siobhan Murphy (b.1958, mother-in-law of Nikhil)
//   Claire's brother: Liam O'Connor (b.1983) — brother-in-law of Nikhil
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '5. EN — In-laws & 5 Generations',
  language: 'en',
  narrator: { firstName: 'Maya', lastName: 'Singh', gender: 'female' },
  existingPeople: [],
  transcript: `I'm Maya Singh, born in 2002 in London. I'm female.

My father is Nikhil Singh, born in 1978 in Mumbai. He's a software architect. My mother is Claire O'Connor, born in 1980 in Dublin. She's a professor of literature. They met at university in London and got married in 2001.

My dad has a sister, Anita Singh, born in 1975. Aunt Anita is a surgeon in Mumbai.

I have a younger brother named Rajan Singh, born in 2005. He was named after our great-great-grandfather! My brother Rajan is studying music.

Now, my paternal grandparents are Arjun Singh, born in 1950 in Mumbai, and Meera Rao, born in 1953 in Bangalore. My grandpa Arjun is retired — he was a professor of mathematics.

My great-grandparents, my grandpa Arjun's parents, were Vikram Singh, born in 1920, and Priya Mehta, born in 1925. Great-grandpa Vikram passed away in 2000, and great-grandma Priya passed away in 2010. They lived in Delhi.

And going even further back, my great-great-grandfather was Rajan Singh, born in 1890, he died in 1970. He was Vikram's father. That's who my brother is named after.

On my mom's side, my maternal grandparents are Patrick O'Connor, born in 1955 in Cork, Ireland, and Siobhan Murphy, born in 1958 in Dublin. So Patrick and Siobhan are my dad's in-laws, his father-in-law and mother-in-law. My mom has a brother named Liam O'Connor, born in 1983. Liam is my uncle, and he's also my dad's brother-in-law. Liam works as a journalist.

Growing up, we'd spend summers in Mumbai with my grandpa Arjun and grandma Meera, and Christmas in Dublin with Grandpa Patrick and Grandma Siobhan. It was the best of both worlds.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Maya', 'Nikhil', 'Claire', 'Anita', 'Arjun', 'Meera', 'Vikram', 'Priya', 'Patrick', 'Siobhan', 'Liam']) {
      assert(R, pNames.includes(normalize(name)), `Person missing: ${name}`);
    }
    // The narrator's brother "Rajan" and great-great-grandfather "Rajan" share a name — test disambiguation
    const rajanMatches = people.filter(p => normalize(p.firstName) === 'rajan');
    warn(R, rajanMatches.length >= 2, `Should have 2 distinct Rajans (brother + great-great-grandpa), got ${rajanMatches.length}`);

    section(R, '5-Generation Lineage');
    // Great-great-grandparent
    assert(R, hasRelOfType(allRelationships, 'great_great_grandparent') ||
      (hasRel(allRelationships, 'Rajan', 'Vikram', 'parent')),
      'great_great_grandparent type should exist, or Rajan → parent of Vikram');
    // Great-grandparent
    assert(R, hasRel(allRelationships, 'Vikram', 'Arjun', 'parent') || hasRelOfType(allRelationships, 'great_grandparent'),
      'Vikram → parent of Arjun or great_grandparent type exists');
    // Grandparent
    assert(R, hasRel(allRelationships, 'Arjun', 'Nikhil', 'parent') || hasRel(allRelationships, 'Arjun', 'Maya', 'grandparent'),
      'Arjun → parent of Nikhil or grandparent of Maya');

    section(R, 'In-law Relationships');
    // Father-in-law and mother-in-law
    warn(R, hasRel(allRelationships, 'Patrick', 'Nikhil', 'parent_in_law'),
      'Patrick should be parent_in_law of Nikhil');
    warn(R, hasRel(allRelationships, 'Siobhan', 'Nikhil', 'parent_in_law'),
      'Siobhan should be parent_in_law of Nikhil');
    // Brother-in-law
    warn(R, hasRel(allRelationships, 'Liam', 'Nikhil', 'in_law'),
      'Liam should be in_law (brother-in-law) of Nikhil');
    // Liam is uncle of Maya
    warn(R, hasRel(allRelationships, 'Liam', 'Maya', 'uncle_aunt'),
      'Liam should be uncle_aunt of Maya');

    section(R, 'Name Disambiguation');
    // Brother Rajan (b.2005) should be sibling of Maya
    assert(R, hasRel(allRelationships, 'Rajan', 'Maya', 'sibling'), 'Rajan (brother) ↔ sibling of Maya');
    // The great-great-grandpa Rajan (b.1890) should NOT be sibling of Maya
    const oldRajan = people.find(p => normalize(p.firstName) === 'rajan' && p.birthDate && parseInt(p.birthDate) < 1950);
    const youngRajan = people.find(p => normalize(p.firstName) === 'rajan' && p.birthDate && parseInt(p.birthDate) > 2000);
    warn(R, !!oldRajan && !!youngRajan, 'Should distinguish old Rajan (1890) from young Rajan (2005)');

    section(R, 'Maternal Grandparents');
    assert(R, hasRel(allRelationships, 'Patrick', 'Claire', 'parent') || hasRel(allRelationships, 'Patrick', 'Maya', 'grandparent'),
      'Patrick → parent of Claire or grandparent of Maya');
    assert(R, hasRel(allRelationships, 'Siobhan', 'Claire', 'parent') || hasRel(allRelationships, 'Siobhan', 'Maya', 'grandparent'),
      'Siobhan → parent of Claire or grandparent of Maya');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 6: Spanish — In-laws & Multi-generational
// ────────────────────────────────────────────────────────────
// Tests: suegro/suegra, cuñado/cuñada, bisabuelo/bisabuela,
//        tatarabuelo/tatarabuela, nuera/yerno
//
// Family: The Torres-Nakamura family
//
// Gen 0: Tatarabuelo: Emilio Torres (b.1895, d.1975)
// Gen 1: Bisabuelo: Ramón Torres (b.1922, d.2005, son of Emilio) + Consuelo Ríos (b.1925)
// Gen 2: Abuelo: Héctor Torres (b.1950) + Yolanda Castillo (b.1952)
// Gen 3: Papá: Rodrigo Torres (b.1977) + Keiko Nakamura (b.1979, mamá)
//        Tía: Verónica Torres (b.1980, sister of Rodrigo)
// Gen 4: NARRATOR: Tomás Torres Nakamura (male, b.2004, CDMX)
//        Sakura Torres (b.2007, sister)
//
// In-law chain:
//   Keiko's parents: Takeshi Nakamura (b.1952, suegro of Rodrigo)
//                    + María Elena Ruiz (b.1955, suegra of Rodrigo)
//   Keiko's sister: Yuki Nakamura (b.1982, cuñada of Rodrigo)
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '6. ES — Suegros, Bisabuelos, Tatarabuelos',
  language: 'es',
  narrator: { firstName: 'Tomás', lastName: 'Torres Nakamura', gender: 'male' },
  existingPeople: [],
  transcript: `Me llamo Tomás Torres Nakamura, nací en 2004 en la Ciudad de México. Soy hombre.

Mi papá se llama Rodrigo Torres, nacido en 1977 en Guadalajara, es médico. Mi mamá es Keiko Nakamura, nacida en 1979 en la Ciudad de México, ella es diseñadora gráfica. Su familia es japonesa-mexicana.

Tengo una hermana menor, Sakura Torres, nacida en 2007. Le gustan las artes.

Mi papá tiene una hermana que se llama Verónica Torres, nacida en 1980. Mi tía Vero es psicóloga.

Mis abuelos paternos son Don Héctor Torres, nacido en 1950 en Guadalajara, y Doña Yolanda Castillo, nacida en 1952. Mi abuelo Héctor es jubilado, fue contador.

Mis bisabuelos, los papás de mi abuelo Héctor, fueron Don Ramón Torres, nacido en 1922 y falleció en 2005, y Doña Consuelo Ríos, nacida en 1925. Mi bisabuelo Ramón era dueño de una ferretería en Guadalajara.

Y mi tatarabuelo, el papá de mi bisabuelo Ramón, se llamaba Emilio Torres, nacido en 1895, falleció en 1975. Era agricultor.

Del lado de mi mamá, mis abuelos maternos son Don Takeshi Nakamura, nacido en 1952 en Tokio, y Doña María Elena Ruiz, nacida en 1955 en Veracruz. Don Takeshi es el suegro de mi papá Rodrigo, y Doña María Elena es su suegra. Mi mamá Keiko tiene una hermana que se llama Yuki Nakamura, nacida en 1982. Mi tía Yuki es la cuñada de mi papá. Yuki trabaja como chef.

Los domingos siempre comíamos en casa de mis abuelos Héctor y Yolanda. Mi abuela hacía pozole y mi abuelo Takeshi traía sushi. Era una mezcla de culturas increíble. Mi tía Yuki siempre traía postres japoneses y mi tía Verónica contaba chistes.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Tomás', 'Rodrigo', 'Keiko', 'Sakura', 'Verónica', 'Héctor', 'Yolanda', 'Ramón', 'Consuelo', 'Emilio', 'Takeshi', 'María Elena', 'Yuki']) {
      // Handle compound names
      const normalizedName = normalize(name);
      const found = pNames.some(pn => pn.includes(normalizedName) || normalizedName.includes(pn));
      assert(R, found, `Person missing: ${name}`);
    }

    section(R, 'Tatarabuelo → Bisabuelo → Abuelo chain');
    // great_great_grandparent
    warn(R, hasRelOfType(allRelationships, 'great_great_grandparent') || hasRel(allRelationships, 'Emilio', 'Ramón', 'parent'),
      'Emilio should be great_great_grandparent or parent of Ramón (tatarabuelo)');
    // great_grandparent
    assert(R, hasRel(allRelationships, 'Ramón', 'Héctor', 'parent') || hasRel(allRelationships, 'Ramon', 'Hector', 'parent') ||
      hasRelOfType(allRelationships, 'great_grandparent'),
      'Ramón should be parent of Héctor (bisabuelo) or great_grandparent exists');
    // grandparent
    assert(R, hasRel(allRelationships, 'Héctor', 'Rodrigo', 'parent') || hasRel(allRelationships, 'Hector', 'Rodrigo', 'parent') ||
      hasRel(allRelationships, 'Héctor', 'Tomás', 'grandparent') || hasRel(allRelationships, 'Hector', 'Tomas', 'grandparent'),
      'Héctor → parent of Rodrigo or grandparent of Tomás');

    section(R, 'Suegro/Suegra/Cuñada');
    warn(R, hasRel(allRelationships, 'Takeshi', 'Rodrigo', 'parent_in_law'),
      'Takeshi should be parent_in_law (suegro) of Rodrigo');
    // María Elena as suegra — check with various normalizations
    warn(R, hasRelByFirstName(allRelationships, 'María Elena', 'Rodrigo', 'parent_in_law') ||
      hasRelByFirstName(allRelationships, 'Maria Elena', 'Rodrigo', 'parent_in_law') ||
      hasRelByFirstName(allRelationships, 'María', 'Rodrigo', 'parent_in_law') ||
      hasRelByFirstName(allRelationships, 'Maria', 'Rodrigo', 'parent_in_law'),
      'María Elena should be parent_in_law (suegra) of Rodrigo');
    warn(R, hasRel(allRelationships, 'Yuki', 'Rodrigo', 'in_law'),
      'Yuki should be in_law (cuñada) of Rodrigo');

    section(R, 'Core Family');
    assert(R, hasRel(allRelationships, 'Rodrigo', 'Tomás', 'parent') || hasRel(allRelationships, 'Rodrigo', 'Tomas', 'parent'),
      'Rodrigo → parent of Tomás');
    assert(R, hasRel(allRelationships, 'Keiko', 'Tomás', 'parent') || hasRel(allRelationships, 'Keiko', 'Tomas', 'parent'),
      'Keiko → parent of Tomás');
    assert(R, hasRel(allRelationships, 'Verónica', 'Rodrigo', 'sibling') || hasRel(allRelationships, 'Veronica', 'Rodrigo', 'sibling'),
      'Verónica ↔ sibling of Rodrigo');

    section(R, 'Deceased');
    const ramon = people.find(p => normalize(p.firstName) === 'ramon');
    warn(R, ramon?.isDeceased || !!ramon?.deathDate, 'Ramón should be deceased');
    const emilio = people.find(p => normalize(p.firstName) === 'emilio');
    warn(R, emilio?.isDeceased || !!emilio?.deathDate, 'Emilio should be deceased');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 7: English — Adoption, Godparents, Ambiguity
// ────────────────────────────────────────────────────────────
// Tests: adopted_parent, adopted_child, godparent, godchild,
//        unnamed relatives, ambiguous references,
//        "my friend is like a brother" (should NOT be sibling)
//
// Family: The Kim-Johnson family
//
// NARRATOR: Grace Kim (female, b.1999, San Francisco)
//   Adopted parents: Daniel Kim (b.1965) + Michelle Kim née Jones (b.1967)
//   Biological mother: "birth mother" (unnamed, unknown details)
//   Godmother: Linda Chen (b.1968, Michelle's best friend)
//   Adopted sister: Hope Kim (b.2002, also adopted)
//   Daniel's parents: Sung-ho Kim (b.1935, d.2019) + Eunji Park (b.1938)
//   "My best friend Alex is like a brother to me" — NOT a sibling
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '7. EN — Adoption, Godparents, Ambiguity',
  language: 'en',
  narrator: { firstName: 'Grace', lastName: 'Kim', gender: 'female' },
  existingPeople: [],
  transcript: `My name is Grace Kim. I was born in 1999 in San Francisco. I'm female.

I was adopted when I was a baby. My adoptive father is Daniel Kim, born in 1965 in Seoul, Korea. He came to the US when he was twenty. He's a pharmacist. My adoptive mother is Michelle Kim, her maiden name was Jones, born in 1967 in Sacramento. She's a social worker.

I don't know much about my birth mother. I just know she was very young when she had me. I've never met her, and I may never know her name.

My parents also adopted my sister Hope Kim in 2002. Hope was born in 2002 in China. So Hope and I are both adopted — she's my adopted sister. We're not biologically related but she's my sister in every way that matters.

My godmother is Linda Chen, born in 1968. She's my mom Michelle's best friend from college. Linda has always been there for me. She was at every birthday, every school play.

My dad Daniel's parents were Sung-ho Kim, born in 1935 in Busan, Korea, and Eunji Park, born in 1938. Grandpa Sung-ho passed away in 2019. Grandma Eunji still lives in Seoul, we visit her every other year.

My best friend Alex is like a brother to me. We grew up on the same street and we've been inseparable since kindergarten. But obviously he's not actually my brother.

One of my favorite memories is the time Grandpa Sung-ho taught me to make kimchi. He was so patient, showing me how to salt the cabbage just right. That was the last summer before he passed.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Grace', 'Daniel', 'Michelle', 'Hope', 'Linda', 'Sung-ho', 'Eunji']) {
      assert(R, pNames.some(pn => pn.includes(normalize(name).split('-')[0])), `Person missing: ${name}`);
    }

    section(R, 'Adoption Relationships');
    // Adopted parents
    assert(R, hasRel(allRelationships, 'Daniel', 'Grace', 'adopted_parent') || hasRel(allRelationships, 'Daniel', 'Grace', 'parent'),
      'Daniel → adopted_parent or parent of Grace');
    assert(R, hasRel(allRelationships, 'Michelle', 'Grace', 'adopted_parent') || hasRel(allRelationships, 'Michelle', 'Grace', 'parent'),
      'Michelle → adopted_parent or parent of Grace');
    // Hope is adopted sister
    assert(R, hasRel(allRelationships, 'Hope', 'Grace', 'sibling') || hasRel(allRelationships, 'Hope', 'Grace', 'adopted_child') ||
      hasRel(allRelationships, 'Daniel', 'Hope', 'adopted_parent') || hasRel(allRelationships, 'Daniel', 'Hope', 'parent'),
      'Hope should be linked to Grace or Daniel/Michelle (adopted sister)');

    section(R, 'Godparent');
    assert(R, hasRel(allRelationships, 'Linda', 'Grace', 'godparent'), 'Linda → godparent of Grace');

    section(R, 'Ambiguity — "like a brother"');
    // Alex should NOT appear as sibling
    const alexRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '');
      const b = normalize(r.personBName || '');
      return (a.includes('alex') || b.includes('alex')) && r.type === 'sibling';
    });
    assert(R, alexRels.length === 0, '"Alex is like a brother" should NOT create sibling relationship');

    section(R, 'Grandparents (Adopted Family)');
    const sunghoRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '');
      const b = normalize(r.personBName || '');
      return a.includes('sung') || b.includes('sung');
    });
    warn(R, sunghoRels.length > 0, 'Sung-ho should have at least one relationship');
    // Sung-ho is parent of Daniel (or grandparent of Grace)
    warn(R, hasRelByFirstName(allRelationships, 'Sung-ho', 'Daniel', 'parent') ||
      hasRelByFirstName(allRelationships, 'Sung', 'Daniel', 'parent') ||
      hasRelByFirstName(allRelationships, 'Sung-ho', 'Grace', 'grandparent') ||
      hasRelByFirstName(allRelationships, 'Sung', 'Grace', 'grandparent'),
      'Sung-ho → parent of Daniel or grandparent of Grace');

    section(R, 'Deceased');
    const sungho = people.find(p => normalize(p.firstName).includes('sung'));
    warn(R, sungho?.isDeceased || !!sungho?.deathDate, 'Sung-ho should be deceased');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 8: Spanish — Adopción, Padrinos, Ambigüedad
// ────────────────────────────────────────────────────────────
// Tests: padre/madre adoptivo/a, padrino/madrina, ahijado/a,
//        "es como un hermano" should NOT create sibling,
//        unnamed birth parent
//
// Family: The Vargas-Luna family
//
// NARRATOR: Emilio Vargas Luna (male, b.2001, Medellín, Colombia)
//   Adoptive parents: Andrés Vargas (b.1968) + Claudia Luna (b.1970)
//   Adopted brother: Sebastián Vargas (b.2003, adopted from Guatemala)
//   Padrino: Miguel Ángel Herrera (b.1965, Andrés's childhood friend)
//   Madrina: Teresa de Jesús Montoya (b.1969)
//   Claudia's parents: Jaime Luna (b.1940, d.2020) + Esperanza Mejía (b.1943)
//   "mi amigo Julián es como mi hermano" — NOT sibling
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '8. ES — Adopción, Padrinos, Ambigüedad',
  language: 'es',
  narrator: { firstName: 'Emilio', lastName: 'Vargas Luna', gender: 'male' },
  existingPeople: [],
  transcript: `Me llamo Emilio Vargas Luna, nací en 2001 en Medellín, Colombia. Soy hombre.

Fui adoptado cuando era bebé. Mi padre adoptivo es Andrés Vargas, nacido en 1968 en Bogotá. Es ingeniero industrial. Mi madre adoptiva es Claudia Luna, nacida en 1970 en Medellín. Ella es profesora universitaria.

De mi madre biológica solo sé que era muy joven. No conozco su nombre ni la he conocido.

Mis papás también adoptaron a mi hermano Sebastián Vargas en 2003. Sebastián nació en 2003 en Guatemala. Él también es adoptado. No somos hermanos de sangre pero para mí es mi hermano de verdad.

Mi padrino es Miguel Ángel Herrera, nacido en 1965. Es el mejor amigo de mi papá desde la infancia. Mi madrina es Teresa de Jesús Montoya, nacida en 1969. Ella es muy cariñosa conmigo, siempre me manda regalos en mi cumpleaños.

Los papás de mi mamá Claudia, o sea mis abuelos maternos, son Don Jaime Luna, nacido en 1940, y Doña Esperanza Mejía, nacida en 1943. Mi abuelito Jaime falleció en 2020. Era músico, tocaba el tiple en una estudiantina. Mi abuelita Esperanza todavía vive en Medellín.

Mi amigo Julián es como mi hermano. Crecimos juntos en el mismo barrio y hemos sido inseparables desde chiquitos. Pero pues obviamente no es mi hermano de verdad.

Recuerdo cuando mi padrino Miguel Ángel me llevó a mi primer partido de fútbol. Yo tenía como ocho años. Fue increíble, gritamos tanto que perdimos la voz. Mi papá Andrés siempre dice que ese día Miguel Ángel se ganó su título de padrino.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    for (const name of ['Emilio', 'Andrés', 'Claudia', 'Sebastián', 'Miguel', 'Teresa', 'Jaime', 'Esperanza']) {
      assert(R, pNames.some(pn => pn.includes(normalize(name).replace('á', 'a').replace('é', 'e'))), `Person missing: ${name}`);
    }

    section(R, 'Adopción');
    assert(R, hasRel(allRelationships, 'Andrés', 'Emilio', 'adopted_parent') || hasRel(allRelationships, 'Andres', 'Emilio', 'adopted_parent') ||
      hasRel(allRelationships, 'Andrés', 'Emilio', 'parent') || hasRel(allRelationships, 'Andres', 'Emilio', 'parent'),
      'Andrés → adopted_parent or parent of Emilio');
    assert(R, hasRel(allRelationships, 'Claudia', 'Emilio', 'adopted_parent') || hasRel(allRelationships, 'Claudia', 'Emilio', 'parent'),
      'Claudia → adopted_parent or parent of Emilio');
    // Sebastián as adopted brother
    assert(R, hasRel(allRelationships, 'Sebastián', 'Emilio', 'sibling') || hasRel(allRelationships, 'Sebastian', 'Emilio', 'sibling') ||
      hasRel(allRelationships, 'Andrés', 'Sebastián', 'adopted_parent') || hasRel(allRelationships, 'Andres', 'Sebastian', 'adopted_parent') ||
      hasRel(allRelationships, 'Andrés', 'Sebastián', 'parent') || hasRel(allRelationships, 'Andres', 'Sebastian', 'parent'),
      'Sebastián linked to family (sibling of Emilio or child of Andrés/Claudia)');

    section(R, 'Padrino/Madrina');
    warn(R, hasRelByFirstName(allRelationships, 'Miguel', 'Emilio', 'godparent') ||
      hasRelByFirstName(allRelationships, 'Miguel Ángel', 'Emilio', 'godparent') ||
      hasRelByFirstName(allRelationships, 'Miguel Angel', 'Emilio', 'godparent'),
      'Miguel Ángel → godparent (padrino) of Emilio');
    warn(R, hasRelByFirstName(allRelationships, 'Teresa', 'Emilio', 'godparent'),
      'Teresa → godparent (madrina) of Emilio');

    section(R, '"como mi hermano" — NO sibling');
    const julianSibRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '');
      const b = normalize(r.personBName || '');
      return (a.includes('julian') || b.includes('julian')) && r.type === 'sibling';
    });
    assert(R, julianSibRels.length === 0, '"Julián es como mi hermano" should NOT create sibling relationship');

    section(R, 'Abuelos');
    assert(R, hasRel(allRelationships, 'Jaime', 'Claudia', 'parent') || hasRel(allRelationships, 'Jaime', 'Emilio', 'grandparent'),
      'Jaime → parent of Claudia or grandparent of Emilio');
    const jaime = people.find(p => normalize(p.firstName) === 'jaime');
    warn(R, jaime?.isDeceased || !!jaime?.deathDate, 'Jaime should be deceased');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 9: English — EXTREME: Naming Collisions,
//             Cousin Marriages, Complex Possessives
// ────────────────────────────────────────────────────────────
// Tests: Multiple people with same first name,
//        complex "his wife's brother's daughter" chains,
//        cousin relationship extraction, nephew_niece,
//        "my dad's cousin" (parent's cousin → what type?),
//        grandchild relationships
//
// Family: The Johnson family — naming chaos
//
// NARRATOR: John William Johnson III (male, b.1998, Chicago)
// John's father: John William Johnson Jr. (b.1968, lawyer)
// John's grandfather: John William Johnson Sr. (b.1938, d.2020)
// John's great-grandmother: Elizabeth "Betty" Johnson (b.1915, d.2008)
//
// John's mother: Catherine "Cat" Rivera (b.1970, architect)
// Catherine's brother: Marco Rivera (b.1973)
//   Marco's daughter: Isabella Rivera (b.2000, narrator's cousin)
//
// John Jr.'s brother: Peter Johnson (b.1972)
//   Peter's son: also named Michael Johnson (b.1999)
//
// John's sister: Anna Johnson (b.2001)
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '9. EN — Naming Collisions & Complex Chains',
  language: 'en',
  narrator: { firstName: 'John William', lastName: 'Johnson III', gender: 'male' },
  existingPeople: [],
  transcript: `My full name is John William Johnson the Third. Yeah, three generations of John William Johnsons. I was born in 1998 in Chicago. I'm male.

My father is John William Johnson Junior, born in 1968 in Chicago. He's a lawyer. Everyone calls him "JW" to avoid confusion. And his father, my grandfather, was John William Johnson Senior, born in 1938 also in Chicago. He was a firefighter his whole career. He passed away in 2020.

My great-grandmother, my grandfather's mother, was Elizabeth Johnson, everyone called her Betty. She was born in 1915 and passed away in 2008. She was a remarkable woman — she worked in a factory during the war.

My mother is Catherine Rivera, but everyone calls her Cat. She was born in 1970 in San Antonio, Texas. She's an architect. My parents married in 1997.

My mom has a brother named Marco Rivera, born in 1973 in San Antonio. Uncle Marco is a musician. He has a daughter named Isabella Rivera, born in 2000. Isabella is my cousin — we're the same age and we used to hang out every summer.

My dad has a younger brother named Peter Johnson, born in 1972. Uncle Peter lives in Milwaukee. He has a son named Michael Johnson, born in 1999. Michael is my cousin too, well, first cousin technically.

I also have a sister named Anna Johnson, born in 2001. Anna is studying environmental science.

The funny thing about having three John Johnsons in the family is that when someone called "John!" at Thanksgiving, all three of us would turn around. My mom started a system — she'd call "Big John" for grandpa, "JW" for my dad, and "Johnny" for me. Now that grandpa is gone, I miss those moments.

I remember Grandma Betty telling stories about working at the factory. She had this way of making even hard times sound like adventures. When she talked about meeting my great-grandfather — she'd get this twinkle in her eye. She said he was the handsomest man at the dance.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    assert(R, people.length >= 9, `Expected ≥9 people, got ${people.length}`);
    for (const name of ['Catherine', 'Marco', 'Isabella', 'Peter', 'Michael', 'Anna', 'Elizabeth']) {
      assert(R, pNames.some(pn => pn.includes(normalize(name))), `Person missing: ${name}`);
    }

    section(R, '3 Johns — Disambiguation');
    // There should be at least 3 distinct "John" entries
    const johnEntries = people.filter(p => normalize(p.firstName).includes('john'));
    warn(R, johnEntries.length >= 3, `Should have ≥3 distinct Johns, got ${johnEntries.length}`);

    // Narrator should be the youngest John
    const narrator = people.find(p => p.isNarrator);
    assert(R, !!narrator, 'Narrator should exist');

    section(R, 'Parent Chain — 3 Johns');
    // JW Jr → parent of narrator
    // JW Sr → parent of JW Jr (or grandparent of narrator)
    assert(R, allRelationships.some(r => r.type === 'parent' || r.type === 'grandparent'),
      'Should have parent or grandparent relationships for the John lineage');

    section(R, 'Great-grandmother');
    // Elizabeth/Betty → great_grandparent of narrator, or parent of JW Sr
    const elizabethRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '');
      const b = normalize(r.personBName || '');
      return a.includes('elizabeth') || a.includes('betty') || b.includes('elizabeth') || b.includes('betty');
    });
    assert(R, elizabethRels.length > 0, 'Elizabeth/Betty should have relationships');
    warn(R, elizabethRels.some(r => r.type === 'great_grandparent' || r.type === 'parent'),
      'Elizabeth should be great_grandparent or parent in chain');

    // Nickname
    const elizabeth = people.find(p => normalize(p.firstName).includes('elizabeth') || normalize(p.firstName).includes('betty'));
    warn(R, elizabeth?.nickname?.toLowerCase() === 'betty' || normalize(elizabeth?.firstName || '').includes('betty'),
      `Elizabeth nickname should be "Betty", got "${elizabeth?.nickname}"`);

    section(R, 'Cousins & Uncles');
    assert(R, hasRel(allRelationships, 'Marco', 'Catherine', 'sibling') || hasRel(allRelationships, 'Marco', 'Cat', 'sibling'),
      'Marco ↔ sibling of Catherine');
    assert(R, hasRel(allRelationships, 'Marco', 'Isabella', 'parent') || hasRel(allRelationships, 'Isabella', 'Marco', 'child'),
      'Marco → parent of Isabella');
    warn(R, hasRelByFirstName(allRelationships, 'Isabella', 'John', 'cousin'),
      'Isabella should be cousin of narrator');
    warn(R, hasRelByFirstName(allRelationships, 'Michael', 'John', 'cousin'),
      'Michael should be cousin of narrator');

    section(R, 'Uncle Peter & his son');
    assert(R, hasRel(allRelationships, 'Peter', 'Michael', 'parent') || hasRel(allRelationships, 'Michael', 'Peter', 'child'),
      'Peter → parent of Michael');

    section(R, 'Siblings');
    // Anna is sibling of narrator
    const annaRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '');
      const b = normalize(r.personBName || '');
      return (a.includes('anna') || b.includes('anna')) && r.type === 'sibling';
    });
    assert(R, annaRels.length > 0, 'Anna should be sibling of narrator');

    return R;
  }
});

// ────────────────────────────────────────────────────────────
// SCENARIO 10: Spanish — EXTREME: Colisiones de Nombres,
//              Cadenas Posesivas Complejas, Familia Recompuesta
// ────────────────────────────────────────────────────────────
// Tests: Multiple people same name, "la esposa de mi tío",
//        "los hijos de ella", nephew via half-sibling,
//        step_parent vs adopted_parent, "mi mamá y mi madrastra",
//        cousin via marriage, complex multi-step inference
//
// Family: The García family — maximum complexity
//
// NARRATOR: María José García Ruiz (female, b.2000, Lima, Perú)
//
// Papá: José García López (b.1970, Lima) — marriage #1: Liliana Mendoza (ex-wife, divorced)
//   → from 1st marriage: José García Jr. "Pepe" (b.1993, half-bro of narrator, on dad's side)
//     Pepe's wife: Carmen Flores (b.1994)
//     Pepe's son: Santiago (tiene 3 años)
// Papá marriage #2: Elena Ruiz (b.1972, narrator's mom, teacher)
//   → NARRATOR + brother
//
// Mamá Elena's parents: Abuelo Alberto Ruiz (b.1942, d.2018, médico) + Abuela Gloria Vásquez (b.1945)
// Papá José's parents: Abuelo Pedro García (b.1940) + Abuela María García née Soto (b.1943)
//   NAMING COLLISION: Abuela María García shares narrator's first name "María"!
//
// Mamá Elena's sister: Tía Rosa Ruiz (b.1975) + Tío Miguel Herrera (b.1973)
//   Their kids: Andrés Herrera (b.1999, primo), Valentina Herrera (b.2002, prima)
//
// NARRATOR's brother: Carlos García Ruiz (b.2003)
// NARRATOR's step-grandmother: Doña Inés Paredes (b.1948, Pedro's 2nd wife after María died)
// ────────────────────────────────────────────────────────────
SCENARIOS.push({
  name: '10. ES — EXTREME: Colisiones, Cadenas, Máxima Complejidad',
  language: 'es',
  narrator: { firstName: 'María José', lastName: 'García Ruiz', gender: 'female' },
  existingPeople: [],
  transcript: `Me llamo María José García Ruiz, nací en el 2000 en Lima, Perú. Soy mujer.

Mi papá se llama José García López, nacido en 1970 en Lima. Es contador. Mi mamá se llama Elena Ruiz, nacida en 1972 en Arequipa. Ella es maestra de primaria.

Pero mi papá estuvo casado antes con Liliana Mendoza. Se casaron en 1992 y se divorciaron en 1998. De ese matrimonio nació José García hijo, en 1993, al que todos le dicen Pepe. O sea que Pepe es mi medio hermano de parte de mi papá, porque compartimos el mismo padre José. Pepe vive en Cusco.

Pepe se casó con Carmen Flores, nacida en 1994. Ellos tienen un hijito que se llama Santiago, tiene tres años. Santiago es el hijo de Pepe y Carmen, no mío.

Tengo un hermano menor que se llama Carlos García Ruiz, nacido en 2003.

Los papás de mi mamá Elena, mis abuelos maternos, son Don Alberto Ruiz, nacido en 1942, que era médico. Mi abuelito Alberto falleció en 2018. Y mi abuelita Gloria Vásquez, nacida en 1945, ella todavía vive en Arequipa.

Los papás de mi papá José, mis abuelos paternos, eran Don Pedro García, nacido en 1940, y Doña María García de soltera Soto, nacida en 1943. Sí, mi abuela se llamaba María también, igual que yo. Ella falleció en 2010. Después de que falleció mi abuela María, mi abuelo Pedro se volvió a casar con Doña Inés Paredes, nacida en 1948. Doña Inés es como una segunda abuela para nosotros.

Mi mamá tiene una hermana que se llama Rosa Ruiz, nacida en 1975. Mi tía Rosa está casada con Miguel Herrera, nacido en 1973. Él es profesor de matemáticas. Los hijos de mi tía Rosa y mi tío Miguel son mi primo Andrés Herrera, nacido en 1999, y mi prima Valentina Herrera, nacida en 2002.

Un recuerdo que tengo muy presente es cuando mi medio hermano Pepe vino a Lima con su esposa Carmen y el pequeño Santiago. Mi mamá Elena le preparó un ceviche espectacular. Aunque Pepe creció con su mamá Liliana, siempre ha tenido buena relación con nosotros. Mi hermanito Carlos le admira mucho.

También recuerdo mucho a mi abuelito Alberto. Cuando yo era chiquita, me llevaba a su consultorio y me dejaba jugar con el estetoscopio. Me decía "algún día vas a ser doctora, María José". Mi abuelita Gloria siempre lo cuenta llorando.`,

  assertions(extraction, resolvedPeople, allRelationships) {
    const R = newResults();
    const people = uniquePeople(resolvedPeople);
    const pNames = people.map(p => normalize(p.firstName));

    section(R, 'People Extraction');
    assert(R, people.length >= 14, `Expected ≥14 people, got ${people.length}`);
    for (const name of ['Elena', 'Liliana', 'Carlos', 'Carmen', 'Santiago', 'Alberto', 'Gloria',
                        'Pedro', 'Inés', 'Rosa', 'Miguel', 'Andrés', 'Valentina']) {
      assert(R, pNames.some(pn => pn.includes(normalize(name))), `Person missing: ${name}`);
    }

    section(R, 'Naming Collision — María José vs Abuela María');
    // Both should exist as separate people
    const marias = people.filter(p => normalize(p.firstName).includes('maria'));
    warn(R, marias.length >= 2, `Should have ≥2 distinct Marías (narrator + abuela), got ${marias.length}`);
    // Narrator should be María José (b.2000), abuela should be María (b.1943)
    const narratorMaria = marias.find(p => p.isNarrator || (p.birthDate && parseInt(p.birthDate) >= 1999));
    const abuelaMaria = marias.find(p => !p.isNarrator && p.birthDate && parseInt(p.birthDate) < 1950);
    warn(R, !!narratorMaria && !!abuelaMaria, 'Should distinguish narrator María José from Abuela María');

    section(R, 'Naming Collision — José padre vs Pepe (José hijo)');
    // Both José Sr. and José Jr. "Pepe" should exist
    const joses = people.filter(p => normalize(p.firstName).includes('jose') || normalize(p.nickname || '').includes('pepe'));
    warn(R, joses.length >= 2, `Should have ≥2 Josés (padre + Pepe), got ${joses.length}`);
    const pepe = people.find(p => normalize(p.nickname || '') === 'pepe' || 
      (normalize(p.firstName).includes('jose') && p.birthDate && parseInt(p.birthDate) === 1993));
    warn(R, !!pepe, 'Pepe (José Jr.) should exist with nickname or distinguishable by birth year');

    section(R, 'Divorce & Half-sibling');
    // Ex-spouse
    assert(R, hasRelByFirstName(allRelationships, 'José', 'Liliana', 'ex_spouse') ||
      hasRelByFirstName(allRelationships, 'Jose', 'Liliana', 'ex_spouse'),
      'José ↔ Liliana ex_spouse');
    // Half-sibling: Pepe ↔ narrator
    const halfSibRel = allRelationships.some(r => {
      const a = normalize(r.personAName || '');
      const b = normalize(r.personBName || '');
      return r.type === 'half_sibling' && 
        ((a.includes('pepe') || a.includes('jose')) && (b.includes('maria jose') || b.includes('maria'))) ||
        ((b.includes('pepe') || b.includes('jose')) && (a.includes('maria jose') || a.includes('maria')));
    });
    assert(R, halfSibRel, 'Pepe ↔ narrator should be half_sibling');
    // Half-sibling parent attribution
    const pepeParentRel = allRelationships.some(r => {
      const a = normalize(r.personAName || '');
      const b = normalize(r.personBName || '');
      return r.type === 'parent' && a.includes('jose') && (b.includes('pepe') || (b.includes('jose') && !b.includes('maria')));
    });
    warn(R, pepeParentRel, 'José → parent of Pepe (half-sibling parent attribution)');

    section(R, 'Possessive Chain — hijos de Pepe y Carmen');
    // Santiago is child of Pepe/Carmen, NOT narrator
    const santiagoParent = allRelationships.some(r => {
      const a = normalize(r.personAName || '');
      const b = normalize(r.personBName || '');
      return (r.type === 'parent' && (a.includes('pepe') || a.includes('carmen')) && b.includes('santiago')) ||
             (r.type === 'child' && a.includes('santiago') && (b.includes('pepe') || b.includes('carmen')));
    });
    assert(R, santiagoParent, 'Pepe/Carmen → parent of Santiago');

    section(R, 'Step/Second-marriage Grandmother');
    // Inés is Pedro's 2nd wife — she should be spouse of Pedro (or step relationship)
    const inesRels = allRelationships.filter(r => {
      const a = normalize(r.personAName || '');
      const b = normalize(r.personBName || '');
      return a.includes('ines') || b.includes('ines');
    });
    warn(R, inesRels.length > 0, 'Inés should have relationships (Pedro\'s 2nd wife)');
    warn(R, inesRels.some(r => r.type === 'spouse'), 'Inés ↔ Pedro should be spouse');

    section(R, 'Abuela María — Deceased');
    const abuelaMaria2 = people.find(p => normalize(p.firstName).includes('maria') && p.birthDate && parseInt(p.birthDate) === 1943);
    if (abuelaMaria2) {
      warn(R, abuelaMaria2.isDeceased || !!abuelaMaria2.deathDate, 'Abuela María should be deceased');
    }

    section(R, 'Maternal Grandparents');
    assert(R, hasRel(allRelationships, 'Alberto', 'Elena', 'parent') || 
      hasRelByFirstName(allRelationships, 'Alberto', 'María José', 'grandparent') ||
      hasRelByFirstName(allRelationships, 'Alberto', 'María', 'grandparent') ||
      hasRelByFirstName(allRelationships, 'Alberto', 'Maria', 'grandparent'),
      'Alberto → parent of Elena or grandparent of narrator');
    const alberto = people.find(p => normalize(p.firstName) === 'alberto');
    warn(R, alberto?.isDeceased || !!alberto?.deathDate, 'Alberto should be deceased');
    warn(R, alberto?.profession?.toLowerCase()?.includes('médico') || alberto?.profession?.toLowerCase()?.includes('medico') ||
      alberto?.profession?.toLowerCase()?.includes('doctor'),
      `Alberto profession should be médico/doctor, got "${alberto?.profession}"`);

    section(R, 'Tía Rosa → Primos');
    assert(R, hasRel(allRelationships, 'Rosa', 'Elena', 'sibling'), 'Rosa ↔ sibling of Elena');
    assert(R, hasRel(allRelationships, 'Rosa', 'Andrés', 'parent') || hasRel(allRelationships, 'Rosa', 'Andres', 'parent') ||
      hasRel(allRelationships, 'Miguel', 'Andrés', 'parent') || hasRel(allRelationships, 'Miguel', 'Andres', 'parent'),
      'Rosa/Miguel → parent of Andrés');
    assert(R, hasRel(allRelationships, 'Rosa', 'Valentina', 'parent') || hasRel(allRelationships, 'Miguel', 'Valentina', 'parent'),
      'Rosa/Miguel → parent of Valentina');

    section(R, 'Age → Year');
    const santiago = people.find(p => normalize(p.firstName) === 'santiago');
    if (santiago?.birthDate) {
      const year = parseInt(santiago.birthDate);
      warn(R, year >= 2022 && year <= 2024, `Santiago "tiene tres años" → ~2022-2023, got ${santiago.birthDate}`);
    }

    return R;
  }
});

// ============================================================
// HELPERS
// ============================================================

function newResults() {
  return { passed: 0, failed: 0, warnings: 0, errors: [], warns: [], currentSection: '' };
}

function section(R, name) {
  R.currentSection = name;
}

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
    // Strip honorifics from AI-returned names
    if (suggested.firstName) suggested.firstName = stripHonorifics(suggested.firstName).trim();
    if (suggested.lastName) suggested.lastName = stripHonorifics(suggested.lastName).trim();
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

  // Extraction
  console.log('  ⏳ Extracting...');
  const extraction = await callLLM(
    EXTRACTION_PROMPT + languageInstruction(scenario.language) + '\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
    transcriptForAI
  );
  console.log(`  ✅ Extraction: ${extraction.suggestedPeople?.length || 0} people, ${extraction.relationships?.length || 0} rels (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);

  // Resolve people
  const resolvedPeople = resolvePeople(
    extraction.suggestedPeople || [],
    scenario.narrator,
    scenario.existingPeople || []
  );

  // Map relationships
  const allRelationships = [];
  let unresolvedCount = 0;
  for (const rel of (extraction.relationships || [])) {
    const personA = resolvePersonName(rel.personA, resolvedPeople, scenario.narrator);
    const personB = resolvePersonName(rel.personB, resolvedPeople, scenario.narrator);
    if (personA && personB && personA.id !== personB.id) {
      // Normalize invalid relationship types
      let relType = rel.relationshipType;
      if (relType === 'adopted_sibling') relType = 'sibling';
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

  // Transitive inference
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

  // Run assertions
  const results = scenario.assertions(extraction, resolvedPeople, allRelationships);

  // Print results
  printResults(results, scenario.name);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ⏱️  Completed in ${totalTime}s`);

  return {
    name: scenario.name,
    results,
    extraction,
    resolvedPeople: peopleArr,
    allRelationships,
    unresolvedCount,
    totalTime,
  };
}

function printResults(R, name) {
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
// HTML Report
// ============================================================

function generateHTML(allScenarioResults) {
  const scenarioRows = allScenarioResults.map(s => {
    const R = s.results;
    const total = R.passed + R.failed + R.warnings;
    const score = total > 0 ? ((R.passed / total) * 100).toFixed(1) : 0;
    const status = R.failed === 0 ? '✅' : '❌';
    const peopleCount = s.resolvedPeople.length;
    const relCount = s.allRelationships.length;

    const failuresHTML = R.errors.map(e => `<div class="failure">✗ ${e}</div>`).join('');
    const warningsHTML = R.warns.map(w => `<div class="warning">⚠ ${w}</div>`).join('');

    const relsByType = {};
    for (const r of s.allRelationships) {
      if (!relsByType[r.type]) relsByType[r.type] = [];
      relsByType[r.type].push(r);
    }
    const relsHTML = Object.entries(relsByType).sort().map(([type, rels]) => {
      const relLines = rels.map(r =>
        `<span class="rel-item ${r.inferred ? 'inferred' : 'direct'}">${r.personAName} → ${r.personBName} (${Math.round(r.confidence * 100)}%${r.inferred ? ', inferred' : ''})</span>`
      ).join('');
      return `<div class="rel-group"><strong>${type}</strong> (${rels.length}): ${relLines}</div>`;
    }).join('');

    const peopleHTML = s.resolvedPeople.map(p => {
      const parts = [];
      if (p.birthDate) parts.push(`b.${p.birthDate}`);
      if (p.deathDate) parts.push(`d.${p.deathDate}`);
      if (p.gender) parts.push(p.gender === 'male' ? '♂' : '♀');
      if (p.profession) parts.push(p.profession);
      if (p.isDeceased) parts.push('✝');
      if (p.isNarrator) parts.push('🎙️');
      const name = `${p.firstName}${p.lastName ? ' ' + p.lastName : ''}`;
      return `<div class="person-item">${name}${p.nickname ? ' ("'+p.nickname+'")' : ''} ${parts.length ? '<span class="person-meta">(' + parts.join(', ') + ')</span>' : ''}</div>`;
    }).join('');

    return `
      <div class="scenario ${R.failed === 0 ? 'pass' : 'fail'}">
        <div class="scenario-header" onclick="this.parentElement.classList.toggle('expanded')">
          <span class="status">${status}</span>
          <span class="scenario-name">${s.name}</span>
          <span class="score">${score}% (${R.passed}/${total})</span>
          <span class="counts">👥 ${peopleCount} · 🔗 ${relCount} · ⏱️ ${s.totalTime}s</span>
        </div>
        <div class="scenario-details">
          ${failuresHTML ? '<div class="section"><h4>❌ Failures</h4>' + failuresHTML + '</div>' : ''}
          ${warningsHTML ? '<div class="section"><h4>⚠️ Warnings</h4>' + warningsHTML + '</div>' : ''}
          <div class="section"><h4>👥 People (${peopleCount})</h4>${peopleHTML}</div>
          <div class="section"><h4>🔗 Relationships (${relCount})</h4>${relsHTML}</div>
        </div>
      </div>`;
  }).join('');

  const totalPassed = allScenarioResults.reduce((s, r) => s + r.results.passed, 0);
  const totalFailed = allScenarioResults.reduce((s, r) => s + r.results.failed, 0);
  const totalWarnings = allScenarioResults.reduce((s, r) => s + r.results.warnings, 0);
  const totalAll = totalPassed + totalFailed + totalWarnings;
  const overallScore = totalAll > 0 ? ((totalPassed / totalAll) * 100).toFixed(1) : 0;
  const scenariosPassed = allScenarioResults.filter(r => r.results.failed === 0).length;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>MATRA — Relationship Extraction Test Report</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0a1628; color: #e8e0d4; }
.header { text-align: center; padding: 30px 20px; background: linear-gradient(135deg, #0d1f3c, #1a3a5c); border-bottom: 2px solid #2a5a8a; }
.header h1 { font-size: 28px; color: #7ec8e3; margin-bottom: 8px; }
.header .subtitle { color: #8b9baa; font-size: 14px; }
.overview { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; padding: 20px; max-width: 1000px; margin: 0 auto; }
.stat { text-align: center; background: #111d2e; border: 1px solid #1e3a5f; border-radius: 12px; padding: 16px; }
.stat .value { font-size: 32px; font-weight: bold; color: #7ec8e3; }
.stat .label { font-size: 12px; color: #8b9baa; margin-top: 4px; }
.stat.fail .value { color: #f87171; }
.stat.warn .value { color: #fbbf24; }
.stat.pass .value { color: #4ade80; }
.scenarios { max-width: 1000px; margin: 0 auto; padding: 20px; }
.scenario { background: #111d2e; border: 1px solid #1e3a5f; border-radius: 12px; margin-bottom: 12px; overflow: hidden; }
.scenario.fail { border-color: #7f1d1d; }
.scenario-header { display: flex; align-items: center; gap: 12px; padding: 14px 20px; cursor: pointer; user-select: none; }
.scenario-header:hover { background: #1a2a3d; }
.status { font-size: 20px; }
.scenario-name { flex: 1; font-weight: 600; }
.score { font-weight: 600; color: #7ec8e3; }
.counts { font-size: 12px; color: #8b9baa; }
.scenario-details { display: none; padding: 0 20px 16px; }
.scenario.expanded .scenario-details { display: block; }
.section { margin-top: 12px; }
.section h4 { color: #7ec8e3; margin-bottom: 6px; font-size: 14px; }
.failure { padding: 4px 10px; margin-bottom: 3px; background: #2d1515; border-left: 2px solid #f87171; border-radius: 4px; font-size: 13px; color: #fca5a5; }
.warning { padding: 4px 10px; margin-bottom: 3px; background: #2d2a15; border-left: 2px solid #fbbf24; border-radius: 4px; font-size: 13px; color: #fde68a; }
.person-item { display: inline-block; padding: 3px 8px; margin: 2px; background: #0d1a2d; border-radius: 6px; font-size: 13px; }
.person-meta { color: #8b9baa; font-size: 11px; }
.rel-group { margin-bottom: 6px; font-size: 13px; }
.rel-group strong { color: #7ec8e3; }
.rel-item { display: inline-block; padding: 2px 6px; margin: 1px; border-radius: 4px; font-size: 12px; }
.rel-item.direct { background: #0d2a1a; color: #86efac; }
.rel-item.inferred { background: #2a1a0d; color: #fde68a; }
</style>
</head>
<body>
<div class="header">
  <h1>🧬 MATRA — Relationship Extraction Test Report</h1>
  <div class="subtitle">10 Scenarios · English & Spanish · ${new Date().toISOString().slice(0, 10)}</div>
</div>
<div class="overview">
  <div class="stat"><div class="value">${scenariosPassed}/${allScenarioResults.length}</div><div class="label">Scenarios Passed</div></div>
  <div class="stat pass"><div class="value">${totalPassed}</div><div class="label">Assertions Passed</div></div>
  <div class="stat fail"><div class="value">${totalFailed}</div><div class="label">Assertions Failed</div></div>
  <div class="stat warn"><div class="value">${totalWarnings}</div><div class="label">Warnings</div></div>
</div>
<div class="overview" style="grid-template-columns: 1fr;">
  <div class="stat ${parseFloat(overallScore) >= 90 ? 'pass' : parseFloat(overallScore) >= 70 ? 'warn' : 'fail'}">
    <div class="value">${overallScore}%</div>
    <div class="label">Overall Score (${totalPassed}/${totalAll} assertions+warnings)</div>
  </div>
</div>
<div class="scenarios">
  <h2 style="color: #7ec8e3; margin-bottom: 16px;">Test Scenarios</h2>
  ${scenarioRows}
</div>
<script>
// Auto-expand failed scenarios
document.querySelectorAll('.scenario.fail').forEach(s => s.classList.add('expanded'));
</script>
</body>
</html>`;
  return html;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const startTime = Date.now();
  const provider = GROQ_API_KEY ? 'Groq (Llama 3.3 70B)' : 'OpenAI (GPT-4o-mini)';

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║   MATRA — Comprehensive Relationship Extraction Test Suite    ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║   10 scenarios · English & Spanish · Every relationship type  ║');
  console.log('║   Nuclear · Blended · In-laws · Adoption · Extreme           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`\n  Provider: ${provider}\n`);

  // Parse CLI args
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

  // ═══ GRAND SUMMARY ═══
  console.log('\n\n' + '═'.repeat(70));
  console.log('  📊 GRAND SUMMARY — Relationship Extraction Test Suite');
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

  // Generate HTML report
  const htmlContent = generateHTML(allResults);
  const htmlPath = path.join(__dirname, 'test-relationship-extraction-output.html');
  fs.writeFileSync(htmlPath, htmlContent, 'utf-8');
  console.log(`  📊 HTML report: ${htmlPath}`);

  // Dump debug JSON
  const debugPath = path.join(__dirname, 'test-relationship-extraction-debug.json');
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

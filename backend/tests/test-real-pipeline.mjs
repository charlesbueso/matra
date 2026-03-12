// ============================================================
// Matra — Real Pipeline Test (via Edge Functions)
// ============================================================
// Runs the two sequential interviews through the actual
// process-interview edge function, comparing results against
// the test-pipeline.mjs local harness.
// ============================================================

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const USER_EMAIL = 'charlesbueso@gmail.com';
const USER_PASSWORD = 'test1234';
const FAMILY_GROUP_ID = '07d34e5f-e634-4ff9-b746-20e18f9664ce';
const USER_ID = '33815d05-e8d9-4b11-8fb6-3e2d4a441556';

const INTERVIEWS = [
  {
    label: 'Carlos Bueso (son)',
    narrator: { firstName: 'Carlos', lastName: 'Bueso' },
    transcript: `Hola, mi nombre es Carlos Adrián Bueso. Nací el octubre 22 de 1999 en la Ciudad de México. Mis papás se llaman Carlos José Bueso y mi mamá se llama Alicia Rentería Montes de Oca. Mi papá nació en Puerto Rico y se fue a estudiar la universidad a Boston, en Massachusetts. Y después de eso consiguió un trabajo que lo expatrió a la Ciudad de México, donde conoció a mi mamá. Una vez que mi mamá y él se conocieron, se casaron y tuvieron tres hijos, que soy yo, mi hermano grande Marco Andrés Bueso y mi hermana pequeña Brisela Alessandra Bueso. También tengo un medio hermano de parte de mi mamá que se llama Cristian Rentería. Él nació en 1985 y él ya tiene dos hijos. Uno de sus hijos se llama Mateo Renter y su otro hijo se llama Andr Renter Mi familia es bastante grande y la verdad es que somos muy unidos Yo soy desarrollador de software y me dedico a programar. Tengo una empresa con mis amigos, un estudio creativo que se llama Alquimia Studio y yo soy programador ahí. principalmente hago páginas web, aplicaciones como esta misma en la que estamos trabajando el cual construye una gráfica de tu árbol familiar con inteligencia artificial y bueno, entre muchas otras cosas mi abuela materna se llama igual que mi mamá, Alicia Rentería y ella ya falleció, pero la queremos mucho. De hecho, el apodo que le tenemos a ella es Abuelita Mimi y también tengo una tía de parte de mi mamá. Ella se llama Claudia y ella es hermana de mi mamá mamá y Claudia tiene dos hijos que son Omar Gutiérrez y Valeria Gutiérrez que son mis primos`,
  },
  {
    label: 'Carlos José Bueso (dad)',
    narrator: { firstName: 'Carlos José', lastName: 'Bueso' },
    transcript: `Hola, me llamo Carlos José Bueso y nací en Puerto Rico el 16 de marzo de 1968. Yo tengo tres hijos con mi ex esposa Alicia Rentería. Mis hijos son Carlos, Marco y Bricel. Yo tengo mis papás en Puerto Rico Mi mamá se llama Lilian Mas Y mi papá biológico se llama Héctor Bueso Mi papá biológico Héctor falleció cuando yo tenía seis meses de edad En una exploración de cuevas en Puerto Rico Y mi abuela después se casó con mi padrastro que se llama José Virriel. También tengo un hermano que se llama Héctor Bueso y mi hermano está casado con su esposa que se llama Omaira Ortega.`,
  },
];

// ── Helpers ──

async function signIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Sign-in failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function dbQuery(sql, params = []) {
  // Use Supabase REST RPC or direct PostgREST — simpler: use service key + raw SQL via pg
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

async function deleteAllData() {
  console.log('  🗑️  Cleaning up existing data...');
  
  // Use PostgREST API with service key to delete data
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  // Delete in correct order to respect foreign keys
  const tables = [
    { table: 'story_people', filter: `story_id=in.(select id from stories where family_group_id=eq.${FAMILY_GROUP_ID})` },
    { table: 'extracted_entities', filter: `interview_id=in.(select id from interviews where family_group_id=eq.${FAMILY_GROUP_ID})` },
    { table: 'media_assets', filter: `family_group_id=eq.${FAMILY_GROUP_ID}` },
    { table: 'processing_jobs', filter: `interview_id=in.(select id from interviews where family_group_id=eq.${FAMILY_GROUP_ID})` },
    { table: 'stories', filter: `family_group_id=eq.${FAMILY_GROUP_ID}` },
    { table: 'transcripts', filter: `interview_id=in.(select id from interviews where family_group_id=eq.${FAMILY_GROUP_ID})` },
    { table: 'relationships', filter: `family_group_id=eq.${FAMILY_GROUP_ID}` },
    { table: 'interviews', filter: `family_group_id=eq.${FAMILY_GROUP_ID}` },
    { table: 'people', filter: `family_group_id=eq.${FAMILY_GROUP_ID}` },
  ];

  for (const { table, filter } of tables) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok && res.status !== 404) {
      // PostgREST doesn't support subquery filters directly — fall back to simpler approach
    }
  }

  // Simpler: just delete with direct family_group_id filter, relying on CASCADE
  // Delete relationships first, then interviews (cascades to transcripts, entities), then people
  await fetch(`${SUPABASE_URL}/rest/v1/relationships?family_group_id=eq.${FAMILY_GROUP_ID}`, { method: 'DELETE', headers });
  
  // Delete stories and their links
  // First get story IDs
  const storiesRes = await fetch(`${SUPABASE_URL}/rest/v1/stories?family_group_id=eq.${FAMILY_GROUP_ID}&select=id`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const stories = await storiesRes.json();
  if (stories?.length) {
    const storyIds = stories.map(s => s.id);
    for (const sid of storyIds) {
      await fetch(`${SUPABASE_URL}/rest/v1/story_people?story_id=eq.${sid}`, { method: 'DELETE', headers });
    }
    await fetch(`${SUPABASE_URL}/rest/v1/stories?family_group_id=eq.${FAMILY_GROUP_ID}`, { method: 'DELETE', headers });
  }

  // Delete interviews (CASCADE to transcripts, extracted_entities)
  await fetch(`${SUPABASE_URL}/rest/v1/interviews?family_group_id=eq.${FAMILY_GROUP_ID}`, { method: 'DELETE', headers });

  // Delete people
  await fetch(`${SUPABASE_URL}/rest/v1/people?family_group_id=eq.${FAMILY_GROUP_ID}`, { method: 'DELETE', headers });

  // Clear self_person_id
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${USER_ID}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ self_person_id: null }),
  });

  // Verify clean
  const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/people?family_group_id=eq.${FAMILY_GROUP_ID}&select=id`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const remaining = await checkRes.json();
  console.log(`  ✅ Cleanup done. Remaining people: ${remaining?.length || 0}`);
}

async function createSelfPerson(jwt, narrator) {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // Create the narrator as a person
  const res = await fetch(`${SUPABASE_URL}/rest/v1/people`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      family_group_id: FAMILY_GROUP_ID,
      first_name: narrator.firstName,
      last_name: narrator.lastName,
      created_by: USER_ID,
    }),
  });
  if (!res.ok) throw new Error(`Failed to create self person: ${await res.text()}`);
  const [person] = await res.json();

  // Set self_person_id on profile
  await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${USER_ID}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ self_person_id: person.id }),
  });

  return person;
}

async function callProcessInterview(jwt, transcript, subjectPersonId, title) {
  // Build multipart form data manually for Node.js fetch
  const formData = new FormData();
  formData.append('transcript', transcript);
  formData.append('familyGroupId', FAMILY_GROUP_ID);
  formData.append('language', 'es');
  if (title) formData.append('title', title);
  if (subjectPersonId) formData.append('subjectPersonId', subjectPersonId);

  const res = await fetch(`${SUPABASE_URL}/functions/v1/process-interview`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`process-interview failed (${res.status}): ${errText}`);
  }

  return await res.json();
}

async function fetchResults() {
  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
  };

  const [peopleRes, relsRes, interviewsRes, storiesRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/people?family_group_id=eq.${FAMILY_GROUP_ID}&deleted_at=is.null&select=id,first_name,last_name,nickname,birth_date,death_date,metadata&order=created_at`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/relationships?family_group_id=eq.${FAMILY_GROUP_ID}&select=id,person_a_id,person_b_id,relationship_type,confidence,source_interview_id,metadata&order=created_at`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/interviews?family_group_id=eq.${FAMILY_GROUP_ID}&deleted_at=is.null&select=id,title,status,ai_summary,ai_key_topics,subject_person_id&order=created_at`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/stories?family_group_id=eq.${FAMILY_GROUP_ID}&deleted_at=is.null&select=id,title,content&order=created_at`, { headers }),
  ]);

  return {
    people: await peopleRes.json(),
    relationships: await relsRes.json(),
    interviews: await interviewsRes.json(),
    stories: await storiesRes.json(),
  };
}

function findPersonByName(people, firstName, lastName) {
  const normFirst = firstName.toLowerCase().trim();
  const normLast = lastName?.toLowerCase().trim() || '';
  return people.find(p => {
    const pFirst = (p.first_name || '').toLowerCase().trim();
    const pLast = (p.last_name || '').toLowerCase().trim();
    return pFirst.includes(normFirst) || normFirst.includes(pFirst);
  });
}

// ── Main ──

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Matra — Real Pipeline Test (Edge Functions)         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Step 1: Sign in
  console.log('  🔑 Signing in as Carlos...');
  const jwt = await signIn();
  console.log('  ✅ Authenticated\n');

  // Step 2: Delete all data
  await deleteAllData();
  console.log();

  // Step 3: Create self person for narrator (Interview 1)
  console.log('  👤 Creating self person (Carlos Bueso)...');
  const selfPerson = await createSelfPerson(jwt, INTERVIEWS[0].narrator);
  console.log(`  ✅ Self person created: ${selfPerson.id}\n`);

  // Step 4: Process Interview 1 (Carlos son)
  console.log('▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓');
  console.log(`  INTERVIEW 1/2: ${INTERVIEWS[0].label}`);
  console.log('▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓');
  console.log(`  Narrator: ${INTERVIEWS[0].narrator.firstName} ${INTERVIEWS[0].narrator.lastName}`);
  console.log(`  Subject person: ${selfPerson.id}`);
  console.log(`  Transcript: ${INTERVIEWS[0].transcript.length} chars`);
  console.log('  ⏳ Processing...');
  
  const startTime1 = Date.now();
  const result1 = await callProcessInterview(jwt, INTERVIEWS[0].transcript, selfPerson.id, 'Interview: Carlos (son)');
  const elapsed1 = ((Date.now() - startTime1) / 1000).toFixed(1);
  console.log(`  ✅ Interview 1 done in ${elapsed1}s`);
  console.log(`     Status: ${result1.interview?.status}`);
  console.log(`     Entities: ${result1.extractedEntities}`);
  console.log(`     Stories: ${result1.storiesCreated}`);
  console.log();

  // Step 5: Find Carlos José's person ID in the DB
  const midResults = await fetchResults();
  const carlosJose = midResults.people.find(p => 
    (p.first_name || '').toLowerCase().includes('carlos') && 
    (p.first_name || '').toLowerCase().includes('jos')
  );

  if (!carlosJose) {
    console.log('  ⚠️  Could not find Carlos José in the DB after interview 1');
    console.log('  People found:');
    midResults.people.forEach(p => console.log(`    - ${p.first_name} ${p.last_name || ''} (${p.id})`));
  } else {
    console.log(`  🔗 Found Carlos José: ${carlosJose.id}`);
  }
  console.log();

  // Step 6: Process Interview 2 (Carlos José dad)
  console.log('▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓');
  console.log(`  INTERVIEW 2/2: ${INTERVIEWS[1].label}`);
  console.log('▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓');
  console.log(`  Narrator: ${INTERVIEWS[1].narrator.firstName} ${INTERVIEWS[1].narrator.lastName}`);
  console.log(`  Subject person: ${carlosJose?.id || 'N/A (will auto-create)'}`);
  console.log(`  Transcript: ${INTERVIEWS[1].transcript.length} chars`);
  console.log('  ⏳ Processing...');
  
  const startTime2 = Date.now();
  const result2 = await callProcessInterview(jwt, INTERVIEWS[1].transcript, carlosJose?.id || null, 'Interview: Carlos José (dad)');
  const elapsed2 = ((Date.now() - startTime2) / 1000).toFixed(1);
  console.log(`  ✅ Interview 2 done in ${elapsed2}s`);
  console.log(`     Status: ${result2.interview?.status}`);
  console.log(`     Entities: ${result2.extractedEntities}`);
  console.log(`     Stories: ${result2.storiesCreated}`);
  console.log();

  // Step 7: Fetch and display final results
  console.log('════════════════════════════════════════════════════════════');
  console.log('  🌳 FINAL RESULTS');
  console.log('════════════════════════════════════════════════════════════\n');

  const final = await fetchResults();
  
  // Build person lookup
  const personMap = {};
  for (const p of final.people) personMap[p.id] = p;

  console.log(`  📊 People: ${final.people.length}`);
  const rels = Array.isArray(final.relationships) ? final.relationships : [];
  console.log(`  🔗 Relationships: ${rels.length}`);
  console.log(`  📚 Stories: ${final.stories.length}`);
  console.log(`  🎙️ Interviews: ${final.interviews.length}`);
  console.log();

  console.log('  👥 PEOPLE:');
  for (const p of final.people) {
    const parts = [`  ${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`];
    if (p.nickname) parts.push(`aka "${p.nickname}"`);
    if (p.birth_date) parts.push(`b. ${p.birth_date}`);
    if (p.death_date) parts.push('✝️');
    if (p.metadata?.gender) parts.push(p.metadata.gender === 'male' ? '♂' : '♀');
    if (p.id === selfPerson.id) parts.push('🎙️ SELF');
    console.log(`    👤 ${parts.join('  ')}`);
  }
  console.log();

  console.log('  🔗 RELATIONSHIPS:');
  final.relationships = rels;
  const relTypeIcons = {
    parent: '👨‍👧', child: '👶', sibling: '👫', spouse: '💑',
    ex_spouse: '🔗', half_sibling: '👥', step_parent: '🔗',
    grandparent: '👴', great_grandparent: '👴', uncle_aunt: '🧑‍🤝‍🧑',
    cousin: '🤝',
  };
  for (const r of final.relationships) {
    const a = personMap[r.person_a_id];
    const b = personMap[r.person_b_id];
    const aName = a ? `${a.first_name}${a.last_name ? ' ' + a.last_name : ''}` : r.person_a_id;
    const bName = b ? `${b.first_name}${b.last_name ? ' ' + b.last_name : ''}` : r.person_b_id;
    const icon = relTypeIcons[r.relationship_type] || '🔗';
    const inf = r.metadata?.inferred ? ' [INFERRED]' : '';
    console.log(`    ${icon} ${aName} ──[${r.relationship_type}]──▶ ${bName} (${Math.round((r.confidence || 0) * 100)}%)${inf}`);
  }
  console.log();

  console.log('  📚 STORIES:');
  for (const s of final.stories) {
    console.log(`    📖 "${s.title}"`);
  }
  console.log();

  // Validation checks
  console.log('════════════════════════════════════════════════════════════');
  console.log('  ✅ VALIDATION CHECKS');
  console.log('════════════════════════════════════════════════════════════\n');

  const checks = [];
  
  // Check: no duplicate Carlos Bueso
  const carlosBuesos = final.people.filter(p => 
    (p.first_name || '').toLowerCase().includes('carlos') && 
    (p.last_name || '').toLowerCase().includes('bueso') &&
    !(p.first_name || '').toLowerCase().includes('jos')
  );
  checks.push({ name: 'No duplicate Carlos Bueso', pass: carlosBuesos.length === 1, detail: `Found ${carlosBuesos.length}` });

  // Check: exactly 2 Alicias (mom + grandma)
  const alicias = final.people.filter(p => (p.first_name || '').toLowerCase().includes('alicia'));
  checks.push({ name: 'Exactly 2 Alicias (mom + grandma)', pass: alicias.length === 2, detail: `Found ${alicias.length}` });

  // Check: exactly 2 Héctors (dad + brother)
  const hectors = final.people.filter(p => (p.first_name || '').toLowerCase().includes('hector') || (p.first_name || '').toLowerCase().includes('héctor'));
  checks.push({ name: 'Exactly 2 Héctors (bio-dad + brother)', pass: hectors.length === 2, detail: `Found ${hectors.length}` });

  // Check: ex_spouse relationship exists
  const exSpouse = rels.find(r => r.relationship_type === 'ex_spouse');
  checks.push({ name: 'ex_spouse relationship exists', pass: !!exSpouse, detail: exSpouse ? 'Found' : 'Missing' });

  // Check: grandparent relationships inferred
  const grandparents = rels.filter(r => r.relationship_type === 'grandparent');
  checks.push({ name: 'Grandparent relationships inferred', pass: grandparents.length > 0, detail: `Found ${grandparents.length}` });

  // Check: interview 1 completed
  checks.push({ name: 'Interview 1 completed', pass: result1.interview?.status === 'completed', detail: result1.interview?.status });
  
  // Check: interview 2 completed
  checks.push({ name: 'Interview 2 completed', pass: result2.interview?.status === 'completed', detail: result2.interview?.status });

  for (const c of checks) {
    console.log(`  ${c.pass ? '✅' : '❌'} ${c.name}: ${c.detail}`);
  }

  const passed = checks.filter(c => c.pass).length;
  console.log(`\n  Score: ${passed}/${checks.length}\n`);
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Done.`);
  console.log('════════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n  ❌ Fatal error:', err.message);
  process.exit(1);
});

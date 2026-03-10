#!/usr/bin/env node
// One-shot: sends Carlos's transcript through the production edge function
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env
const envPath = fs.existsSync(path.join(__dirname, '.env.local'))
  ? path.join(__dirname, '.env.local')
  : path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) process.env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
}

const BASE = 'http://127.0.0.1:54321';
const ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const FAMILY_GROUP_ID = '5a0f4ca1-aca6-4c15-ada8-082f8dffae0d';
const SUBJECT_PERSON_ID = 'c6156bb7-9a11-4a0e-bd28-1b76aacde7bb';

const TRANSCRIPT = `Hola, mi nombre es Carlos Adrián Bueso. Nací el octubre 22 de 1999 en la Ciudad de México. Mis papás se llaman Carlos José Bueso y mi mamá se llama Alicia Rentería Montes de Oca. Mi papá nació en Puerto Rico y se fue a estudiar la universidad a Boston, en Massachusetts. Y después de eso consiguió un trabajo que lo expatrió a la Ciudad de México, donde conoció a mi mamá. Una vez que mi mamá y él se conocieron, se casaron y tuvieron tres hijos, que soy yo, mi hermano grande Marco Andrés Bueso y mi hermana pequeña Brisela Alessandra Bueso. También tengo un medio hermano de parte de mi mamá que se llama Cristian Rentería. Él nació en 1985 y él ya tiene dos hijos. Uno de sus hijos se llama Mateo Renter y su otro hijo se llama Andr Renter Mi familia es bastante grande y la verdad es que somos muy unidos Yo soy desarrollador de software y me dedico a programar. Tengo una empresa con mis amigos, un estudio creativo que se llama Alquimia Studio y yo soy programador ahí. principalmente hago páginas web, aplicaciones como esta misma en la que estamos trabajando el cual construye una gráfica de tu árbol familiar con inteligencia artificial y bueno, entre muchas otras cosas mi abuela materna se llama igual que mi mamá, Alicia Rentería y ella ya falleció, pero la queremos mucho. De hecho, el apodo que le tenemos a ella es Abuelita Mimi y también tengo una tía de parte de mi mamá. Ella se llama Claudia y ella es hermana de mi mamá mamá y Claudia tiene dos hijos que son Omar Gutiérrez y Valeria Gutiérrez que son mis primos`;

async function main() {
  // 1. Authenticate
  console.log('🔑 Authenticating...');
  const authResp = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'charlesbueso@gmail.com', password: 'testpass123' }),
  });
  const authData = await authResp.json();
  if (!authData.access_token) {
    console.error('❌ Auth failed:', authData);
    process.exit(1);
  }
  console.log('✅ Authenticated as', authData.user.email);

  // 2. Call process-interview
  const formData = new FormData();
  formData.append('familyGroupId', FAMILY_GROUP_ID);
  formData.append('subjectPersonId', SUBJECT_PERSON_ID);
  formData.append('language', 'es');
  formData.append('title', 'Mi Familia');
  formData.append('transcript', TRANSCRIPT);

  console.log('\n📤 Calling process-interview edge function...');
  const startTime = Date.now();

  const resp = await fetch(`${BASE}/functions/v1/process-interview`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authData.access_token}`,
      'apikey': ANON_KEY,
    },
    body: formData,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n📥 Response: ${resp.status} (${elapsed}s)`);

  const text = await resp.text();
  try {
    const result = JSON.parse(text);
    console.log('\n✅ Result:');
    console.log(`   Interview ID: ${result.interviewId}`);
    console.log(`   People created: ${result.peopleCreated}`);
    console.log(`   Relationships: ${result.relationshipsCreated}`);
    console.log(`   Stories: ${result.storiesCreated}`);
    if (result.error) console.log(`   ⚠️  Error: ${result.error}`);
    console.log('\nFull response:');
    console.log(JSON.stringify(result, null, 2));
  } catch {
    console.log(text);
  }
}

main().catch(e => {
  console.error('❌ Fatal:', e);
  process.exit(1);
});

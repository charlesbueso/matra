#!/usr/bin/env node
// ============================================================
// MATRA — Premium User Monthly Cost Calculator
// ============================================================
// Uses the ACTUAL Groq API to measure real token usage for
// a simulated 30-minute interview transcript, then extrapolates
// to 30 conversations/month (premium max).
//
// Run: node test-cost-calculator.mjs
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load env ──
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

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  console.error('❌ GROQ_API_KEY not found in .env.local');
  process.exit(1);
}

// ============================================================
// GROQ PRICING (as of March 2026) — USD per million tokens
// ============================================================
const PRICING = {
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79, label: 'Llama 3.3 70B Versatile' },
  'whisper-large-v3':        { perAudioHour: 0.111, label: 'Whisper V3 Large' },
};

// ============================================================
// PROMPTS (same as production)
// ============================================================

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
   - gender: "male" | "female" | null (optional)

Rules:
- Be conservative with confidence scores. Only use 0.9+ when explicitly stated.
- Extract ALL relationships stated or strongly implied.
- MULTILINGUAL SUPPORT: Recognize Spanish kinship terms.
- Deduplicate people.
- Dates: If a year is mentioned without month/day, use ONLY "YYYY" format.
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

Respond with a JSON object. No other text.

IMPORTANT: Generate ALL output text in Spanish. Field names/keys in the JSON must remain in English, but all human-readable string values must be in Spanish.`;

const BIOGRAPHY_PROMPT = `You are a warm, empathetic biographer who writes vivid personal biographies based on family interview data.

Given information about a person (their details, relationships, and stories they appear in), write a biography. Return a JSON object with:

1. **biography**: A 2-4 paragraph biography in warm, narrative tone. Write it as if telling their story to a family member. Include relevant details about their life, relationships, and memorable moments from interviews. Be specific — reference actual events, places, dates, and relationships mentioned in the data.

Rules:
- Focus on what makes this person unique in their family context.
- Reference specific stories and moments when available.
- Be warm but not overly sentimental.
- If information is sparse, keep it shorter rather than inventing details.

Respond with a JSON object. No other text.

IMPORTANT: Generate ALL output text in Spanish. Field names/keys in the JSON must remain in English, but all human-readable string values must be in Spanish.`;

// ============================================================
// Simulated 30-minute transcript (~4500 words Spanish)
// A typical 30-minute conversational interview in Spanish
// produces roughly 4000-5000 words.
// ============================================================

const TRANSCRIPT_30MIN = `Bueno, voy a empezar desde el principio. Me llamo Valentina Rodriguez Chen, soy mujer, nací el quince de marzo de 1998 en la Ciudad de México. Mi familia es bastante grande y tiene una historia muy interesante porque mezcla tradiciones mexicanas y chinas. Voy a tratar de contar todo lo que pueda porque hay muchas historias que vale la pena preservar.

Mi papá se llama Jorge Rodriguez Vega y nació en 1970 en Guadalajara, Jalisco. Él es ingeniero civil y ha trabajado toda su vida construyendo puentes y carreteras por todo México. Cuando era joven, él quería ser arquitecto, pero su papá le dijo que la ingeniería era más práctica y que siempre iba a tener trabajo. Mi papá dice que fue el mejor consejo que le dieron en la vida porque ahora le encanta lo que hace. Trabajó en la construcción de la autopista Guadalajara-Colima y en varios puentes en Veracruz. Él conoció a mi mamá en la universidad en la Ciudad de México cuando los dos estaban en sus últimos años de carrera. La historia que cuenta mi mamá es que un día estaba en la biblioteca de la UNAM buscando un libro de anatomía y mi papá se acercó a preguntarle algo sobre cálculo porque pensó que ella estudiaba ingeniería también. Ella le dijo que era de medicina y él se puso todo rojo de la vergüenza, pero le invitó un café y así empezó todo.

Mi mamá se llama Sofía Chen Fernández, ella nació en 1973 también en la Ciudad de México. Es doctora, pediatra específicamente, y tiene su consultorio en la colonia Roma. Ella siempre quiso ser doctora desde que era niña. Mi abuelita Lucía me cuenta que cuando Sofía tenía como cinco años, le ponía curitas a todas sus muñecas y les tomaba la temperatura con un termómetro de juguete. Después en la secundaria ganó un concurso de ciencias con un proyecto sobre el sistema inmunológico y desde ahí no hubo duda de que iba a estudiar medicina. Ha atendido a cientos de niños en más de veinticinco años de carrera y muchos de sus pacientes la buscan hasta ahora que ya son adultos para que atienda a sus propios hijos. Mis papás se casaron en diciembre de 1996 en una boda que combinó tradiciones mexicanas y chinas. Hubo un banquete con mole y arroz frito, mi abuela Lucía hizo tamales oaxaqueños y mi abuelo Miguel preparó dim sum. Dice mi mamá que bailaron su primera canción con una mezcla de música de mariachi y una canción china que le gustaba a mi abuelo.

Tengo un hermano mayor que se llama Diego Rodriguez Chen. Diego nació en 1995, así que me lleva tres años. Él estudió medicina igual que mi mamá, es cirujano ortopédico y trabaja en el Hospital General de México. Diego siempre fue muy estudioso, el típico hermano mayor responsable que sacaba dieces en todo. Cuando estábamos chiquitos él me ayudaba con la tarea de matemáticas y me explicaba las cosas con una paciencia infinita. También era muy protector conmigo y con Isa, una vez en la primaria un niño me quitó mi lonchera y Diego fue a hablar con él y se la devolvió. Se casó el año pasado con Ana López, que también es doctora, es anestesióloga. Se conocieron durante la residencia en el hospital, pasaban tantas horas juntos en las guardias que era inevitable que se enamoraran. Tienen un bebé que se llama Matías, acaba de cumplir un año. El bebito es hermoso, tiene los ojos de Diego y la sonrisa de Ana. Es un niño muy tranquilo y risueño, ya está empezando a dar sus primeros pasitos.

También tengo una hermana menor que se llama Isabella, pero todos le decimos Isa. Ella nació en 2001 y acaba de terminar la universidad. Estudió diseño gráfico en la Universidad Iberoamericana y ya tiene su propio estudio de diseño que se llama "Studio Isa". Isa siempre fue la más creativa de la familia, desde chiquita dibujaba en todos lados, en las paredes, en los cuadernos de mi papá, hasta en los manteles de la abuela. Una vez pintó un mural enorme en la pared de su cuarto sin pedir permiso y mi mamá se enojó muchísimo, pero cuando vio lo bonito que había quedado, un jardín con mariposas y colibríes, no pudo enojarse más. Ahora Isa hace diseño de marca para restaurantes y cafeterías en la Ciudad de México. Le va muy bien, ya tiene como diez clientes fijos y acaba de contratar a su primera empleada.

Por el lado de mi papá, mis abuelos son Don Roberto Rodriguez y Doña Carmen Vega. Mi abuelo Roberto nació en 1945 en Guadalajara y fue militar, estuvo treinta años en el ejército mexicano. Entró al ejército cuando tenía dieciocho años y fue subiendo de rango hasta que llegó a ser coronel. Es un hombre muy serio y disciplinado, siempre impecable, siempre puntual, pero con sus nietos es el más tierno del mundo. Cuando éramos chiquitos nos sentaba en sus rodillas y nos contaba historias de cuando estuvo en servicio, de las misiones en la sierra de Guerrero, de cuando lo mandaron a ayudar después del terremoto del 85 en la Ciudad de México. Esas historias me fascinaban. Se retiró del ejército en 1993 y desde entonces se dedica a su jardín, tiene un jardín hermoso con rosales y árboles frutales.

Mi abuela Carmen nació en 1948, también en Guadalajara. Ella fue maestra de primaria durante cuarenta años en la misma escuela, la Escuela Primaria Benito Juárez en el centro de Guadalajara. Todos en el barrio la conocen como "la maestra Carmen" y hasta ahora que está jubilada la saludan sus ex alumnos en la calle. Una vez fuimos al mercado con ella y como cinco personas diferentes la pararon para decirle que ella les había enseñado a leer. Mi abuela siempre dice que no hay profesión más noble que ser maestra. Ella también es una cocinera increíble, sus enchiladas suizas y su pozole rojo son legendarios en la familia. Cada domingo cuando estamos en Guadalajara hace un pozole enorme y toda la familia va a comer a su casa.

Pero resulta que la historia de mis abuelos es complicada. Mi abuelo Roberto estuvo casado antes con una señora que se llama Marta Ruiz. Ellos se casaron muy jóvenes, como a los diecinueve años, y tuvieron un hijo, mi tío Andrés Rodriguez, que nació en 1965. Pero el matrimonio no funcionó, eran muy jóvenes y mi abuelo estaba mucho tiempo fuera por el ejército. Marta y mi abuelo se divorciaron como en 1966 o 1967, antes de que mi abuelo conociera a mi abuela Carmen. Andrés se fue a vivir con su mamá Marta a Tampico y creció allá. O sea que Andrés es medio hermano de mi papá Jorge porque comparten el mismo padre que es Roberto, pero tienen diferentes mamás. Por mucho tiempo Andrés y mi papá no se conocían bien, pero eso cambió después.

Mi tío Andrés ahora vive en Monterrey con su esposa Laura Garza. Él es contador público y tiene su propio despacho contable que le va bastante bien. Laura es maestra de yoga y tiene su propio estudio. Tienen dos hijos: mi primo Sebastián que tiene veinte años y está estudiando derecho en el Tecnológico de Monterrey, y mi prima Natalia que tiene dieciséis años y quiere ser veterinaria. Natalia es una niña increíble, tiene tres perros y dos gatos rescatados y pasa todo su tiempo libre en un refugio de animales.

Los papás de mi abuelo Roberto, o sea mis bisabuelos, fueron Don Antonio Rodriguez y Doña Elena Morales. Mi bisabuelo Antonio nació en 1920 en Guadalajara y era panadero. Tenía una panadería en el centro que se llamaba "La Espiga de Oro" y era famosa en todo el barrio por sus conchas, sus cuernos, sus polvorones y sus orejas. La panadería estaba en la calle Independencia y tenía un letrero verde con letras doradas que mi bisabuelo mandó hacer con un herrero del barrio. Yo no lo alcancé a conocer porque él falleció en 1995, tres años antes de que yo naciera, pero mi papá me ha contado tantas historias que siento como si lo hubiera conocido bien. Mi papá dice que Antonio se levantaba a las tres de la mañana todos los días para encender el horno de leña y empezar a preparar la masa. El olor a pan recién horneado se sentía a tres cuadras de distancia.

Mi bisabuela Elena nació en 1923 y ella sí la conocí mejor. Ella murió en 2010 cuando yo tenía doce años. Elena era una mujer increíble, muy fuerte y muy inteligente. Nunca fue a la universidad pero era la persona más sabia que he conocido. Ella mantenía la panadería funcionando mientras Antonio hacía el pan. Era la que llevaba las cuentas, atendía a los clientes, organizaba los pedidos para las fiestas y bodas del barrio, y se aseguraba de que todo marchara bien. Mi papá dice que sin Elena, la panadería no hubiera sobrevivido ni un año. Ella también hacía unos dulces de leche y cocadas que vendía aparte y que eran deliciosos.

Uno de mis recuerdos más bonitos es cuando íbamos a Guadalajara a visitar la casa de mis bisabuelos. La panadería ya no existía como negocio, había cerrado poco después de que murió mi bisabuelo Antonio, pero el horno viejo de ladrillo todavía estaba ahí en el patio trasero de la casa. Mi bisabuela Elena nos enseñaba a hacer pan a mi primo Lucas y a mí. Nos ponía delantalitos pequeños que ella misma había cosido para nosotros, nos amarraba el pelo y nos daba bolas de masa para que hiciéramos nuestras propias conchas. Por supuesto nos salían todas chuecas y feas, pero ella siempre decía con una sonrisa enorme que eran las más bonitas que había visto en toda su vida. Lucas y yo nos peleábamos por quién hacía la concha más redonda. El olor a pan recién horneado llenaba toda la calle y los vecinos venían a tocar la puerta para pedir. Mi bisabuela siempre les daba pan, nunca le dijo que no a nadie. Esos veranos en Guadalajara son de mis recuerdos más preciados, ojalá pudiera regresar a esos momentos.

Por el lado de mi mamá, mis abuelos maternos son Don Miguel Chen y Doña Lucía Fernández. Mi abuelo Miguel nació en 1947, él es chino-mexicano. Su familia vino de Cantón, China, en los años treinta. Su papá, o sea mi bisabuelo, se llamaba Chen Wei y llegó a México con prácticamente nada en los bolsillos junto con su hermano Chen Li. Abrieron un pequeño restaurante de comida china en el barrio chino de la Ciudad de México que se llamaba "El Dragón de Oro". Al principio era un local diminuto con solo cuatro mesas, pero la comida era tan buena que fue creciendo poco a poco. Mi bisabuelo Chen Wei era un cocinero extraordinario, sus fideos lo mein y su pato laqueado eran famosos. Mi abuelo Miguel creció ayudando en el restaurante desde que tenía como seis años, lavaba platos, pelaba verduras, y a los doce ya cocinaba solo. Eventualmente heredó el restaurante cuando mi bisabuelo se retiró en los años setenta. Todavía hoy el restaurante existe, aunque ahora lo manejan unos primos lejanos porque mi abuelo también se retiró hace unos diez años.

Mi abuela materna Lucía nació en 1950 en un pueblo pequeño cerca de Monte Albán en Oaxaca. Ella es de una familia zapoteca, su mamá hablaba zapoteco y español. Lucía creció viendo a su mamá hacer textiles en telar de cintura, esos rebozos hermosos con diseños tradicionales que tardan semanas en hacerse. Cuando tenía dieciocho años se fue a la Ciudad de México a estudiar enfermería porque quería ayudar a la gente de su comunidad. Ahí conoció a mi abuelo Miguel en el restaurante de su familia. Dice mi abuela que fue amor a primera vista, que un día entró al Dragón de Oro con unas compañeras de la escuela de enfermería y Miguel le sirvió un plato de sopa wonton. Cuando lo probó y vio la sonrisa de Miguel, supo que se iba a casar con él. Se casaron en 1970 después de dos años de noviazgo, fue una boda pequeña pero hermosa en Oaxaca.

Mi abuela cocinaba increíble. Combinaba la cocina oaxaqueña con la china de una manera que nadie más hacía. Hacía mole negro oaxaqueño que tardaba dos días en preparar, con más de veinte ingredientes incluyendo el chocolate, el chile pasilla oaxaqueño y las hojas de aguacate. Y mi abuelo hacía arroz frito con camarón, dumplings de cerdo al vapor, y rollitos primavera crujientes. En Navidad siempre teníamos esta mezcla extraordinaria de comida oaxaqueña y china que era absolutamente única. Mi abuela Lucía también nos enseñó a hacer tamales de mole, de rajas con queso, y de dulce con piña. Nos ponía a todos los nietos a untarle masa a las hojas de maíz y era un desastre glorioso, terminábamos todos llenos de masa y muertos de risa.

Mi papá tiene una hermana mayor que se llama Patricia Rodriguez Vega, ella nació en 1968. Mi tía Paty, como le decimos todos, es abogada corporativa y trabaja en uno de los bufetes de abogados más importantes de Guadalajara, Martínez y Asociados. Ella es una mujer muy fuerte e independiente, fue de las primeras mujeres en ocupar un puesto directivo en su firma. Se casó con mi tío Ricardo Mendoza que es arquitecto y tiene su propio despacho de arquitectura. Juntos diseñaron y construyeron su casa en la colonia Providencia que es preciosa, moderna pero con toques mexicanos como un patio central con una fuente de talavera.

Tienen dos hijos: mi primo Lucas que nació en 1997, él estudió ingeniería en sistemas en el ITESO y trabaja en una empresa de tecnología en Guadalajara desarrollando aplicaciones. Lucas es como mi hermano adicional, literal crecimos juntos porque como nuestros papás son hermanos nos veíamos todo el tiempo. De chiquitos jugábamos por horas en el jardín de mis abuelos, inventábamos mundos imaginarios y hacíamos fuertes con las cobijas de mi abuela Carmen. En la adolescencia Lucas y yo íbamos juntos a conciertos y a veces nos metíamos en problemas juntos pero nos cubríamos mutuamente. Y mi prima Camila que nació en 2000 estudia psicología en la Universidad de Guadalajara. Camila es muy social y extrovertida, es la que siempre organiza las fiestas y reuniones familiares. Es la que manda los mensajes al grupo de WhatsApp para coordinar los cumpleaños y las cenas.

La tía Paty también es mi madrina, desde que nací ella y yo tenemos una conexión especial. En mis cumpleaños siempre me daba los mejores regalos, recuerdo que cuando cumplí quince años me regaló un collar de oro con una V de diamantitos que todavía uso. Ella siempre me dice que si algún día quiero estudiar derecho me va a dar trabajo en su firma, pero la verdad yo estudié comunicación y no me arrepiento.

Mi mamá tiene un hermano menor que se llama Eduardo Chen Fernández, nacido en 1975. Mi tío Eduardo es brillante, estudió matemáticas en la UNAM y después se fue a hacer un doctorado en la Universidad de Toronto en Canadá. Ahora es profesor titular de matemáticas aplicadas ahí y ha publicado como treinta artículos en revistas internacionales. Se fue a Canadá cuando tenía veintitrés años para el doctorado y ya nunca regresó a vivir a México, aunque viene dos veces al año a visitarnos. Se casó con Teresa Gutiérrez, que también es mexicana, de Puebla, y es psicóloga clínica. Tienen un hijo que se llama Daniel Chen Gutiérrez, que tiene veintidós años y estudia ingeniería mecánica en la Universidad de Toronto. Daniel es bilingüe perfecto en español e inglés, y también habla algo de mandarín que le enseñó mi abuelo Miguel. Era muy triste no poder ver al tío Eduardo seguido de chiquita, pero con la tecnología ahora hacemos videollamadas cada semana y es como si estuviera aquí.

Hablando de Navidades, esas son las mejores fiestas del año en nuestra familia. Siempre las celebramos en la casa de mis papás en la Ciudad de México porque es la más grande. Mi abuela Lucía se pasa literalmente dos días haciendo mole negro oaxaqueño y tamales de diferentes sabores: de mole, de rajas con queso, de verde con pollo, y de dulce con piña. Mi abuelo Miguel prepara su arroz frito especial con camarón y hace rollos primavera que se acaban en cinco minutos porque son adictivos. Mi tía Paty siempre trae un pastel de tres leches que ella misma hornea con una receta secreta de mi abuela Carmen. Mi mamá prepara su famoso ponche de frutas con tejocotes, guayaba, caña de azúcar, manzana, ciruela pasa y un poquito de mezcal que le da un toque espectacular. La casa se llena del olor más increíble, una mezcla de mole, arroz frito, tamales y ponche que es simplemente el olor de la felicidad.

Después de la cena de Nochebuena, mi prima Camila siempre organiza los juegos. Hacemos lotería mexicana y mi hermana Isa le ayuda con la decoración de toda la casa. Isa siempre hace unos centros de mesa hermosos con flores de cempasúchil y papel picado. También hacemos el intercambio de regalos al estilo "amigo secreto" y siempre hay algún drama porque alguien compra un regalo muy barato o porque alguien adivina quién le tocó. Luego los hombres se van a la sala a ver fútbol y las mujeres nos quedamos platicando y bailando hasta la madrugada. Siempre hacemos videollamada con mi tío Eduardo, mi tía Teresa y mi primo Daniel en Canadá, que por la diferencia de horario a veces están medio dormidos, pero siempre se conectan. Mi abuela Lucía les muestra los tamales por la cámara y Daniel siempre dice que un día va a venir a México solo para los tamales de la abuela.

Uno de los momentos más emotivos de mi vida fue cuando nació mi sobrino Matías. Toda la familia viajó a la Ciudad de México para estar ahí. Mis abuelos Roberto y Carmen vinieron de Guadalajara, mi tía Paty y mi tío Ricardo también. Fue un parto largo, Ana estuvo como catorce horas en labor, y todos nosotros estábamos en la sala de espera del hospital vueltos locos. Mi papá Jorge, que normalmente es un hombre muy serio y reservado, cuando Diego salió con Matías en los brazos y nos lo mostró por el vidrio, a mi papá se le llenaron los ojos de lágrimas. Luego cuando por fin pudimos entrar al cuarto, mi papá abrazó a Diego y le dijo "estoy muy orgulloso de ti, hijo, vas a ser un gran padre." Mi abuela Carmen también lloró de la emoción y dijo que Matías tenía la misma nariz que mi bisabuelo Antonio. Mi mamá Sofía, como buena pediatra, fue la primera en revisar al bebé de pies a cabeza y declarar orgullosamente que estaba absolutamente perfecto. Mi bisabuela Elena, que en paz descanse, hubiera estado tan feliz de conocer a su tataranieto.

También quiero hablar de mi tío Andrés porque su historia es muy importante para la familia. Como dije, él es medio hermano de mi papá. Cuando era niño no tenía mucha relación con la familia de mi abuelo Roberto porque vivía con su mamá Marta en Tampico. Dice mi tío que de chiquito se sentía triste porque sabía que tenía un papá en Guadalajara que tenía otra familia. Marta nunca le habló mal de mi abuelo, pero tampoco hacía mucho esfuerzo por mantener la relación. Cuando Andrés tenía como dieciocho años decidió tomar un camión a Guadalajara y tocar la puerta de mi abuelo. Dice que estaba temblando del miedo. Mi abuelo Roberto abrió la puerta y se le quedó viendo un momento, y luego lo abrazó y empezó a llorar. Fue difícil al principio porque había mucho dolor acumulado, pero mi abuela Carmen, que es un ángel en la tierra, lo recibió como si fuera su propio hijo. Le dijo "esta también es tu casa, siempre lo ha sido." Desde ese día Andrés viene a todas las reuniones familiares y sus hijos Sebastián y Natalia se llevan increíble con nosotros. Sebastián y Lucas son casi de la misma edad y son como mejores amigos.

Recuerdo una vez que hicimos un viaje familiar todos juntos a la playa en Puerto Escondido, Oaxaca. Fuimos como dieciocho personas: mis papás, mis hermanos Diego e Isa, mis abuelos Roberto y Carmen, mi tía Paty con mi tío Ricardo y mis primos Lucas y Camila, mi tío Andrés con su esposa Laura y Sebastián que era chiquito todavía, y mi abuela Lucía. Alquilamos dos casas grandes una al lado de la otra frente al mar. Pasamos una semana absolutamente increíble. Mi abuelo Roberto, que normalmente es muy serio y militar en su actitud, se puso un sombrero ridículo de palma con estrellitas que le compró a un vendedor ambulante y jugó en la arena con todos los nietos como si tuviera cinco años. Lucas y yo intentamos aprender a surfear juntos con un instructor local, y fue un desastre glorioso, nos caímos como cien veces cada uno, tragamos medio océano de agua salada, pero nos reíamos tanto que nos dolía el estómago. Mi prima Camila y mi hermana Isa construyeron un castillo de arena enorme con torres y un foso que ganó un mini-concurso improvisado entre las familias de la playa. Mi abuela Lucía cocinó un caldo de camarón estilo oaxaqueño con camarones frescos que compramos en el mercado del pueblo y fue el mejor caldo de mi vida. Fue la primera vez que casi toda la familia extendida estaba junta en un mismo lugar y fue mágico, pura felicidad.

Mi papá siempre dice que lo que hace especial a nuestra familia es la mezcla de culturas. Tenemos raíces mexicanas muy fuertes con los Rodriguez y los Morales de Guadalajara, raíces zapotecas y oaxaqueñas por mi abuela Lucía, y la herencia china de los Chen que vino desde Cantón. En nuestra casa se come lo mismo arroz frito que mole negro, se celebra el Año Nuevo Chino con decoraciones rojas y sobres de la suerte, y el Día de los Muertos con un altar enorme lleno de flores de cempasúchil, pan de muerto, fotos de mi bisabuelo Antonio y mi bisabuela Elena, y los platos favoritos de los que ya no están. Mi mamá creció comiendo dumplings y tamales por igual, y ahora nosotros también. Mi abuelo Miguel siempre nos dice que la diversidad es la riqueza más grande que puede tener una familia, que no hay que tener miedo de ser diferentes porque en la diferencia está la belleza.

Quiero mencionar también algo que pasó hace unos años que unió mucho a la familia. Mi abuelo Roberto tuvo un problema del corazón, le tuvieron que hacer una cirugía de bypass. Fue un momento muy difícil y aterrador para todos. Mi tío Andrés fue el primero en llegar al hospital desde Monterrey, manejó toda la noche. Mi tía Paty se encargó de todo lo legal y los seguros. Mi mamá, como doctora, estaba en contacto constante con los cardiólogos y nos explicaba todo en términos que pudiéramos entender. Mi papá no se separó del lado de su papá ni un momento. Hasta mi tío Eduardo voló desde Canadá. Cuando mi abuelo salió de la cirugía y abrió los ojos y vio a toda su familia reunida ahí, dijo con su voz ronca de militar: "con razón me quería morir, para verlos a todos juntos." Todos nos reímos y lloramos al mismo tiempo.

Lo que más valoro de mi familia es que a pesar de las distancias y las diferencias, siempre estamos conectados. Mi tío Eduardo está en Canadá, mi tío Andrés en Monterrey, mis abuelos paternos en Guadalajara, y nosotros en la Ciudad de México, pero siempre encontramos la manera de estar juntos cuando importa. Ya sea en persona o por videollamada, la familia siempre está presente. Cuando hubo problemas, como lo del corazón de mi abuelo o cuando mi tío Andrés tuvo problemas financieros en su despacho, toda la familia se unió para apoyar sin juzgar. Eso es lo que significa ser un Rodriguez Chen: que nunca, pero nunca, estás solo. Y eso es lo que quiero que mis hijos sepan algún día, que vienen de una familia enorme, diversa, complicada a veces, pero llena de amor.

Ah, y quiero agregar algo que se me olvidaba. Mi abuelo Miguel tiene una tradición muy bonita que empezó cuando yo era chiquita. Cada Año Nuevo Chino él nos da a todos los nietos un sobre rojo con dinero adentro, como se hace en China. Pero también nos cuenta la historia de su familia, de cómo su papá Chen Wei salió de Cantón durante una época muy difícil con solo una maleta y el sueño de darle una vida mejor a su familia. De cómo cruzó el océano en un barco que tardó semanas en llegar a Veracruz. De cómo no hablaba español y tuvo que aprenderlo en la calle, vendiendo dulces chinos en un carrito mientras juntaba dinero para abrir el restaurante. De cómo conoció a mi bisabuela, una mujer mexicana llamada Rosa que fue su primera clienta del carrito de dulces y terminó siendo su esposa. Mi abuelo siempre dice que la historia de su papá es la prueba de que con trabajo duro y un poco de suerte, cualquier sueño es posible. A mí esa historia siempre me emociona hasta las lágrimas.

También quiero contar algo de mi vida personal que tiene que ver con la familia. Yo estudié comunicación en la UNAM y ahora trabajo como productora de contenido digital para una empresa de medios. Pero lo que realmente me apasiona es documentar historias familiares, por eso me encanta esta plataforma de Matra. Creo que cada familia tiene historias que merecen ser contadas y preservadas. Mi bisabuelo Antonio ya no puede contar la historia de la Espiga de Oro, pero nosotros sí podemos contarla por él. Mi bisabuela Elena ya no puede enseñarnos a hacer conchas, pero ese recuerdo vive en cada uno de nosotros que estuvo en aquella cocina con ella. Las historias son la manera en que las personas que amamos siguen vivas, aunque ya no estén físicamente con nosotros.

Hay otra cosa que quiero mencionar sobre mi hermano Diego porque creo que es importante. Cuando Diego decidió estudiar medicina, mi papá al principio no estaba completamente de acuerdo. Mi papá quería que Diego fuera ingeniero como él, decía que la medicina era una carrera muy larga y muy sacrificada. Pero mi mamá Sofía apoyó a Diego desde el primer momento y le dijo a mi papá que dejara al muchacho seguir su vocación. Diego tuvo que hacer seis años de carrera, más un año de servicio social en una comunidad rural en Chiapas donde no había ni un hospital cerca, más cuatro años de especialidad en ortopedia. Fueron once años de formación durante los cuales trabajó turnos de treinta y seis horas y ganaba prácticamente nada. Pero nunca se quejó y ahora es uno de los mejores cirujanos ortopédicos jóvenes del hospital. Mi papá está increíblemente orgulloso de él, aunque le costó admitirlo al principio.

Mi hermana Isa también tuvo que luchar por lo suyo. En nuestra familia todos son profesionistas tradicionales: ingenieros, doctores, abogados, contadores, maestros. Cuando Isa dijo que quería estudiar diseño gráfico, mi abuelo Roberto le dijo que eso no era una carrera de verdad. Isa se enojó tanto que no le habló a mi abuelo por dos meses. Finalmente mi abuela Carmen intervino y le dijo a Roberto que dejara a la niña en paz, que el mundo necesitaba gente creativa también. Ahora que Isa tiene su estudio funcionando y hasta sale en revistas de diseño, mi abuelo es el primero en presumirla con sus amigos del club de veteranos. El otro día lo caché enseñándole el Instagram de Studio Isa a un señor en la barbería.

Yo creo que las mejores familias son las que se permiten cambiar y crecer juntas. Mis bisabuelos Antonio y Elena eran panaderos, mis abuelos fueron militar, maestra, restaurantero y enfermera. Mis papás son ingeniero y doctora. Y ahora en nuestra generación tenemos un cirujano, una diseñadora, una productora de contenido, un ingeniero de software, una psicóloga, un estudiante de derecho y una futura veterinaria. La familia se va reinventando con cada generación, pero los valores fundamentales siguen siendo los mismos: trabajar duro, apoyarse mutuamente, y nunca olvidar de dónde vienes.

Creo que ya dije mucho, pero la verdad es que podría seguir hablando de mi familia por horas. Cada persona que mencioné tiene mil historias más que contar. Espero que esto sirva para que las futuras generaciones de Rodriguez Chen sepan quiénes somos y de dónde venimos. Porque al final del día, somos la suma de todas estas historias, de todos estos momentos, de todas estas personas que nos han formado y que nos han querido. Y eso no tiene precio.`;

// ============================================================
// API calls with token tracking
// ============================================================

async function callGroqWithUsage(systemPrompt, userMessage, label) {
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
  const usage = data.usage;

  return {
    label,
    model: data.model,
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    },
    result: JSON.parse(data.choices[0].message.content),
  };
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   MATRA — Premium User Monthly Cost Calculator             ║');
  console.log('║   Using REAL Groq API token measurements                   ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log('║   Scenario: 30 conversations/month × 30 mins each         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const subjectName = 'Valentina Rodriguez Chen';
  const narratorContext = `[Narrator/subject of this interview is ${subjectName}. Their gender is female. Use correct gendered language when referring to ${subjectName}. Any first-person references ("I", "me", "my") refer to ${subjectName}. Do NOT create a separate entry for the narrator — they are ${subjectName}. IMPORTANT: When the narrator says "my mom", "my dad", "my brother", etc., create relationships between those people and ${subjectName}. Use ${subjectName} as the personA or personB name in relationships — never use "I" or "me" as a person name.]\n\n`;

  const existingTreeContext = `\n\n[EXISTING FAMILY TREE — These people already exist in the database. When you detect a person who matches an existing entry, use their exact name. Do NOT create duplicates.
Known people:
  - Jorge Rodriguez, b. 1970, from Guadalajara, male [id:existing-jorge]
  - Sofía Chen, b. 1973, from Ciudad de México, female [id:existing-sofia]
  - Diego Rodriguez Chen, b. 1995, male [id:existing-diego]
Known relationships:
  - Jorge Rodriguez is parent of Valentina Rodriguez Chen
  - Sofía Chen is parent of Valentina Rodriguez Chen
  - Diego Rodriguez Chen is sibling of Valentina Rodriguez Chen
Existing stories (avoid duplicating these themes):
  - "La panadería de mi bisabuelo"
  - "El nacimiento de mi sobrino"
]\n`;

  const fullTranscriptForExtraction = narratorContext + existingTreeContext + TRANSCRIPT_30MIN;
  const fullTranscriptForSummary = narratorContext + TRANSCRIPT_30MIN;

  // Simulate biography input (a person with relationships and stories)
  const biographyInput = JSON.stringify({
    person: { firstName: 'Jorge', lastName: 'Rodriguez Vega', birthDate: '1970', birthPlace: 'Guadalajara', gender: 'male', profession: 'Ingeniero civil' },
    relationships: [
      { type: 'parent', relatedPerson: 'Valentina Rodriguez Chen' },
      { type: 'parent', relatedPerson: 'Diego Rodriguez Chen' },
      { type: 'parent', relatedPerson: 'Isabella Rodriguez Chen' },
      { type: 'spouse', relatedPerson: 'Sofía Chen Fernández' },
      { type: 'child', relatedPerson: 'Roberto Rodriguez' },
      { type: 'child', relatedPerson: 'Carmen Vega' },
      { type: 'sibling', relatedPerson: 'Patricia Rodriguez Vega' },
      { type: 'half_sibling', relatedPerson: 'Andrés Rodriguez' },
    ],
    stories: [
      { title: 'La panadería de mi bisabuelo', excerpt: 'Mi papá nos llevaba cada verano a Guadalajara...' },
      { title: 'El nacimiento de Matías', excerpt: 'Mi papá Jorge abrazó a Diego y le dijo que estaba muy orgulloso...' },
      { title: 'Vacaciones en Puerto Escondido', excerpt: 'Fuimos como quince personas a la playa...' },
    ],
    interviewExcerpts: [
      'Mi papá se llama Jorge Rodriguez Vega y nació en 1970 en Guadalajara...',
      'Él es ingeniero civil y ha trabajado toda su vida construyendo puentes...',
    ],
  });

  console.log(`  📝 Transcript length: ${TRANSCRIPT_30MIN.length} chars (~${Math.round(TRANSCRIPT_30MIN.split(/\s+/).length)} words)`);
  console.log(`  📨 Extraction input: ${fullTranscriptForExtraction.length} chars`);
  console.log(`  📨 Summary input: ${fullTranscriptForSummary.length} chars`);
  console.log(`  📨 Biography input: ${biographyInput.length} chars\n`);

  // ── Call 1: Extraction ──
  console.log('  ⏳ Call 1/3: Entity extraction...');
  const extraction = await callGroqWithUsage(
    EXTRACTION_PROMPT + '\n\nIMPORTANT: Generate ALL output text in Spanish. Field names/keys in the JSON must remain in English, but all human-readable string values must be in Spanish.\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
    fullTranscriptForExtraction,
    'Extraction'
  );
  console.log(`  ✅ Done — ${extraction.usage.prompt_tokens} input + ${extraction.usage.completion_tokens} output = ${extraction.usage.total_tokens} tokens`);

  // ── Call 2: Summarization ──
  console.log('  ⏳ Call 2/3: Summarization + stories...');
  const summary = await callGroqWithUsage(
    SUMMARY_PROMPT + '\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
    fullTranscriptForSummary,
    'Summarization'
  );
  console.log(`  ✅ Done — ${summary.usage.prompt_tokens} input + ${summary.usage.completion_tokens} output = ${summary.usage.total_tokens} tokens`);

  // ── Call 3: Biography (on-demand, but let's measure it) ──
  console.log('  ⏳ Call 3/3: Biography generation (on-demand)...');
  const biography = await callGroqWithUsage(
    BIOGRAPHY_PROMPT + '\n\nIMPORTANT: Respond ONLY with valid JSON, no other text.',
    biographyInput,
    'Biography'
  );
  console.log(`  ✅ Done — ${biography.usage.prompt_tokens} input + ${biography.usage.completion_tokens} output = ${biography.usage.total_tokens} tokens`);

  // ============================================================
  // COST CALCULATIONS
  // ============================================================

  const llmPricing = PRICING['llama-3.3-70b-versatile'];
  const whisperPricing = PRICING['whisper-large-v3'];

  const calls = [extraction, summary, biography];

  console.log('\n' + '═'.repeat(64));
  console.log('  📊 TOKEN USAGE PER INTERVIEW (actual API measurements)');
  console.log('═'.repeat(64));
  console.log('');
  console.log('  ┌─────────────────────┬──────────┬──────────┬──────────┐');
  console.log('  │ Call                │ Input    │ Output   │ Total    │');
  console.log('  ├─────────────────────┼──────────┼──────────┼──────────┤');

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const call of calls) {
    const label = call.label.padEnd(19);
    const inp = String(call.usage.prompt_tokens).padStart(8);
    const out = String(call.usage.completion_tokens).padStart(8);
    const tot = String(call.usage.total_tokens).padStart(8);
    console.log(`  │ ${label} │ ${inp} │ ${out} │ ${tot} │`);
    totalInputTokens += call.usage.prompt_tokens;
    totalOutputTokens += call.usage.completion_tokens;
  }

  const totalTokens = totalInputTokens + totalOutputTokens;
  console.log('  ├─────────────────────┼──────────┼──────────┼──────────┤');
  console.log(`  │ ${'LLM TOTAL'.padEnd(19)} │ ${String(totalInputTokens).padStart(8)} │ ${String(totalOutputTokens).padStart(8)} │ ${String(totalTokens).padStart(8)} │`);
  console.log('  └─────────────────────┴──────────┴──────────┴──────────┘');

  // Now calculate per-interview and monthly costs
  const INTERVIEWS_PER_MONTH = 30;
  const INTERVIEW_DURATION_HOURS = 0.5; // 30 minutes

  // STT cost
  const sttCostPerInterview = whisperPricing.perAudioHour * INTERVIEW_DURATION_HOURS;

  // LLM cost per interview (extraction + summary are always called)
  const extractionInputCost = (extraction.usage.prompt_tokens / 1_000_000) * llmPricing.input;
  const extractionOutputCost = (extraction.usage.completion_tokens / 1_000_000) * llmPricing.output;
  const summaryInputCost = (summary.usage.prompt_tokens / 1_000_000) * llmPricing.input;
  const summaryOutputCost = (summary.usage.completion_tokens / 1_000_000) * llmPricing.output;

  const llmCostPerInterview = extractionInputCost + extractionOutputCost +
    summaryInputCost + summaryOutputCost;

  // Biography cost (on-demand, assume user generates ~1 biography per interview on average)
  const bioCostPerCall = (biography.usage.prompt_tokens / 1_000_000) * llmPricing.input +
    (biography.usage.completion_tokens / 1_000_000) * llmPricing.output;

  // Total per interview (without biography)
  const baseCostPerInterview = sttCostPerInterview + llmCostPerInterview;

  // Monthly costs
  const monthlySTT = sttCostPerInterview * INTERVIEWS_PER_MONTH;
  const monthlyLLM = llmCostPerInterview * INTERVIEWS_PER_MONTH;
  const monthlyBase = baseCostPerInterview * INTERVIEWS_PER_MONTH;

  // Biography scenarios
  const biographiesPerMonth_low = 5;
  const biographiesPerMonth_med = 15;
  const biographiesPerMonth_high = 30;

  const monthlyBio_low = bioCostPerCall * biographiesPerMonth_low;
  const monthlyBio_med = bioCostPerCall * biographiesPerMonth_med;
  const monthlyBio_high = bioCostPerCall * biographiesPerMonth_high;

  console.log('\n' + '═'.repeat(64));
  console.log('  💰 COST BREAKDOWN');
  console.log('═'.repeat(64));

  console.log('\n  ── Per Interview (30 min) ──');
  console.log(`  STT (Whisper V3 Large):      $${sttCostPerInterview.toFixed(4)}`);
  console.log(`  LLM Extraction:              $${(extractionInputCost + extractionOutputCost).toFixed(4)}`);
  console.log(`    ├─ Input (${extraction.usage.prompt_tokens} tokens):  $${extractionInputCost.toFixed(4)}`);
  console.log(`    └─ Output (${extraction.usage.completion_tokens} tokens): $${extractionOutputCost.toFixed(4)}`);
  console.log(`  LLM Summarization:           $${(summaryInputCost + summaryOutputCost).toFixed(4)}`);
  console.log(`    ├─ Input (${summary.usage.prompt_tokens} tokens):  $${summaryInputCost.toFixed(4)}`);
  console.log(`    └─ Output (${summary.usage.completion_tokens} tokens): $${summaryOutputCost.toFixed(4)}`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  Total per interview:         $${baseCostPerInterview.toFixed(4)}`);

  console.log(`\n  Biography (per call):         $${bioCostPerCall.toFixed(4)}`);
  console.log(`    ├─ Input (${biography.usage.prompt_tokens} tokens):   $${((biography.usage.prompt_tokens / 1_000_000) * llmPricing.input).toFixed(4)}`);
  console.log(`    └─ Output (${biography.usage.completion_tokens} tokens):  $${((biography.usage.completion_tokens / 1_000_000) * llmPricing.output).toFixed(4)}`);

  console.log('\n' + '═'.repeat(64));
  console.log('  📅 MONTHLY COST (30 interviews × 30 min)');
  console.log('═'.repeat(64));

  console.log(`\n  STT (30 × 30min):            $${monthlySTT.toFixed(2)}`);
  console.log(`  LLM (extraction + summary):  $${monthlyLLM.toFixed(2)}`);
  console.log(`  ─────────────────────────────────────`);
  console.log(`  BASE MONTHLY COST:           $${monthlyBase.toFixed(2)}`);

  console.log('\n  ── With Biography Generation ──');
  console.log(`  + ${biographiesPerMonth_low} biographies/month:       $${(monthlyBase + monthlyBio_low).toFixed(2)}  (+ $${monthlyBio_low.toFixed(2)})`);
  console.log(`  + ${biographiesPerMonth_med} biographies/month:      $${(monthlyBase + monthlyBio_med).toFixed(2)}  (+ $${monthlyBio_med.toFixed(2)})`);
  console.log(`  + ${biographiesPerMonth_high} biographies/month:      $${(monthlyBase + monthlyBio_high).toFixed(2)}  (+ $${monthlyBio_high.toFixed(2)})`);

  console.log('\n' + '═'.repeat(64));
  console.log('  📊 WORST CASE — MAX USAGE PREMIUM USER');
  console.log('═'.repeat(64));

  const worstCase = monthlyBase + monthlyBio_high;
  console.log(`\n  30 interviews + 30 biographies:  $${worstCase.toFixed(2)}/month`);

  // Show pricing basis
  console.log('\n' + '═'.repeat(64));
  console.log('  💵 GROQ PRICING USED');
  console.log('═'.repeat(64));
  console.log(`\n  ${llmPricing.label}:`);
  console.log(`    Input:  $${llmPricing.input}/M tokens`);
  console.log(`    Output: $${llmPricing.output}/M tokens`);
  console.log(`  ${whisperPricing.label}:`);
  console.log(`    Price:  $${whisperPricing.perAudioHour}/audio hour`);

  console.log('\n' + '═'.repeat(64));
  console.log('  📈 TOKEN BUDGET SUMMARY');
  console.log('═'.repeat(64));

  const monthlyInputTokens = (extraction.usage.prompt_tokens + summary.usage.prompt_tokens) * INTERVIEWS_PER_MONTH;
  const monthlyOutputTokens = (extraction.usage.completion_tokens + summary.usage.completion_tokens) * INTERVIEWS_PER_MONTH;
  const monthlyTotalTokens = monthlyInputTokens + monthlyOutputTokens;
  const monthlyAudioHours = INTERVIEW_DURATION_HOURS * INTERVIEWS_PER_MONTH;

  console.log(`\n  Monthly input tokens:   ${monthlyInputTokens.toLocaleString()}`);
  console.log(`  Monthly output tokens:  ${monthlyOutputTokens.toLocaleString()}`);
  console.log(`  Monthly total tokens:   ${monthlyTotalTokens.toLocaleString()}`);
  console.log(`  Monthly audio hours:    ${monthlyAudioHours} hours`);
  console.log('');

  // Save results
  const output = {
    measured_at: new Date().toISOString(),
    scenario: {
      interviews_per_month: INTERVIEWS_PER_MONTH,
      duration_minutes: 30,
      transcript_words: TRANSCRIPT_30MIN.split(/\s+/).length,
      transcript_chars: TRANSCRIPT_30MIN.length,
    },
    per_interview: {
      extraction: extraction.usage,
      summarization: summary.usage,
      biography: biography.usage,
      stt_cost: sttCostPerInterview,
      llm_cost: llmCostPerInterview,
      total_cost: baseCostPerInterview,
    },
    monthly: {
      stt_cost: monthlySTT,
      llm_cost: monthlyLLM,
      base_cost: monthlyBase,
      with_5_bios: monthlyBase + monthlyBio_low,
      with_15_bios: monthlyBase + monthlyBio_med,
      with_30_bios: monthlyBase + monthlyBio_high,
      total_input_tokens: monthlyInputTokens,
      total_output_tokens: monthlyOutputTokens,
      total_tokens: monthlyTotalTokens,
      audio_hours: monthlyAudioHours,
    },
    pricing: PRICING,
  };

  const outPath = path.join(__dirname, 'cost-analysis.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`  💾 Full results saved to: ${outPath}\n`);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

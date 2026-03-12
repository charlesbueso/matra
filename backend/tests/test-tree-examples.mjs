#!/usr/bin/env node
// ============================================================
// Matra — Tree Layout Examples Visualizer
// ============================================================
// Generates an interactive HTML file with built-in family tree
// examples to verify the layout algorithm handles all cases
// without node overlaps or misalignment.
//
// Usage:
//   node test-tree-examples.mjs                # all examples
//   node test-tree-examples.mjs 3 5            # only examples 3 & 5
//
// Output: test-tree-examples.html
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Parse args ──
const scenarioNums = [];
for (const arg of process.argv.slice(2)) {
  const n = parseInt(arg);
  if (!isNaN(n)) scenarioNums.push(n);
}

// ============================================================
// BUILT-IN TREE EXAMPLES
// ============================================================

let id = 0;
function pid() { return `p${++id}`; }

function person(firstName, lastName = null, isNarrator = false) {
  return { id: pid(), first_name: firstName, last_name: lastName, nickname: null, birth_date: null, isNarrator };
}

function rel(personA, personB, type, verified = true) {
  return {
    id: `rel-${id++}`,
    person_a_id: personA.id,
    person_b_id: personB.id,
    relationship_type: type,
    confidence: 0.9,
    verified,
  };
}

function buildScenarios() {
  const scenarios = [];

  // ─── 1. Simple Nuclear Family ───
  {
    const me = person('Carlos', 'García', true);
    const mom = person('María', 'López');
    const dad = person('Roberto', 'García');
    const sis = person('Ana', 'García');
    scenarios.push({
      name: '1. Nuclear Family (2 parents, 2 kids)',
      people: [me, mom, dad, sis],
      relationships: [
        rel(dad, mom, 'spouse'),
        rel(dad, me, 'parent'),
        rel(dad, sis, 'parent'),
        rel(mom, me, 'parent'),
        rel(mom, sis, 'parent'),
        rel(me, sis, 'sibling'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 2. Three Generations ───
  {
    const me = person('Sofia', 'Martínez', true);
    const mom = person('Laura', 'Sánchez');
    const dad = person('Pedro', 'Martínez');
    const abuela = person('Rosa', 'Hernández');
    const abuelo = person('Miguel', 'Sánchez');
    const bro = person('Diego', 'Martínez');
    scenarios.push({
      name: '2. Three Generations (grandparents → parents → kids)',
      people: [me, mom, dad, abuela, abuelo, bro],
      relationships: [
        rel(abuelo, abuela, 'spouse'),
        rel(abuelo, mom, 'parent'),
        rel(abuela, mom, 'parent'),
        rel(dad, mom, 'spouse'),
        rel(dad, me, 'parent'),
        rel(dad, bro, 'parent'),
        rel(mom, me, 'parent'),
        rel(mom, bro, 'parent'),
        rel(me, bro, 'sibling'),
        rel(abuelo, me, 'grandparent'),
        rel(abuela, me, 'grandparent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 3. Divorce & Remarriage (blended) ───
  {
    const me = person('Emma', 'Wilson', true);
    const mom = person('Sarah', 'Wilson');
    const dad = person('James', 'Wilson');
    const stepmom = person('Karen', 'Taylor');
    const halfBro = person('Liam', 'Wilson');
    const sis = person('Olivia', 'Wilson');
    scenarios.push({
      name: '3. Blended Family (divorce + remarriage + half-sibling)',
      people: [me, mom, dad, stepmom, halfBro, sis],
      relationships: [
        rel(dad, mom, 'ex_spouse'),
        rel(dad, stepmom, 'spouse'),
        rel(dad, me, 'parent'),
        rel(mom, me, 'parent'),
        rel(dad, sis, 'parent'),
        rel(mom, sis, 'parent'),
        rel(me, sis, 'sibling'),
        rel(dad, halfBro, 'parent'),
        rel(stepmom, halfBro, 'parent'),
        rel(me, halfBro, 'half_sibling'),
        rel(stepmom, me, 'step_parent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 4. Multiple Spouses (triple divorce) ───
  {
    const me = person('Marco', 'Torres', true);
    const wife1 = person('Andrea', 'Ruiz');
    const wife2 = person('Priya', 'Patel');
    const wife3 = person('Steve', 'Park');
    const kid1 = person('Mia', 'Torres');
    const kid2 = person('Noah', 'Torres');
    const kid3 = person('Zara', 'Torres');
    scenarios.push({
      name: '4. Triple Marriage (3 spouses, kids from each)',
      people: [me, wife1, wife2, wife3, kid1, kid2, kid3],
      relationships: [
        rel(me, wife1, 'ex_spouse'),
        rel(me, wife2, 'ex_spouse'),
        rel(me, wife3, 'spouse'),
        rel(me, kid1, 'parent'),
        rel(wife1, kid1, 'parent'),
        rel(me, kid2, 'parent'),
        rel(wife2, kid2, 'parent'),
        rel(me, kid3, 'parent'),
        rel(wife3, kid3, 'parent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 5. Five Generations ───
  {
    const me = person('Alex', 'Chen', true);
    const dad = person('Wei', 'Chen');
    const mom = person('Lily', 'Zhang');
    const gpa = person('Jun', 'Chen');
    const gma = person('Mei', 'Wang');
    const ggpa = person('Bao', 'Chen');
    const ggma = person('Hua', 'Li');
    const son = person('Ryan', 'Chen');
    const wife = person('Jessica', 'Kim');
    scenarios.push({
      name: '5. Five Generations (great-grandparent → child)',
      people: [me, dad, mom, gpa, gma, ggpa, ggma, son, wife],
      relationships: [
        rel(ggpa, ggma, 'spouse'),
        rel(ggpa, gpa, 'parent'),
        rel(ggma, gpa, 'parent'),
        rel(gpa, gma, 'spouse'),
        rel(gpa, dad, 'parent'),
        rel(gma, dad, 'parent'),
        rel(dad, mom, 'spouse'),
        rel(dad, me, 'parent'),
        rel(mom, me, 'parent'),
        rel(me, wife, 'spouse'),
        rel(me, son, 'parent'),
        rel(wife, son, 'parent'),
        rel(ggpa, me, 'great_grandparent'),
        rel(ggma, me, 'great_grandparent'),
        rel(gpa, me, 'grandparent'),
        rel(gma, me, 'grandparent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 6. Large Sibling Set ───
  {
    const me = person('Daniel', 'Rodríguez', true);
    const mom = person('Carmen', 'Flores');
    const dad = person('Luis', 'Rodríguez');
    const s1 = person('Pablo', 'Rodríguez');
    const s2 = person('Lucía', 'Rodríguez');
    const s3 = person('Andrés', 'Rodríguez');
    const s4 = person('Valentina', 'Rodríguez');
    const s5 = person('Mateo', 'Rodríguez');
    const s6 = person('Isabella', 'Rodríguez');
    scenarios.push({
      name: '6. Large Sibling Set (7 children)',
      people: [me, mom, dad, s1, s2, s3, s4, s5, s6],
      relationships: [
        rel(dad, mom, 'spouse'),
        ...[me, s1, s2, s3, s4, s5, s6].map(c => rel(dad, c, 'parent')),
        ...[me, s1, s2, s3, s4, s5, s6].map(c => rel(mom, c, 'parent')),
        ...[s1, s2, s3, s4, s5, s6].map(s => rel(me, s, 'sibling')),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 7. Same-Sex Parents + Donor ───
  {
    const me = person('Maya', 'Johnson', true);
    const mama1 = person('Rachel', 'Johnson');
    const mama2 = person('Tiffany', 'Johnson');
    const donor = person('Donor', 'Anonymous');
    const bro = person('Ethan', 'Johnson');
    scenarios.push({
      name: '7. Same-Sex Parents + Donor',
      people: [me, mama1, mama2, donor, bro],
      relationships: [
        rel(mama1, mama2, 'spouse'),
        rel(mama1, me, 'parent'),
        rel(mama2, me, 'parent'),
        rel(mama1, bro, 'parent'),
        rel(mama2, bro, 'parent'),
        rel(me, bro, 'sibling'),
        rel(donor, me, 'parent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 8. Adoption + Godparents ───
  {
    const me = person('Sam', 'Taylor', true);
    const adoptMom = person('Linda', 'Taylor');
    const adoptDad = person('Robert', 'Taylor');
    const godparent = person('Tony', 'Stark');
    const bioMom = person('Unknown', 'Bio-Mom');
    scenarios.push({
      name: '8. Adoption + Godparent + Bio Parent',
      people: [me, adoptMom, adoptDad, godparent, bioMom],
      relationships: [
        rel(adoptDad, adoptMom, 'spouse'),
        rel(adoptDad, me, 'adopted_parent'),
        rel(adoptMom, me, 'adopted_parent'),
        rel(godparent, me, 'godparent'),
        rel(bioMom, me, 'parent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 9. In-Laws + Extended Family ───
  {
    const me = person('David', 'Lee', true);
    const wife = person('Emily', 'Park');
    const fil = person('John', 'Park');
    const mil = person('Susan', 'Park');
    const bil = person('Kevin', 'Park');
    const myMom = person('Grace', 'Lee');
    const myDad = person('Henry', 'Lee');
    const son = person('Lucas', 'Lee');
    scenarios.push({
      name: '9. In-Laws + Two Family Lines + Child',
      people: [me, wife, fil, mil, bil, myMom, myDad, son],
      relationships: [
        rel(myDad, myMom, 'spouse'),
        rel(myDad, me, 'parent'),
        rel(myMom, me, 'parent'),
        rel(fil, mil, 'spouse'),
        rel(fil, wife, 'parent'),
        rel(mil, wife, 'parent'),
        rel(fil, bil, 'parent'),
        rel(mil, bil, 'parent'),
        rel(wife, bil, 'sibling'),
        rel(me, wife, 'spouse'),
        rel(me, son, 'parent'),
        rel(wife, son, 'parent'),
        rel(fil, me, 'parent_in_law'),
        rel(mil, me, 'parent_in_law'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 10. Complex: Multiple Divorces + Step-children + Grandkids ───
  {
    const me = person('Javier', 'Morales', true);
    const ex1 = person('Patricia', 'Gómez');
    const ex2 = person('Claudia', 'Vargas');
    const wife = person('Daniela', 'Reyes');
    const kid1 = person('Sofía', 'Morales');
    const kid2 = person('Matías', 'Morales');
    const stepkid = person('Camila', 'Reyes');
    const kid3 = person('Santiago', 'Morales');
    const grandkid1 = person('Luna', 'Morales');
    const kid1Spouse = person('Ricardo', 'Fuentes');
    scenarios.push({
      name: '10. Complex: 3 marriages, step-child, grandchild',
      people: [me, ex1, ex2, wife, kid1, kid2, stepkid, kid3, grandkid1, kid1Spouse],
      relationships: [
        rel(me, ex1, 'ex_spouse'),
        rel(me, ex2, 'ex_spouse'),
        rel(me, wife, 'spouse'),
        rel(me, kid1, 'parent'),
        rel(ex1, kid1, 'parent'),
        rel(me, kid2, 'parent'),
        rel(ex1, kid2, 'parent'),
        rel(kid1, kid2, 'sibling'),
        rel(me, kid3, 'parent'),
        rel(wife, kid3, 'parent'),
        rel(wife, stepkid, 'parent'),
        rel(me, stepkid, 'step_parent'),
        rel(kid1, kid1Spouse, 'spouse'),
        rel(kid1, grandkid1, 'parent'),
        rel(kid1Spouse, grandkid1, 'parent'),
        rel(me, grandkid1, 'grandparent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 11. Aunts/Uncles + Cousins ───
  {
    const me = person('Isabella', 'Fernández', true);
    const mom = person('Ana', 'Fernández');
    const dad = person('Jorge', 'Fernández');
    const uncle = person('Carlos', 'Fernández');
    const aunt = person('María', 'Ríos');
    const cousin1 = person('Diego', 'Fernández');
    const cousin2 = person('Valeria', 'Fernández');
    const bro = person('Tomás', 'Fernández');
    scenarios.push({
      name: '11. Extended: Uncle/Aunt + Cousins + Sibling',
      people: [me, mom, dad, uncle, aunt, cousin1, cousin2, bro],
      relationships: [
        rel(dad, mom, 'spouse'),
        rel(dad, me, 'parent'),
        rel(mom, me, 'parent'),
        rel(dad, bro, 'parent'),
        rel(mom, bro, 'parent'),
        rel(me, bro, 'sibling'),
        rel(uncle, aunt, 'spouse'),
        rel(uncle, cousin1, 'parent'),
        rel(aunt, cousin1, 'parent'),
        rel(uncle, cousin2, 'parent'),
        rel(aunt, cousin2, 'parent'),
        rel(dad, uncle, 'sibling'),
        rel(uncle, me, 'uncle_aunt'),
        rel(me, cousin1, 'cousin'),
        rel(me, cousin2, 'cousin'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 12. Single Parent + Grandparent-Raised ───
  {
    const me = person('Marcus', 'Williams', true);
    const mom = person('Keisha', 'Williams');
    const gma = person('Dorothy', 'Williams');
    const gpa = person('James', 'Williams');
    const sis = person('Aaliyah', 'Williams');
    scenarios.push({
      name: '12. Single Mom + Raised by Grandparents',
      people: [me, mom, gma, gpa, sis],
      relationships: [
        rel(gpa, gma, 'spouse'),
        rel(gpa, mom, 'parent'),
        rel(gma, mom, 'parent'),
        rel(mom, me, 'parent'),
        rel(mom, sis, 'parent'),
        rel(me, sis, 'sibling'),
        rel(gpa, me, 'grandparent'),
        rel(gma, me, 'grandparent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 13. Wide + Deep (stress test) ───
  {
    const me = person('Ricardo', 'Navarro', true);
    const dad = person('Ernesto', 'Navarro');
    const mom = person('Beatriz', 'Lara');
    const gpa = person('Alfonso', 'Navarro');
    const gma = person('Dolores', 'Ruiz');
    const wife = person('Paulina', 'Vega');
    const kids = [
      person('Tomás', 'Navarro'),
      person('Valeria', 'Navarro'),
      person('Emilio', 'Navarro'),
      person('Renata', 'Navarro'),
      person('Bruno', 'Navarro'),
    ];
    const grandkids = [
      person('Mateo', 'Navarro'),
      person('Lucía', 'Navarro'),
      person('Nico', 'Navarro'),
    ];
    const siblings = [
      person('Adriana', 'Navarro'),
      person('Felipe', 'Navarro'),
      person('Camila', 'Navarro'),
    ];
    const kidSpouse = person('Diana', 'Mora');

    const allPeople = [me, dad, mom, gpa, gma, wife, ...kids, ...grandkids, ...siblings, kidSpouse];
    const rels = [
      rel(gpa, gma, 'spouse'),
      rel(gpa, dad, 'parent'),
      rel(gma, dad, 'parent'),
      rel(dad, mom, 'spouse'),
      rel(me, wife, 'spouse'),
      ...[me, ...siblings].map(c => rel(dad, c, 'parent')),
      ...[me, ...siblings].map(c => rel(mom, c, 'parent')),
      ...siblings.map(s => rel(me, s, 'sibling')),
      ...kids.map(c => rel(me, c, 'parent')),
      ...kids.map(c => rel(wife, c, 'parent')),
      rel(kids[0], kidSpouse, 'spouse'),
      ...grandkids.map(g => rel(kids[0], g, 'parent')),
      ...grandkids.map(g => rel(kidSpouse, g, 'parent')),
      rel(gpa, me, 'grandparent'),
      rel(gma, me, 'grandparent'),
      rel(me, grandkids[0], 'grandparent'),
    ];

    scenarios.push({
      name: '13. Stress Test: Wide + Deep (4 gens, many nodes)',
      people: allPeople,
      relationships: rels,
      selfPersonId: me.id,
    });
  }

  // ─── 14. Foster Care: Bio + Legal Families ───
  {
    const me = person('Jordan', 'Smith', true);
    const bioMom = person('Crystal', 'Jones');
    const bioDad = person('Marcus', 'Smith');
    const fosterMom = person('Maria', 'Santos');
    const fosterDad = person('David', 'Santos');
    const fosterSib = person('Tanya', 'Johnson');
    const bioSib = person('Jaylen', 'Smith');
    scenarios.push({
      name: '14. Foster Care: Bio Family + Foster Family',
      people: [me, bioMom, bioDad, fosterMom, fosterDad, fosterSib, bioSib],
      relationships: [
        rel(bioDad, bioMom, 'spouse'),
        rel(bioDad, me, 'parent'),
        rel(bioMom, me, 'parent'),
        rel(bioDad, bioSib, 'parent'),
        rel(bioMom, bioSib, 'parent'),
        rel(me, bioSib, 'sibling'),
        rel(fosterDad, fosterMom, 'spouse'),
        rel(fosterMom, me, 'adopted_parent'),
        rel(fosterDad, me, 'adopted_parent'),
        rel(fosterMom, fosterSib, 'adopted_parent'),
        rel(fosterDad, fosterSib, 'adopted_parent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 15. Only Spouse (minimal) ───
  {
    const me = person('Pat', 'Quinn', true);
    const spouse = person('Alex', 'Quinn');
    scenarios.push({
      name: '15. Minimal: Just a Couple',
      people: [me, spouse],
      relationships: [rel(me, spouse, 'spouse')],
      selfPersonId: me.id,
    });
  }

  // ─── 16. Solo Person ───
  {
    const me = person('Lonely', 'Person', true);
    scenarios.push({
      name: '16. Minimal: Solo Person (no relationships)',
      people: [me],
      relationships: [],
      selfPersonId: me.id,
    });
  }

  // ─── 17. Spouse's Full Family Side ───
  {
    const me = person('Andrés', 'Herrera', true);
    const wife = person('Sofía', 'Castillo');
    const myDad = person('Raúl', 'Herrera');
    const myMom = person('Elena', 'Rivas');
    const mySib = person('Laura', 'Herrera');
    // Wife's side
    const wifeDad = person('Gustavo', 'Castillo');
    const wifeMom = person('Pilar', 'Mendoza');
    const wifeGpa = person('Ramón', 'Castillo');
    const wifeGma = person('Teresa', 'Soto');
    const wifeBro = person('Marcos', 'Castillo');
    const wifeSis = person('Lucía', 'Castillo');
    const wifeNephew = person('Joaquín', 'Castillo');
    const kid = person('Valentina', 'Herrera');

    scenarios.push({
      name: '17. Spouse\'s Full Family (3 gen in-law side)',
      people: [me, wife, myDad, myMom, mySib, wifeDad, wifeMom, wifeGpa, wifeGma, wifeBro, wifeSis, wifeNephew, kid],
      relationships: [
        rel(myDad, myMom, 'spouse'),
        rel(myDad, me, 'parent'),
        rel(myMom, me, 'parent'),
        rel(myDad, mySib, 'parent'),
        rel(myMom, mySib, 'parent'),
        rel(me, mySib, 'sibling'),
        rel(me, wife, 'spouse'),
        rel(wifeGpa, wifeGma, 'spouse'),
        rel(wifeGpa, wifeDad, 'parent'),
        rel(wifeGma, wifeDad, 'parent'),
        rel(wifeDad, wifeMom, 'spouse'),
        rel(wifeDad, wife, 'parent'),
        rel(wifeMom, wife, 'parent'),
        rel(wifeDad, wifeBro, 'parent'),
        rel(wifeMom, wifeBro, 'parent'),
        rel(wifeDad, wifeSis, 'parent'),
        rel(wifeMom, wifeSis, 'parent'),
        rel(wife, wifeBro, 'sibling'),
        rel(wife, wifeSis, 'sibling'),
        rel(wifeBro, wifeNephew, 'parent'),
        rel(me, kid, 'parent'),
        rel(wife, kid, 'parent'),
        rel(wifeGpa, wife, 'grandparent'),
        rel(wifeGma, wife, 'grandparent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 18. Both Sides Deep (symmetric) ───
  {
    const me = person('Diego', 'Paredes', true);
    const wife = person('Camila', 'Ríos');
    // My side: 4 gens
    const myDad = person('Fernando', 'Paredes');
    const myMom = person('Gloria', 'Salinas');
    const myGpa = person('Alberto', 'Paredes');
    const myGma = person('Rosa', 'Guzmán');
    const myGGpa = person('Simón', 'Paredes');
    const myGGma = person('Mercedes', 'Aldana');
    // Wife side: 3 gens
    const wDad = person('Héctor', 'Ríos');
    const wMom = person('Claudia', 'Peña');
    const wGpa = person('Ignacio', 'Ríos');
    const wGma = person('Amelia', 'Fuentes');
    const wSib = person('Natalia', 'Ríos');
    // Kids
    const kid1 = person('Sebastián', 'Paredes');
    const kid2 = person('Isabella', 'Paredes');

    scenarios.push({
      name: '18. Both Sides Deep (4 gen me + 3 gen spouse)',
      people: [me, wife, myDad, myMom, myGpa, myGma, myGGpa, myGGma, wDad, wMom, wGpa, wGma, wSib, kid1, kid2],
      relationships: [
        rel(myGGpa, myGGma, 'spouse'),
        rel(myGGpa, myGpa, 'parent'),
        rel(myGGma, myGpa, 'parent'),
        rel(myGpa, myGma, 'spouse'),
        rel(myGpa, myDad, 'parent'),
        rel(myGma, myDad, 'parent'),
        rel(myDad, myMom, 'spouse'),
        rel(myDad, me, 'parent'),
        rel(myMom, me, 'parent'),
        rel(myGGpa, me, 'great_grandparent'),
        rel(myGGma, me, 'great_grandparent'),
        rel(myGpa, me, 'grandparent'),
        rel(myGma, me, 'grandparent'),
        rel(me, wife, 'spouse'),
        rel(wGpa, wGma, 'spouse'),
        rel(wGpa, wDad, 'parent'),
        rel(wGma, wDad, 'parent'),
        rel(wDad, wMom, 'spouse'),
        rel(wDad, wife, 'parent'),
        rel(wMom, wife, 'parent'),
        rel(wDad, wSib, 'parent'),
        rel(wMom, wSib, 'parent'),
        rel(wife, wSib, 'sibling'),
        rel(me, kid1, 'parent'),
        rel(wife, kid1, 'parent'),
        rel(me, kid2, 'parent'),
        rel(wife, kid2, 'parent'),
        rel(wGpa, wife, 'grandparent'),
        rel(wGma, wife, 'grandparent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 19. Multiple In-Law Families ───
  {
    const me = person('Martín', 'Delgado', true);
    const wife = person('Renata', 'Ochoa');
    const mySib = person('Patricia', 'Delgado');
    const sibSpouse = person('Raúl', 'Mendoza');
    const myDad = person('Enrique', 'Delgado');
    const myMom = person('Silvia', 'Torres');
    // Wife's parents
    const wDad = person('Oscar', 'Ochoa');
    const wMom = person('ivonne', 'Bravo');
    // Sibling-in-law's parents
    const sibInLawDad = person('Jorge', 'Mendoza');
    const sibInLawMom = person('Alicia', 'Cruz');
    // Kids
    const kid = person('Emilia', 'Delgado');
    const sibKid = person('Nicolás', 'Mendoza');

    scenarios.push({
      name: '19. Multiple In-Law Families (2 spouse branches)',
      people: [me, wife, mySib, sibSpouse, myDad, myMom, wDad, wMom, sibInLawDad, sibInLawMom, kid, sibKid],
      relationships: [
        rel(myDad, myMom, 'spouse'),
        rel(myDad, me, 'parent'),
        rel(myMom, me, 'parent'),
        rel(myDad, mySib, 'parent'),
        rel(myMom, mySib, 'parent'),
        rel(me, mySib, 'sibling'),
        rel(me, wife, 'spouse'),
        rel(mySib, sibSpouse, 'spouse'),
        rel(wDad, wMom, 'spouse'),
        rel(wDad, wife, 'parent'),
        rel(wMom, wife, 'parent'),
        rel(sibInLawDad, sibInLawMom, 'spouse'),
        rel(sibInLawDad, sibSpouse, 'parent'),
        rel(sibInLawMom, sibSpouse, 'parent'),
        rel(me, kid, 'parent'),
        rel(wife, kid, 'parent'),
        rel(mySib, sibKid, 'parent'),
        rel(sibSpouse, sibKid, 'parent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 20. Blended + Spouse Family ───
  {
    const me = person('Santiago', 'Vargas', true);
    const ex = person('Carolina', 'Luna');
    const wife = person('Ana', 'Beltrán');
    const myDad = person('Manuel', 'Vargas');
    const myMom = person('Rocío', 'Espinoza');
    // Kids from ex
    const kid1 = person('Tomás', 'Vargas');
    const kid2 = person('Mariana', 'Vargas');
    // Kids from current wife
    const kid3 = person('Mateo', 'Vargas');
    // Wife's side
    const wDad = person('Roberto', 'Beltrán');
    const wMom = person('Estela', 'Córdoba');
    const wSis = person('Daniela', 'Beltrán');
    // Wife's step-kid from prev relationship
    const wStepKid = person('Julián', 'Beltrán');

    scenarios.push({
      name: '20. Blended + Spouse Family (ex + current + in-laws)',
      people: [me, ex, wife, myDad, myMom, kid1, kid2, kid3, wDad, wMom, wSis, wStepKid],
      relationships: [
        rel(myDad, myMom, 'spouse'),
        rel(myDad, me, 'parent'),
        rel(myMom, me, 'parent'),
        rel(me, ex, 'ex_spouse'),
        rel(me, wife, 'spouse'),
        rel(me, kid1, 'parent'),
        rel(ex, kid1, 'parent'),
        rel(me, kid2, 'parent'),
        rel(ex, kid2, 'parent'),
        rel(kid1, kid2, 'sibling'),
        rel(me, kid3, 'parent'),
        rel(wife, kid3, 'parent'),
        rel(wDad, wMom, 'spouse'),
        rel(wDad, wife, 'parent'),
        rel(wMom, wife, 'parent'),
        rel(wDad, wSis, 'parent'),
        rel(wMom, wSis, 'parent'),
        rel(wife, wSis, 'sibling'),
        rel(wife, wStepKid, 'parent'),
        rel(me, wStepKid, 'step_parent'),
      ],
      selfPersonId: me.id,
    });
  }

  // ─── 21. Mega Stress: Both Sides Wide + Deep ───
  {
    const me = person('Ricardo', 'Flores', true);
    const wife = person('Alejandra', 'Domínguez');
    const myDad = person('Pedro', 'Flores');
    const myMom = person('Lorena', 'Salazar');
    const myGpa = person('Arturo', 'Flores');
    const myGma = person('Elvira', 'Romero');
    const mySib1 = person('Gabriela', 'Flores');
    const mySib2 = person('Héctor', 'Flores');
    const mySib3 = person('Mónica', 'Flores');
    // Wife's side
    const wDad = person('Luis', 'Domínguez');
    const wMom = person('Carmen', 'Reyes');
    const wGpa = person('Francisco', 'Domínguez');
    const wGma = person('Josefina', 'Aguirre');
    const wSib1 = person('Alejandro', 'Domínguez');
    const wSib2 = person('Verónica', 'Domínguez');
    // Kids
    const kid1 = person('Emilio', 'Flores');
    const kid2 = person('Valeria', 'Flores');
    const kid3 = person('Bruno', 'Flores');
    const kid4 = person('Renata', 'Flores');
    // Grandkids
    const kid1Spouse = person('Diana', 'Torres');
    const gk1 = person('Lucas', 'Flores');
    const gk2 = person('Mía', 'Flores');
    // Wife's nephew
    const wNephew = person('Sebastián', 'Domínguez');

    scenarios.push({
      name: '21. Mega Stress: Both Sides Wide + Deep (25 nodes)',
      people: [me, wife, myDad, myMom, myGpa, myGma, mySib1, mySib2, mySib3,
               wDad, wMom, wGpa, wGma, wSib1, wSib2,
               kid1, kid2, kid3, kid4, kid1Spouse, gk1, gk2, wNephew],
      relationships: [
        rel(myGpa, myGma, 'spouse'),
        rel(myGpa, myDad, 'parent'),
        rel(myGma, myDad, 'parent'),
        rel(myDad, myMom, 'spouse'),
        rel(myDad, me, 'parent'),
        rel(myMom, me, 'parent'),
        rel(myDad, mySib1, 'parent'),
        rel(myMom, mySib1, 'parent'),
        rel(myDad, mySib2, 'parent'),
        rel(myMom, mySib2, 'parent'),
        rel(myDad, mySib3, 'parent'),
        rel(myMom, mySib3, 'parent'),
        rel(me, mySib1, 'sibling'),
        rel(me, mySib2, 'sibling'),
        rel(me, mySib3, 'sibling'),
        rel(myGpa, me, 'grandparent'),
        rel(myGma, me, 'grandparent'),
        rel(me, wife, 'spouse'),
        rel(wGpa, wGma, 'spouse'),
        rel(wGpa, wDad, 'parent'),
        rel(wGma, wDad, 'parent'),
        rel(wDad, wMom, 'spouse'),
        rel(wDad, wife, 'parent'),
        rel(wMom, wife, 'parent'),
        rel(wDad, wSib1, 'parent'),
        rel(wMom, wSib1, 'parent'),
        rel(wDad, wSib2, 'parent'),
        rel(wMom, wSib2, 'parent'),
        rel(wife, wSib1, 'sibling'),
        rel(wife, wSib2, 'sibling'),
        rel(wSib1, wNephew, 'parent'),
        rel(wGpa, wife, 'grandparent'),
        rel(wGma, wife, 'grandparent'),
        rel(me, kid1, 'parent'),
        rel(wife, kid1, 'parent'),
        rel(me, kid2, 'parent'),
        rel(wife, kid2, 'parent'),
        rel(me, kid3, 'parent'),
        rel(wife, kid3, 'parent'),
        rel(me, kid4, 'parent'),
        rel(wife, kid4, 'parent'),
        rel(kid1, kid1Spouse, 'spouse'),
        rel(kid1, gk1, 'parent'),
        rel(kid1Spouse, gk1, 'parent'),
        rel(kid1, gk2, 'parent'),
        rel(kid1Spouse, gk2, 'parent'),
        rel(me, gk1, 'grandparent'),
        rel(me, gk2, 'grandparent'),
      ],
      selfPersonId: me.id,
    });
  }

  return scenarios;
}

// ============================================================
// LAYOUT ALGORITHM — Faithful port from tree.tsx
// ============================================================

const NODE_RADIUS = 28;
const HORIZONTAL_SPACING = 140;
const VERTICAL_SPACING = 160;
const COUPLE_GAP = 100;
const PADDING = 80;
const CANVAS_MIN_WIDTH = 800;
const CANVAS_MIN_HEIGHT = 600;

function layoutNodes(people, relationships, selfPersonId) {
  const positions = new Map();
  const roleLabels = new Map();
  const generation = new Map();
  if (people.length === 0) return { positions, roleLabels, generation, width: CANVAS_MIN_WIDTH, height: CANVAS_MIN_HEIGHT };

  const peopleById = new Map(people.map(p => [p.id, p]));

  // Build adjacency
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
      if (type === 'ex_spouse') {
        exSpousePairs.add([a, b].sort().join('|'));
      }
    } else if (type === 'step_parent') {
      if (!childrenOf.has(a)) childrenOf.set(a, []);
      childrenOf.get(a).push(b);
      if (!parentOf.has(b)) parentOf.set(b, []);
      parentOf.get(b).push(a);
    } else if (type === 'step_child') {
      if (!childrenOf.has(b)) childrenOf.set(b, []);
      childrenOf.get(b).push(a);
      if (!parentOf.has(a)) parentOf.set(a, []);
      parentOf.get(a).push(b);
    } else if (type === 'adopted_parent') {
      if (!childrenOf.has(a)) childrenOf.set(a, []);
      childrenOf.get(a).push(b);
      if (!parentOf.has(b)) parentOf.set(b, []);
      parentOf.get(b).push(a);
    } else if (type === 'adopted_child') {
      if (!childrenOf.has(b)) childrenOf.set(b, []);
      childrenOf.get(b).push(a);
      if (!parentOf.has(a)) parentOf.set(a, []);
      parentOf.get(a).push(b);
    }
  }

  // directParentOf tracks only 1-generation parent relationships
  const directParentOf = new Map();
  for (const [childId, parents] of parentOf) {
    directParentOf.set(childId, [...parents]);
  }

  // Multi-generation ancestor maps
  const ancestorOf = new Map();
  const descendantParentOf = new Map();
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
      if (!ancestorOf.has(ancestorId)) ancestorOf.set(ancestorId, []);
      ancestorOf.get(ancestorId).push({ descendantId, gap });
      if (!descendantParentOf.has(descendantId)) descendantParentOf.set(descendantId, []);
      descendantParentOf.get(descendantId).push({ ancestorId, gap });
      if (!parentOf.has(descendantId)) parentOf.set(descendantId, []);
      if (!parentOf.get(descendantId).includes(ancestorId)) {
        parentOf.get(descendantId).push(ancestorId);
      }
    }
  }

  // Build sibling adjacency
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

  // Propagate parent through full siblings (only direct/1-gen parents)
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
            if (!childrenOf.get(parentId).includes(personId)) {
              childrenOf.get(parentId).push(personId);
            }
            changed = true;
          }
          if (!directParentOf.has(personId)) directParentOf.set(personId, []);
          if (!directParentOf.get(personId).includes(parentId)) {
            directParentOf.get(personId).push(parentId);
          }
        }
      }
    }
  }

  // Infer spouse links from step_parent
  for (const rel of relationships) {
    if (rel.relationship_type !== 'step_parent' && rel.relationship_type !== 'step_child') continue;
    const a = rel.person_a_id;
    const b = rel.person_b_id;
    if (!peopleById.has(a) || !peopleById.has(b)) continue;
    const stepParentId = rel.relationship_type === 'step_parent' ? a : b;
    const childId = rel.relationship_type === 'step_parent' ? b : a;
    const bioParents = (parentOf.get(childId) || []).filter(p => p !== stepParentId);
    for (const bioParentId of bioParents) {
      const existingSpouses = spouseOf.get(bioParentId);
      if (existingSpouses && existingSpouses.has(stepParentId)) continue;
      if (!spouseOf.has(bioParentId)) spouseOf.set(bioParentId, new Set());
      if (!spouseOf.has(stepParentId)) spouseOf.set(stepParentId, new Set());
      spouseOf.get(bioParentId).add(stepParentId);
      spouseOf.get(stepParentId).add(bioParentId);
    }
  }

  // ── Generation assignment via BFS ──
  const visited = new Set();
  const GEN_OFFSET_A = {
    parent: -1, child: 1,
    spouse: 0, ex_spouse: 0,
    sibling: 0, half_sibling: 0, step_sibling: 0,
    grandparent: -2, grandchild: 2,
    great_grandparent: -3, great_grandchild: 3,
    great_great_grandparent: -4, great_great_grandchild: 4,
    uncle_aunt: -1, nephew_niece: 1,
    cousin: 0,
    in_law: 0,
    parent_in_law: -1, child_in_law: 1,
    step_parent: -1, step_child: 1,
    adopted_parent: -1, adopted_child: 1,
    godparent: -1, godchild: 1,
    other: 0,
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

  const startNode = selfPersonId && peopleById.has(selfPersonId) ? selfPersonId : null;
  if (startNode) {
    const queue = [{ id: startNode, gen: 0 }];
    visited.add(startNode);
    while (queue.length > 0) {
      const { id: nid, gen } = queue.shift();
      generation.set(nid, gen);
      const neighbors = adjList.get(nid) || [];
      for (const { targetId, offset } of neighbors) {
        if (!visited.has(targetId)) {
          visited.add(targetId);
          queue.push({ id: targetId, gen: gen + offset });
        }
      }
    }
  }

  // Handle unvisited
  for (const p of people) {
    if (visited.has(p.id)) continue;
    const neighbors = adjList.get(p.id) || [];
    const placedNeighbor = neighbors.find(n => generation.has(n.targetId));
    if (placedNeighbor) {
      const queue = [{
        id: p.id,
        gen: generation.get(placedNeighbor.targetId) + placedNeighbor.offset,
      }];
      visited.add(p.id);
      while (queue.length > 0) {
        const { id: nid, gen } = queue.shift();
        generation.set(nid, gen);
        const ns = adjList.get(nid) || [];
        for (const { targetId, offset } of ns) {
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

  // Shift so min gen = 0
  let minGen = 0;
  for (const gen of generation.values()) {
    if (gen < minGen) minGen = gen;
  }
  if (minGen < 0) {
    for (const [personId, gen] of generation) {
      generation.set(personId, gen - minGen);
    }
  }

  // Group by generation
  const genGroups = new Map();
  for (const [personId, gen] of generation) {
    if (!genGroups.has(gen)) genGroups.set(gen, []);
    genGroups.get(gen).push(personId);
  }
  const sortedGens = [...genGroups.keys()].sort((a, b) => a - b);

  let maxRowWidth = 0;

  // Reorder a row containing the self person so layout is:
  // [narrator's siblings + their spouses] [self + spouses] [current spouse's siblings + their spouses] [remaining]
  function reorderSelfGen(ids) {
    if (!selfPersonId || !ids.includes(selfPersonId)) return ids;

    const selfSpouses = spouseOf.get(selfPersonId);
    const selfAllSpousesInRow = selfSpouses
      ? [...selfSpouses].filter(s => ids.includes(s))
      : [];
    const selfCurrentSpouseInRow = selfAllSpousesInRow.find(
      s => !exSpousePairs.has([selfPersonId, s].sort().join('|'))
    ) || null;

    const assigned = new Set([selfPersonId, ...selfAllSpousesInRow]);

    // Narrator's siblings + their spouses (ordered: each [sibSpouse, sibling] so sibling is inner)
    const narratorSide = [];
    const mySibs = siblingOf.get(selfPersonId)
      ? [...siblingOf.get(selfPersonId)].filter(s => ids.includes(s) && !assigned.has(s))
      : [];
    for (const sib of mySibs) {
      assigned.add(sib);
      const sibSp = spouseOf.get(sib);
      const sibSpousesInRow = [];
      if (sibSp) {
        for (const sp of sibSp) {
          if (ids.includes(sp) && !assigned.has(sp)) {
            assigned.add(sp);
            sibSpousesInRow.push(sp);
          }
        }
      }
      // Spouse goes first (outer), sibling closer to narrator (inner)
      narratorSide.push(...sibSpousesInRow, sib);
    }

    // Current spouse's siblings + their spouses
    const spouseSide = [];
    if (selfCurrentSpouseInRow) {
      const spSibs = siblingOf.get(selfCurrentSpouseInRow)
        ? [...siblingOf.get(selfCurrentSpouseInRow)].filter(s => ids.includes(s) && !assigned.has(s))
        : [];
      for (const sib of spSibs) {
        assigned.add(sib);
        const sibSp = spouseOf.get(sib);
        const sibSpousesInRow = [];
        if (sibSp) {
          for (const sp of sibSp) {
            if (ids.includes(sp) && !assigned.has(sp)) {
              assigned.add(sp);
              sibSpousesInRow.push(sp);
            }
          }
        }
        // Sibling first (inner, closer to spouse), their spouse outer
        spouseSide.push(sib, ...sibSpousesInRow);
      }
    }

    const remaining = ids.filter(id => !assigned.has(id));
    return [...narratorSide, selfPersonId, ...selfAllSpousesInRow, ...spouseSide, ...remaining];
  }

  // Pre-compute self-gen ordering for ancestor row positioning
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

  // Find minimum self-gen descendant index for a person (for ancestor row ordering)
  function getMinSelfGenDescIdx(personId) {
    if (!selfGenOrder) return Infinity;
    if (selfGenOrder.has(personId)) return selfGenOrder.get(personId);
    const visited = new Set([personId]);
    const queue = [personId];
    let minIdx = Infinity;
    while (queue.length > 0) {
      const current = queue.shift();
      const kids = childrenOf.get(current) || [];
      for (const c of kids) {
        if (visited.has(c)) continue;
        visited.add(c);
        if (selfGenOrder.has(c)) {
          minIdx = Math.min(minIdx, selfGenOrder.get(c));
        } else {
          queue.push(c);
        }
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
      const spousesInRow = spouses
        ? [...spouses].filter(s => ids.includes(s) && !placed.has(s))
        : [];

      if (spousesInRow.length >= 2) {
        placed.add(personId);
        const exes = [];
        const currents = [];
        for (const sp of spousesInRow) {
          placed.add(sp);
          const pairKey = [personId, sp].sort().join('|');
          if (exSpousePairs.has(pairKey)) exes.push(sp);
          else currents.push(sp);
        }
        const unitIds = [...exes, personId, ...currents];
        if (exes.length === 0 && currents.length >= 2) {
          const mid = Math.floor(currents.length / 2);
          unitIds.length = 0;
          unitIds.push(...currents.slice(0, mid), personId, ...currents.slice(mid));
        }
        units.push({ ids: unitIds, width: (unitIds.length - 1) * COUPLE_GAP });
      } else if (spousesInRow.length === 1) {
        const spouseInRow = spousesInRow[0];
        placed.add(personId);
        placed.add(spouseInRow);
        // Self person's couple: self closer to siblings, spouse at edge
        if (personId === selfPersonId || spouseInRow === selfPersonId) {
          const self = personId === selfPersonId ? personId : spouseInRow;
          const sp = personId === selfPersonId ? spouseInRow : personId;
          units.push({ ids: [self, sp], width: COUPLE_GAP });
        } else {
          const personHasSib = siblingOf.get(personId)?.size
            ? [...siblingOf.get(personId)].some(s => ids.includes(s))
            : false;
          const spouseHasSib = siblingOf.get(spouseInRow)?.size
            ? [...siblingOf.get(spouseInRow)].some(s => ids.includes(s))
            : false;
          if (personHasSib && !spouseHasSib) {
            units.push({ ids: [spouseInRow, personId], width: COUPLE_GAP });
          } else {
            units.push({ ids: [personId, spouseInRow], width: COUPLE_GAP });
          }
        }
      } else {
        placed.add(personId);
        units.push({ ids: [personId], width: 0 });
      }
    }
    return units;
  }

  for (let gi = 0; gi < sortedGens.length; gi++) {
    const gen = sortedGens[gi];
    const row = genGroups.get(gen);
    const minGenForY = sortedGens[0];
    const y = PADDING + (gen - minGenForY) * VERTICAL_SPACING;

    if (gi === 0) {
      let orderedRow = reorderSelfGen(row);
      // For ancestor rows (self not in this gen), sort by descendant self-gen position
      if (selfGenOrder && !row.includes(selfPersonId)) {
        orderedRow = [...row].sort((a, b) => getMinSelfGenDescIdx(a) - getMinSelfGenDescIdx(b));
      }
      const units = buildUnits(orderedRow);
      const totalWidth = units.reduce((sum, u) => sum + u.width, 0) +
        (units.length - 1) * HORIZONTAL_SPACING;
      maxRowWidth = Math.max(maxRowWidth, totalWidth);

      let x = PADDING + (Math.max(maxRowWidth, CANVAS_MIN_WIDTH) - totalWidth) / 2;
      for (const unit of units) {
        for (let i = 0; i < unit.ids.length; i++) {
          positions.set(unit.ids[i], { x: x + i * COUPLE_GAP, y });
        }
        x += unit.width + HORIZONTAL_SPACING;
      }
      continue;
    }

    // Special handling for the self person's generation:
    // Merge all parent groups into one row with side-aware ordering
    if (selfPersonId && row.includes(selfPersonId)) {
      const orderedRow = reorderSelfGen(row);
      const rowUnits = buildUnits(orderedRow);

      // Find center X from all positioned parents of everyone in this row
      const allParentXs = [];
      for (const childId of orderedRow) {
        const parents = parentOf.get(childId) || [];
        for (const pid of parents) {
          const pp = positions.get(pid);
          if (pp) allParentXs.push(pp.x);
        }
      }
      const centerX = allParentXs.length > 0
        ? (Math.min(...allParentXs) + Math.max(...allParentXs)) / 2
        : PADDING + CANVAS_MIN_WIDTH / 2;

      const totalWidth = rowUnits.reduce((sum, u) => sum + u.width, 0) +
        (rowUnits.length - 1) * HORIZONTAL_SPACING;

      let rx = centerX - totalWidth / 2;
      if (rx < PADDING) rx = PADDING;

      let rowWidth = 0;
      for (const unit of rowUnits) {
        for (let i = 0; i < unit.ids.length; i++) {
          positions.set(unit.ids[i], { x: rx + i * COUPLE_GAP, y });
        }
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
        const key = spouseId
          ? [positionedParent, spouseId].sort().join('|')
          : positionedParent;
        if (!parentUnitMap.has(key)) parentUnitMap.set(key, []);
        parentUnitMap.get(key).push(childId);
      } else {
        orphans.push(childId);
      }
    }

    const remainingOrphans = [];
    for (const orphanId of orphans) {
      const sibs = siblingOf.get(orphanId);
      let placed = false;
      if (sibs) {
        for (const sibId of sibs) {
          for (const [key, children] of parentUnitMap) {
            if (children.includes(sibId)) {
              children.push(orphanId);
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
      if (!placed) {
        const spouses = spouseOf.get(orphanId);
        if (spouses) {
          for (const spId of spouses) {
            for (const [key, children] of parentUnitMap) {
              if (children.includes(spId)) {
                children.push(orphanId);
                placed = true;
                break;
              }
            }
            if (placed) break;
          }
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
      const aX = Math.min(...aIds.map(id => positions.get(id)?.x ?? 0));
      const bX = Math.min(...bIds.map(id => positions.get(id)?.x ?? 0));
      return aX - bX;
    });

    const groupPlacements = [];

    if (isAncestorGen && selfGenOrder && remainingOrphans.length > 0) {
      // For ancestor gens with orphans, interleave at correct position by descendant self-gen index
      const orphanUnits = buildUnits(remainingOrphans);
      const allGroupItems = sortedParentKeys.map(key => ({
        type: 'keyed', key, unit: null,
        descIdx: Math.min(...parentUnitMap.get(key).map(c => getMinSelfGenDescIdx(c)))
      }));
      for (const unit of orphanUnits) {
        allGroupItems.push({
          type: 'orphan', key: null, unit,
          descIdx: Math.min(...unit.ids.map(id => getMinSelfGenDescIdx(id)))
        });
      }
      allGroupItems.sort((a, b) => a.descIdx - b.descIdx);

      for (const item of allGroupItems) {
        if (item.type === 'keyed') {
          const groupChildren = parentUnitMap.get(item.key);
          const groupUnits = buildUnits(groupChildren);
          const parentIds = item.key.split('|');
          const parentXs = parentIds.map(id => positions.get(id)?.x ?? 0);
          const parentCenterX = parentXs.reduce((a, b) => a + b, 0) / parentXs.length;
          const groupTotalWidth = groupUnits.reduce((sum, u) => sum + u.width, 0) +
            (groupUnits.length - 1) * HORIZONTAL_SPACING;
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
        const parentXs = parentIds.map(id => positions.get(id)?.x ?? 0);
        const parentCenterX = parentXs.reduce((a, b) => a + b, 0) / parentXs.length;

        const groupTotalWidth = groupUnits.reduce((sum, u) => sum + u.width, 0) +
          (groupUnits.length - 1) * HORIZONTAL_SPACING;

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

    // Apply positions
    let rowWidth = 0;
    for (const group of groupPlacements) {
      for (const pu of group) {
        for (let i = 0; i < pu.ids.length; i++) {
          positions.set(pu.ids[i], { x: pu.x + i * COUPLE_GAP, y });
        }
        rowWidth = Math.max(rowWidth, pu.x + pu.width);
      }
    }

    // Post-pass: shift single parents to center above children
    for (const key of sortedParentKeys) {
      const parentIds = key.split('|');
      if (parentIds.length !== 1) continue;
      const parentId = parentIds[0];
      const parentPos = positions.get(parentId);
      if (!parentPos) continue;
      const children = parentUnitMap.get(key);
      const childXs = children.map(c => positions.get(c)?.x ?? 0);
      if (childXs.length === 0) continue;
      const childCenter = (Math.min(...childXs) + Math.max(...childXs)) / 2;
      if (childCenter > parentPos.x) {
        parentPos.x = childCenter;
      }
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
        if (shift > 0) {
          pos.x += shift;
          spousePos.x += shift;
        }
      } else {
        if (childCenter > pos.x) {
          pos.x = childCenter;
        }
      }
    }
  }

  // Post-layout overlap deconfliction
  const MIN_NODE_DISTANCE = NODE_RADIUS * 2 + 20;
  for (const gen of sortedGens) {
    const row = genGroups.get(gen);
    const rowNodes = row
      .map(id => ({ id, pos: positions.get(id) }))
      .filter(n => n.pos)
      .sort((a, b) => a.pos.x - b.pos.x);
    for (let i = 1; i < rowNodes.length; i++) {
      const gap = rowNodes[i].pos.x - rowNodes[i - 1].pos.x;
      if (gap < MIN_NODE_DISTANCE) {
        const push = MIN_NODE_DISTANCE - gap;
        for (let j = i; j < rowNodes.length; j++) {
          rowNodes[j].pos.x += push;
        }
      }
    }
  }

  // After re-centering and deconfliction, fix ancestor gen couple ordering
  // Re-centering + deconfliction can interleave narrator-side and spouse-side couples
  if (selfGenOrder) {
    for (const gen of sortedGens) {
      if (selfGen == null || gen >= selfGen) continue;
      const row = genGroups.get(gen);
      // Build couple units from the row
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

      // Sort couple units by descIdx (narrator-side first, then spouse-side)
      coupleUnits.sort((a, b) => a.descIdx - b.descIdx);

      // Compute desired center for each couple based on children positions
      for (const unit of coupleUnits) {
        const allKidXs = [];
        for (const id of unit.ids) {
          const kids = childrenOf.get(id) || [];
          for (const k of kids) {
            const kp = positions.get(k);
            if (kp) allKidXs.push(kp.x);
          }
        }
        unit.desiredCenter = allKidXs.length > 0
          ? (Math.min(...allKidXs) + Math.max(...allKidXs)) / 2
          : positions.get(unit.ids[0]).x + ((unit.ids.length - 1) * COUPLE_GAP) / 2;
        unit.width = (unit.ids.length - 1) * COUPLE_GAP;
      }

      // Place couples left-to-right in descIdx order, using desired centers,
      // but preventing overlap
      for (let i = 0; i < coupleUnits.length; i++) {
        const unit = coupleUnits[i];
        let leftX = unit.desiredCenter - unit.width / 2;
        if (leftX < PADDING) leftX = PADDING;
        // Ensure no overlap with previous unit
        if (i > 0) {
          const prev = coupleUnits[i - 1];
          const prevRightX = positions.get(prev.ids[prev.ids.length - 1]).x;
          const minX = prevRightX + HORIZONTAL_SPACING;
          if (leftX < minX) leftX = minX;
        }
        for (let j = 0; j < unit.ids.length; j++) {
          positions.get(unit.ids[j]).x = leftX + j * COUPLE_GAP;
        }
      }
    }
  }

  // Compute canvas dimensions
  let actualMaxX = 0, actualMaxY = 0;
  for (const pos of positions.values()) {
    if (pos.x > actualMaxX) actualMaxX = pos.x;
    if (pos.y > actualMaxY) actualMaxY = pos.y;
  }
  const genRange = sortedGens.length > 0 ? (sortedGens[sortedGens.length - 1] - sortedGens[0] + 1) : 1;
  const graphWidth = Math.max(actualMaxX + PADDING * 3, maxRowWidth + PADDING * 2, CANVAS_MIN_WIDTH);
  const graphHeight = Math.max(actualMaxY + PADDING * 3, PADDING * 2 + genRange * VERTICAL_SPACING, CANVAS_MIN_HEIGHT);

  // Role labels — BFS from self to compute path-based labels
  // inverseLabel: when currentNode is person_a with type X, what does person_b represent?
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
  // directLabel: when currentNode is person_b with type X, what does person_a represent?
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
    // Build relationship index by person for BFS
    const relsByPerson = new Map();
    for (const r of relationships) {
      if (!relsByPerson.has(r.person_a_id)) relsByPerson.set(r.person_a_id, []);
      if (!relsByPerson.has(r.person_b_id)) relsByPerson.set(r.person_b_id, []);
      relsByPerson.get(r.person_a_id).push(r);
      relsByPerson.get(r.person_b_id).push(r);
    }
    const visited = new Set([selfPersonId]);
    const queue = [{ id: selfPersonId, prefix: '' }];
    while (queue.length > 0) {
      const { id: curId, prefix } = queue.shift();
      const rels = relsByPerson.get(curId) || [];
      for (const r of rels) {
        let otherId, label;
        const type = r.relationship_type;
        if (r.person_a_id === curId && !visited.has(r.person_b_id)) {
          otherId = r.person_b_id;
          label = inverseLabel[type];
        } else if (r.person_b_id === curId && !visited.has(r.person_a_id)) {
          otherId = r.person_a_id;
          label = directLabel[type];
        } else {
          continue;
        }
        if (!label || visited.has(otherId)) continue;
        visited.add(otherId);
        const fullLabel = prefix ? `${prefix}${label}` : label;
        roleLabels.set(otherId, fullLabel);
        // Accumulate prefix for next hops — deeper connections get descriptive paths
        const nextPrefix = `${fullLabel}'s `;
        queue.push({ id: otherId, prefix: nextPrefix });
      }
    }
  }

  return {
    positions,
    roleLabels,
    generation,
    width: graphWidth,
    height: graphHeight,
    people,
    relationships,
    selfPersonId,
  };
}

// ============================================================
// HTML GENERATION
// ============================================================

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateSVG(layout) {
  const { positions, roleLabels, generation, width, height, people, relationships, selfPersonId } = layout;
  const peopleById = new Map(people.map(p => [p.id, p]));

  let svg = '';

  svg += `<defs>
    <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#00bcd4" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#00bcd4" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="selfGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffc107" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#ffc107" stop-opacity="0"/>
    </radialGradient>
  </defs>\n`;

  const genColors = ['#e57373', '#ffb74d', '#4dd0e1', '#81c784', '#ba68c8', '#4fc3f7', '#fff176'];

  // Parent-child edges (elbow connectors)
  for (const r of relationships) {
    const posA = positions.get(r.person_a_id);
    const posB = positions.get(r.person_b_id);
    if (!posA || !posB) continue;

    const type = r.relationship_type;
    const verified = r.verified;
    const dash = verified ? '' : 'stroke-dasharray="4 4"';

    // Use parent's generation color for parent-child edges
    const parentGenA = generation.get(r.person_a_id) ?? 0;
    const parentGenB = generation.get(r.person_b_id) ?? 0;
    const edgeGen = Math.min(parentGenA, parentGenB);
    const color = verified ? (genColors[edgeGen % genColors.length] || '#4dd0e1') : 'rgba(255,255,255,0.3)';
    const sw = verified ? 2 : 1;

    if (type === 'spouse') {
      const leftX = Math.min(posA.x, posB.x) + NODE_RADIUS;
      const rightX = Math.max(posA.x, posB.x) - NODE_RADIUS;
      svg += `<line x1="${leftX}" y1="${posA.y}" x2="${rightX}" y2="${posB.y}" stroke="#ffc107" stroke-width="2" ${dash}/>\n`;
      continue;
    }
    if (type === 'ex_spouse') {
      const leftX = Math.min(posA.x, posB.x) + NODE_RADIUS;
      const rightX = Math.max(posA.x, posB.x) - NODE_RADIUS;
      svg += `<line x1="${leftX}" y1="${posA.y}" x2="${rightX}" y2="${posB.y}" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="6 4"/>\n`;
      continue;
    }
    if (type === 'sibling' || type === 'half_sibling' || type === 'step_sibling') continue;

    const ancestorTypes = ['parent', 'child', 'grandparent', 'grandchild',
      'great_grandparent', 'great_grandchild', 'great_great_grandparent', 'great_great_grandchild',
      'step_parent', 'step_child', 'adopted_parent', 'adopted_child'];
    if (!ancestorTypes.includes(type)) continue;

    // Skip multi-gen if bridge exists
    if (!['parent', 'child', 'step_parent', 'step_child', 'adopted_parent', 'adopted_child'].includes(type)) {
      const genA = generation.get(r.person_a_id) ?? 0;
      const genB = generation.get(r.person_b_id) ?? 0;
      const minG = Math.min(genA, genB);
      const maxG = Math.max(genA, genB);
      const hasBridge = relationships.some(r2 => {
        if (r2 === r) return false;
        const otherId = r2.person_a_id === r.person_a_id || r2.person_a_id === r.person_b_id
          ? r2.person_b_id
          : r2.person_b_id === r.person_a_id || r2.person_b_id === r.person_b_id
            ? r2.person_a_id
            : null;
        if (!otherId) return false;
        const otherGen = generation.get(otherId) ?? -999;
        return otherGen > minG && otherGen < maxG;
      });
      if (hasBridge) continue;
    }

    const parent = posA.y < posB.y ? posA : posB;
    const child = posA.y < posB.y ? posB : posA;
    const midY = parent.y + (child.y - parent.y) / 2;
    svg += `<path d="M ${parent.x} ${parent.y + NODE_RADIUS} L ${parent.x} ${midY} L ${child.x} ${midY} L ${child.x} ${child.y - NODE_RADIUS}" stroke="${color}" stroke-width="${sw}" ${dash} fill="none"/>\n`;
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
    const sibGen = generation.get(r.person_a_id) ?? 0;
    const sibColor = genColors[sibGen % genColors.length] || '#4dd0e1';
    const dashAttr = (r.relationship_type === 'half_sibling' || r.relationship_type === 'step_sibling')
      ? 'stroke-dasharray="6 3"' : '';
    svg += `<line x1="${leftX}" y1="${posA.y}" x2="${rightX}" y2="${posB.y}" stroke="${sibColor}" stroke-width="1.5" ${dashAttr} opacity="0.7"/>\n`;
  }

  // Draw nodes
  for (const p of people) {
    const pos = positions.get(p.id);
    if (!pos) continue;
    const isSelf = p.id === selfPersonId;
    const initials = (p.first_name?.[0] || '') + (p.last_name?.[0] || '');
    const role = roleLabels.get(p.id) || '';
    const gen = generation.get(p.id) ?? 0;
    const genColor = genColors[gen % genColors.length];
    const strokeColor = isSelf ? '#ffc107' : genColor;

    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${NODE_RADIUS * 2}" fill="url(#${isSelf ? 'selfGlow' : 'nodeGlow'})"/>\n`;
    svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${NODE_RADIUS}" fill="#0a0e14" stroke="${strokeColor}" stroke-width="${isSelf ? 3 : 2}"/>\n`;
    svg += `<text x="${pos.x}" y="${pos.y + 5}" text-anchor="middle" font-size="14" font-weight="bold" fill="#e8eaed">${escapeHtml(initials)}</text>\n`;
    svg += `<text x="${pos.x}" y="${pos.y + NODE_RADIUS + 16}" text-anchor="middle" font-size="12" font-weight="600" fill="#e8eaed">${escapeHtml(p.first_name)}</text>\n`;
    if (p.last_name) {
      svg += `<text x="${pos.x}" y="${pos.y + NODE_RADIUS + 29}" text-anchor="middle" font-size="10" fill="rgba(232,234,237,0.5)">${escapeHtml(p.last_name)}</text>\n`;
    }
    if (role) {
      const roleColor = isSelf ? '#ffc107' : genColor;
      const roleY = p.last_name ? pos.y + NODE_RADIUS + 42 : pos.y + NODE_RADIUS + 32;
      svg += `<text x="${pos.x}" y="${roleY}" text-anchor="middle" font-size="9" fill="${roleColor}" font-weight="600">${escapeHtml(role)}</text>\n`;
    }
    svg += `<text x="${pos.x}" y="${pos.y - NODE_RADIUS - 6}" text-anchor="middle" font-size="8" fill="rgba(255,255,255,0.3)">Gen ${gen}</text>\n`;
  }

  return svg;
}

function detectOverlaps(layout) {
  const { positions, people } = layout;
  const issues = [];
  const personNames = new Map(people.map(p => [p.id, p.first_name + (p.last_name ? ' ' + p.last_name : '')]));

  const positioned = [...positions.entries()];
  for (let i = 0; i < positioned.length; i++) {
    for (let j = i + 1; j < positioned.length; j++) {
      const [idA, posA] = positioned[i];
      const [idB, posB] = positioned[j];
      const dx = Math.abs(posA.x - posB.x);
      const dy = Math.abs(posA.y - posB.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = NODE_RADIUS * 2 + 10;

      if (dist < minDist) {
        issues.push({
          type: 'overlap',
          severity: dist < NODE_RADIUS ? 'critical' : 'warning',
          message: `${personNames.get(idA)} and ${personNames.get(idB)} overlap (distance: ${dist.toFixed(0)}px, min: ${minDist}px)`,
        });
      }
    }
  }

  // Check vertical alignment
  const genYMap = new Map();
  for (const [personId, pos] of positions) {
    const gen = layout.generation.get(personId);
    if (gen === undefined) continue;
    if (!genYMap.has(gen)) genYMap.set(gen, pos.y);
    else if (Math.abs(genYMap.get(gen) - pos.y) > 1) {
      issues.push({
        type: 'vertical_misalignment',
        severity: 'warning',
        message: `${personNames.get(personId)} at Gen ${gen} has y=${pos.y.toFixed(0)} but expected y=${genYMap.get(gen).toFixed(0)}`,
      });
    }
  }

  return issues;
}

function generateHTML(allLayouts) {
  let scenarioTabs = '';
  let scenarioPanels = '';

  for (let i = 0; i < allLayouts.length; i++) {
    const { layout, scenario, issues } = allLayouts[i];
    const hasIssues = issues.some(iss => iss.severity === 'critical');
    const hasWarnings = issues.length > 0;
    const icon = hasIssues ? '❌' : hasWarnings ? '⚠️' : '✅';

    scenarioTabs += `<button class="tab ${i === 0 ? 'active' : ''}" onclick="showScenario(${i})" id="tab-${i}">${icon} ${escapeHtml(scenario.name)}</button>\n`;

    const issuesList = issues.length > 0
      ? `<div class="issues">${issues.map(iss =>
          `<div class="issue ${iss.severity}">${escapeHtml(iss.message)}</div>`
        ).join('')}</div>`
      : '<div class="no-issues">✅ No overlaps or alignment issues detected</div>';

    let dataTable = '<table class="data-table"><tr><th>Person</th><th>Gen</th><th>X</th><th>Y</th><th>Role</th></tr>';
    for (const p of layout.people) {
      const pos = layout.positions.get(p.id);
      if (!pos) continue;
      const gen = layout.generation.get(p.id) ?? '?';
      const role = layout.roleLabels.get(p.id) || '';
      const isSelf = p.id === layout.selfPersonId;
      const name = p.first_name + (p.last_name ? ' ' + p.last_name : '');
      dataTable += `<tr class="${isSelf ? 'self-row' : ''}"><td>${escapeHtml(name)}</td><td>${gen}</td><td>${pos.x.toFixed(0)}</td><td>${pos.y.toFixed(0)}</td><td>${escapeHtml(role)}</td></tr>`;
    }
    dataTable += '</table>';

    let relList = '<table class="data-table"><tr><th>Person A</th><th>→</th><th>Person B</th><th>Type</th></tr>';
    for (const r of layout.relationships) {
      const pA = layout.people.find(p => p.id === r.person_a_id);
      const pB = layout.people.find(p => p.id === r.person_b_id);
      if (!pA || !pB) continue;
      relList += `<tr><td>${escapeHtml(pA.first_name)}</td><td>→</td><td>${escapeHtml(pB.first_name)}</td><td><code>${escapeHtml(r.relationship_type)}</code></td></tr>`;
    }
    relList += '</table>';

    const svgContent = generateSVG(layout);

    scenarioPanels += `
    <div class="scenario-panel ${i === 0 ? 'active' : ''}" id="panel-${i}">
      <h2>${escapeHtml(scenario.name)}</h2>
      <div class="stats">
        <span class="stat">${layout.people.length} people</span>
        <span class="stat">${layout.relationships.length} relationships</span>
        <span class="stat">${issues.length} issues</span>
        <span class="stat">Canvas: ${layout.width.toFixed(0)} × ${layout.height.toFixed(0)}</span>
      </div>
      ${issuesList}
      <div class="svg-container" id="svg-container-${i}">
        <svg width="${layout.width}" height="${layout.height}" xmlns="http://www.w3.org/2000/svg" style="background: #0a0e14;">
          ${svgContent}
        </svg>
      </div>
      <div class="controls">
        <button onclick="zoomIn(${i})">🔍+</button>
        <button onclick="zoomOut(${i})">🔍−</button>
        <button onclick="resetZoom(${i})">↺ Reset</button>
        <button onclick="toggleGrid(${i})">⊞ Grid</button>
      </div>
      <details class="details-section">
        <summary>📊 Position Data</summary>
        ${dataTable}
      </details>
      <details class="details-section">
        <summary>🔗 Relationships (${layout.relationships.length})</summary>
        ${relList}
      </details>
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Matra — Tree Layout Examples</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #e8eaed;
      min-height: 100vh;
    }
    h1 { padding: 20px 24px 8px; font-size: 22px; color: #ffc107; }
    h1 span { color: #4dd0e1; font-weight: 400; font-size: 14px; margin-left: 12px; }
    .summary { padding: 4px 24px 12px; font-size: 13px; color: #8b949e; }
    h2 { font-size: 16px; margin-bottom: 12px; color: #e8eaed; }

    .tabs {
      display: flex;
      gap: 4px;
      padding: 8px 24px;
      overflow-x: auto;
      border-bottom: 1px solid #1e2530;
      flex-wrap: wrap;
    }
    .tab {
      background: #161b22;
      color: #8b949e;
      border: 1px solid #30363d;
      border-radius: 8px 8px 0 0;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
      transition: all 0.2s;
    }
    .tab:hover { background: #1e2530; color: #e8eaed; }
    .tab.active { background: #1e2530; color: #ffc107; border-bottom-color: #1e2530; }

    .scenario-panel { display: none; padding: 20px 24px; }
    .scenario-panel.active { display: block; }

    .stats {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .stat {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      color: #4dd0e1;
    }

    .issues { margin-bottom: 16px; }
    .issue {
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 4px;
      font-size: 12px;
    }
    .issue.critical { background: rgba(255, 0, 0, 0.15); border: 1px solid #f44336; color: #ef9a9a; }
    .issue.warning { background: rgba(255, 193, 7, 0.1); border: 1px solid #ffc107; color: #ffe082; }
    .no-issues {
      background: rgba(76, 175, 80, 0.1);
      border: 1px solid #4caf50;
      color: #a5d6a7;
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 12px;
    }

    .svg-container {
      overflow: auto;
      border: 1px solid #30363d;
      border-radius: 8px;
      background: #0a0e14;
      margin-bottom: 12px;
      position: relative;
      max-height: 70vh;
      cursor: grab;
    }
    .svg-container:active { cursor: grabbing; }
    .svg-container svg { display: block; transform-origin: 0 0; transition: transform 0.1s ease-out; }

    .controls {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .controls button {
      background: #161b22;
      border: 1px solid #30363d;
      color: #e8eaed;
      border-radius: 6px;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }
    .controls button:hover { background: #1e2530; border-color: #4dd0e1; }

    .details-section { margin-bottom: 12px; }
    .details-section summary {
      cursor: pointer;
      padding: 8px 12px;
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      font-size: 13px;
      color: #8b949e;
      transition: all 0.15s;
    }
    .details-section summary:hover { color: #e8eaed; }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 12px;
    }
    .data-table th {
      background: #161b22;
      color: #4dd0e1;
      padding: 6px 10px;
      text-align: left;
      border-bottom: 1px solid #30363d;
    }
    .data-table td {
      padding: 5px 10px;
      border-bottom: 1px solid #1e2530;
    }
    .data-table code {
      background: #1e2530;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      color: #ffc107;
    }
    .self-row { background: rgba(255, 193, 7, 0.08); }
    .self-row td { color: #ffc107; }

    .legend {
      display: flex;
      gap: 16px;
      padding: 8px 24px;
      flex-wrap: wrap;
      align-items: center;
    }
    .legend-title { font-size: 11px; color: #8b949e; text-transform: uppercase; letter-spacing: 0.5px; }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #8b949e;
    }
    .legend-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 1.5px solid;
      background: #0a0e14;
    }
    .legend-self {
      font-size: 11px;
      color: #ffc107;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend-self .legend-dot { border-color: #ffc107; }
    .legend-line {
      width: 20px;
      height: 2px;
      display: inline-block;
    }
  </style>
</head>
<body>
  <h1>🌳 Matra Tree Layout Examples <span>${allLayouts.length} examples</span></h1>
  <div class="summary">Built-in family tree examples · No AI pipeline needed · Overlap detection enabled</div>
  <div class="legend">
    <span class="legend-title">Legend:</span>
    <span class="legend-self"><span class="legend-dot"></span> Me (narrator)</span>
    <span class="legend-item"><span class="legend-dot" style="border-color: #e57373"></span> Gen 0</span>
    <span class="legend-item"><span class="legend-dot" style="border-color: #ffb74d"></span> Gen 1</span>
    <span class="legend-item"><span class="legend-dot" style="border-color: #4dd0e1"></span> Gen 2</span>
    <span class="legend-item"><span class="legend-dot" style="border-color: #81c784"></span> Gen 3</span>
    <span class="legend-item"><span class="legend-dot" style="border-color: #ba68c8"></span> Gen 4</span>
    <span class="legend-item" style="margin-left: 12px"><span class="legend-line" style="background: #ffc107"></span> Spouse</span>
    <span class="legend-item"><span class="legend-line" style="background: rgba(255,255,255,0.25); border-top: 2px dashed rgba(255,255,255,0.25); height: 0;"></span> Ex-Spouse</span>
  </div>
  <div class="tabs">
    ${scenarioTabs}
  </div>
  ${scenarioPanels}

  <script>
    const scales = {};

    function showScenario(idx) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.scenario-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-' + idx).classList.add('active');
      document.getElementById('panel-' + idx).classList.add('active');
    }

    function applyScale(idx) {
      const container = document.getElementById('svg-container-' + idx);
      const svg = container?.querySelector('svg');
      if (svg) svg.style.transform = 'scale(' + (scales[idx] || 1) + ')';
    }

    function zoomIn(idx) {
      scales[idx] = Math.min((scales[idx] || 1) * 1.3, 4);
      applyScale(idx);
    }

    function zoomOut(idx) {
      scales[idx] = Math.max((scales[idx] || 1) / 1.3, 0.2);
      applyScale(idx);
    }

    function resetZoom(idx) {
      scales[idx] = 1;
      applyScale(idx);
    }

    function toggleGrid(idx) {
      const container = document.getElementById('svg-container-' + idx);
      const svg = container?.querySelector('svg');
      if (!svg) return;

      let grid = svg.querySelector('.grid-lines');
      if (grid) {
        grid.style.display = grid.style.display === 'none' ? 'block' : 'none';
        return;
      }

      const w = parseInt(svg.getAttribute('width'));
      const h = parseInt(svg.getAttribute('height'));
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'grid-lines');

      for (let x = ${PADDING}; x < w; x += ${VERTICAL_SPACING}) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x); line.setAttribute('y1', 0);
        line.setAttribute('x2', x); line.setAttribute('y2', h);
        line.setAttribute('stroke', 'rgba(255,255,255,0.05)');
        line.setAttribute('stroke-width', '1');
        g.appendChild(line);
      }
      for (let y = ${PADDING}; y < h; y += ${VERTICAL_SPACING}) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', 0); line.setAttribute('y1', y);
        line.setAttribute('x2', w); line.setAttribute('y2', y);
        line.setAttribute('stroke', 'rgba(255,255,255,0.05)');
        line.setAttribute('stroke-width', '1');
        g.appendChild(line);

        const gen = (y - ${PADDING}) / ${VERTICAL_SPACING};
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '10');
        text.setAttribute('y', y + 4);
        text.setAttribute('fill', 'rgba(255,255,255,0.2)');
        text.setAttribute('font-size', '10');
        text.textContent = 'Gen ' + gen;
        g.appendChild(text);
      }

      svg.insertBefore(g, svg.firstChild);
    }

    document.querySelectorAll('.svg-container').forEach((container, idx) => {
      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        scales[idx] = Math.min(Math.max((scales[idx] || 1) * delta, 0.2), 4);
        applyScale(idx);
      }, { passive: false });
    });
  </script>
</body>
</html>`;
}

// ============================================================
// MAIN
// ============================================================

let scenarios = buildScenarios();
if (scenarioNums.length > 0) {
  scenarios = scenarios.filter((_, i) => scenarioNums.includes(i + 1));
}

console.log(`📋 ${scenarios.length} tree example(s)`);

const allLayouts = [];

for (const scenario of scenarios) {
  console.log(`  🌳 Laying out: ${scenario.name}`);
  const layout = layoutNodes(scenario.people, scenario.relationships, scenario.selfPersonId);
  const issues = detectOverlaps(layout);

  if (issues.length > 0) {
    for (const iss of issues) {
      const icon = iss.severity === 'critical' ? '❌' : '⚠️';
      console.log(`     ${icon} ${iss.message}`);
    }
  } else {
    console.log(`     ✅ No overlaps or alignment issues`);
  }

  allLayouts.push({ layout, scenario, issues });
}

const html = generateHTML(allLayouts);
const outputPath = path.join(__dirname, 'test-tree-examples.html');
fs.writeFileSync(outputPath, html, 'utf-8');

console.log(`\n✅ HTML written to: ${outputPath}`);
console.log(`   Open in browser to inspect layouts.\n`);

const totalIssues = allLayouts.reduce((sum, l) => sum + l.issues.length, 0);
const criticalIssues = allLayouts.reduce((sum, l) => sum + l.issues.filter(i => i.severity === 'critical').length, 0);
if (totalIssues === 0) {
  console.log('🎉 All examples have clean layouts — no overlaps detected!\n');
} else {
  console.log(`⚠️  ${totalIssues} issue(s) found (${criticalIssues} critical)\n`);
}

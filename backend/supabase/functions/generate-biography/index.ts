// ============================================================
// Matra — Generate Biography Edge Function
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId, getServiceClient } from '../_shared/supabase.ts';
import { checkFeatureAccess } from '../_shared/feature-gate.ts';
import { getLLMProviderWithFallback } from '../_shared/ai/registry.ts';
import type { PersonBiographyInput } from '../_shared/ai/provider.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = await getAuthUserId(req);

    // Check premium access
    const access = await checkFeatureAccess(userId, 'aiBiography');
    if (!access.allowed) {
      return errorResponse(access.reason!, 'FEATURE_LOCKED', 403);
    }

    const { personId, language } = await req.json();
    if (!personId) {
      return errorResponse('Missing personId', 'MISSING_FIELDS', 400);
    }

    const supabase = getServiceClient();

    // Fetch person with all related data
    const { data: person, error: personError } = await supabase
      .from('people')
      .select(`
        *,
        relationships_as_a:relationships!person_a_id(
          relationship_type, person_b:people!person_b_id(first_name, last_name)
        ),
        relationships_as_b:relationships!person_b_id(
          relationship_type, person_a:people!person_a_id(first_name, last_name)
        ),
        stories:story_people(
          story:stories(title, content)
        )
      `)
      .eq('id', personId)
      .is('deleted_at', null)
      .single();

    if (personError || !person) {
      return errorResponse('Person not found', 'NOT_FOUND', 404);
    }

    // Fetch interview excerpts mentioning this person
    const { data: entities } = await supabase
      .from('extracted_entities')
      .select('context_text')
      .eq('linked_person_id', personId)
      .eq('entity_type', 'person')
      .limit(20);

    // Map from relationship_type to human-readable role descriptions.
    // TYPE_LABEL[type] = what person_a is called relative to person_b.
    // e.g. 'parent' → person_a is person_b's "parent"
    const TYPE_LABEL: Record<string, string> = {
      parent: 'parent', child: 'child',
      grandparent: 'grandparent', grandchild: 'grandchild',
      great_grandparent: 'great-grandparent', great_grandchild: 'great-grandchild',
      great_great_grandparent: 'great-great-grandparent', great_great_grandchild: 'great-great-grandchild',
      uncle_aunt: 'uncle/aunt', nephew_niece: 'nephew/niece',
      step_parent: 'step-parent', step_child: 'step-child',
      step_sibling: 'step-sibling',
      adopted_parent: 'adoptive parent', adopted_child: 'adopted child',
      godparent: 'godparent', godchild: 'godchild',
      spouse: 'spouse', ex_spouse: 'ex-spouse',
      sibling: 'sibling', cousin: 'cousin',
      in_law: 'in-law', other: 'relative',
    };

    // Inverse type map for relationships_as_b
    const INVERSE_TYPE: Record<string, string> = {
      parent: 'child', child: 'parent',
      grandparent: 'grandchild', grandchild: 'grandparent',
      great_grandparent: 'great_grandchild', great_grandchild: 'great_grandparent',
      great_great_grandparent: 'great_great_grandchild', great_great_grandchild: 'great_great_grandparent',
      uncle_aunt: 'nephew_niece', nephew_niece: 'uncle_aunt',
      step_parent: 'step_child', step_child: 'step_parent',
      adopted_parent: 'adopted_child', adopted_child: 'adopted_parent',
      godparent: 'godchild', godchild: 'godparent',
      spouse: 'spouse', ex_spouse: 'ex_spouse',
      sibling: 'sibling', step_sibling: 'step_sibling',
      cousin: 'cousin', in_law: 'in_law', other: 'other',
    };

    const subjectName = `${person.first_name}${person.last_name ? ' ' + person.last_name : ''}`;

    // Build biography input — deduplicate and create natural-language descriptions
    const seenRelationships = new Set<string>();
    const relationships: Array<{ type: string; relatedPersonName: string; description: string }> = [];

    function addRelationship(type: string, name: string) {
      const key = `${type}|${name}`;
      if (seenRelationships.has(key)) return;
      seenRelationships.add(key);
      const label = TYPE_LABEL[type] || type.replace(/_/g, ' ');
      // Build a natural-language description: "[Related] is [Subject]'s [label]"
      // For the subject's bio, we describe what the related person IS to the subject.
      // e.g. type='child' means Subject is the child → Related is the parent
      // So we flip the description to say what the related person is:
      const INVERSE_LABEL: Record<string, string> = {
        child: 'parent', parent: 'child',
        grandchild: 'grandparent', grandparent: 'grandchild',
        great_grandchild: 'great-grandparent', great_grandparent: 'great-grandchild',
        great_great_grandchild: 'great-great-grandparent', great_great_grandparent: 'great-great-grandchild',
        nephew_niece: 'uncle/aunt', uncle_aunt: 'nephew/niece',
        step_child: 'step-parent', step_parent: 'step-child',
        adopted_child: 'adoptive parent', adopted_parent: 'adopted child',
        godchild: 'godparent', godparent: 'godchild',
        spouse: 'spouse', ex_spouse: 'ex-spouse',
        sibling: 'sibling', step_sibling: 'step-sibling',
        cousin: 'cousin', in_law: 'in-law', other: 'relative',
      };
      const relatedRole = INVERSE_LABEL[type] || label;
      const description = `${name} is ${subjectName}'s ${relatedRole}`;
      relationships.push({ type, relatedPersonName: name, description });
    }

    // relationships_as_a: Subject IS [type] OF person_b → pass type as-is
    for (const r of (person.relationships_as_a || [])) {
      const name = `${r.person_b.first_name} ${r.person_b.last_name || ''}`.trim();
      addRelationship(r.relationship_type, name);
    }

    // relationships_as_b: person_a IS [type] OF Subject → invert the type
    for (const r of (person.relationships_as_b || [])) {
      const name = `${r.person_a.first_name} ${r.person_a.last_name || ''}`.trim();
      const invertedType = INVERSE_TYPE[r.relationship_type] || r.relationship_type;
      addRelationship(invertedType, name);
    }

    // Remove contradictory relationships: if Subject is both parent AND child
    // of the same person, keep only the more likely one (child) and discard parent.
    const contradictionPairs: [string, string][] = [
      ['parent', 'child'], ['grandparent', 'grandchild'],
      ['great_grandparent', 'great_grandchild'], ['great_great_grandparent', 'great_great_grandchild'],
      ['uncle_aunt', 'nephew_niece'], ['step_parent', 'step_child'],
      ['adopted_parent', 'adopted_child'], ['godparent', 'godchild'],
    ];
    const byPerson = new Map<string, Array<{ type: string; relatedPersonName: string; description: string }>>();
    for (const rel of relationships) {
      const arr = byPerson.get(rel.relatedPersonName) || [];
      arr.push(rel);
      byPerson.set(rel.relatedPersonName, arr);
    }
    const toRemove = new Set<string>();
    for (const [name, rels] of byPerson) {
      const types = new Set(rels.map((r) => r.type));
      for (const [typeA, typeB] of contradictionPairs) {
        if (types.has(typeA) && types.has(typeB)) {
          // Both exist — remove the "ancestor" type (typeA), keep "descendant" (typeB)
          // because the user generating the bio is more likely to be the younger person
          console.warn(`[generate-biography] Contradictory relationship with ${name}: both ${typeA} and ${typeB} — removing ${typeA}`);
          toRemove.add(`${typeA}|${name}`);
        }
      }
    }
    const cleanedRelationships = relationships.filter((r) => !toRemove.has(`${r.type}|${r.relatedPersonName}`));

    console.log(`[generate-biography] Relationships for ${subjectName}:`, JSON.stringify(cleanedRelationships, null, 2));

    const stories = (person.stories || [])
      .map((sp: any) => sp.story)
      .filter(Boolean)
      .map((s: any) => ({ title: s.title, content: s.content }));

    const interviewExcerpts = (entities || [])
      .map((e: any) => e.context_text)
      .filter(Boolean);

    const input: PersonBiographyInput = {
      firstName: person.first_name,
      lastName: person.last_name,
      gender: person.metadata?.gender,
      birthDate: person.birth_date,
      deathDate: person.death_date,
      birthPlace: person.birth_place,
      currentLocation: person.current_location,
      profession: person.metadata?.profession,
      isDeceased: person.metadata?.is_deceased,
      relationships: cleanedRelationships,
      stories,
      interviewExcerpts,
    };

    // Generate biography
    const llm = getLLMProviderWithFallback();
    const result = await llm.generateBiography(input, language || undefined);

    // Save to person record
    await supabase
      .from('people')
      .update({
        ai_biography: result.biography,
        ai_biography_generated_at: new Date().toISOString(),
      })
      .eq('id', personId);

    return jsonResponse(result);
  } catch (err) {
    console.error('Generate biography error:', err);
    return errorResponse(
      err.message || 'Internal server error',
      'INTERNAL_ERROR',
      err.message === 'Unauthorized' ? 401 : 500
    );
  }
});

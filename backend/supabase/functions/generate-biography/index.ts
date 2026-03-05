// ============================================================
// MATRA — Generate Biography Edge Function
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId, getServiceClient } from '../_shared/supabase.ts';
import { checkFeatureAccess } from '../_shared/feature-gate.ts';
import { getLLMProvider } from '../_shared/ai/registry.ts';
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

    const { personId } = await req.json();
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

    // Build biography input
    const relationships = [
      ...(person.relationships_as_a || []).map((r: any) => ({
        type: r.relationship_type,
        relatedPersonName: `${r.person_b.first_name} ${r.person_b.last_name || ''}`.trim(),
      })),
      ...(person.relationships_as_b || []).map((r: any) => ({
        type: r.relationship_type,
        relatedPersonName: `${r.person_a.first_name} ${r.person_a.last_name || ''}`.trim(),
      })),
    ];

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
      birthDate: person.birth_date,
      deathDate: person.death_date,
      birthPlace: person.birth_place,
      relationships,
      stories,
      interviewExcerpts,
    };

    // Generate biography
    const llm = getLLMProvider();
    const result = await llm.generateBiography(input);

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

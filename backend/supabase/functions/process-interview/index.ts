// ============================================================
// MATRA — Process Interview Edge Function
// ============================================================
// Orchestrates the full AI processing pipeline:
// 1. Upload audio to storage
// 2. Transcribe audio
// 3. Extract entities & relationships
// 4. Generate summary & stories
// 5. Create/link people nodes and relationships
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getUserClient, getAuthUserId, getServiceClient } from '../_shared/supabase.ts';
import { canCreateInterview, getUserEntitlements } from '../_shared/feature-gate.ts';
import { getSTTProvider, getLLMProvider } from '../_shared/ai/registry.ts';
import { uploadToSpaces } from '../_shared/spaces.ts';

serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    console.log('[process-interview] Starting...');
    const userId = await getAuthUserId(req);
    console.log('[process-interview] Authenticated user:', userId);
    const supabase = getServiceClient();

    // Check feature gate
    const canCreate = await canCreateInterview(userId);
    if (!canCreate.allowed) {
      return errorResponse(canCreate.reason!, 'INTERVIEW_LIMIT_REACHED', 403);
    }

    // Parse multipart form data
    console.log('[process-interview] Parsing form data...');
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    const familyGroupId = formData.get('familyGroupId') as string;
    const title = formData.get('title') as string | null;
    const subjectPersonId = formData.get('subjectPersonId') as string | null;
    const devTranscript = formData.get('transcript') as string | null;
    console.log('[process-interview] Form data parsed:', {
      hasAudio: !!audioFile,
      audioSize: audioFile?.size,
      audioName: audioFile?.name,
      familyGroupId,
      hasTranscript: !!devTranscript,
    });

    if (!familyGroupId) {
      return errorResponse('Missing required field: familyGroupId', 'MISSING_FIELDS', 400);
    }
    if (!audioFile && !devTranscript) {
      return errorResponse('Missing required field: audio or transcript', 'MISSING_FIELDS', 400);
    }

    // 1. Create interview record
    const { data: interview, error: interviewError } = await supabase
      .from('interviews')
      .insert({
        family_group_id: familyGroupId,
        conducted_by: userId,
        title: title || `Interview ${new Date().toLocaleDateString()}`,
        subject_person_id: subjectPersonId,
        status: devTranscript ? 'processing' : 'uploading',
        audio_size_bytes: audioFile?.size || 0,
      })
      .select()
      .single();

    if (interviewError) {
      return errorResponse('Failed to create interview', 'DB_ERROR', 500, interviewError);
    }

    let transcriptText: string;
    let transcript: { id: string };

    if (devTranscript) {
      // ── Dev mode: skip audio upload & STT, use provided transcript ──
      transcriptText = devTranscript;

      const { data: transcriptRecord, error: transcriptError } = await supabase
        .from('transcripts')
        .insert({
          interview_id: interview.id,
          full_text: devTranscript,
          word_timings: null,
          speakers: null,
          provider: 'dev-transcript',
          language: 'en',
          confidence: 1.0,
        })
        .select()
        .single();

      if (transcriptError) {
        return errorResponse('Failed to save transcript', 'DB_ERROR', 500, transcriptError);
      }
      transcript = transcriptRecord;

      await supabase
        .from('interviews')
        .update({
          status: 'processing',
          processing_stage: 'extracting',
          processing_started_at: new Date().toISOString(),
        })
        .eq('id', interview.id);
    } else {
      // ── Normal mode: upload audio & transcribe ──
      // 2. Upload audio to DO Spaces
      const ext = audioFile!.name.split('.').pop() || 'm4a';
      const audioSubPath = `audio/${familyGroupId}/${interview.id}.${ext}`;
      const audioBytes = new Uint8Array(await audioFile!.arrayBuffer());

      let audioUrl: string;
      console.log('[process-interview] Uploading audio:', audioSubPath, `(${audioBytes.length} bytes)`);
      try {
        audioUrl = await uploadToSpaces(audioSubPath, audioBytes, audioFile!.type);
      } catch (uploadErr) {
        await supabase.from('interviews').update({ status: 'failed', processing_error: 'Upload failed' }).eq('id', interview.id);
        return errorResponse('Failed to upload audio', 'UPLOAD_ERROR', 500, uploadErr);
      }

      // Update interview with audio path
      await supabase
        .from('interviews')
        .update({
          audio_storage_path: audioUrl,
          status: 'transcribing',
          processing_stage: 'transcribing',
          processing_started_at: new Date().toISOString(),
        })
        .eq('id', interview.id);

      // Update storage usage
      await supabase
        .from('profiles')
        .update({
          storage_used_bytes: supabase.rpc('increment_storage', {
            user_id: userId,
            bytes: audioFile!.size,
          }),
        });

      // 3. Transcribe audio
      console.log('[process-interview] Starting transcription...');
      const sttProvider = getSTTProvider();
      let transcriptionResult;

      try {
        transcriptionResult = await sttProvider.transcribe(audioBytes, audioFile!.type);
      } catch (err) {
        await supabase.from('interviews').update({
          status: 'failed',
          processing_stage: 'failed',
          processing_error: `Transcription failed: ${err.message}`,
        }).eq('id', interview.id);
        return errorResponse('Transcription failed', 'TRANSCRIPTION_ERROR', 500);
      }

      transcriptText = transcriptionResult.text;

      // 4. Save transcript
      const { data: transcriptRecord, error: transcriptError } = await supabase
        .from('transcripts')
        .insert({
          interview_id: interview.id,
          full_text: transcriptionResult.text,
          word_timings: transcriptionResult.words,
          speakers: transcriptionResult.speakers || null,
          provider: sttProvider.name,
          language: transcriptionResult.language,
          confidence: transcriptionResult.confidence,
        })
        .select()
        .single();

      if (transcriptError) {
        return errorResponse('Failed to save transcript', 'DB_ERROR', 500, transcriptError);
      }
      transcript = transcriptRecord;

      // Update status
      await supabase
        .from('interviews')
        .update({ status: 'processing', processing_stage: 'extracting' })
        .eq('id', interview.id);
    }

    // 5. Extract entities & relationships
    // Look up subject person so the AI knows who the narrator is
    let subjectPerson: { id: string; first_name: string; last_name: string | null } | null = null;
    if (subjectPersonId) {
      const { data } = await supabase
        .from('people')
        .select('id, first_name, last_name')
        .eq('id', subjectPersonId)
        .single();
      subjectPerson = data;
    }

    // Prepend narrator context so the AI knows "I" = the subject person
    const subjectName = subjectPerson
      ? `${subjectPerson.first_name}${subjectPerson.last_name ? ' ' + subjectPerson.last_name : ''}`
      : null;
    const transcriptForAI = subjectName
      ? `[Narrator/subject of this interview is ${subjectName}. Any first-person references ("I", "me", "my") refer to ${subjectName}. Do NOT create a separate entry for the narrator — they are ${subjectName}. IMPORTANT: When the narrator says "my mom", "my dad", "my brother", etc., create relationships between those people and ${subjectName}. Use ${subjectName} as the personA or personB name in relationships — never use "I" or "me" as a person name.]\n\n${transcriptText}`
      : transcriptText;

    const llmProvider = getLLMProvider();
    let extractionResult;

    try {
      extractionResult = await llmProvider.extractEntities(transcriptForAI);
    } catch (err) {
      console.error('Entity extraction failed:', err);
      // Non-fatal — continue with summarization
      extractionResult = { entities: [], relationships: [], suggestedPeople: [] };
    }

    // 6. Save extracted entities
    if (extractionResult.entities.length > 0) {
      const entityRows = extractionResult.entities.map((e) => ({
        interview_id: interview.id,
        transcript_id: transcript.id,
        entity_type: e.type,
        entity_value: e.value,
        confidence: e.confidence,
        context_text: e.context,
      }));

      await supabase.from('extracted_entities').insert(entityRows);
    }

    // 7. Create/link people nodes — with cross-interview deduplication
    // Build a resolution map: suggested name → person ID in DB
    const resolvedPeople = new Map<string, string>(); // "firstName lastName" → person.id

    // Pre-seed the resolution map with the subject/self person so they are
    // NEVER duplicated. Any AI-suggested person matching the narrator's name
    // will resolve to their existing record.
    if (subjectPerson) {
      const selfKey = `${subjectPerson.first_name} ${subjectPerson.last_name || ''}`.trim();
      resolvedPeople.set(selfKey, subjectPerson.id);
      // Also seed first-name-only key for common references
      resolvedPeople.set(subjectPerson.first_name, subjectPerson.id);
    }

    // Fetch all existing people in this family group for matching
    const { data: existingPeople } = await supabase
      .from('people')
      .select('id, first_name, last_name, nickname, birth_date, birth_place')
      .eq('family_group_id', familyGroupId)
      .is('deleted_at', null);

    const allExisting = existingPeople || [];

    for (const suggested of extractionResult.suggestedPeople) {
      const sugFirst = (suggested.firstName || '').trim().toLowerCase();
      const sugLast = (suggested.lastName || '').trim().toLowerCase();
      const sugNick = (suggested.nickname || '').trim().toLowerCase();
      const sugFullKey = `${suggested.firstName} ${suggested.lastName || ''}`.trim();

      // If this person was already pre-seeded (e.g. the subject/self), skip
      if (resolvedPeople.has(sugFullKey) || resolvedPeople.has(suggested.firstName)) {
        continue;
      }

      // Try to find a match among existing people
      let matchId: string | null = null;
      let bestScore = 0;

      for (const existing of allExisting) {
        const exFirst = (existing.first_name || '').toLowerCase();
        const exLast = (existing.last_name || '').toLowerCase();
        const exNick = (existing.nickname || '').toLowerCase();

        let score = 0;

        // Exact first name match
        if (sugFirst && exFirst && sugFirst === exFirst) score += 3;
        // First name matches nickname
        else if (sugFirst && exNick && sugFirst === exNick) score += 2;
        // Nickname matches first name
        else if (sugNick && exFirst && sugNick === exFirst) score += 2;
        // Nickname matches nickname
        else if (sugNick && exNick && sugNick === exNick) score += 2;
        // First name is a prefix (e.g. "Rose" matches "Rosemary")
        else if (sugFirst && exFirst && (exFirst.startsWith(sugFirst) || sugFirst.startsWith(exFirst)) && Math.min(sugFirst.length, exFirst.length) >= 3) score += 1;

        if (score === 0) continue; // No first-name-level match at all

        // Last name match boost
        if (sugLast && exLast && sugLast === exLast) score += 3;
        // One side has no last name — don't penalize
        else if (!sugLast || !exLast) score += 0;
        // Last names differ — reduce confidence
        else score -= 2;

        if (score > bestScore) {
          bestScore = score;
          matchId = existing.id;
        }
      }

      if (matchId && bestScore >= 3) {
        // Match found — update existing record with any new info
        const updates: Record<string, unknown> = {};
        const match = allExisting.find((p: any) => p.id === matchId)!;
        if (suggested.lastName && !match.last_name) updates.last_name = suggested.lastName;
        if (suggested.nickname && !match.nickname) updates.nickname = suggested.nickname;
        if (suggested.birthDate && !match.birth_date) updates.birth_date = suggested.birthDate;
        if (suggested.birthPlace && !match.birth_place) updates.birth_place = suggested.birthPlace;

        if (Object.keys(updates).length > 0) {
          await supabase.from('people').update(updates).eq('id', matchId);
          // Also update our local copy
          const localMatch = allExisting.find((p: any) => p.id === matchId)!;
          Object.assign(localMatch, updates);
        }

        resolvedPeople.set(sugFullKey, matchId);
      } else {
        // No match — create new person
        const { data: newPerson } = await supabase
          .from('people')
          .insert({
            family_group_id: familyGroupId,
            first_name: suggested.firstName,
            last_name: suggested.lastName,
            nickname: suggested.nickname,
            birth_date: suggested.birthDate,
            birth_place: suggested.birthPlace,
            created_by: userId,
          })
          .select('id, first_name, last_name, nickname, birth_date, birth_place')
          .single();

        if (newPerson) {
          resolvedPeople.set(sugFullKey, newPerson.id);
          allExisting.push(newPerson);
        }
      }
    }

    // Helper: resolve a name reference (from relationships/stories) to a person ID
    function resolvePersonName(name: string): string | null {
      // Handle self-references — map to subject person if available
      const selfRefs = ['i', 'me', 'myself', 'narrator', 'the narrator'];
      if (subjectPerson && selfRefs.includes(name.toLowerCase().trim())) {
        return subjectPerson.id;
      }

      // Direct key match
      if (resolvedPeople.has(name)) return resolvedPeople.get(name)!;

      // Try first-name-only match against resolved map
      const firstName = name.split(' ')[0].toLowerCase();
      for (const [key, id] of resolvedPeople) {
        if (key.split(' ')[0].toLowerCase() === firstName) return id;
      }

      // Fall back to DB existing people
      for (const p of allExisting) {
        const exFirst = (p.first_name || '').toLowerCase();
        const exNick = (p.nickname || '').toLowerCase();
        if (exFirst === firstName || exNick === firstName) return p.id;
      }

      return null;
    }

    // 8. Create relationships
    for (const rel of extractionResult.relationships) {
      const personAId = resolvePersonName(rel.personA);
      const personBId = resolvePersonName(rel.personB);

      if (personAId && personBId && personAId !== personBId) {
        // Validate that the relationship type is a known enum value
        const validTypes = [
          'parent', 'child', 'spouse', 'sibling', 'grandparent', 'grandchild',
          'uncle_aunt', 'nephew_niece', 'cousin', 'in_law',
          'step_parent', 'step_child', 'step_sibling',
          'adopted_parent', 'adopted_child', 'godparent', 'godchild', 'other',
        ];
        const relType = validTypes.includes(rel.relationshipType)
          ? rel.relationshipType
          : 'other';

        await supabase.from('relationships').upsert(
          {
            family_group_id: familyGroupId,
            person_a_id: personAId,
            person_b_id: personBId,
            relationship_type: relType,
            source_interview_id: interview.id,
            confidence: rel.confidence,
          },
          { onConflict: 'person_a_id,person_b_id,relationship_type' }
        );
      } else {
        console.warn('[process-interview] Could not resolve relationship:', {
          personA: rel.personA, resolvedA: personAId,
          personB: rel.personB, resolvedB: personBId,
          type: rel.relationshipType,
        });
      }
    }

    // 9. Summarize (premium feature — still run for basic summary)
    await supabase
      .from('interviews')
      .update({ processing_stage: 'summarizing' })
      .eq('id', interview.id);

    let summaryResult;
    try {
      summaryResult = await llmProvider.summarizeInterview(transcriptText);
    } catch (err) {
      console.error('Summarization failed:', err);
      summaryResult = null;
    }

    // 10. Save summary and stories
    let storiesCreatedCount = 0;
    if (summaryResult) {
      await supabase
        .from('interviews')
        .update({
          ai_summary: summaryResult.summary,
          ai_key_topics: summaryResult.keyTopics,
        })
        .eq('id', interview.id);

      // Determine how many stories to save based on subscription tier
      const entitlements = await getUserEntitlements(userId);
      const maxStories = entitlements.limits.maxStoriesPerInterview;
      const storiesToSave = summaryResult.suggestedStories.slice(0, maxStories);

      if (storiesToSave.length > 0) {
        for (const story of storiesToSave) {
          const { data: storyRecord } = await supabase
            .from('stories')
            .insert({
              family_group_id: familyGroupId,
              interview_id: interview.id,
              title: story.title,
              content: story.content,
              ai_generated: true,
              event_date: story.approximateDate || null,
              event_location: story.location || null,
              created_by: userId,
            })
            .select()
            .single();

          if (storyRecord) {
            storiesCreatedCount++;

            // Link people to stories
            if (story.involvedPeople.length > 0) {
              for (const personName of story.involvedPeople) {
                const personId = resolvePersonName(personName);

                if (personId) {
                  await supabase.from('story_people').upsert(
                    { story_id: storyRecord.id, person_id: personId, role: 'mentioned' },
                    { onConflict: 'story_id,person_id' }
                  );
                }
              }
            }
          }
        }
      }
    }

    // 11. Mark complete
    await supabase
      .from('interviews')
      .update({
        status: 'completed',
        processing_stage: 'completed',
        processing_completed_at: new Date().toISOString(),
      })
      .eq('id', interview.id);

    // Fetch final interview state
    const { data: finalInterview } = await supabase
      .from('interviews')
      .select('*, transcripts(*)')
      .eq('id', interview.id)
      .single();

    return jsonResponse({
      interview: finalInterview,
      extractedEntities: extractionResult.entities.length,
      extractedRelationships: extractionResult.relationships.length,
      suggestedPeople: extractionResult.suggestedPeople.length,
      storiesCreated: storiesCreatedCount,
    });
  } catch (err) {
    console.error('[process-interview] FATAL ERROR:', (err as any)?.message || err, (err as any)?.stack || '');
    return errorResponse(
      err.message || 'Internal server error',
      'INTERNAL_ERROR',
      err.message === 'Unauthorized' ? 401 : 500
    );
  }
});

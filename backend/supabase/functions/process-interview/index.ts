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
import { getSTTProviderWithFallback, getLLMProviderWithFallback } from '../_shared/ai/registry.ts';
import { uploadToSpaces } from '../_shared/spaces.ts';

// ── Audio Snippet Matching ──
// Finds verbatim quotes from the transcript in word timings to get precise timestamps.
// Uses fuzzy substring matching: normalizes both the quote and the word sequence,
// then slides a window over the words to find the best match.
function matchQuotesToTimings(
  keyMoments: Array<{ quote: string; label: string }>,
  words: Array<{ word: string; start_ms: number; end_ms: number; confidence: number }>,
  fullText: string,
): Array<{ label: string; quote: string; startMs: number; endMs: number }> {
  const results: Array<{ label: string; quote: string; startMs: number; endMs: number }> = [];

  function norm(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F ]/g, '').replace(/\s+/g, ' ').trim();
  }

  for (const moment of keyMoments) {
    const quoteNorm = norm(moment.quote);
    if (!quoteNorm || quoteNorm.split(' ').length < 3) continue;

    const quoteWords = quoteNorm.split(' ');
    let bestScore = 0;
    let bestStart = -1;
    let bestEnd = -1;

    // Slide a window of varying size around the quote length
    const minLen = Math.max(3, quoteWords.length - 2);
    const maxLen = quoteWords.length + 2;

    for (let windowSize = minLen; windowSize <= maxLen && windowSize <= words.length; windowSize++) {
      for (let i = 0; i <= words.length - windowSize; i++) {
        const windowWords = words.slice(i, i + windowSize).map((w) => norm(w.word)).join(' ');
        // Count matching words in order
        let matches = 0;
        let qi = 0;
        for (const ww of windowWords.split(' ')) {
          if (qi < quoteWords.length && ww === quoteWords[qi]) {
            matches++;
            qi++;
          }
        }
        const score = matches / quoteWords.length;
        if (score > bestScore) {
          bestScore = score;
          bestStart = i;
          bestEnd = i + windowSize - 1;
        }
      }
    }

    // Require at least 60% word match to avoid false positives
    if (bestScore >= 0.6 && bestStart >= 0 && bestEnd >= 0) {
      const startMs = words[bestStart].start_ms;
      // Add small buffer (500ms) before and after for natural playback
      const endMs = words[bestEnd].end_ms + 500;
      results.push({
        label: moment.label,
        quote: moment.quote,
        startMs: Math.max(0, startMs - 300),
        endMs,
      });
    }
  }

  // Cap at 3 snippets per story to keep it digestible
  return results.slice(0, 3);
}

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
    const language = formData.get('language') as string | null;
    console.log('[process-interview] Form data parsed:', {
      hasAudio: !!audioFile,
      audioSize: audioFile?.size,
      audioName: audioFile?.name,
      familyGroupId,
      hasTranscript: !!devTranscript,
      language,
    });

    if (!familyGroupId) {
      return errorResponse('Missing required field: familyGroupId', 'MISSING_FIELDS', 400);
    }
    if (!audioFile && !devTranscript) {
      return errorResponse('Missing required field: audio or transcript', 'MISSING_FIELDS', 400);
    }

    // Validate audio file type and size
    if (audioFile) {
      const allowedAudioTypes = [
        'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/mpeg',
        'audio/wav', 'audio/webm', 'audio/ogg', 'audio/aac',
      ];
      if (!allowedAudioTypes.includes(audioFile.type)) {
        return errorResponse('Invalid audio format', 'INVALID_FILE_TYPE', 400);
      }
      const MAX_AUDIO_SIZE = 100 * 1024 * 1024; // 100 MB hard cap
      if (audioFile.size > MAX_AUDIO_SIZE) {
        return errorResponse('Audio file too large. Maximum 100MB', 'FILE_TOO_LARGE', 400);
      }
      if (audioFile.size === 0) {
        return errorResponse('Audio file is empty', 'INVALID_FILE', 400);
      }
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
    let wordTimings: Array<{ word: string; start_ms: number; end_ms: number; confidence: number }> | null = null;

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
      const sttProvider = getSTTProviderWithFallback();
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
      wordTimings = transcriptionResult.words || null;

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
    let subjectPerson: { id: string; first_name: string; last_name: string | null; metadata: any } | null = null;
    if (subjectPersonId) {
      const { data } = await supabase
        .from('people')
        .select('id, first_name, last_name, metadata')
        .eq('id', subjectPersonId)
        .single();
      subjectPerson = data;
    }

    // Prepend narrator context so the AI knows "I" = the subject person
    const subjectName = subjectPerson
      ? `${subjectPerson.first_name}${subjectPerson.last_name ? ' ' + subjectPerson.last_name : ''}`
      : null;
    const subjectGender = subjectPerson?.metadata?.gender || null;
    const genderHint = subjectGender
      ? ` Their gender is ${subjectGender}. Use correct gendered language (pronouns, adjectives, relationship labels) when referring to ${subjectName}.`
      : '';

    // Build existing family context so the AI can match against known people
    // and avoid creating duplicates or conflicting relationships.
    let existingFamilyContext = '';
    {
      // Fetch existing people and relationships for context
      const { data: ctxPeople } = await supabase
        .from('people')
        .select('id, first_name, last_name, nickname, birth_date, birth_place, metadata')
        .eq('family_group_id', familyGroupId)
        .is('deleted_at', null);

      const { data: ctxRels } = await supabase
        .from('relationships')
        .select('person_a_id, person_b_id, relationship_type')
        .eq('family_group_id', familyGroupId);

      const { data: ctxStories } = await supabase
        .from('stories')
        .select('title, content')
        .eq('family_group_id', familyGroupId)
        .limit(10);

      if (ctxPeople && ctxPeople.length > 0) {
        const peopleList = ctxPeople.map((p: any) => {
          const parts = [`${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`];
          if (p.nickname) parts.push(`aka "${p.nickname}"`);
          if (p.birth_date) parts.push(`b. ${p.birth_date}`);
          if (p.birth_place) parts.push(`from ${p.birth_place}`);
          if (p.metadata?.gender) parts.push(p.metadata.gender);
          return `  - ${parts.join(', ')} [id:${p.id}]`;
        }).join('\n');

        const relList = (ctxRels || []).map((r: any) => {
          const a = ctxPeople.find((p: any) => p.id === r.person_a_id);
          const b = ctxPeople.find((p: any) => p.id === r.person_b_id);
          if (!a || !b) return null;
          const aName = `${a.first_name}${a.last_name ? ' ' + a.last_name : ''}`;
          const bName = `${b.first_name}${b.last_name ? ' ' + b.last_name : ''}`;
          return `  - ${aName} is ${r.relationship_type} of ${bName}`;
        }).filter(Boolean).join('\n');

        existingFamilyContext = `\n[EXISTING FAMILY TREE — These people already exist in the database. When extracting, use the EXACT same names for people who match. Do NOT create duplicates. If the transcript mentions someone who matches an existing person, use their name as listed here.\nKnown people:\n${peopleList}`;
        if (relList) {
          existingFamilyContext += `\nKnown relationships:\n${relList}`;
        }
        if (ctxStories && ctxStories.length > 0) {
          const storyTitles = ctxStories.map((s: any) => `  - "${s.title}"`).join('\n');
          existingFamilyContext += `\nExisting stories (avoid duplicating these themes):\n${storyTitles}`;
        }
        existingFamilyContext += ']\n';
      }
    }

    const transcriptForAI = subjectName
      ? `[Narrator/subject of this interview is ${subjectName}.${genderHint} Any first-person references ("I", "me", "my") refer to ${subjectName}. Do NOT create a separate entry for the narrator — they are ${subjectName}. IMPORTANT: When the narrator says "my mom", "my dad", "my brother", etc., create relationships between those people and ${subjectName}. Use ${subjectName} as the personA or personB name in relationships — never use "I" or "me" as a person name.]${existingFamilyContext}\n\n${transcriptText}`
      : `${existingFamilyContext}\n\n${transcriptText}`;

    const llmProvider = getLLMProviderWithFallback();
    let extractionResult;

    try {
      extractionResult = await llmProvider.extractEntities(transcriptForAI, language || undefined);
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
    const resolvedPeople = new Map<string, string>(); // normalized key → person.id

    // Strip diacritics / accents for consistent matching
    // e.g. "García" → "garcia", "Héctor" → "hector"
    function normalize(s: string): string {
      return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    }

    // Pre-seed the resolution map with the subject/self person so they are
    // NEVER duplicated. Any AI-suggested person matching the narrator's name
    // will resolve to their existing record.
    if (subjectPerson) {
      const selfKey = normalize(`${subjectPerson.first_name} ${subjectPerson.last_name || ''}`);
      resolvedPeople.set(selfKey, subjectPerson.id);
      // NOTE: We intentionally do NOT seed first-name-only for the subject.
      // This prevents false dedup when a family member shares the subject's
      // first name (e.g., "John William Smith" vs narrator "John Smith").
    }

    // Fetch all existing people in this family group for matching
    const { data: existingPeople } = await supabase
      .from('people')
      .select('id, first_name, last_name, nickname, birth_date, death_date, birth_place, current_location, metadata')
      .eq('family_group_id', familyGroupId)
      .is('deleted_at', null);

    const allExisting = existingPeople || [];

    // Also pre-seed resolvedPeople with ALL existing people so within-interview
    // duplicates are caught (e.g. AI suggests "Marco Smith" and "Marco" in same batch)
    for (const ep of allExisting) {
      const epKey = normalize(`${ep.first_name} ${ep.last_name || ''}`);
      if (!resolvedPeople.has(epKey)) {
        resolvedPeople.set(epKey, ep.id);
      }
    }

    for (const suggested of extractionResult.suggestedPeople) {
      const sugFirst = normalize(suggested.firstName || '');
      const sugLast = normalize(suggested.lastName || '');
      const sugNick = normalize(suggested.nickname || '');
      const sugFullKey = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);

      // If this person was already resolved (e.g. the subject/self, or existing person), skip.
      // EXCEPTION: if the match is to the subject/narrator, fall through instead.
      // The AI prompt says NOT to include the narrator in suggestedPeople, so a
      // match here likely means a different person with a similar name (e.g.,
      // a parent the narrator is named after).
      if (resolvedPeople.has(sugFullKey) || resolvedPeople.has(sugFirst)) {
        const matchedId = resolvedPeople.get(sugFullKey) || resolvedPeople.get(sugFirst);
        if (subjectPerson && matchedId === subjectPerson.id) {
          console.log(`[process-interview] Suggested person "${suggested.firstName} ${suggested.lastName || ''}" matches narrator name — checking if different person`);
          // Fall through to matching loop for careful disambiguation
        } else {
          continue;
        }
      }

      // Try to find a match among existing people
      let matchId: string | null = null;
      let bestScore = 0;

      for (const existing of allExisting) {
        // Skip the subject/narrator as a matching candidate. The AI prompt
        // instructs not to include the narrator in suggestedPeople, so any
        // suggested person here is a different family member — even if they
        // share a name (e.g., child named after parent).
        if (subjectPerson && existing.id === subjectPerson.id) continue;

        const exFirst = normalize(existing.first_name || '');
        const exLast = normalize(existing.last_name || '');
        const exNick = normalize(existing.nickname || '');

        let score = 0;

        // Exact first name match (after normalization)
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

        // Last name matching — with substring/containment support
        if (sugLast && exLast) {
          if (sugLast === exLast) {
            // Exact match
            score += 3;
          } else if (sugLast.includes(exLast) || exLast.includes(sugLast)) {
            // One last name contains the other (e.g. "Smith" matches "Smith Johnson",
            // "Garcia" matches "Garcia Lopez")
            score += 2;
          } else {
            // Truly different last names — strong penalty
            score -= 2;
          }
        }
        // One side has no last name — don't penalize (score += 0)

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
        if (suggested.deathDate && !match.death_date) updates.death_date = suggested.deathDate;
        if (suggested.birthPlace && !match.birth_place) updates.birth_place = suggested.birthPlace;
        if (suggested.currentLocation && !match.current_location) updates.current_location = suggested.currentLocation;
        // Store profession and isDeceased in metadata JSONB
        const existingMeta = (match as any).metadata || {};
        const metaUpdates: Record<string, unknown> = { ...existingMeta };
        if (suggested.profession && !existingMeta.profession) metaUpdates.profession = suggested.profession;
        if (suggested.isDeceased != null && existingMeta.is_deceased == null) metaUpdates.is_deceased = suggested.isDeceased;
        if (suggested.gender && !existingMeta.gender) metaUpdates.gender = suggested.gender;
        if (Object.keys(metaUpdates).length > Object.keys(existingMeta).length) {
          updates.metadata = metaUpdates;
        }

        if (Object.keys(updates).length > 0) {
          await supabase.from('people').update(updates).eq('id', matchId);
          // Also update our local copy
          const localMatch = allExisting.find((p: any) => p.id === matchId)!;
          Object.assign(localMatch, updates);
        }

        // Don't overwrite the narrator's key — a family member sharing
        // the narrator's name must not steal their resolution entry.
        const existingFullMapping = resolvedPeople.get(sugFullKey);
        if (!existingFullMapping || !(subjectPerson && existingFullMapping === subjectPerson.id)) {
          resolvedPeople.set(sugFullKey, matchId);
        }
        // Also seed first-name-only so "Marco" resolves later if AI uses short form
        if (!resolvedPeople.has(sugFirst)) resolvedPeople.set(sugFirst, matchId);
      } else {
        // No match — create new person
        const personMeta: Record<string, unknown> = {};
        if (suggested.profession) personMeta.profession = suggested.profession;
        if (suggested.isDeceased != null) personMeta.is_deceased = suggested.isDeceased;
        if (suggested.gender) personMeta.gender = suggested.gender;

        const { data: newPerson } = await supabase
          .from('people')
          .insert({
            family_group_id: familyGroupId,
            first_name: suggested.firstName,
            last_name: suggested.lastName,
            nickname: suggested.nickname,
            birth_date: suggested.birthDate,
            death_date: suggested.deathDate,
            birth_place: suggested.birthPlace,
            current_location: suggested.currentLocation,
            metadata: Object.keys(personMeta).length > 0 ? personMeta : undefined,
            created_by: userId,
          })
          .select('id, first_name, last_name, nickname, birth_date, death_date, birth_place, current_location, metadata')
          .single();

        if (newPerson) {
          // Don't overwrite the narrator's key — a family member sharing
          // the narrator's name must not steal their resolution entry.
          const existingFullMapping = resolvedPeople.get(sugFullKey);
          if (!existingFullMapping || !(subjectPerson && existingFullMapping === subjectPerson.id)) {
            resolvedPeople.set(sugFullKey, newPerson.id);
          }
          // Also seed first-name-only and normalized first name
          if (!resolvedPeople.has(sugFirst)) resolvedPeople.set(sugFirst, newPerson.id);
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

      const normName = normalize(name);
      const normParts = normName.split(/\s+/);
      const normFirst = normParts[0];
      const normLast = normParts.length > 1 ? normParts.slice(1).join(' ') : '';

      // Direct key match (normalized)
      if (resolvedPeople.has(normName)) return resolvedPeople.get(normName)!;

      // Try first-name-only match against resolved map, but only when
      // last names are compatible (one is missing, or they share a word).
      // Use scoring to prefer exact/best matches (e.g., "Carlos José Bueso"
      // should match key "carlos jose bueso" over key "carlos bueso").
      let bestResolvedId: string | null = null;
      let bestResolvedScore = 0;
      for (const [key, id] of resolvedPeople) {
        const keyParts = key.split(/\s+/);
        const keyFirst = keyParts[0];
        const keyLast = keyParts.length > 1 ? keyParts.slice(1).join(' ') : '';
        if (keyFirst !== normFirst) continue;
        // If both sides have last names, they must share at least one word
        if (normLast && keyLast) {
          const normLastWords = normLast.split(/\s+/);
          const keyLastWords = keyLast.split(/\s+/);
          const hasOverlap = normLastWords.some((w: string) => keyLastWords.includes(w));
          if (!hasOverlap) continue;
        }
        // Score: prefer keys that match more parts of the input name
        // Exact full key match scores highest
        let score = 1;
        if (key === normName) score = 100;
        else {
          // Count how many words in the key also appear in normName
          const normWords = normName.split(/\s+/);
          score = keyParts.filter((w: string) => normWords.includes(w)).length;
        }
        if (score > bestResolvedScore) {
          bestResolvedScore = score;
          bestResolvedId = id;
        }
      }
      if (bestResolvedId) return bestResolvedId;

      // Fall back to DB existing people (also normalized), same scoring approach
      let bestExistingId: string | null = null;
      let bestExistingScore = 0;
      for (const p of allExisting) {
        const exFirst = normalize(p.first_name || '');
        const exLast = normalize(p.last_name || '');
        const exNick = normalize(p.nickname || '');
        const firstMatch = exFirst === normFirst || exNick === normFirst;
        if (!firstMatch) continue;
        if (normLast && exLast) {
          const normLastWords = normLast.split(/\s+/);
          const exLastWords = exLast.split(/\s+/);
          const hasOverlap = normLastWords.some((w: string) => exLastWords.includes(w));
          if (!hasOverlap) continue;
        }
        // Prefer exact full-name matches
        const exFull = normalize(`${p.first_name} ${p.last_name || ''}`);
        let score = 1;
        if (exFull === normName) score = 100;
        else {
          const normWords = normName.split(/\s+/);
          const exWords = exFull.split(/\s+/);
          score = exWords.filter((w: string) => normWords.includes(w)).length;
        }
        if (score > bestExistingScore) {
          bestExistingScore = score;
          bestExistingId = p.id;
        }
      }
      if (bestExistingId) return bestExistingId;

      return null;
    }

    // 7b. Auto-create people referenced in relationships but missing from suggestedPeople
    for (const rel of extractionResult.relationships) {
      for (const refName of [rel.personA, rel.personB]) {
        const resolved = resolvePersonName(refName);
        if (resolved) continue;

        // Parse first/last name from the reference
        const parts = refName.trim().split(/\s+/);
        const firstName = parts[0];
        const lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined;

        console.log(`[process-interview] Auto-creating unresolved person from relationship: "${refName}"`);
        const { data: newPerson } = await supabase
          .from('people')
          .insert({
            family_group_id: familyGroupId,
            first_name: firstName,
            last_name: lastName,
            created_by: userId,
          })
          .select('id, first_name, last_name, nickname, birth_date, death_date, birth_place, current_location, metadata')
          .single();

        if (newPerson) {
          const normFull = normalize(refName);
          const normFirst = normalize(firstName);
          resolvedPeople.set(normFull, newPerson.id);
          if (!resolvedPeople.has(normFirst)) resolvedPeople.set(normFirst, newPerson.id);
          allExisting.push(newPerson);
        }
      }
    }

    // 8. Create relationships
    // First, load user-rejected relationships so we don't recreate them
    const { data: rejectedRows } = await supabase
      .from('rejected_relationships')
      .select('person_a_id, person_b_id, relationship_type')
      .eq('family_group_id', familyGroupId);
    const rejectedSet = new Set(
      (rejectedRows || []).map((r: { person_a_id: string; person_b_id: string; relationship_type: string }) =>
        `${r.person_a_id}|${r.person_b_id}|${r.relationship_type}`
      )
    );
    function isRejected(aId: string, bId: string, type: string): boolean {
      return rejectedSet.has(`${aId}|${bId}|${type}`);
    }

    for (const rel of extractionResult.relationships) {
      const personAId = resolvePersonName(rel.personA);
      const personBId = resolvePersonName(rel.personB);

      if (personAId && personBId && personAId !== personBId) {
        // Validate that the relationship type is a known enum value
        const validTypes = [
          'parent', 'child', 'spouse', 'ex_spouse', 'sibling', 'half_sibling', 'grandparent', 'grandchild',
          'great_grandparent', 'great_grandchild', 'great_great_grandparent', 'great_great_grandchild',
          'uncle_aunt', 'nephew_niece', 'cousin', 'in_law', 'parent_in_law', 'child_in_law',
          'step_parent', 'step_child', 'step_sibling',
          'adopted_parent', 'adopted_child', 'godparent', 'godchild', 'other',
        ];
        const relType = validTypes.includes(rel.relationshipType)
          ? rel.relationshipType
          : 'other';

        // Skip if user previously rejected this relationship
        if (isRejected(personAId, personBId, relType)) {
          console.log(`[process-interview] Skipping rejected relationship: ${rel.personA} → ${rel.personB} (${relType})`);
          continue;
        }

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

    // 8b. Infer transitive relationships
    // Runs multiple passes to propagate all logical connections.
    {
      // Collect all relationships we just created (plus any pre-existing)
      const { data: allRels } = await supabase
        .from('relationships')
        .select('person_a_id, person_b_id, relationship_type')
        .eq('family_group_id', familyGroupId);

      const rels = allRels || [];

      // Build adjacency maps
      const parentsOf = new Map<string, Set<string>>();   // childId → parentIds
      const childrenOf = new Map<string, Set<string>>();   // parentId → childIds
      const siblingsOf = new Map<string, Set<string>>();   // personId → full-sibling Ids
      const stepSiblingsOf = new Map<string, Set<string>>();  // half-siblings
      const spousesOf = new Map<string, Set<string>>();
      const existingRelSet = new Set<string>();

      function addToSetMap(map: Map<string, Set<string>>, key: string, val: string) {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key)!.add(val);
      }

      for (const r of rels) {
        const key = `${r.person_a_id}|${r.person_b_id}|${r.relationship_type}`;
        existingRelSet.add(key);

        if (r.relationship_type === 'parent') {
          addToSetMap(parentsOf, r.person_b_id, r.person_a_id);
          addToSetMap(childrenOf, r.person_a_id, r.person_b_id);
        } else if (r.relationship_type === 'child') {
          addToSetMap(parentsOf, r.person_a_id, r.person_b_id);
          addToSetMap(childrenOf, r.person_b_id, r.person_a_id);
        } else if (r.relationship_type === 'sibling') {
          addToSetMap(siblingsOf, r.person_a_id, r.person_b_id);
          addToSetMap(siblingsOf, r.person_b_id, r.person_a_id);
        } else if (r.relationship_type === 'half_sibling') {
          addToSetMap(stepSiblingsOf, r.person_a_id, r.person_b_id);
          addToSetMap(stepSiblingsOf, r.person_b_id, r.person_a_id);
        } else if (r.relationship_type === 'spouse') {
          addToSetMap(spousesOf, r.person_a_id, r.person_b_id);
          addToSetMap(spousesOf, r.person_b_id, r.person_a_id);
        }
      }

      const inferredRels: { person_a_id: string; person_b_id: string; relationship_type: string }[] = [];
      // Track sibling→half_sibling upgrades so we can clean up old DB entries
      const upgradedPairs: { person_a_id: string; person_b_id: string }[] = [];

      function tryInfer(a: string, b: string, type: string): boolean {
        if (a === b) return false;
        const fwd = `${a}|${b}|${type}`;
        const rev = `${b}|${a}|${type}`;
        if (existingRelSet.has(fwd) || existingRelSet.has(rev)) return false;
        // Don't infer relationships the user explicitly rejected
        if (isRejected(a, b, type) || isRejected(b, a, type)) return false;
        inferredRels.push({ person_a_id: a, person_b_id: b, relationship_type: type });
        existingRelSet.add(fwd);
        return true;
      }

      // ── Pass 1: Full siblings share all parents ──
      // Run in a loop until stable (propagation can cascade)
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

      // ── Pass 2: Children of the same parent → siblings ──
      // (unless they are already step_siblings, or one is a step_sibling of the other's sibling)
      for (const [_parentId, children] of childrenOf) {
        const childArr = [...children];
        for (let i = 0; i < childArr.length; i++) {
          for (let j = i + 1; j < childArr.length; j++) {
            const a = childArr[i];
            const b = childArr[j];
            // Don't overwrite an existing half_sibling with sibling
            const stepFwd = `${a}|${b}|half_sibling`;
            const stepRev = `${b}|${a}|half_sibling`;
            if (existingRelSet.has(stepFwd) || existingRelSet.has(stepRev)) continue;
            // If either person is already a step_sibling of the other's full sibling,
            // they should be step_siblings (half-siblings via one shared parent) not full siblings.
            let isHalf = false;
            const aSibs = siblingsOf.get(a) || new Set();
            const bSibs = siblingsOf.get(b) || new Set();
            const aStepSibs = stepSiblingsOf.get(a) || new Set();
            const bStepSibs = stepSiblingsOf.get(b) || new Set();
            // If A is step_sibling of any of B's full siblings (or B itself is reachable via step_sibling)
            for (const bSib of bSibs) {
              if (aStepSibs.has(bSib)) { isHalf = true; break; }
            }
            if (!isHalf) {
              for (const aSib of aSibs) {
                if (bStepSibs.has(aSib)) { isHalf = true; break; }
              }
            }
            // Also check if they have different numbers of parents (one shared parent ≠ full sibling)
            if (!isHalf) {
              const aParents = parentsOf.get(a) || new Set();
              const bParents = parentsOf.get(b) || new Set();
              if (aParents.size > 0 && bParents.size > 0) {
                const shared = [...aParents].filter(p => bParents.has(p)).length;
                // If one child has a parent the other doesn't → half-sibling
                // (conservative: use Math.max to catch asymmetric parent knowledge)
                if (shared > 0 && shared < Math.max(aParents.size, bParents.size)) isHalf = true;
                const totalUnique = new Set([...aParents, ...bParents]).size;
                // If they share only 1 parent but have different other parents, they're half-siblings
                if (shared > 0 && totalUnique > shared + 1) isHalf = true;
              }
            }
            if (isHalf) {
              // If a full sibling relationship exists, upgrade it to half_sibling
              const sibFwd = `${a}|${b}|sibling`;
              const sibRev = `${b}|${a}|sibling`;
              if (existingRelSet.has(sibFwd) || existingRelSet.has(sibRev)) {
                existingRelSet.delete(sibFwd);
                existingRelSet.delete(sibRev);
                const aSiblings = siblingsOf.get(a);
                if (aSiblings) aSiblings.delete(b);
                const bSiblings = siblingsOf.get(b);
                if (bSiblings) bSiblings.delete(a);
                // Track for DB cleanup
                upgradedPairs.push({ person_a_id: a, person_b_id: b });
              }
              if (tryInfer(a, b, 'half_sibling')) {
                addToSetMap(stepSiblingsOf, a, b);
                addToSetMap(stepSiblingsOf, b, a);
              }
            } else {
              // Don't re-infer sibling if already exists
              const sibFwd = `${a}|${b}|sibling`;
              const sibRev = `${b}|${a}|sibling`;
              if (!existingRelSet.has(sibFwd) && !existingRelSet.has(sibRev)) {
                if (tryInfer(a, b, 'sibling')) {
                  addToSetMap(siblingsOf, a, b);
                  addToSetMap(siblingsOf, b, a);
                }
              }
            }
          }
        }
      }

      // ── Pass 3: Half siblings propagate to full siblings ──
      // If A is half_sibling of B, and B has full siblings C, D...
      // then A is also half_sibling of C, D (and vice versa)
      for (const [personId, stepSibs] of stepSiblingsOf) {
        const fullSibs = siblingsOf.get(personId) || new Set();
        for (const stepSibId of stepSibs) {
          // stepSibId is half_sibling of personId
          // → stepSibId should be half_sibling of all of personId's full siblings
          for (const fullSibId of fullSibs) {
            if (tryInfer(stepSibId, fullSibId, 'half_sibling')) {
              addToSetMap(stepSiblingsOf, stepSibId, fullSibId);
              addToSetMap(stepSiblingsOf, fullSibId, stepSibId);
            }
          }
          // Also the reverse: personId should be half_sibling of stepSibId's full siblings
          const stepSibFullSibs = siblingsOf.get(stepSibId) || new Set();
          for (const otherStepSibId of stepSibFullSibs) {
            if (tryInfer(personId, otherStepSibId, 'half_sibling')) {
              addToSetMap(stepSiblingsOf, personId, otherStepSibId);
              addToSetMap(stepSiblingsOf, otherStepSibId, personId);
            }
          }
        }
      }

      // ── Pass 4: Co-parents → spouse ──
      // If two people are both parents of the same child, infer spouse
      for (const [_childId, parents] of parentsOf) {
        const parentArr = [...parents];
        for (let i = 0; i < parentArr.length; i++) {
          for (let j = i + 1; j < parentArr.length; j++) {
            if (tryInfer(parentArr[i], parentArr[j], 'spouse')) {
              addToSetMap(spousesOf, parentArr[i], parentArr[j]);
              addToSetMap(spousesOf, parentArr[j], parentArr[i]);
            }
          }
        }
      }

      // ── Pass 5: Grandparent inference ──
      // If A is parent of B and B is parent of C → A is grandparent of C
      for (const [parentId, children] of childrenOf) {
        for (const childId of children) {
          const grandchildren = childrenOf.get(childId) || new Set();
          for (const gcId of grandchildren) {
            tryInfer(parentId, gcId, 'grandparent');
          }
        }
      }

      // ── Pass 5b: Great-grandparent inference ──
      // If A is grandparent of B and B has a parent C where C is child of A's child,
      // i.e. A→parent→B→parent→C→parent→D ⇒ A is great_grandparent of D
      // Simpler: walk 3 generations down from each person
      for (const [gen1, gen1Children] of childrenOf) {
        for (const gen2 of gen1Children) {
          const gen2Children = childrenOf.get(gen2) || new Set();
          for (const gen3 of gen2Children) {
            const gen3Children = childrenOf.get(gen3) || new Set();
            for (const gen4 of gen3Children) {
              tryInfer(gen1, gen4, 'great_grandparent');
            }
          }
        }
      }

      // ── Pass 5c: Great-great-grandparent inference ──
      // Walk 4 generations down
      for (const [gen1, gen1Children] of childrenOf) {
        for (const gen2 of gen1Children) {
          const gen2Children = childrenOf.get(gen2) || new Set();
          for (const gen3 of gen2Children) {
            const gen3Children = childrenOf.get(gen3) || new Set();
            for (const gen4 of gen3Children) {
              const gen4Children = childrenOf.get(gen4) || new Set();
              for (const gen5 of gen4Children) {
                tryInfer(gen1, gen5, 'great_great_grandparent');
              }
            }
          }
        }
      }

      // ── Pass 6: Uncle/aunt inference ──
      // If A is sibling of B and B is parent of C → A is uncle/aunt of C
      for (const [personId, siblings] of siblingsOf) {
        for (const sibId of siblings) {
          const niblings = childrenOf.get(sibId) || new Set();
          for (const niblingId of niblings) {
            tryInfer(personId, niblingId, 'uncle_aunt');
          }
        }
      }

      // ── Pass 7: Uncle/aunt inference through step siblings ──
      // If A is step_sibling of B and B is parent of C → A is uncle/aunt of C
      for (const [personId, stepSibs] of stepSiblingsOf) {
        for (const stepSibId of stepSibs) {
          const niblings = childrenOf.get(stepSibId) || new Set();
          for (const niblingId of niblings) {
            tryInfer(personId, niblingId, 'uncle_aunt');
          }
        }
      }

      // Persist inferred relationships
      if (inferredRels.length > 0) {
        console.log(`[process-interview] Inferring ${inferredRels.length} transitive relationships`);
        for (const inf of inferredRels) {
          await supabase.from('relationships').upsert(
            {
              family_group_id: familyGroupId,
              person_a_id: inf.person_a_id,
              person_b_id: inf.person_b_id,
              relationship_type: inf.relationship_type,
              source_interview_id: interview.id,
              confidence: 0.85,
            },
            { onConflict: 'person_a_id,person_b_id,relationship_type' }
          );
        }
      }

      // Clean up sibling→half_sibling upgrades: delete the old 'sibling' entries from DB
      for (const pair of upgradedPairs) {
        // Delete both directions since we don't know which was stored
        await supabase.from('relationships')
          .delete()
          .eq('family_group_id', familyGroupId)
          .eq('relationship_type', 'sibling')
          .or(`and(person_a_id.eq.${pair.person_a_id},person_b_id.eq.${pair.person_b_id}),and(person_a_id.eq.${pair.person_b_id},person_b_id.eq.${pair.person_a_id})`);
      }
    }

    // 9. Summarize (premium feature — still run for basic summary)
    await supabase
      .from('interviews')
      .update({ processing_stage: 'summarizing' })
      .eq('id', interview.id);

    let summaryResult;
    try {
      summaryResult = await llmProvider.summarizeInterview(transcriptText, language || undefined);
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
      const suggestedStories = Array.isArray(summaryResult.suggestedStories)
        ? summaryResult.suggestedStories
        : [];
      let storiesToSave = suggestedStories.slice(0, maxStories);

      // Guarantee at least 1 story per conversation — synthesize from summary if AI returned none
      if (storiesToSave.length === 0 && summaryResult.summary) {
        storiesToSave = [{
          title: interview.title || 'A Family Story',
          content: summaryResult.summary,
          involvedPeople: [],
          approximateDate: undefined,
          location: undefined,
        }];
      }

      if (storiesToSave.length > 0) {
        // Resolve audio snippets if we have word timings (premium feature)
        const canUseSnippets = entitlements.limits.audioSnippets && wordTimings && wordTimings.length > 0;

        for (const story of storiesToSave) {
          // Match key moments to audio timestamps via word timings
          let audioSnippets: Array<{ label: string; quote: string; startMs: number; endMs: number }> = [];
          if (canUseSnippets && story.keyMoments && story.keyMoments.length > 0) {
            audioSnippets = matchQuotesToTimings(story.keyMoments, wordTimings!, transcriptText);
          }

          const metadata: Record<string, unknown> = {};
          if (audioSnippets.length > 0) {
            metadata.audioSnippets = audioSnippets;
          }

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
              metadata,
              created_by: userId,
            })
            .select()
            .single();

          if (storyRecord) {
            storiesCreatedCount++;

            // Link people to stories
            if (story.involvedPeople && story.involvedPeople.length > 0) {
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

    // 10b. Fallback — guarantee at least 1 story even if summarization completely failed
    if (storiesCreatedCount === 0) {
      console.log('[process-interview] No stories created from summarization — creating fallback story from transcript');
      const fallbackContent = summaryResult?.summary
        || transcriptText.slice(0, 2000)
        || 'A family conversation was recorded and preserved.';
      const { data: fallbackStory } = await supabase
        .from('stories')
        .insert({
          family_group_id: familyGroupId,
          interview_id: interview.id,
          title: interview.title || 'A Family Story',
          content: fallbackContent,
          ai_generated: true,
          created_by: userId,
        })
        .select()
        .single();

      if (fallbackStory) {
        storiesCreatedCount = 1;
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

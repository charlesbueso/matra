// ============================================================
// Matra — Process Interview Edge Function (v2 — dedicated story gen)
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

// ── Fallback Snippet Extraction ──
// When the AI doesn't provide keyMoments or they fail to match word timings,
// automatically extract meaningful sentences from the transcript that relate
// to the story content. Picks sentences that mention people from the story
// or share key words with the story text.
function extractFallbackSnippets(
  transcriptText: string,
  storyContent: string,
  involvedPeople: string[],
): Array<{ quote: string; label: string }> {
  // Split transcript into sentences
  const sentences = transcriptText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => {
      const wordCount = s.split(/\s+/).length;
      return wordCount >= 5 && wordCount <= 30;
    });

  if (sentences.length === 0) return [];

  // Score each sentence by relevance to the story
  const storyWords = new Set(
    storyContent.toLowerCase().replace(/[^a-záéíóúüñ\s]/gi, '').split(/\s+/)
      .filter((w) => w.length > 3)
  );
  const peopleNorms = involvedPeople.map((n) => n.toLowerCase());
  // Common stop words to exclude from scoring
  const stopWords = new Set(['that', 'this', 'with', 'from', 'have', 'been', 'were', 'they', 'their', 'there', 'also', 'about', 'would', 'como', 'para', 'pero', 'cuando', 'donde', 'tiene', 'están', 'estos']);

  const scored = sentences.map((sentence) => {
    const lower = sentence.toLowerCase();
    let score = 0;

    // Bonus for mentioning people in the story
    for (const name of peopleNorms) {
      const nameParts = name.split(/\s+/);
      if (nameParts.some((part) => part.length >= 3 && lower.includes(part))) {
        score += 3;
      }
    }

    // Bonus for sharing content words with the story
    const sentenceWords = lower.replace(/[^a-záéíóúüñ\s]/gi, '').split(/\s+/);
    for (const w of sentenceWords) {
      if (w.length > 3 && !stopWords.has(w) && storyWords.has(w)) {
        score += 1;
      }
    }

    // Prefer medium-length sentences (more likely to be meaningful quotes)
    const wordCount = sentenceWords.length;
    if (wordCount >= 8 && wordCount <= 20) score += 1;

    return { sentence, score };
  });

  // Sort by score descending, take top 2
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((s) => s.score >= 2).slice(0, 2);

  if (top.length === 0) {
    // Last resort: pick the longest sentence from the middle of the transcript
    const mid = Math.floor(sentences.length / 2);
    const midSentences = sentences.slice(Math.max(0, mid - 2), mid + 3);
    midSentences.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
    if (midSentences[0]) {
      return [{ quote: midSentences[0], label: 'A family moment' }];
    }
    return [];
  }

  return top.map((s, i) => ({
    quote: s.sentence,
    label: i === 0 ? 'A key moment' : 'In their words',
  }));
}

serve(async (req: Request) => {
  // Handle CORS
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    console.log('[process-interview] Starting...');
    const pipelineStartMs = Date.now();
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

        existingFamilyContext = `\n[EXISTING FAMILY TREE — These people already exist in the database. When extracting, use the EXACT same names for people who match. Do NOT create duplicates. If the transcript mentions someone who matches an existing person, use their name as listed here.
CRITICAL — VOICE RECOGNITION NAME MATCHING: This transcript comes from voice/speech recognition, which frequently MISSPELLS names. The same person's name may appear with different spellings across conversations (e.g., "Brizel" might be transcribed as "Brisela", "Bricel", "Brissel", or "Brisel" — these are ALL the same person). When you encounter a name in the transcript that SOUNDS SIMILAR (phonetically) to an existing person below, you MUST use the existing person's exact name in your output. Always prefer matching to an existing person over creating a new one when the names are phonetically similar. Pay special attention to consonant swaps (s/z, c/s, l/r), vowel variations, and extra/missing syllables that are common in speech-to-text errors.\nKnown people:\n${peopleList}`;
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
      ? `[Narrator/subject of this interview is ${subjectName}.${genderHint} Any first-person references ("I", "me", "my") refer to ${subjectName}. Do NOT create a separate entry for the narrator — they are ${subjectName}. IMPORTANT: If the narrator introduces themselves by a different or fuller version of their name (e.g., including middle names, maiden names, or additional names), that is STILL the narrator — do NOT create a new suggestedPeople entry for them. The narrator is ALWAYS ${subjectName}, regardless of how they refer to themselves. When the narrator says "my mom", "my dad", "my brother", etc., create relationships between those people and ${subjectName}. Use ${subjectName} as the personA or personB name in relationships — never use "I" or "me" as a person name.]${existingFamilyContext}\n\n${transcriptText}`
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

    // Strip the _reasoning field (used for CoT) — it's not needed downstream
    if ((extractionResult as any)._reasoning) {
      console.log(`[process-interview] AI reasoning: ${(extractionResult as any)._reasoning}`);
      delete (extractionResult as any)._reasoning;
    }

    // 5b. Verification pass — AI audits its own extraction for common errors
    const verificationStartMs = Date.now();
    try {
      const verification = await llmProvider.verifyExtraction(transcriptForAI, extractionResult, language || undefined);
      const correctionCount = verification.corrections?.length || 0;
      console.log(`[process-interview] Verification pass: ${correctionCount} corrections, verified=${verification.verified} (${Date.now() - verificationStartMs}ms)`);

      if (verification.corrections && verification.corrections.length > 0) {
        for (const correction of verification.corrections) {
          switch (correction.type) {
            case 'fix_directionality': {
              // Find and fix the reversed relationship
              if (correction.original && correction.corrected) {
                const idx = extractionResult.relationships.findIndex(
                  (r: any) => normalize(r.personA) === normalize(correction.original!.personA || '') &&
                              normalize(r.personB) === normalize(correction.original!.personB || '') &&
                              r.relationshipType === correction.original!.relationshipType
                );
                if (idx >= 0) {
                  console.log(`[verification] Fixing directionality: ${correction.reason}`);
                  extractionResult.relationships[idx].personA = correction.corrected.personA || extractionResult.relationships[idx].personA;
                  extractionResult.relationships[idx].personB = correction.corrected.personB || extractionResult.relationships[idx].personB;
                }
              }
              break;
            }
            case 'add_relationship': {
              if (correction.corrected) {
                console.log(`[verification] Adding missing relationship: ${correction.corrected.personA} → ${correction.corrected.personB} (${correction.corrected.relationshipType}) — ${correction.reason}`);
                extractionResult.relationships.push({
                  personA: correction.corrected.personA || '',
                  personB: correction.corrected.personB || '',
                  relationshipType: correction.corrected.relationshipType || 'other',
                  confidence: 0.85,
                  context: `Added by verification: ${correction.reason}`,
                });
              }
              break;
            }
            case 'remove_relationship': {
              if (correction.original) {
                const idx = extractionResult.relationships.findIndex(
                  (r: any) => normalize(r.personA) === normalize(correction.original!.personA || '') &&
                              normalize(r.personB) === normalize(correction.original!.personB || '') &&
                              r.relationshipType === correction.original!.relationshipType
                );
                if (idx >= 0) {
                  console.log(`[verification] Removing contradictory relationship: ${correction.reason}`);
                  extractionResult.relationships.splice(idx, 1);
                }
              }
              break;
            }
            case 'add_person': {
              if (correction.corrected?.firstName) {
                const exists = extractionResult.suggestedPeople.some(
                  (p: any) => normalize(p.firstName || '') === normalize(correction.corrected!.firstName || '')
                );
                if (!exists) {
                  console.log(`[verification] Adding missing person: ${correction.corrected.firstName} ${correction.corrected.lastName || ''} — ${correction.reason}`);
                  extractionResult.suggestedPeople.push({
                    firstName: correction.corrected.firstName,
                    lastName: correction.corrected.lastName,
                    gender: correction.corrected.gender as any,
                  });
                }
              }
              break;
            }
            case 'fix_relationship_type': {
              if (correction.original && correction.corrected) {
                const idx = extractionResult.relationships.findIndex(
                  (r: any) => normalize(r.personA) === normalize(correction.original!.personA || '') &&
                              normalize(r.personB) === normalize(correction.original!.personB || '') &&
                              r.relationshipType === correction.original!.relationshipType
                );
                if (idx >= 0) {
                  console.log(`[verification] Fixing relationship type: ${correction.original.relationshipType} → ${correction.corrected.relationshipType} — ${correction.reason}`);
                  extractionResult.relationships[idx].relationshipType = correction.corrected.relationshipType || extractionResult.relationships[idx].relationshipType;
                }
              }
              break;
            }
          }
        }
      }
    } catch (err) {
      console.warn('[process-interview] Verification pass failed (non-fatal):', (err as Error).message);
    }

    // Log extraction result for debugging narrator variant handling
    console.log(`[process-interview] AI extracted ${extractionResult.suggestedPeople.length} suggestedPeople:`,
      extractionResult.suggestedPeople.map((p: any) => `${p.firstName} ${p.lastName || ''} (birth: ${p.birthDate || '?'}, place: ${p.birthPlace || '?'})`).join(', '));
    console.log(`[process-interview] AI extracted ${extractionResult.relationships.length} relationships:`,
      extractionResult.relationships.map((r: any) => `${r.personA} -[${r.relationshipType}]-> ${r.personB}`).join(', '));

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

    // Levenshtein edit distance for phonetic/fuzzy name matching.
    // Catches voice recognition misspellings like "Brisela" vs "Bricel" vs "Brizel".
    function editDistance(a: string, b: string): number {
      const m = a.length, n = b.length;
      const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          dp[i][j] = a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
      return dp[m][n];
    }

    // Strip parenthetical disambiguators: "Héctor (padre)" → "Héctor"
    function stripDisambiguator(name: string): string {
      return (name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    }

    // Strip honorifics: "Don Fernando" → "Fernando"
    function stripHonorifics(name: string): string {
      return name.replace(/\b(don|doña|dona|señor|señora|sr\.?|sra\.?|mr\.?|mrs\.?|ms\.?|dr\.?)\s+/gi, '').trim();
    }

    // Check if a relationship name plausibly refers to a target person name.
    // Requires all words of the shorter name to appear in the longer one,
    // with at most 1 extra word difference. Ignores parenthetical disambiguators.
    function nameRefersTo(refNorm: string, targetNorm: string): boolean {
      if (refNorm === targetNorm) return true;
      const rWords = refNorm.split(/\s+/).filter((w: string) => !w.startsWith('(') && !w.endsWith(')'));
      const tWords = targetNorm.split(/\s+/).filter((w: string) => !w.startsWith('(') && !w.endsWith(')'));
      const shorter = rWords.length <= tWords.length ? rWords : tWords;
      const longer = rWords.length <= tWords.length ? tWords : rWords;
      if (longer.length - shorter.length > 1) return false;
      return shorter.length > 0 && shorter.every((w: string) => longer.includes(w));
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
      // Map first word of first name for abbreviated lookups ("Marco" → "Marco Andrés Bueso")
      const epFirstWord = normalize(ep.first_name || '').split(/\s+/)[0];
      if (epFirstWord && !resolvedPeople.has(epFirstWord)) {
        resolvedPeople.set(epFirstWord, ep.id);
      }
      // Map nickname for resolution ("Bricel" → Brisela)
      if (ep.nickname) {
        const nickKey = normalize(ep.nickname);
        if (!resolvedPeople.has(nickKey)) {
          resolvedPeople.set(nickKey, ep.id);
        }
      }
    }

    // Helper: check if a name looks like a variant of the narrator's name
    // (shares first-name word + at least one last-name word).
    function looksLikeNarratorVariant(normName: string): boolean {
      if (!subjectPerson) return false;
      const subFirst = normalize(subjectPerson.first_name || '');
      const subLast = normalize(subjectPerson.last_name || '');
      const subLastWords = subLast ? subLast.split(/\s+/) : [];
      const parts = normName.split(/\s+/);
      const firstWord = parts[0];
      const lastWords = parts.length > 1 ? parts.slice(1) : [];
      const firstMatch = firstWord === subFirst;
      const lastMatch = subLastWords.length > 0 && lastWords.length > 0 &&
        subLastWords.some((w: string) => lastWords.includes(w));
      return firstMatch && lastMatch;
    }

    // Check if a name-variant candidate is actually a distinct family member
    // (e.g., "Carlos José Bueso" is the narrator's father, not the narrator).
    // A variant is DISTINCT if:
    //  1. It appears as a parent/grandparent OF the narrator (or narrator variant), OR
    //  2. It has a spouse/ex_spouse relationship (narrator variants don't have spouse rels), OR
    //  3. It has any direct relationship with the narrator's exact stored name.
    function isDistinctFromNarrator(sugNormFull: string): boolean {
      const narratorName = normalize(`${subjectPerson!.first_name} ${subjectPerson!.last_name || ''}`);
      // If the suggested name exactly matches the narrator, it IS the narrator
      if (sugNormFull === narratorName) return false;
      const parentTypes = ['parent', 'grandparent', 'great_grandparent', 'great_great_grandparent'];
      for (const rel of extractionResult.relationships) {
        const normA = normalize(rel.personA);
        const normB = normalize(rel.personB);

        // Case 1: candidate is a parent/ancestor OF a narrator variant
        if (normA === sugNormFull && parentTypes.includes(rel.relationshipType) &&
            (normB === narratorName || looksLikeNarratorVariant(normB))) {
          console.log(`[process-interview] isDistinctFromNarrator: "${sugNormFull}" is ${rel.relationshipType} of "${normB}" → distinct (parent/ancestor)`);
          return true;
        }
        // Case 1b: reverse — narrator variant is child of candidate
        if (normB === sugNormFull && rel.relationshipType === 'child' &&
            (normA === narratorName || looksLikeNarratorVariant(normA))) {
          console.log(`[process-interview] isDistinctFromNarrator: "${normA}" is child of "${sugNormFull}" → distinct (reverse parent)`);
          return true;
        }

        // Case 2: candidate has a spouse/ex_spouse relationship with anyone.
        // Narrator variants don't have their own spouse rels (AI uses stored name).
        if ((normA === sugNormFull || normB === sugNormFull) &&
            (rel.relationshipType === 'spouse' || rel.relationshipType === 'ex_spouse')) {
          console.log(`[process-interview] isDistinctFromNarrator: "${sugNormFull}" has spouse rel → distinct`);
          return true;
        }

        // Case 3: candidate has ANY direct relationship with narrator's stored name
        if ((normA === sugNormFull && normB === narratorName) ||
            (normB === sugNormFull && normA === narratorName)) {
          console.log(`[process-interview] isDistinctFromNarrator: "${sugNormFull}" has direct rel with narrator "${narratorName}" → distinct`);
          return true;
        }
      }
      return false;
    }

    // Check if the AI extracted a direct relationship between two names.
    // If so, they CANNOT be the same person and must not be merged.
    function aiHasRelationshipBetween(nameA: string, nameB: string): boolean {
      const normA = normalize(nameA);
      const normB = normalize(nameB);
      if (normA === normB) return false;
      for (const rel of extractionResult.relationships) {
        const relA = normalize(rel.personA);
        const relB = normalize(rel.personB);
        if ((relA === normA && relB === normB) || (relA === normB && relB === normA)) {
          return true;
        }
      }
      // Also check by partial match: "Alicia Rentería" could match the relationship
      // entry "Alicia Rentería Montes de Oca" if one name contains the other.
      for (const rel of extractionResult.relationships) {
        const relA = normalize(rel.personA);
        const relB = normalize(rel.personB);
        const matchesA = (relA === normA || relA === normB);
        const matchesB = (relB === normA || relB === normB);
        if (matchesA && matchesB) return true;
      }
      return false;
    }

    // Check if two people with the same name are actually different individuals
    // (e.g., deceased father vs living brother both called "Héctor Bueso").
    function shouldCreateSeparatePerson(
      suggested: { firstName?: string; lastName?: string; isDeceased?: boolean; birthDate?: string },
      existingPerson: { first_name: string; last_name?: string; metadata?: any; death_date?: string; birth_date?: string },
      relationships: Array<{ personA: string; personB: string; relationshipType: string }>
    ): boolean {
      // Deceased mismatch → different people
      const existingDeceased = !!existingPerson.death_date || !!existingPerson.metadata?.is_deceased;
      if (suggested.isDeceased === true && !existingDeceased) return true;
      if (!suggested.isDeceased && existingDeceased) return true;

      // Birth date mismatch → different people
      if (suggested.birthDate && existingPerson.birth_date &&
          String(suggested.birthDate).slice(0, 4) !== String(existingPerson.birth_date).slice(0, 4)) return true;

      // Direct ancestor relationship between them → different people
      const sugName = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);
      const exName = normalize(`${existingPerson.first_name} ${existingPerson.last_name || ''}`);
      const ancestorTypes = ['parent', 'grandparent', 'great_grandparent', 'great_great_grandparent'];
      for (const rel of relationships) {
        const nA = normalize(rel.personA);
        const nB = normalize(rel.personB);
        if (ancestorTypes.includes(rel.relationshipType)) {
          if ((nA === sugName && nB === exName) || (nA === exName && nB === sugName)) return true;
        }
      }

      // Contradictory relationship types to the same target (ancestor + peer)
      const baseNorm = normalize(stripDisambiguator(suggested.firstName || '') + ' ' + stripDisambiguator(suggested.lastName || ''));
      const baseFirst = baseNorm.split(/\s+/)[0];
      const ancestorSet = new Set(['parent', 'grandparent', 'great_grandparent', 'step_parent']);
      const peerSet = new Set(['sibling', 'half_sibling', 'step_sibling', 'spouse', 'ex_spouse']);
      const byTarget = new Map<string, Set<string>>();
      for (const rel of relationships) {
        const nA = normalize(rel.personA);
        const nB = normalize(rel.personB);
        // Strict match: only match if nA/nB IS baseNorm or just the first name
        const matchA = nA === baseNorm || nA === baseFirst;
        const matchB = nB === baseNorm || nB === baseFirst;
        if (matchA) {
          if (!byTarget.has(nB)) byTarget.set(nB, new Set());
          byTarget.get(nB)!.add(rel.relationshipType);
        }
        if (matchB) {
          if (!byTarget.has(nA)) byTarget.set(nA, new Set());
          byTarget.get(nA)!.add(rel.relationshipType);
        }
      }
      for (const [, types] of byTarget) {
        const hasAnc = [...types].some((t: string) => ancestorSet.has(t));
        const hasPeer = [...types].some((t: string) => peerSet.has(t));
        if (hasAnc && hasPeer) return true;
      }

      return false;
    }

    // Track which name keys have been merged as narrator variants, so we don't
    // merge TWO entries with the same name (one might be a parent named after the child).
    const narratorVariantMergedKeys = new Set<string>();

    for (const suggested of extractionResult.suggestedPeople) {
      const sugFirst = normalize(suggested.firstName || '');
      const sugLast = normalize(suggested.lastName || '');
      const sugNick = normalize(suggested.nickname || '');
      const sugFullKey = normalize(`${suggested.firstName} ${suggested.lastName || ''}`);
      // Strip parenthetical disambiguators for display and matching
      const displayFirst = stripDisambiguator(suggested.firstName || '');
      const displayLast = stripDisambiguator(suggested.lastName || '');
      const cleanFirst = normalize(displayFirst);
      const cleanLast = normalize(displayLast);
      const cleanKey = normalize(`${displayFirst} ${displayLast}`);
      const sugFirstWord = cleanFirst.split(/\s+/)[0];

      // ── Narrator variant check ──
      // If the suggested person is actually the narrator with a fuller/different
      // version of their name (e.g., narrator is "Carlos Bueso" but transcript says
      // "Carlos Adrián Bueso"), resolve to the subject and skip creation.
      if (subjectPerson) {
        const subFirst = normalize(subjectPerson.first_name || '');
        const subLast = normalize(subjectPerson.last_name || '');
        const subLastWords = subLast ? subLast.split(/\s+/) : [];
        const cleanLastWords = cleanLast ? cleanLast.split(/\s+/) : [];
        // Match if first name matches (exact or compound: "Carlos Adrián" starts with "Carlos")
        const cleanFirstWords = cleanFirst.split(/\s+/);
        const firstNameMatches = cleanFirst === subFirst || cleanFirstWords[0] === subFirst;
        // Match if they share at least one last-name word
        const sharesLastName = subLastWords.length > 0 && cleanLastWords.length > 0 &&
          subLastWords.some((w: string) => cleanLastWords.includes(w));
        if (firstNameMatches && sharesLastName) {
          // Before resolving to narrator, check if this person is a distinct
          // family member (e.g., a parent of the narrator who shares the name).
          const sugNormFull = normalize(`${displayFirst} ${displayLast}`);

          // Also check: if this person has birth data that CONTRADICTS the narrator's,
          // they're clearly a different person (e.g., father born in Puerto Rico vs
          // narrator born in Mexico City).
          let hasDifferentBirthData = false;
          if (suggested.birthPlace && subjectPerson.birth_place &&
              normalize(suggested.birthPlace) !== normalize(subjectPerson.birth_place)) {
            hasDifferentBirthData = true;
          }
          if (suggested.birthDate && subjectPerson.birth_date) {
            const sugYear = String(suggested.birthDate).slice(0, 4);
            const subYear = String(subjectPerson.birth_date).slice(0, 4);
            if (sugYear !== subYear) hasDifferentBirthData = true;
          }

          // If we already merged an entry with this same normalized name as the narrator,
          // a second entry is very likely a DIFFERENT person (e.g., parent named after child).
          const alreadyMergedThisName = narratorVariantMergedKeys.has(sugNormFull);

          if (isDistinctFromNarrator(sugNormFull) || hasDifferentBirthData || alreadyMergedThisName) {
            console.log(`[process-interview] Suggested person "${suggested.firstName} ${suggested.lastName || ''}" shares name pattern with narrator but is distinct (relationship=${isDistinctFromNarrator(sugNormFull)}, differentBirth=${hasDifferentBirthData}, alreadyMerged=${alreadyMergedThisName}) — treating as separate person`);
          } else {
          console.log(`[process-interview] Suggested person "${suggested.firstName} ${suggested.lastName || ''}" is a name variant of narrator "${subjectPerson.first_name} ${subjectPerson.last_name || ''}" — resolving to narrator`);
          resolvedPeople.set(sugFullKey, subjectPerson.id);
          narratorVariantMergedKeys.add(sugNormFull);
          // Update narrator's record with any new info (e.g., birth date, profession)
          const updates: Record<string, unknown> = {};
          if (suggested.birthDate && !subjectPerson.metadata?.birth_date) {
            // Only update birth_date via the main column if not already set
            const { data: currentPerson } = await supabase.from('people').select('birth_date').eq('id', subjectPerson.id).single();
            if (currentPerson && !currentPerson.birth_date) {
              updates.birth_date = suggested.birthDate;
              (subjectPerson as any).birth_date = suggested.birthDate; // keep in-memory in sync
            }
          }
          if (suggested.birthPlace) {
            const { data: currentPerson } = await supabase.from('people').select('birth_place').eq('id', subjectPerson.id).single();
            if (currentPerson && !currentPerson.birth_place) {
              updates.birth_place = suggested.birthPlace;
              (subjectPerson as any).birth_place = suggested.birthPlace; // keep in-memory in sync
            }
          }
          if (suggested.profession || suggested.gender) {
            const meta = { ...(subjectPerson.metadata || {}) };
            if (suggested.profession && !meta.profession) meta.profession = suggested.profession;
            if (suggested.gender && !meta.gender) meta.gender = suggested.gender;
            updates.metadata = meta;
          }
          if (Object.keys(updates).length > 0) {
            await supabase.from('people').update(updates).eq('id', subjectPerson.id);
          }
          continue;
          }
        }
      }

      // If this person was already resolved (e.g. the subject/self, or existing person), skip.
      // EXCEPTIONS:
      //   1. If the match is to the subject/narrator, fall through for disambiguation.
      //   2. shouldCreateSeparatePerson detects them as different individuals.
      //   3. If the AI has a direct relationship between this person and the matched
      //      person, they are clearly different people — fall through.
      if (resolvedPeople.has(sugFullKey) || resolvedPeople.has(sugFirstWord)) {
        const matchedId = resolvedPeople.get(sugFullKey) || resolvedPeople.get(sugFirstWord);
        // Find the name of the person this matched to
        const matchedName = [...resolvedPeople.entries()].find(([, id]) => id === matchedId)?.[0] || '';
        const matchedPerson = allExisting.find((p: any) => p.id === matchedId);
        const sugName = `${suggested.firstName} ${suggested.lastName || ''}`;
        if (subjectPerson && matchedId === subjectPerson.id) {
          console.log(`[process-interview] Suggested person "${sugName}" matches narrator name — checking if different person`);
          // Fall through to matching loop for careful disambiguation
        } else if (matchedPerson && shouldCreateSeparatePerson(suggested, matchedPerson, extractionResult.relationships)) {
          console.log(`[process-interview] Suggested person "${sugName}" matched to "${matchedName}" but detected as different person — treating as separate`);
          // Fall through — these are different people
        } else if (aiHasRelationshipBetween(sugName, matchedName)) {
          console.log(`[process-interview] Suggested person "${sugName}" matched to "${matchedName}" but AI has a relationship between them — treating as separate person`);
          // Fall through — these are different people
        } else {
          continue;
        }
      }

      // Collect all candidates with score ≥ 3, then try each in score order,
      // skipping any that shouldCreateSeparatePerson or aiHasRelationshipBetween rejects.
      const candidates: Array<{ id: string; score: number }> = [];

      for (const existing of allExisting) {
        // Skip the subject/narrator as a matching candidate. The AI prompt
        // instructs not to include the narrator in suggestedPeople, so any
        // suggested person here is a different family member — even if they
        // share a name (e.g., child named after parent).
        if (subjectPerson && existing.id === subjectPerson.id) continue;

        const exFirst = normalize(existing.first_name || '');
        const exLast = normalize(existing.last_name || '');
        const exNick = normalize(existing.nickname || '');
        const exFirstWord = exFirst.split(/\s+/)[0]; // First word for multi-word first names

        let score = 0;

        // Exact first name match (after normalization, using clean name without disambiguator)
        if (cleanFirst && exFirst && cleanFirst === exFirst) score += 3;
        // First word of compound first name matches
        else if (cleanFirst && exFirstWord && exFirstWord !== exFirst && cleanFirst === exFirstWord) score += 3;
        // First name matches nickname
        else if (cleanFirst && exNick && cleanFirst === exNick) score += 2;
        // Nickname matches first name
        else if (sugNick && exFirst && sugNick === exFirst) score += 2;
        // Nickname matches first word of first name
        else if (sugNick && exFirstWord && exFirstWord !== exFirst && sugNick === exFirstWord) score += 2;
        // Nickname matches nickname
        else if (sugNick && exNick && sugNick === exNick) score += 2;
        // First name is a prefix (e.g. "Rose" matches "Rosemary")
        else if (cleanFirst && exFirst && (exFirst.startsWith(cleanFirst) || cleanFirst.startsWith(exFirst)) && Math.min(cleanFirst.length, exFirst.length) >= 3) score += 1;
        // Phonetic/fuzzy match for voice recognition misspellings
        // e.g. "brisela" vs "bricel" vs "brizel" (edit distance ≤ 2)
        // Compare against first word of first name to handle multi-word names
        else if (cleanFirst && exFirstWord && cleanFirst.length >= 4 && exFirstWord.length >= 4) {
          const dist = editDistance(cleanFirst, exFirstWord);
          const maxLen = Math.max(cleanFirst.length, exFirstWord.length);
          if (dist <= 2 && dist / maxLen <= 0.35) score += 2;
        }

        if (score === 0) continue; // No first-name-level match at all

        // Last name matching — with substring/containment support
        if (cleanLast && exLast) {
          if (cleanLast === exLast) {
            // Exact match
            score += 3;
          } else if (cleanLast.includes(exLast) || exLast.includes(cleanLast)) {
            // One last name contains the other (e.g. "Smith" matches "Smith Johnson",
            // "Garcia" matches "Garcia Lopez")
            score += 2;
          } else {
            // Truly different last names — strong penalty
            score -= 2;
          }
        }
        // One side has no last name — don't penalize (score += 0)

        if (score >= 3) {
          candidates.push({ id: existing.id, score });
        }
      }

      // Sort candidates by score descending, try each until one passes validation
      candidates.sort((a, b) => b.score - a.score);
      let matchId: string | null = null;
      let bestScore = 0;

      for (const candidate of candidates) {
        const matchPerson = allExisting.find((p: any) => p.id === candidate.id)!;
        const sugName = `${suggested.firstName} ${suggested.lastName || ''}`;
        const matchName = `${matchPerson.first_name} ${matchPerson.last_name || ''}`;
        if (shouldCreateSeparatePerson(suggested, matchPerson, extractionResult.relationships)) {
          console.log(`[process-interview] "${sugName}" scored ${candidate.score} against existing "${matchName}" but detected as different person — trying next`);
          continue;
        }
        if (aiHasRelationshipBetween(sugName, matchName)) {
          console.log(`[process-interview] "${sugName}" scored ${candidate.score} against existing "${matchName}" but AI has a relationship between them — trying next`);
          continue;
        }
        matchId = candidate.id;
        bestScore = candidate.score;
        break;
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
        // Also seed clean key (without disambiguator) if different
        if (cleanKey !== sugFullKey && !resolvedPeople.has(cleanKey)) {
          resolvedPeople.set(cleanKey, matchId);
        }
        // Seed first-word-only so "Marco" resolves later if AI uses short form
        if (sugFirstWord && !resolvedPeople.has(sugFirstWord)) resolvedPeople.set(sugFirstWord, matchId);
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
            first_name: displayFirst,
            last_name: displayLast || suggested.lastName,
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
          // Also seed clean key (without disambiguator) if different
          if (cleanKey !== sugFullKey) {
            const cleanMapping = resolvedPeople.get(cleanKey);
            if (!cleanMapping || !(subjectPerson && cleanMapping === subjectPerson.id)) {
              resolvedPeople.set(cleanKey, newPerson.id);
            }
          }
          // Seed first-word-only so abbreviated lookups work
          if (sugFirstWord && !resolvedPeople.has(sugFirstWord)) resolvedPeople.set(sugFirstWord, newPerson.id);
          // Key ownership swap: if this person's exact clean name matches a key
          // but the current owner has a longer/different name, this person should own it
          if (cleanKey !== sugFullKey && resolvedPeople.has(cleanKey)) {
            const ownerId = resolvedPeople.get(cleanKey)!;
            const owner = allExisting.find((p: any) => p.id === ownerId);
            if (owner) {
              const ownerFullKey = normalize(`${owner.first_name || ''} ${owner.last_name || ''}`);
              if (ownerFullKey !== cleanKey) {
                resolvedPeople.set(cleanKey, newPerson.id);
              }
            }
          }
          allExisting.push(newPerson);
        }
      }
    }

    // Helper: resolve a name reference (from relationships/stories) to a person ID
    function resolvePersonName(name: string): string | null {
      // Handle self-references — map to subject person if available
      const selfRefs = ['i', 'me', 'myself', 'narrator', 'the narrator', 'yo'];
      if (subjectPerson && selfRefs.includes(name.toLowerCase().trim())) {
        return subjectPerson.id;
      }

      const normName = normalize(name);
      // Try honorific-stripped version
      const strippedName = normalize(stripHonorifics(name));
      if (strippedName !== normName && resolvedPeople.has(strippedName)) return resolvedPeople.get(strippedName)!;
      const normParts = normName.split(/\s+/);
      const normFirst = normParts[0];
      const normLast = normParts.length > 1 ? normParts.slice(1).join(' ') : '';

      // Direct key match (normalized)
      if (resolvedPeople.has(normName)) return resolvedPeople.get(normName)!;

      // Try stripped disambiguator version (e.g., "Héctor (padre) Bueso" → "hector bueso")
      const stripped = normalize(stripDisambiguator(name));
      if (stripped !== normName && resolvedPeople.has(stripped)) return resolvedPeople.get(stripped)!;

      // Scoring-based fallback with prefix, nickname, and edit-distance matching
      let bestResolvedId: string | null = null;
      let bestResolvedScore = 0;
      let bestResolvedKeyLen = 999;
      for (const [key, id] of resolvedPeople) {
        const keyParts = key.split(/\s+/);
        const keyFirst = keyParts[0];
        const keyLast = keyParts.length > 1 ? keyParts.slice(1).join(' ') : '';

        // First name matching: exact, compound-name prefix, nickname, or edit-distance
        let firstMatch = false;
        if (keyFirst === normFirst) firstMatch = true;
        else if (key.startsWith(normFirst + ' ') || normName.startsWith(keyFirst + ' ')) firstMatch = true;
        else {
          // Check nickname — look up the person for this key
          const personForKey = allExisting.find((p: any) => p.id === id);
          if (personForKey) {
            const nick = normalize(personForKey.nickname || '');
            if (nick && (nick === normFirst || nick === normName)) firstMatch = true;
          }
        }
        // Edit-distance fallback for voice recognition errors ("Bricel" ↔ "Brisela")
        if (!firstMatch && normFirst.length >= 3 && keyFirst.length >= 3) {
          const dist = editDistance(normFirst, keyFirst);
          if (dist <= 2 && dist / Math.max(normFirst.length, keyFirst.length) < 0.4) {
            firstMatch = true;
          }
        }
        if (!firstMatch) continue;

        // If both sides have last names, they must share at least one word
        if (normLast && keyLast) {
          const normLastWords = normLast.split(/\s+/);
          const keyLastWords = keyLast.split(/\s+/);
          const hasOverlap = normLastWords.some((w: string) => keyLastWords.includes(w));
          if (!hasOverlap) continue;
        }
        // Score: prefer keys that match more parts of the input name
        let score = 1;
        if (key === normName) score = 100;
        else {
          const normWords = normName.split(/\s+/);
          score = keyParts.filter((w: string) => normWords.includes(w)).length;
          // Bonus for nickname match
          const personForKey = allExisting.find((p: any) => p.id === id);
          if (personForKey) {
            const nick = normalize(personForKey.nickname || '');
            if (nick && (nick === normFirst || nick === normName)) score += 2;
          }
        }
        // Tie-break: prefer keys closer in word count to the input
        if (score > bestResolvedScore || (score === bestResolvedScore && Math.abs(keyParts.length - normParts.length) < Math.abs(bestResolvedKeyLen - normParts.length))) {
          bestResolvedScore = score;
          bestResolvedId = id;
          bestResolvedKeyLen = keyParts.length;
        }
      }
      if (bestResolvedId) return bestResolvedId;

      // Fall back to DB existing people (also normalized), same enhanced scoring
      let bestExistingId: string | null = null;
      let bestExistingScore = 0;
      for (const p of allExisting) {
        const exFirst = normalize(p.first_name || '');
        const exLast = normalize(p.last_name || '');
        const exNick = normalize(p.nickname || '');
        let firstMatch = exFirst === normFirst || exNick === normFirst;
        // Edit-distance fallback
        if (!firstMatch && normFirst.length >= 3 && exFirst.length >= 3) {
          const dist = editDistance(normFirst, exFirst);
          if (dist <= 2 && dist / Math.max(normFirst.length, exFirst.length) < 0.4) firstMatch = true;
        }
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
          if (exNick && (exNick === normFirst || exNick === normName)) score += 2;
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

    // Pre-load existing relationship confidences for confidence-weighted merging
    const { data: existingRelRows } = await supabase
      .from('relationships')
      .select('person_a_id, person_b_id, relationship_type, confidence')
      .eq('family_group_id', familyGroupId);
    const existingConfMap = new Map<string, number>();
    for (const er of (existingRelRows || [])) {
      existingConfMap.set(`${er.person_a_id}|${er.person_b_id}|${er.relationship_type}`, er.confidence || 0);
    }

    for (const rel of extractionResult.relationships) {
      let personAId = resolvePersonName(rel.personA);
      let personBId = resolvePersonName(rel.personB);

      // For spouse/ex_spouse, if one side resolved to a deceased person, check if
      // there's a non-deceased person with the same base name (same base + more words).
      // e.g., "Alicia Rentería" (deceased grandma) → swap to "Alicia Rentería Montes de Oca" (mom)
      if (personAId && personBId && (rel.relationshipType === 'spouse' || rel.relationshipType === 'ex_spouse')) {
        const personARecord = allExisting.find((p: any) => p.id === personAId);
        const personBRecord = allExisting.find((p: any) => p.id === personBId);
        if (personARecord && (personARecord.death_date || personARecord.metadata?.is_deceased)) {
          const baseKey = normalize(`${personARecord.first_name} ${personARecord.last_name || ''}`);
          for (const [k, pid] of resolvedPeople) {
            if (pid !== personAId) {
              const candidate = allExisting.find((p: any) => p.id === pid);
              if (candidate && !candidate.death_date && !candidate.metadata?.is_deceased && k.startsWith(baseKey)) {
                console.log(`[process-interview] Spouse swap: using "${candidate.first_name} ${candidate.last_name || ''}" instead of deceased "${personARecord.first_name} ${personARecord.last_name || ''}"`);
                personAId = pid;
                break;
              }
            }
          }
        }
        if (personBRecord && (personBRecord.death_date || personBRecord.metadata?.is_deceased)) {
          const baseKey = normalize(`${personBRecord.first_name} ${personBRecord.last_name || ''}`);
          for (const [k, pid] of resolvedPeople) {
            if (pid !== personBId) {
              const candidate = allExisting.find((p: any) => p.id === pid);
              if (candidate && !candidate.death_date && !candidate.metadata?.is_deceased && k.startsWith(baseKey)) {
                console.log(`[process-interview] Spouse swap: using "${candidate.first_name} ${candidate.last_name || ''}" instead of deceased "${personBRecord.first_name} ${personBRecord.last_name || ''}"`);
                personBId = pid;
                break;
              }
            }
          }
        }
      }

      if (personAId && personBId && personAId !== personBId) {
        // Normalize common LLM-generated non-standard relationship types
        const typeAliases: Record<string, string> = {
          // English aliases
          aunt: 'uncle_aunt', uncle: 'uncle_aunt',
          nephew: 'nephew_niece', niece: 'nephew_niece',
          grandfather: 'grandparent', grandmother: 'grandparent',
          grandson: 'grandchild', granddaughter: 'grandchild',
          father: 'parent', mother: 'parent',
          son: 'child', daughter: 'child',
          husband: 'spouse', wife: 'spouse',
          brother: 'sibling', sister: 'sibling',
          adopted_sibling: 'sibling',
          father_in_law: 'parent_in_law', mother_in_law: 'parent_in_law',
          son_in_law: 'child_in_law', daughter_in_law: 'child_in_law',
          brother_in_law: 'in_law', sister_in_law: 'in_law',
          // Spanish aliases
          padre: 'parent', madre: 'parent', 'papá': 'parent', 'mamá': 'parent', papa: 'parent', mama: 'parent',
          hijo: 'child', hija: 'child',
          hermano: 'sibling', hermana: 'sibling',
          medio_hermano: 'half_sibling', media_hermana: 'half_sibling', hermanastro: 'half_sibling', hermanastra: 'half_sibling',
          abuelo: 'grandparent', abuela: 'grandparent',
          nieto: 'grandchild', nieta: 'grandchild',
          bisabuelo: 'great_grandparent', bisabuela: 'great_grandparent',
          bisnieto: 'great_grandchild', bisnieta: 'great_grandchild',
          'tío': 'uncle_aunt', 'tía': 'uncle_aunt', tio: 'uncle_aunt', tia: 'uncle_aunt',
          sobrino: 'nephew_niece', sobrina: 'nephew_niece',
          primo: 'cousin', prima: 'cousin',
          esposo: 'spouse', esposa: 'spouse', 'cónyuge': 'spouse', conyuge: 'spouse', marido: 'spouse',
          ex_esposo: 'ex_spouse', ex_esposa: 'ex_spouse', exesposo: 'ex_spouse', exesposa: 'ex_spouse',
          padrastro: 'step_parent', madrastra: 'step_parent',
          hijastro: 'step_child', hijastra: 'step_child',
          suegro: 'parent_in_law', suegra: 'parent_in_law',
          yerno: 'child_in_law', nuera: 'child_in_law',
          'cuñado': 'in_law', 'cuñada': 'in_law', cunado: 'in_law', cunada: 'in_law',
          padrino: 'godparent', madrina: 'godparent',
          ahijado: 'godchild', ahijada: 'godchild',
        };
        const normalizedType = typeAliases[rel.relationshipType] || rel.relationshipType;

        // Validate that the relationship type is a known enum value
        const validTypes = [
          'parent', 'child', 'spouse', 'ex_spouse', 'sibling', 'half_sibling', 'grandparent', 'grandchild',
          'great_grandparent', 'great_grandchild', 'great_great_grandparent', 'great_great_grandchild',
          'uncle_aunt', 'nephew_niece', 'cousin', 'in_law', 'parent_in_law', 'child_in_law',
          'step_parent', 'step_child', 'step_sibling',
          'adopted_parent', 'adopted_child', 'godparent', 'godchild', 'other',
        ];
        const relType = validTypes.includes(normalizedType)
          ? normalizedType
          : 'other';

        // Skip if user previously rejected this relationship
        if (isRejected(personAId, personBId, relType)) {
          console.log(`[process-interview] Skipping rejected relationship: ${rel.personA} → ${rel.personB} (${relType})`);
          continue;
        }

        // Confidence-weighted merging: if relationship already exists, boost confidence
        const confKey = `${personAId}|${personBId}|${relType}`;
        const existingConf = existingConfMap.get(confKey);
        const mergedConfidence = existingConf !== undefined
          ? Math.min(1.0, Math.max(existingConf, rel.confidence) + 0.05)
          : rel.confidence;

        await supabase.from('relationships').upsert(
          {
            family_group_id: familyGroupId,
            person_a_id: personAId,
            person_b_id: personBId,
            relationship_type: relType,
            source_interview_id: interview.id,
            confidence: mergedConfidence,
            is_inferred: false,
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

    // 8a. Fix same-name relationship conflicts
    // When a person has both ancestor-type and peer-type relationships to the same target,
    // reassign the peer relationships to the other person with the same name.
    // (e.g., deceased Héctor Bueso is parent AND sibling of narrator → reassign sibling to living Héctor)
    {
      const ancestorTypes = new Set(['parent', 'grandparent', 'great_grandparent', 'step_parent']);
      const peerTypes = new Set(['sibling', 'half_sibling', 'spouse', 'ex_spouse', 'step_sibling']);

      // Group people by normalized base name
      const nameGroups = new Map<string, Array<{ id: string; first_name: string; last_name?: string; death_date?: string; metadata?: any }>>();
      for (const p of allExisting) {
        const name = normalize(`${p.first_name} ${p.last_name || ''}`);
        if (!nameGroups.has(name)) nameGroups.set(name, []);
        nameGroups.get(name)!.push(p);
      }

      for (const [, group] of nameGroups) {
        if (group.length < 2) continue;

        // Load relationships for each person in the group
        for (const person of group) {
          const { data: personRels } = await supabase
            .from('relationships')
            .select('id, person_a_id, person_b_id, relationship_type')
            .eq('family_group_id', familyGroupId)
            .eq('person_a_id', person.id);

          const rels = personRels || [];
          const ancRels = rels.filter((r: any) => ancestorTypes.has(r.relationship_type));
          const peerRelsData = rels.filter((r: any) => peerTypes.has(r.relationship_type));

          if (ancRels.length > 0 && peerRelsData.length > 0) {
            const isDeceased = !!person.death_date || !!person.metadata?.is_deceased;
            const altPerson = isDeceased
              ? group.find(p => p.id !== person.id && !p.death_date && !p.metadata?.is_deceased)
              : group.find(p => p.id !== person.id && (!!p.death_date || !!p.metadata?.is_deceased));

            if (altPerson) {
              // Deceased person keeps ancestor rels, peer rels go to the alive one
              const relsToReassign = isDeceased ? peerRelsData : ancRels;
              const targetPerson = isDeceased ? altPerson : altPerson;
              for (const pr of relsToReassign) {
                console.log(`[process-interview] Reassigning ${pr.relationship_type} from ${person.first_name} (${person.id}) to ${targetPerson.first_name} (${targetPerson.id})`);
                await supabase.from('relationships')
                  .update({ person_a_id: targetPerson.id })
                  .eq('id', pr.id);
              }
            }
          }
        }
      }
    }

    // 8b. Infer transitive relationships
    // Runs multiple convergence rounds to propagate all logical connections.
    // Clears previous inferred relationships first, then re-derives them.
    {
      // Clear old inferred relationships for this family group so we derive fresh
      await supabase
        .from('relationships')
        .delete()
        .eq('family_group_id', familyGroupId)
        .eq('is_inferred', true);

      // Collect all relationships (non-inferred) for this family group
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

      // ── Convergence loop: run all passes until no new relationships are inferred ──
      let inferenceRound = 0;
      const MAX_INFERENCE_ROUNDS = 5;
      let totalInferredBefore = 0;

      do {
        totalInferredBefore = inferredRels.length;
        inferenceRound++;

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

      // ── Pass 8: Cousin inference with degree tracking ──
      // If A's parent is sibling of B's parent → A and B are first cousins
      // If A's grandparent is sibling of B's grandparent → second cousins
      for (const [personId, myParents] of parentsOf) {
        for (const parentId of myParents) {
          const parentSiblings = siblingsOf.get(parentId) || new Set();
          const parentHalfSiblings = stepSiblingsOf.get(parentId) || new Set();
          const allParentSibs = new Set([...parentSiblings, ...parentHalfSiblings]);
          for (const parentSibId of allParentSibs) {
            // parentSibId's children are my first cousins
            const cousinCandidates = childrenOf.get(parentSibId) || new Set();
            for (const cousinId of cousinCandidates) {
              if (cousinId === personId) continue;
              if (tryInfer(personId, cousinId, 'cousin')) {
                // Track cousin degree in metadata during persist phase
              }
            }
          }
        }
      }

      // ── Pass 8b: Reverse-grandparent inference ──
      // If X is grandparent of Y and Z is parent of Y but X is NOT parent of Z → infer X is parent of Z
      for (const [grandchildId, grandparents] of (() => {
        const gpOf = new Map<string, Set<string>>();
        for (const rel of [...rels, ...inferredRels]) {
          if (rel.relationship_type === 'grandparent') {
            if (!gpOf.has(rel.person_b_id)) gpOf.set(rel.person_b_id, new Set());
            gpOf.get(rel.person_b_id)!.add(rel.person_a_id);
          }
        }
        return gpOf;
      })()) {
        const myParents = parentsOf.get(grandchildId) || new Set();
        for (const gpId of grandparents) {
          const gpChildren = childrenOf.get(gpId) || new Set();
          for (const parentId of myParents) {
            if (!gpChildren.has(parentId)) {
              if (tryInfer(gpId, parentId, 'parent')) {
                addToSetMap(parentsOf, parentId, gpId);
                addToSetMap(childrenOf, gpId, parentId);
              }
            }
          }
        }
      }

      // ── Pass 8c: Sibling-parent sharing ──
      // If X is parent of A, and A is sibling of B, but X is NOT parent of B → infer X is parent of B
      for (const [parentId, children] of childrenOf) {
        for (const childId of children) {
          const childSiblings = siblingsOf.get(childId) || new Set();
          for (const sibId of childSiblings) {
            const sibParents = parentsOf.get(sibId) || new Set();
            if (sibParents.size < 2 && !sibParents.has(parentId)) {
              if (tryInfer(parentId, sibId, 'parent')) {
                addToSetMap(parentsOf, sibId, parentId);
                addToSetMap(childrenOf, parentId, sibId);
              }
            }
          }
        }
      }

      // ── Pass 8d: Cousin-parent inference ──
      // If X is cousin of Y, X has no parents, Z is uncle_aunt of Y and has no children → infer Z is parent of X
      for (const [personId, myParents] of parentsOf) {
        if (myParents.size > 0) continue; // already has parents
        // Find cousins of personId
        for (const rel of [...rels, ...inferredRels]) {
          if (rel.relationship_type !== 'cousin') continue;
          const cousinId = rel.person_a_id === personId ? rel.person_b_id
            : rel.person_b_id === personId ? rel.person_a_id : null;
          if (!cousinId) continue;
          // Find uncle/aunts of the cousin who have no children
          for (const uaRel of [...rels, ...inferredRels]) {
            if (uaRel.relationship_type !== 'uncle_aunt') continue;
            const uncleId = uaRel.person_b_id === cousinId ? uaRel.person_a_id : null;
            if (!uncleId) continue;
            const uncleChildren = childrenOf.get(uncleId) || new Set();
            if (uncleChildren.size === 0) {
              if (tryInfer(uncleId, personId, 'parent')) {
                addToSetMap(parentsOf, personId, uncleId);
                addToSetMap(childrenOf, uncleId, personId);
              }
            }
          }
        }
      }

      // ── Pass 9: Bidirectional relationship validation ──
      // Ensure complementary relationships exist (parent↔child, grandparent↔grandchild)
      const complementMap: Record<string, string> = {
        'parent': 'child',
        'child': 'parent',
        'grandparent': 'grandchild',
        'grandchild': 'grandparent',
        'great_grandparent': 'great_grandchild',
        'great_grandchild': 'great_grandparent',
        'great_great_grandparent': 'great_great_grandchild',
        'great_great_grandchild': 'great_great_grandparent',
        'uncle_aunt': 'nephew_niece',
        'nephew_niece': 'uncle_aunt',
      };
      // Collect current + inferred to check
      const allCurrentRels = [...rels, ...inferredRels];
      for (const rel of allCurrentRels) {
        const complement = complementMap[rel.relationship_type];
        if (!complement) continue; // symmetric types (sibling, spouse, cousin) don't need complements
        // Check if complement exists (B → A with complement type)
        const compFwd = `${rel.person_b_id}|${rel.person_a_id}|${complement}`;
        if (!existingRelSet.has(compFwd)) {
          tryInfer(rel.person_b_id, rel.person_a_id, complement);
        }
      }

      // ── End of convergence round ──
      const newInThisRound = inferredRels.length - totalInferredBefore;
      console.log(`[process-interview] Inference round ${inferenceRound}: ${newInThisRound} new relationships`);

      } while (inferredRels.length > totalInferredBefore && inferenceRound < MAX_INFERENCE_ROUNDS);

      console.log(`[process-interview] Inference converged after ${inferenceRound} round(s), ${inferredRels.length} total inferred`);

      // Persist inferred relationships
      if (inferredRels.length > 0) {
        console.log(`[process-interview] Persisting ${inferredRels.length} inferred relationships`);
        for (const inf of inferredRels) {
          await supabase.from('relationships').upsert(
            {
              family_group_id: familyGroupId,
              person_a_id: inf.person_a_id,
              person_b_id: inf.person_b_id,
              relationship_type: inf.relationship_type,
              source_interview_id: interview.id,
              confidence: 0.85,
              is_inferred: true,
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

    // 10. Save summary and generate stories
    let storiesCreatedCount = 0;
    if (summaryResult) {
      await supabase
        .from('interviews')
        .update({
          ai_summary: summaryResult.summary,
          ai_key_topics: summaryResult.keyTopics,
        })
        .eq('id', interview.id);
    }

    // 10a. Dedicated story generation — always run as a separate AI pass
    const entitlements = await getUserEntitlements(userId);
    const maxStories = entitlements.limits.maxStoriesPerInterview;
    let storiesToSave: Array<{
      title: string;
      content: string;
      involvedPeople: string[];
      approximateDate?: string;
      location?: string;
      keyMoments?: Array<{ quote: string; label: string }>;
    }> = [];

    try {
      console.log('[process-interview] Generating stories with dedicated story generator...');
      const storyResult = await llmProvider.generateStories(transcriptText, language || undefined);
      if (storyResult?.stories && Array.isArray(storyResult.stories) && storyResult.stories.length > 0) {
        storiesToSave = storyResult.stories.slice(0, maxStories);
        console.log(`[process-interview] Story generator produced ${storyResult.stories.length} stories, saving ${storiesToSave.length}`);
      }
    } catch (err) {
      console.error('[process-interview] Story generator failed:', err);
    }

    // Fallback: if story generator returned nothing, use summary stories
    if (storiesToSave.length === 0 && summaryResult?.suggestedStories?.length) {
      console.log('[process-interview] Falling back to summary-generated stories');
      storiesToSave = summaryResult.suggestedStories.slice(0, maxStories);
    }

    // Last resort: synthesize from summary text
    if (storiesToSave.length === 0 && summaryResult?.summary) {
      console.log('[process-interview] No stories from any source — synthesizing from summary');
      const firstSentence = summaryResult.summary.split(/[.!?]/)[0]?.trim();
      const fallbackTitle = firstSentence && firstSentence.length > 10 && firstSentence.length < 80
        ? firstSentence
        : (summaryResult.keyTopics?.[0] || 'A Family Memory');
      storiesToSave = [{
        title: fallbackTitle,
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
          console.log(`[process-interview] Matched ${audioSnippets.length}/${story.keyMoments.length} keyMoments to audio for "${story.title}"`);
        }

        // Fallback: if no snippets matched (or AI didn't provide keyMoments),
        // extract snippets automatically from the transcript by finding
        // meaningful sentences that relate to the story content.
        if (canUseSnippets && audioSnippets.length === 0) {
          console.log(`[process-interview] No keyMoments matched for "${story.title}" — extracting fallback snippets from transcript`);
          const fallbackMoments = extractFallbackSnippets(transcriptText, story.content, story.involvedPeople || []);
          if (fallbackMoments.length > 0) {
            audioSnippets = matchQuotesToTimings(fallbackMoments, wordTimings!, transcriptText);
            console.log(`[process-interview] Fallback extracted ${audioSnippets.length} snippets for "${story.title}"`);
          }
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

    // 10b. Fallback — guarantee at least 1 story even if summarization completely failed
    if (storiesCreatedCount === 0) {
      console.log('[process-interview] No stories created from summarization — creating fallback story from transcript');
      const fallbackContent = summaryResult?.summary
        || transcriptText.slice(0, 2000)
        || 'A family conversation was recorded and preserved.';
      const firstTopic = summaryResult?.keyTopics?.[0];
      const fallbackTitle = firstTopic || 'A Family Memory';
      const { data: fallbackStory } = await supabase
        .from('stories')
        .insert({
          family_group_id: familyGroupId,
          interview_id: interview.id,
          title: fallbackTitle,
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

    // Log pipeline metrics
    const pipelineDurationMs = Date.now() - pipelineStartMs;
    console.log(`[process-interview] ✅ Pipeline complete in ${(pipelineDurationMs / 1000).toFixed(1)}s — ${extractionResult.relationships.length} extracted rels, ${extractionResult.suggestedPeople.length} people, ${storiesCreatedCount} stories`);

    return jsonResponse({
      interview: finalInterview,
      extractedEntities: extractionResult.entities.length,
      extractedRelationships: extractionResult.relationships.length,
      suggestedPeople: extractionResult.suggestedPeople.length,
      storiesCreated: storiesCreatedCount,
      pipelineDurationMs,
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

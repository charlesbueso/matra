// ============================================================
// Matra — Export My Data Edge Function
// ============================================================
// Returns CSV files of all user data plus presigned URLs for
// media/audio assets.
// Available to ALL users (free & premium) — GDPR-style export.
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId, getServiceClient } from '../_shared/supabase.ts';
import { getPresignedUrl } from '../_shared/spaces.ts';

// ── CSV helpers ──

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => headers.map((h) => escapeCsvField(row[h])).join(',')),
  ];
  return lines.join('\n');
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = await getAuthUserId(req);
    const supabase = getServiceClient();

    // 1. Get user's family group IDs
    const { data: memberships } = await supabase
      .from('family_group_members')
      .select('family_group_id')
      .eq('user_id', userId);

    const groupIds = (memberships || []).map((m: any) => m.family_group_id);

    // 2. Fetch core data in parallel (no sub-queries)
    const [
      profileRes,
      familyGroupsRes,
      peopleRes,
      relationshipsRes,
      interviewsRes,
      storiesRes,
      mediaRes,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, avatar_url, onboarding_completed, preferences, subscription_tier, interview_count, storage_used_bytes, created_at, updated_at')
        .eq('id', userId)
        .single(),

      groupIds.length > 0
        ? supabase
            .from('family_groups')
            .select('id, name, description, cover_image_url, created_at, updated_at')
            .in('id', groupIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] }),

      groupIds.length > 0
        ? supabase
            .from('people')
            .select('id, family_group_id, first_name, last_name, nickname, birth_date, birth_date_approximate, death_date, death_date_approximate, birth_place, current_location, avatar_url, ai_biography, ai_summary, metadata, created_at, updated_at')
            .in('family_group_id', groupIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] }),

      groupIds.length > 0
        ? supabase
            .from('relationships')
            .select('id, family_group_id, person_a_id, person_b_id, relationship_type, start_date, end_date, notes, confidence, verified, created_at')
            .in('family_group_id', groupIds)
        : Promise.resolve({ data: [] }),

      groupIds.length > 0
        ? supabase
            .from('interviews')
            .select('id, family_group_id, title, description, subject_person_id, audio_storage_path, audio_duration_seconds, audio_size_bytes, status, ai_summary, ai_key_topics, created_at, updated_at')
            .in('family_group_id', groupIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] }),

      groupIds.length > 0
        ? supabase
            .from('stories')
            .select('id, family_group_id, interview_id, title, content, ai_generated, event_date, event_location, tags, created_at, updated_at')
            .in('family_group_id', groupIds)
            .is('deleted_at', null)
        : Promise.resolve({ data: [] }),

      groupIds.length > 0
        ? supabase
            .from('media_assets')
            .select('id, family_group_id, storage_path, media_type, mime_type, file_size_bytes, person_id, story_id, interview_id, caption, created_at')
            .in('family_group_id', groupIds)
        : Promise.resolve({ data: [] }),
    ]);

    // 3. Fetch dependent data (transcripts & story_people) using IDs from above
    const interviews = interviewsRes.data || [];
    const stories = storiesRes.data || [];
    const interviewIds = interviews.map((i: any) => i.id);
    const storyIds = stories.map((s: any) => s.id);

    const [transcriptsRes, storyPeopleRes] = await Promise.all([
      interviewIds.length > 0
        ? supabase
            .from('transcripts')
            .select('id, interview_id, full_text, provider, language, confidence, created_at')
            .in('interview_id', interviewIds)
        : Promise.resolve({ data: [] }),

      storyIds.length > 0
        ? supabase
            .from('story_people')
            .select('story_id, person_id, role')
            .in('story_id', storyIds)
        : Promise.resolve({ data: [] }),
    ]);

    // 4. Collect all storage keys for presigned URL generation
    const storageKeys: string[] = [];

    if (profileRes.data?.avatar_url) {
      storageKeys.push(profileRes.data.avatar_url);
    }

    const people = peopleRes.data || [];
    for (const p of people) {
      if (p.avatar_url) storageKeys.push(p.avatar_url);
    }

    for (const i of interviews) {
      if (i.audio_storage_path) storageKeys.push(i.audio_storage_path);
    }

    const media = mediaRes.data || [];
    for (const m of media) {
      if (m.storage_path) storageKeys.push(m.storage_path);
    }

    const familyGroups = familyGroupsRes.data || [];
    for (const fg of familyGroups) {
      if (fg.cover_image_url) storageKeys.push(fg.cover_image_url);
    }

    // Generate presigned URLs (valid for 24 hours for download)
    const presignedUrls: Record<string, string> = {};
    if (storageKeys.length > 0) {
      await Promise.all(
        storageKeys.map(async (key) => {
          try {
            presignedUrls[key] = await getPresignedUrl(key, 86400); // 24 hours
          } catch {
            // Skip keys that fail (deleted files)
          }
        }),
      );
    }

    // 5. Build CSV data — resolve IDs to human-readable names
    const csvFiles: Record<string, string> = {};

    // Lookup helpers for resolving foreign keys
    const personName = (id: string | null) => {
      if (!id) return '';
      const p = people.find((x: any) => x.id === id);
      return p ? `${p.first_name}${p.last_name ? ' ' + p.last_name : ''}` : '';
    };
    const interviewTitle = (id: string | null) => {
      if (!id) return '';
      const i = interviews.find((x: any) => x.id === id);
      return i?.title || '';
    };
    const storyTitle = (id: string | null) => {
      if (!id) return '';
      const s = stories.find((x: any) => x.id === id);
      return s?.title || '';
    };
    const groupName = (id: string | null) => {
      if (!id) return '';
      const g = familyGroups.find((x: any) => x.id === id);
      return g?.name || '';
    };

    // Strip internal ID columns from a row
    function stripIds(row: Record<string, unknown>, extraKeys: string[] = []): Record<string, unknown> {
      const exclude = new Set(['id', 'family_group_id', ...extraKeys]);
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (!exclude.has(k)) result[k] = v;
      }
      return result;
    }

    // Profile
    if (profileRes.data) {
      csvFiles['profile.csv'] = toCsv([stripIds(profileRes.data)]);
    }

    // Family groups
    if (familyGroups.length > 0) {
      csvFiles['family_groups.csv'] = toCsv(familyGroups.map((fg: any) => stripIds(fg)));
    }

    // People
    if (people.length > 0) {
      csvFiles['people.csv'] = toCsv(people.map((p: any) => {
        const row = stripIds(p);
        row.family_group = groupName(p.family_group_id);
        return row;
      }));
    }

    // Relationships
    const relationships = relationshipsRes.data || [];
    if (relationships.length > 0) {
      csvFiles['relationships.csv'] = toCsv(relationships.map((r: any) => {
        const row = stripIds(r, ['person_a_id', 'person_b_id']);
        row.person_a = personName(r.person_a_id);
        row.person_b = personName(r.person_b_id);
        return row;
      }));
    }

    // Interviews
    if (interviews.length > 0) {
      csvFiles['interviews.csv'] = toCsv(
        interviews.map(({ audio_storage_path, subject_person_id, ...rest }: any) => {
          const row = stripIds(rest);
          row.subject_person = personName(subject_person_id);
          row.audio_download_url = audio_storage_path ? (presignedUrls[audio_storage_path] || '') : '';
          return row;
        }),
      );
    }

    // Transcripts
    const transcripts = transcriptsRes.data || [];
    if (transcripts.length > 0) {
      csvFiles['transcripts.csv'] = toCsv(transcripts.map((t: any) => {
        const row = stripIds(t, ['interview_id']);
        row.interview = interviewTitle(t.interview_id);
        return row;
      }));
    }

    // Stories
    if (stories.length > 0) {
      csvFiles['stories.csv'] = toCsv(stories.map((s: any) => {
        const row = stripIds(s, ['interview_id']);
        row.interview = interviewTitle(s.interview_id);
        row.family_group = groupName(s.family_group_id);
        return row;
      }));
    }

    // Story-People
    const storyPeople = storyPeopleRes.data || [];
    if (storyPeople.length > 0) {
      csvFiles['story_people.csv'] = toCsv(storyPeople.map((sp: any) => ({
        story: storyTitle(sp.story_id),
        person: personName(sp.person_id),
        role: sp.role,
      })));
    }

    // Media assets with download URLs
    if (media.length > 0) {
      csvFiles['media_assets.csv'] = toCsv(
        media.map(({ storage_path, person_id, story_id, interview_id, ...rest }: any) => {
          const row = stripIds(rest);
          row.person = personName(person_id);
          row.story = storyTitle(story_id);
          row.interview = interviewTitle(interview_id);
          row.download_url = storage_path ? (presignedUrls[storage_path] || '') : '';
          return row;
        }),
      );
    }

    // File index for convenience
    const fileUrls: { key: string; download_url: string; type: string }[] = [];
    for (const [key, url] of Object.entries(presignedUrls)) {
      const type = key.includes('avatar') ? 'avatar'
        : key.includes('audio') ? 'audio'
        : key.includes('cover') ? 'cover_image'
        : 'media';
      fileUrls.push({ key, download_url: url, type });
    }
    if (fileUrls.length > 0) {
      csvFiles['file_downloads.csv'] = toCsv(fileUrls);
    }

    return jsonResponse({
      exportedAt: new Date().toISOString(),
      csvFiles,
      fileDownloads: presignedUrls,
      summary: {
        profile: profileRes.data ? 1 : 0,
        familyGroups: familyGroups.length,
        people: people.length,
        relationships: relationships.length,
        interviews: interviews.length,
        transcripts: transcripts.length,
        stories: stories.length,
        mediaAssets: media.length,
        downloadableFiles: Object.keys(presignedUrls).length,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'Unauthorized') {
      return errorResponse(message, 'UNAUTHORIZED', 401);
    }
    console.error('export-my-data error:', message);
    return errorResponse(message, 'INTERNAL_ERROR', 500);
  }
});

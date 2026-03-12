// ============================================================
// Matra — Delete Account (Cascade)
// ============================================================
// Permanently deletes the authenticated user's account and all
// associated data, including remote files in DO Spaces.
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId, getServiceClient } from '../_shared/supabase.ts';
import { deleteFromSpaces } from '../_shared/spaces.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = await getAuthUserId(req);
    const db = getServiceClient();

    // ── 1. Collect all DO Spaces URLs before deleting rows ──
    const urlsToDelete: string[] = [];

    // People avatars in user's family groups
    const { data: groups } = await db
      .from('family_groups')
      .select('id')
      .eq('created_by', userId);
    const groupIds = (groups || []).map((g: any) => g.id);

    if (groupIds.length > 0) {
      const { data: people } = await db
        .from('people')
        .select('avatar_url')
        .in('family_group_id', groupIds)
        .not('avatar_url', 'is', null);
      for (const p of people || []) {
        if (p.avatar_url) urlsToDelete.push(p.avatar_url);
      }

      // Interview audio
      const { data: interviews } = await db
        .from('interviews')
        .select('audio_storage_path')
        .in('family_group_id', groupIds)
        .not('audio_storage_path', 'is', null);
      for (const i of interviews || []) {
        if (i.audio_storage_path) urlsToDelete.push(i.audio_storage_path);
      }

      // Media assets
      const { data: media } = await db
        .from('media_assets')
        .select('storage_path')
        .in('family_group_id', groupIds);
      for (const m of media || []) {
        if (m.storage_path) urlsToDelete.push(m.storage_path);
      }

      // Exports
      const { data: exports } = await db
        .from('exports')
        .select('output_storage_path')
        .in('family_group_id', groupIds)
        .not('output_storage_path', 'is', null);
      for (const e of exports || []) {
        if (e.output_storage_path) urlsToDelete.push(e.output_storage_path);
      }
    }

    // ── 2. Remove all data in user's family groups (FK-safe order) ──
    // Delete children before parents to avoid FK constraint violations.
    // Service client bypasses RLS.
    if (groupIds.length > 0) {
      // processing_jobs references interviews, people, exports
      await db.from('processing_jobs').delete().in(
        'interview_id',
        (await db.from('interviews').select('id').in('family_group_id', groupIds)).data?.map((r: any) => r.id) || []
      );

      // media_assets references people, stories, interviews
      await db.from('media_assets').delete().in('family_group_id', groupIds);

      // story_people CASCADE from stories — but delete explicitly for safety
      const storyIds = (await db.from('stories').select('id').in('family_group_id', groupIds)).data?.map((r: any) => r.id) || [];
      if (storyIds.length > 0) {
        await db.from('story_people').delete().in('story_id', storyIds);
      }

      // stories references interviews
      await db.from('stories').delete().in('family_group_id', groupIds);

      // extracted_entities, transcripts CASCADE from interviews — delete explicitly for safety
      const interviewIds = (await db.from('interviews').select('id').in('family_group_id', groupIds)).data?.map((r: any) => r.id) || [];
      if (interviewIds.length > 0) {
        await db.from('extracted_entities').delete().in('interview_id', interviewIds);
        await db.from('transcripts').delete().in('interview_id', interviewIds);
      }

      // interviews
      await db.from('interviews').delete().in('family_group_id', groupIds);

      // relationships
      await db.from('relationships').delete().in('family_group_id', groupIds);

      // exports
      await db.from('exports').delete().in('family_group_id', groupIds);

      // people
      await db.from('people').delete().in('family_group_id', groupIds);

      // family_group_members
      await db.from('family_group_members').delete().in('family_group_id', groupIds);

      // family_groups themselves
      await db.from('family_groups').delete().in('id', groupIds);
    }

    // ── 3. Clean up any remaining references to this profile ──
    await db.from('processing_jobs').delete().eq('user_id', userId);
    await db.from('exports').delete().eq('requested_by', userId);
    await db.from('media_assets').delete().eq('uploaded_by', userId);
    await db.from('stories').delete().eq('created_by', userId);
    await db.from('interviews').delete().eq('conducted_by', userId);
    await db.from('family_group_members').update({ invited_by: null }).eq('invited_by', userId);
    await db.from('family_group_members').delete().eq('user_id', userId);

    // ── 4. Delete auth user — CASCADEs to profiles, subscriptions, deactivation_snapshots ──
    const { error: deleteError } = await db.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw new Error(`Failed to delete auth user: ${deleteError.message}`);
    }

    // ── 5. Clean up DO Spaces files (best-effort) ──
    for (const url of urlsToDelete) {
      try {
        await deleteFromSpaces(url);
      } catch {
        // Best-effort: don't fail the whole request if a file is already gone
      }
    }

    return jsonResponse({ deleted: true });
  } catch (err) {
    return errorResponse(
      err.message || 'Internal server error',
      'DELETE_ACCOUNT_ERROR',
      err.message === 'Unauthorized' ? 401 : 500
    );
  }
});

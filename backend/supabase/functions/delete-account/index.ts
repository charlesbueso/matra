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

    // ── 2. Remove non-CASCADE FK references to profiles ──

    // processing_jobs.user_id → profiles(id) — no CASCADE
    await db.from('processing_jobs').delete().eq('user_id', userId);

    // exports.requested_by → profiles(id) — no CASCADE
    await db.from('exports').delete().eq('requested_by', userId);

    // media_assets.uploaded_by → profiles(id) — no CASCADE
    await db.from('media_assets').delete().eq('uploaded_by', userId);

    // stories.created_by → profiles(id) — no CASCADE
    await db.from('stories').delete().eq('created_by', userId);

    // interviews.conducted_by → profiles(id) — no CASCADE
    await db.from('interviews').delete().eq('conducted_by', userId);

    // people.created_by → profiles(id) — no CASCADE
    if (groupIds.length > 0) {
      await db.from('people').delete().in('family_group_id', groupIds);
    }

    // family_group_members.invited_by → profiles(id) — nullable, no CASCADE
    await db
      .from('family_group_members')
      .update({ invited_by: null })
      .eq('invited_by', userId);

    // ── 3. Delete auth user — CASCADEs to profiles → family_groups → everything else ──
    const { error: deleteError } = await db.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw new Error(`Failed to delete auth user: ${deleteError.message}`);
    }

    // ── 4. Clean up DO Spaces files (best-effort) ──
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

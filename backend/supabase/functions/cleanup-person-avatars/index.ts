// ============================================================
// Matra — Cleanup Person Avatars Edge Function
// ============================================================
// Accepts an array of person IDs and deletes their avatar
// images from DigitalOcean Spaces. Called before soft-deleting
// people so remote files don't become orphaned.
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

    const { personIds } = await req.json();

    if (!Array.isArray(personIds) || personIds.length === 0) {
      return errorResponse('personIds must be a non-empty array', 'MISSING_FIELDS', 400);
    }

    // Verify user has access: all people must belong to a family group the user is a member of
    const { data: membership } = await db
      .from('family_group_members')
      .select('family_group_id')
      .eq('user_id', userId)
      .not('accepted_at', 'is', null);

    const allowedGroupIds = (membership || []).map((m: any) => m.family_group_id);
    if (allowedGroupIds.length === 0) {
      return errorResponse('No family groups found', 'UNAUTHORIZED', 403);
    }

    // Fetch avatar URLs for the given person IDs (only those in user's groups)
    const { data: people } = await db
      .from('people')
      .select('id, avatar_url, family_group_id')
      .in('id', personIds)
      .in('family_group_id', allowedGroupIds)
      .not('avatar_url', 'is', null);

    let cleaned = 0;
    for (const person of people || []) {
      if (person.avatar_url) {
        try {
          await deleteFromSpaces(person.avatar_url);
          cleaned++;
        } catch {
          // Best-effort: file may already be gone
        }
      }
    }

    return jsonResponse({ cleaned });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('cleanup-person-avatars error:', message);
    return errorResponse(message, 'INTERNAL_ERROR', 500);
  }
});

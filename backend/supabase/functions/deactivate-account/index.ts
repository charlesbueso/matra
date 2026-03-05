// ============================================================
// MATRA — Deactivate / Reactivate Account
// ============================================================
// Deactivate: soft-deletes all user data and marks profile as
//   deactivated. Data is preserved and can be restored.
// Reactivate: clears deactivated_at and restores soft-deleted data.
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId, getServiceClient } from '../_shared/supabase.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = await getAuthUserId(req);
    const db = getServiceClient();
    const { action } = await req.json();

    if (action === 'deactivate') {
      const now = new Date().toISOString();

      // Get user's family groups
      const { data: groups } = await db
        .from('family_groups')
        .select('id')
        .eq('created_by', userId)
        .is('deleted_at', null);
      const groupIds = (groups || []).map((g: any) => g.id);

      if (groupIds.length > 0) {
        // Soft-delete all data in user's family groups
        await db
          .from('interviews')
          .update({ deleted_at: now })
          .in('family_group_id', groupIds)
          .is('deleted_at', null);

        await db
          .from('stories')
          .update({ deleted_at: now })
          .in('family_group_id', groupIds)
          .is('deleted_at', null);

        await db
          .from('people')
          .update({ deleted_at: now })
          .in('family_group_id', groupIds)
          .is('deleted_at', null);

        // Soft-delete the family groups themselves
        await db
          .from('family_groups')
          .update({ deleted_at: now })
          .in('id', groupIds);
      }

      // Mark profile as deactivated
      await db
        .from('profiles')
        .update({ deactivated_at: now })
        .eq('id', userId);

      return jsonResponse({ deactivated: true });

    } else if (action === 'reactivate') {
      // Get the deactivation timestamp to know which records to restore
      const { data: profile } = await db
        .from('profiles')
        .select('deactivated_at')
        .eq('id', userId)
        .single();

      if (!profile?.deactivated_at) {
        return jsonResponse({ reactivated: true }); // nothing to do
      }

      const deactivatedAt = profile.deactivated_at;

      // Restore family groups deactivated at that time
      const { data: groups } = await db
        .from('family_groups')
        .select('id')
        .eq('created_by', userId)
        .eq('deleted_at', deactivatedAt);
      const groupIds = (groups || []).map((g: any) => g.id);

      if (groupIds.length > 0) {
        // Restore family groups
        await db
          .from('family_groups')
          .update({ deleted_at: null })
          .in('id', groupIds);

        // Restore data that was soft-deleted at the same timestamp
        await db
          .from('people')
          .update({ deleted_at: null })
          .in('family_group_id', groupIds)
          .eq('deleted_at', deactivatedAt);

        await db
          .from('interviews')
          .update({ deleted_at: null })
          .in('family_group_id', groupIds)
          .eq('deleted_at', deactivatedAt);

        await db
          .from('stories')
          .update({ deleted_at: null })
          .in('family_group_id', groupIds)
          .eq('deleted_at', deactivatedAt);
      }

      // Clear deactivation flag
      await db
        .from('profiles')
        .update({ deactivated_at: null })
        .eq('id', userId);

      return jsonResponse({ reactivated: true });

    } else {
      return errorResponse('Invalid action. Use "deactivate" or "reactivate".', 'INVALID_ACTION', 400);
    }
  } catch (err) {
    return errorResponse(
      err.message || 'Internal server error',
      'ACCOUNT_STATUS_ERROR',
      err.message === 'Unauthorized' ? 401 : 500
    );
  }
});

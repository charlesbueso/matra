// ============================================================
// MATRA — Deactivate / Reactivate Account
// ============================================================
// Industry-grade account deactivation with full data snapshot.
//
// Deactivate:
//   1. Check idempotency (reject if already deactivated)
//   2. Snapshot ALL user data as JSON into deactivation_snapshots
//   3. Soft-delete all rows (family_groups, people, relationships,
//      interviews, transcripts, extracted_entities, stories,
//      story_people, media_assets, family_invitations, members)
//   4. Mark profile.deactivated_at
//
// Reactivate:
//   1. Restore soft-deleted rows using the deactivation timestamp
//   2. Clear profile.deactivated_at
//   3. Remove snapshot (data is live again)
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId, getServiceClient } from '../_shared/supabase.ts';

/** Tables that support soft-delete (have a deleted_at column) */
const SOFT_DELETE_TABLES = ['interviews', 'stories', 'people', 'family_groups'] as const;

/** Tables without deleted_at — we snapshot them but don't touch rows */
const SNAPSHOT_ONLY_TABLES = [
  'relationships',
  'transcripts',
  'extracted_entities',
  'story_people',
  'media_assets',
  'family_group_members',
  'family_invitations',
] as const;

// ─── Helpers ────────────────────────────────────────────────

async function assertOk(
  promise: Promise<{ error: any; data?: any }>,
  context: string,
) {
  const { error, data } = await promise;
  if (error) throw new Error(`${context}: ${error.message}`);
  return data;
}

// ─── Snapshot builder ───────────────────────────────────────

async function buildSnapshot(db: any, userId: string, groupIds: string[]) {
  const snapshot: Record<string, any> = {};

  // Profile
  snapshot.profile = await assertOk(
    db.from('profiles').select('*').eq('id', userId).single(),
    'snapshot profiles',
  );

  if (groupIds.length === 0) return snapshot;

  // Family groups
  snapshot.family_groups = await assertOk(
    db.from('family_groups').select('*').in('id', groupIds),
    'snapshot family_groups',
  );

  // People
  snapshot.people = await assertOk(
    db.from('people').select('*').in('family_group_id', groupIds).is('deleted_at', null),
    'snapshot people',
  );

  const peopleIds = (snapshot.people || []).map((p: any) => p.id);

  // Relationships (no deleted_at — snapshot all)
  if (peopleIds.length > 0) {
    snapshot.relationships = await assertOk(
      db.from('relationships').select('*').in('family_group_id', groupIds),
      'snapshot relationships',
    );
  }

  // Interviews
  snapshot.interviews = await assertOk(
    db.from('interviews').select('*').in('family_group_id', groupIds).is('deleted_at', null),
    'snapshot interviews',
  );

  const interviewIds = (snapshot.interviews || []).map((i: any) => i.id);

  // Transcripts (cascade-linked to interviews)
  if (interviewIds.length > 0) {
    snapshot.transcripts = await assertOk(
      db.from('transcripts').select('*').in('interview_id', interviewIds),
      'snapshot transcripts',
    );

    snapshot.extracted_entities = await assertOk(
      db.from('extracted_entities').select('*').in('interview_id', interviewIds),
      'snapshot extracted_entities',
    );
  }

  // Stories
  snapshot.stories = await assertOk(
    db.from('stories').select('*').in('family_group_id', groupIds).is('deleted_at', null),
    'snapshot stories',
  );

  const storyIds = (snapshot.stories || []).map((s: any) => s.id);

  // Story-people junction
  if (storyIds.length > 0) {
    snapshot.story_people = await assertOk(
      db.from('story_people').select('*').in('story_id', storyIds),
      'snapshot story_people',
    );
  }

  // Media assets
  snapshot.media_assets = await assertOk(
    db.from('media_assets').select('*').in('family_group_id', groupIds),
    'snapshot media_assets',
  );

  // Family group members
  snapshot.family_group_members = await assertOk(
    db.from('family_group_members').select('*').in('family_group_id', groupIds),
    'snapshot family_group_members',
  );

  // Invitations
  snapshot.family_invitations = await assertOk(
    db.from('family_invitations').select('*').in('family_group_id', groupIds),
    'snapshot family_invitations',
  );

  return snapshot;
}

// ─── Deactivate ─────────────────────────────────────────────

async function deactivate(db: any, userId: string) {
  // Idempotency: reject if already deactivated
  const profile = await assertOk(
    db.from('profiles').select('deactivated_at').eq('id', userId).single(),
    'check profile',
  );
  if (profile.deactivated_at) {
    return { deactivated: true, alreadyDeactivated: true };
  }

  const now = new Date().toISOString();

  // 1. Identify owned family groups
  const groups = await assertOk(
    db.from('family_groups').select('id').eq('created_by', userId).is('deleted_at', null),
    'fetch family_groups',
  );
  const groupIds = (groups || []).map((g: any) => g.id);

  // 2. Build full snapshot BEFORE any mutations
  const snapshot = await buildSnapshot(db, userId, groupIds);

  // 3. Save snapshot (upsert — one per user)
  await assertOk(
    db.from('deactivation_snapshots').upsert(
      { user_id: userId, snapshot, deactivated_at: now },
      { onConflict: 'user_id' },
    ),
    'save snapshot',
  );

  // 4. Soft-delete all data
  if (groupIds.length > 0) {
    await assertOk(
      db.from('interviews')
        .update({ deleted_at: now })
        .in('family_group_id', groupIds)
        .is('deleted_at', null),
      'soft-delete interviews',
    );

    await assertOk(
      db.from('stories')
        .update({ deleted_at: now })
        .in('family_group_id', groupIds)
        .is('deleted_at', null),
      'soft-delete stories',
    );

    await assertOk(
      db.from('people')
        .update({ deleted_at: now })
        .in('family_group_id', groupIds)
        .is('deleted_at', null),
      'soft-delete people',
    );

    // Revoke pending invitations
    await assertOk(
      db.from('family_invitations')
        .update({ status: 'revoked', updated_at: now })
        .in('family_group_id', groupIds)
        .eq('status', 'pending'),
      'revoke invitations',
    );

    // Soft-delete family groups last (parent records)
    await assertOk(
      db.from('family_groups')
        .update({ deleted_at: now })
        .in('id', groupIds),
      'soft-delete family_groups',
    );
  }

  // 5. Mark profile as deactivated
  await assertOk(
    db.from('profiles')
      .update({ deactivated_at: now })
      .eq('id', userId),
    'mark profile deactivated',
  );

  return { deactivated: true };
}

// ─── Reactivate ─────────────────────────────────────────────

async function reactivate(db: any, userId: string) {
  // Get deactivation timestamp
  const profile = await assertOk(
    db.from('profiles').select('deactivated_at').eq('id', userId).single(),
    'check profile',
  );

  if (!profile.deactivated_at) {
    return { reactivated: true, alreadyActive: true };
  }

  const deactivatedAt = profile.deactivated_at;

  // 1. Restore family groups first (parent records)
  const groups = await assertOk(
    db.from('family_groups')
      .select('id')
      .eq('created_by', userId)
      .eq('deleted_at', deactivatedAt),
    'find deactivated groups',
  );
  const groupIds = (groups || []).map((g: any) => g.id);

  if (groupIds.length > 0) {
    await assertOk(
      db.from('family_groups')
        .update({ deleted_at: null })
        .in('id', groupIds),
      'restore family_groups',
    );

    await assertOk(
      db.from('people')
        .update({ deleted_at: null })
        .in('family_group_id', groupIds)
        .eq('deleted_at', deactivatedAt),
      'restore people',
    );

    await assertOk(
      db.from('interviews')
        .update({ deleted_at: null })
        .in('family_group_id', groupIds)
        .eq('deleted_at', deactivatedAt),
      'restore interviews',
    );

    await assertOk(
      db.from('stories')
        .update({ deleted_at: null })
        .in('family_group_id', groupIds)
        .eq('deleted_at', deactivatedAt),
      'restore stories',
    );
  }

  // 2. Clear deactivation flag
  await assertOk(
    db.from('profiles')
      .update({ deactivated_at: null })
      .eq('id', userId),
    'clear deactivated_at',
  );

  // 3. Remove snapshot (data is live again)
  await assertOk(
    db.from('deactivation_snapshots')
      .delete()
      .eq('user_id', userId),
    'remove snapshot',
  );

  return { reactivated: true };
}

// ─── Handler ────────────────────────────────────────────────

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = await getAuthUserId(req);
    const db = getServiceClient();
    const { action } = await req.json();

    if (action === 'deactivate') {
      const result = await deactivate(db, userId);
      return jsonResponse(result);
    } else if (action === 'reactivate') {
      const result = await reactivate(db, userId);
      return jsonResponse(result);
    } else {
      return errorResponse(
        'Invalid action. Use "deactivate" or "reactivate".',
        'INVALID_ACTION',
        400,
      );
    }
  } catch (err: any) {
    return errorResponse(
      err.message || 'Internal server error',
      'ACCOUNT_STATUS_ERROR',
      err.message === 'Unauthorized' ? 401 : 500,
    );
  }
});

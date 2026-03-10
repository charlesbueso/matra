// ============================================================
// Matra — Accept Family Invitation & Merge Trees
// ============================================================
// When a user accepts an invitation:
// 1. Validate the invite code (pending, not expired)
// 2. Add invitee to the inviter's family group as 'editor'
// 3. Merge the invitee's tree data into the shared family group
// 4. Create the relationship between inviter and invitee
// 5. Propagate transitive relationships (shared parents, etc.)
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId, getServiceClient } from '../_shared/supabase.ts';

/** Normalize name for fuzzy matching (lowercase, strip accents). */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Check word overlap ratio between two names. */
function nameMatchScore(a: string, b: string): number {
  const wordsA = normalizeName(a).split(/\s+/).filter(Boolean);
  const wordsB = normalizeName(b).split(/\s+/).filter(Boolean);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const matches = wordsA.filter((w) => wordsB.includes(w)).length;
  return matches / Math.max(wordsA.length, wordsB.length);
}

/** Get the inverse relationship type. */
function getInverseType(type: string): string {
  const inverses: Record<string, string> = {
    parent: 'child', child: 'parent',
    grandparent: 'grandchild', grandchild: 'grandparent',
    great_grandparent: 'great_grandchild', great_grandchild: 'great_grandparent',
    great_great_grandparent: 'great_great_grandchild', great_great_grandchild: 'great_great_grandparent',
    spouse: 'spouse', ex_spouse: 'ex_spouse', sibling: 'sibling',
    step_parent: 'step_child', step_child: 'step_parent',
    step_sibling: 'step_sibling',
    uncle_aunt: 'nephew_niece', nephew_niece: 'uncle_aunt',
    cousin: 'cousin', in_law: 'in_law',
    adopted_parent: 'adopted_child', adopted_child: 'adopted_parent',
    godparent: 'godchild', godchild: 'godparent',
    other: 'other',
  };
  return inverses[type] || 'other';
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (req.method === 'GET') {
      // Preview invitation (no auth required for previewing)
      const url = new URL(req.url);
      const code = url.searchParams.get('code');
      if (!code) return errorResponse('code is required', 'MISSING_PARAMS', 400);
      return await handlePreview(code);
    }

    const userId = await getAuthUserId(req);
    const body = await req.json();
    const inviteCode = body.inviteCode as string;

    if (!inviteCode) {
      return errorResponse('inviteCode is required', 'MISSING_PARAMS', 400);
    }

    return await handleAccept(userId, inviteCode);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return errorResponse(message, 'INTERNAL_ERROR', status);
  }
});

// ── Preview invitation (public, no auth) ──
async function handlePreview(code: string) {
  const supabase = getServiceClient();

  const { data: invitation } = await supabase
    .from('family_invitations')
    .select('id, relationship_type, status, expires_at, family_group_id')
    .eq('invite_code', code.toUpperCase().trim())
    .single();

  if (!invitation) {
    return errorResponse('Invitation not found', 'NOT_FOUND', 404);
  }

  if (invitation.status !== 'pending') {
    return errorResponse(`Invitation has been ${invitation.status}`, 'INVALID_STATUS', 410);
  }

  if (new Date(invitation.expires_at) < new Date()) {
    // Mark as expired
    await supabase
      .from('family_invitations')
      .update({ status: 'expired' })
      .eq('id', invitation.id);
    return errorResponse('Invitation has expired', 'EXPIRED', 410);
  }

  // Get inviter info
  const { data: inv } = await supabase
    .from('family_invitations')
    .select('invited_by')
    .eq('id', invitation.id)
    .single();

  const { data: inviter } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', inv!.invited_by)
    .single();

  // Get family group name
  const { data: group } = await supabase
    .from('family_groups')
    .select('name')
    .eq('id', invitation.family_group_id)
    .single();

  return jsonResponse({
    valid: true,
    relationshipType: invitation.relationship_type,
    inviterName: inviter?.display_name ?? 'Someone',
    inviterAvatar: inviter?.avatar_url ?? null,
    familyGroupName: group?.name ?? 'Family',
  });
}

// ── Accept invitation + merge trees ──
async function handleAccept(userId: string, inviteCode: string) {
  const supabase = getServiceClient();

  // 1. Validate invitation
  const { data: invitation, error: invErr } = await supabase
    .from('family_invitations')
    .select('*')
    .eq('invite_code', inviteCode.toUpperCase().trim())
    .eq('status', 'pending')
    .single();

  if (invErr || !invitation) {
    return errorResponse('Invalid or expired invitation', 'INVALID_INVITE', 404);
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await supabase
      .from('family_invitations')
      .update({ status: 'expired' })
      .eq('id', invitation.id);
    return errorResponse('Invitation has expired', 'EXPIRED', 410);
  }

  // Can't accept your own invitation
  if (invitation.invited_by === userId) {
    return errorResponse('You cannot accept your own invitation', 'SELF_INVITE', 400);
  }

  // Check if user is already a member of this family group
  const { data: existingMember } = await supabase
    .from('family_group_members')
    .select('id')
    .eq('family_group_id', invitation.family_group_id)
    .eq('user_id', userId)
    .single();

  if (existingMember) {
    return errorResponse('You are already a member of this family group', 'ALREADY_MEMBER', 409);
  }

  // 2. Find the invitee's current family group (if any)
  const { data: inviteeMembership } = await supabase
    .from('family_group_members')
    .select('family_group_id')
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .limit(1)
    .single();

  const inviteeOldGroupId = inviteeMembership?.family_group_id ?? null;
  const targetGroupId = invitation.family_group_id;

  // 3. Get invitee's profile
  const { data: inviteeProfile } = await supabase
    .from('profiles')
    .select('self_person_id, display_name')
    .eq('id', userId)
    .single();

  // 4. Get inviter's profile
  const { data: inviterProfile } = await supabase
    .from('profiles')
    .select('self_person_id')
    .eq('id', invitation.invited_by)
    .single();

  // 5. Add invitee to the inviter's family group as 'editor'
  const { error: memberErr } = await supabase
    .from('family_group_members')
    .insert({
      family_group_id: targetGroupId,
      user_id: userId,
      role: 'editor',
      invited_by: invitation.invited_by,
      accepted_at: new Date().toISOString(),
    });

  if (memberErr) {
    return errorResponse(memberErr.message, 'JOIN_FAILED', 500);
  }

  // 6. Merge trees if invitee had existing data
  let mergeResult = { peopleMerged: 0, peopleCreated: 0, relationshipsCreated: 0 };

  if (inviteeOldGroupId && inviteeOldGroupId !== targetGroupId) {
    mergeResult = await mergeTrees(
      supabase,
      userId,
      inviteeOldGroupId,
      targetGroupId,
      inviteeProfile?.self_person_id ?? null,
      invitation.invitee_person_id
    );
  }

  // 7. Link invitee's self_person_id to the target group
  let inviteeSelfPersonId = inviteeProfile?.self_person_id;

  if (invitation.invitee_person_id) {
    // The inviter already had a person node for the invitee — link it
    inviteeSelfPersonId = invitation.invitee_person_id;
    await supabase
      .from('profiles')
      .update({ self_person_id: invitation.invitee_person_id })
      .eq('id', userId);
  } else if (!inviteeSelfPersonId || inviteeOldGroupId !== targetGroupId) {
    // Create a new person node for the invitee in the target group
    const { data: newPerson } = await supabase
      .from('people')
      .insert({
        family_group_id: targetGroupId,
        first_name: inviteeProfile?.display_name?.split(' ')[0] ?? 'Unknown',
        last_name: inviteeProfile?.display_name?.split(' ').slice(1).join(' ') || null,
        created_by: userId,
      })
      .select('id')
      .single();

    if (newPerson) {
      inviteeSelfPersonId = newPerson.id;
      await supabase
        .from('profiles')
        .update({ self_person_id: newPerson.id })
        .eq('id', userId);
    }
  }

  // 8. Create relationship between inviter and invitee
  if (inviterProfile?.self_person_id && inviteeSelfPersonId) {
    const relType = invitation.relationship_type;
    const inverseType = getInverseType(relType);

    // The invitation says "this person is my [relType]"
    // So inviter → invitee has type relType
    // And invitee → inviter has type inverseType
    await createRelationshipIfNotExists(
      supabase,
      targetGroupId,
      inviterProfile.self_person_id,
      inviteeSelfPersonId,
      relType
    );
    await createRelationshipIfNotExists(
      supabase,
      targetGroupId,
      inviteeSelfPersonId,
      inviterProfile.self_person_id,
      inverseType
    );

    // 9. Propagate transitive relationships
    await propagateSharedRelationships(
      supabase,
      targetGroupId,
      inviterProfile.self_person_id,
      inviteeSelfPersonId,
      relType
    );
  }

  // 10. Mark invitation as accepted
  await supabase
    .from('family_invitations')
    .update({
      status: 'accepted',
      accepted_by: userId,
      accepted_at: new Date().toISOString(),
    })
    .eq('id', invitation.id);

  return jsonResponse({
    familyGroupId: targetGroupId,
    ...mergeResult,
    selfPersonId: inviteeSelfPersonId,
  });
}

// ── Merge tree data from old group to target group ──
async function mergeTrees(
  supabase: any,
  userId: string,
  oldGroupId: string,
  targetGroupId: string,
  inviteeSelfPersonId: string | null,
  inviteePersonInTarget: string | null
) {
  const result = { peopleMerged: 0, peopleCreated: 0, relationshipsCreated: 0 };

  // Get all people from the old group
  const { data: oldPeople } = await supabase
    .from('people')
    .select('*')
    .eq('family_group_id', oldGroupId)
    .is('deleted_at', null);

  if (!oldPeople || oldPeople.length === 0) return result;

  // Get all people from the target group for matching
  const { data: targetPeople } = await supabase
    .from('people')
    .select('*')
    .eq('family_group_id', targetGroupId)
    .is('deleted_at', null);

  // Build ID mapping: old person ID → target person ID
  const idMap: Record<string, string> = {};

  // If invitee's self person exists in old group, map it to target
  if (inviteeSelfPersonId && inviteePersonInTarget) {
    idMap[inviteeSelfPersonId] = inviteePersonInTarget;
    result.peopleMerged++;
  }

  for (const oldPerson of oldPeople) {
    if (idMap[oldPerson.id]) continue; // Already mapped

    const fullName = `${oldPerson.first_name} ${oldPerson.last_name || ''}`.trim();

    // Try to find a match in the target group
    let bestMatch: any = null;
    let bestScore = 0;

    for (const targetPerson of (targetPeople || [])) {
      const targetFullName = `${targetPerson.first_name} ${targetPerson.last_name || ''}`.trim();
      const score = nameMatchScore(fullName, targetFullName);
      if (score > bestScore && score >= 0.6) {
        bestScore = score;
        bestMatch = targetPerson;
      }
    }

    if (bestMatch) {
      // Merge: fill in missing fields
      idMap[oldPerson.id] = bestMatch.id;
      const updates: Record<string, unknown> = {};
      if (!bestMatch.birth_date && oldPerson.birth_date) updates.birth_date = oldPerson.birth_date;
      if (!bestMatch.death_date && oldPerson.death_date) updates.death_date = oldPerson.death_date;
      if (!bestMatch.birth_place && oldPerson.birth_place) updates.birth_place = oldPerson.birth_place;
      if (!bestMatch.current_location && oldPerson.current_location) updates.current_location = oldPerson.current_location;
      if (!bestMatch.nickname && oldPerson.nickname) updates.nickname = oldPerson.nickname;
      if (!bestMatch.ai_biography && oldPerson.ai_biography) updates.ai_biography = oldPerson.ai_biography;

      if (Object.keys(updates).length > 0) {
        await supabase
          .from('people')
          .update(updates)
          .eq('id', bestMatch.id);
      }
      result.peopleMerged++;
    } else {
      // Create new person in target group
      const { data: newPerson } = await supabase
        .from('people')
        .insert({
          family_group_id: targetGroupId,
          first_name: oldPerson.first_name,
          last_name: oldPerson.last_name,
          nickname: oldPerson.nickname,
          birth_date: oldPerson.birth_date,
          birth_date_approximate: oldPerson.birth_date_approximate,
          death_date: oldPerson.death_date,
          death_date_approximate: oldPerson.death_date_approximate,
          birth_place: oldPerson.birth_place,
          current_location: oldPerson.current_location,
          avatar_url: oldPerson.avatar_url,
          ai_biography: oldPerson.ai_biography,
          ai_biography_generated_at: oldPerson.ai_biography_generated_at,
          ai_summary: oldPerson.ai_summary,
          metadata: oldPerson.metadata,
          created_by: userId,
        })
        .select('id')
        .single();

      if (newPerson) {
        idMap[oldPerson.id] = newPerson.id;
        result.peopleCreated++;
      }
    }
  }

  // Migrate relationships
  const { data: oldRelationships } = await supabase
    .from('relationships')
    .select('*')
    .eq('family_group_id', oldGroupId);

  for (const rel of (oldRelationships || [])) {
    const newAId = idMap[rel.person_a_id];
    const newBId = idMap[rel.person_b_id];
    if (!newAId || !newBId) continue;

    await createRelationshipIfNotExists(
      supabase,
      targetGroupId,
      newAId,
      newBId,
      rel.relationship_type,
      rel.confidence,
      rel.verified
    );
    result.relationshipsCreated++;
  }

  // Migrate interviews (re-point to target group with mapped person IDs)
  const { data: oldInterviews } = await supabase
    .from('interviews')
    .select('*')
    .eq('family_group_id', oldGroupId)
    .is('deleted_at', null);

  for (const interview of (oldInterviews || [])) {
    const mappedSubjectId = interview.subject_person_id
      ? idMap[interview.subject_person_id] || interview.subject_person_id
      : null;

    await supabase
      .from('interviews')
      .update({
        family_group_id: targetGroupId,
        subject_person_id: mappedSubjectId,
      })
      .eq('id', interview.id);
  }

  // Migrate stories
  const { data: oldStories } = await supabase
    .from('stories')
    .select('*')
    .eq('family_group_id', oldGroupId)
    .is('deleted_at', null);

  for (const story of (oldStories || [])) {
    await supabase
      .from('stories')
      .update({ family_group_id: targetGroupId })
      .eq('id', story.id);

    // Update story_people references
    const { data: storyPeople } = await supabase
      .from('story_people')
      .select('*')
      .eq('story_id', story.id);

    for (const sp of (storyPeople || [])) {
      const newPersonId = idMap[sp.person_id];
      if (newPersonId && newPersonId !== sp.person_id) {
        // Delete old, insert new (composite PK)
        await supabase
          .from('story_people')
          .delete()
          .eq('story_id', sp.story_id)
          .eq('person_id', sp.person_id);
        await supabase
          .from('story_people')
          .insert({ story_id: sp.story_id, person_id: newPersonId, role: sp.role });
      }
    }
  }

  // Migrate media assets
  await supabase
    .from('media_assets')
    .update({ family_group_id: targetGroupId })
    .eq('family_group_id', oldGroupId);

  // Soft-delete the old family group if now empty
  const { count: remainingMembers } = await supabase
    .from('family_group_members')
    .select('id', { count: 'exact', head: true })
    .eq('family_group_id', oldGroupId);

  // Remove invitee from old group
  await supabase
    .from('family_group_members')
    .delete()
    .eq('family_group_id', oldGroupId)
    .eq('user_id', userId);

  if ((remainingMembers ?? 0) <= 1) {
    await supabase
      .from('family_groups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', oldGroupId);
  }

  return result;
}

// ── Create relationship if it doesn't already exist ──
async function createRelationshipIfNotExists(
  supabase: any,
  familyGroupId: string,
  personAId: string,
  personBId: string,
  type: string,
  confidence = 1.0,
  verified = false
) {
  const { data: existing } = await supabase
    .from('relationships')
    .select('id')
    .eq('family_group_id', familyGroupId)
    .eq('person_a_id', personAId)
    .eq('person_b_id', personBId)
    .eq('relationship_type', type)
    .limit(1)
    .single();

  if (existing) return;

  await supabase
    .from('relationships')
    .insert({
      family_group_id: familyGroupId,
      person_a_id: personAId,
      person_b_id: personBId,
      relationship_type: type,
      confidence,
      verified,
    });
}

// ── Propagate transitive relationships ──
// e.g. if A and B are siblings, A's parents are also B's parents
async function propagateSharedRelationships(
  supabase: any,
  familyGroupId: string,
  inviterPersonId: string,
  inviteePersonId: string,
  relationType: string
) {
  // Get inviter's relationships
  const { data: inviterRels } = await supabase
    .from('relationships')
    .select('*')
    .eq('family_group_id', familyGroupId)
    .or(`person_a_id.eq.${inviterPersonId},person_b_id.eq.${inviterPersonId}`);

  if (!inviterRels || inviterRels.length === 0) return;

  // Sibling propagation: share parents
  if (relationType === 'sibling' || relationType === 'step_sibling') {
    for (const rel of inviterRels) {
      const isA = rel.person_a_id === inviterPersonId;
      const otherPersonId = isA ? rel.person_b_id : rel.person_a_id;
      const type = rel.relationship_type as string;

      // If inviter has a parent relationship, create it for invitee too
      if (isA && type === 'child') {
        // inviter is child of otherPerson → invitee is also child of otherPerson
        await createRelationshipIfNotExists(supabase, familyGroupId, inviteePersonId, otherPersonId, 'child');
        await createRelationshipIfNotExists(supabase, familyGroupId, otherPersonId, inviteePersonId, 'parent');
      }
      if (!isA && type === 'parent') {
        // otherPerson is parent of inviter → otherPerson is also parent of invitee
        await createRelationshipIfNotExists(supabase, familyGroupId, otherPersonId, inviteePersonId, 'parent');
        await createRelationshipIfNotExists(supabase, familyGroupId, inviteePersonId, otherPersonId, 'child');
      }

      // Share grandparents too
      if (isA && type === 'grandchild') {
        await createRelationshipIfNotExists(supabase, familyGroupId, inviteePersonId, otherPersonId, 'grandchild');
        await createRelationshipIfNotExists(supabase, familyGroupId, otherPersonId, inviteePersonId, 'grandparent');
      }
      if (!isA && type === 'grandparent') {
        await createRelationshipIfNotExists(supabase, familyGroupId, otherPersonId, inviteePersonId, 'grandparent');
        await createRelationshipIfNotExists(supabase, familyGroupId, inviteePersonId, otherPersonId, 'grandchild');
      }

      // Share siblings (inviter's siblings become invitee's siblings)
      if (type === 'sibling' || (isA && type === 'sibling')) {
        if (otherPersonId !== inviteePersonId) {
          await createRelationshipIfNotExists(supabase, familyGroupId, inviteePersonId, otherPersonId, 'sibling');
          await createRelationshipIfNotExists(supabase, familyGroupId, otherPersonId, inviteePersonId, 'sibling');
        }
      }
    }
  }

  // Parent-child propagation
  if (relationType === 'parent' || relationType === 'child') {
    for (const rel of inviterRels) {
      const isA = rel.person_a_id === inviterPersonId;
      const otherPersonId = isA ? rel.person_b_id : rel.person_a_id;
      const type = rel.relationship_type as string;

      if (relationType === 'parent') {
        // Invitee is inviter's parent
        // Inviter's children are invitee's grandchildren
        if (isA && type === 'parent') {
          await createRelationshipIfNotExists(supabase, familyGroupId, inviteePersonId, otherPersonId, 'grandparent');
          await createRelationshipIfNotExists(supabase, familyGroupId, otherPersonId, inviteePersonId, 'grandchild');
        }
        // Inviter's siblings are invitee's children too
        if (type === 'sibling' && otherPersonId !== inviteePersonId) {
          await createRelationshipIfNotExists(supabase, familyGroupId, inviteePersonId, otherPersonId, 'parent');
          await createRelationshipIfNotExists(supabase, familyGroupId, otherPersonId, inviteePersonId, 'child');
        }
        // Inviter's spouse is invitee's child-in-law (skip for simplicity)
      }

      if (relationType === 'child') {
        // Invitee is inviter's child
        // Inviter's parents are invitee's grandparents
        if (isA && type === 'child') {
          await createRelationshipIfNotExists(supabase, familyGroupId, inviteePersonId, otherPersonId, 'grandchild');
          await createRelationshipIfNotExists(supabase, familyGroupId, otherPersonId, inviteePersonId, 'grandparent');
        }
        if (!isA && type === 'parent') {
          await createRelationshipIfNotExists(supabase, familyGroupId, otherPersonId, inviteePersonId, 'grandparent');
          await createRelationshipIfNotExists(supabase, familyGroupId, inviteePersonId, otherPersonId, 'grandchild');
        }
      }
    }
  }

  // Spouse propagation: spouse's children/parents become in-laws
  if (relationType === 'spouse') {
    for (const rel of inviterRels) {
      const isA = rel.person_a_id === inviterPersonId;
      const otherPersonId = isA ? rel.person_b_id : rel.person_a_id;
      const type = rel.relationship_type as string;

      // Inviter's children are also invitee's children (step or adopted)
      if ((isA && type === 'parent') || (!isA && type === 'child')) {
        await createRelationshipIfNotExists(supabase, familyGroupId, inviteePersonId, otherPersonId, 'parent');
        await createRelationshipIfNotExists(supabase, familyGroupId, otherPersonId, inviteePersonId, 'child');
      }
    }
  }
}

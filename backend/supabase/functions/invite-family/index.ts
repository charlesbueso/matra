// ============================================================
// Matra — Family Invitation Management
// ============================================================
// Premium users can create, list, and revoke family invitations.
// Each invitation generates a unique code for sharing.
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId, getServiceClient } from '../_shared/supabase.ts';
import { checkFeatureAccess } from '../_shared/feature-gate.ts';
import { encode as base64Encode } from 'https://deno.land/std@0.208.0/encoding/base64.ts';

/** Generate a URL-safe alphanumeric invite code (8 chars). */
function generateInviteCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return base64Encode(bytes)
    .replace(/[+/=]/g, '')
    .slice(0, 8)
    .toUpperCase();
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = await getAuthUserId(req);
    const supabase = getServiceClient();

    // ── Route by method ──
    if (req.method === 'GET') {
      return await handleList(supabase, userId);
    }

    const body = await req.json();
    const action = body.action as string;

    if (req.method === 'POST' && action === 'create') {
      return await handleCreate(supabase, userId, body);
    }
    if (req.method === 'POST' && action === 'revoke') {
      return await handleRevoke(supabase, userId, body);
    }

    return errorResponse('Invalid action', 'INVALID_ACTION', 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message === 'Unauthorized' ? 401 : 500;
    return errorResponse(message, 'INTERNAL_ERROR', status);
  }
});

// ── Create Invitation ──
async function handleCreate(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  body: Record<string, unknown>
) {
  // Gate: only premium users can invite
  const access = await checkFeatureAccess(userId, 'familySharing');
  if (!access.allowed) {
    return errorResponse(access.reason!, 'FEATURE_LOCKED', 403);
  }

  const familyGroupId = body.familyGroupId as string;
  const relationshipType = body.relationshipType as string;
  const inviteePersonId = (body.inviteePersonId as string) || null;

  if (!familyGroupId || !relationshipType) {
    return errorResponse('familyGroupId and relationshipType are required', 'MISSING_PARAMS', 400);
  }

  // Verify user is member of this family group
  const { data: membership } = await supabase
    .from('family_group_members')
    .select('role')
    .eq('family_group_id', familyGroupId)
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single();

  if (!membership) {
    return errorResponse('You are not a member of this family group', 'NOT_MEMBER', 403);
  }

  // Limit: max 10 pending invitations per group
  const { count } = await supabase
    .from('family_invitations')
    .select('id', { count: 'exact', head: true })
    .eq('family_group_id', familyGroupId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString());

  if ((count ?? 0) >= 10) {
    return errorResponse(
      'Maximum 10 pending invitations per family group',
      'INVITE_LIMIT',
      429
    );
  }

  // Generate unique code with retry
  let inviteCode = '';
  for (let i = 0; i < 5; i++) {
    const candidate = generateInviteCode();
    const { data: existing } = await supabase
      .from('family_invitations')
      .select('id')
      .eq('invite_code', candidate)
      .single();
    if (!existing) {
      inviteCode = candidate;
      break;
    }
  }
  if (!inviteCode) {
    return errorResponse('Failed to generate unique invite code', 'CODE_GEN_FAILED', 500);
  }

  const { data: invitation, error } = await supabase
    .from('family_invitations')
    .insert({
      family_group_id: familyGroupId,
      invited_by: userId,
      invite_code: inviteCode,
      relationship_type: relationshipType,
      invitee_person_id: inviteePersonId,
    })
    .select()
    .single();

  if (error) {
    return errorResponse(error.message, 'INSERT_FAILED', 500);
  }

  // Get inviter profile for display
  const { data: inviter } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .single();

  return jsonResponse({
    invitation,
    inviteLink: `matra://invite/${inviteCode}`,
    inviterName: inviter?.display_name ?? 'Someone',
  });
}

// ── List Invitations ──
async function handleList(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string
) {
  const { data: invitations, error } = await supabase
    .from('family_invitations')
    .select('*, profiles!family_invitations_accepted_by_fkey(display_name)')
    .eq('invited_by', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return errorResponse(error.message, 'QUERY_FAILED', 500);
  }

  return jsonResponse({ invitations: invitations ?? [] });
}

// ── Revoke Invitation ──
async function handleRevoke(
  supabase: ReturnType<typeof getServiceClient>,
  userId: string,
  body: Record<string, unknown>
) {
  const invitationId = body.invitationId as string;
  if (!invitationId) {
    return errorResponse('invitationId is required', 'MISSING_PARAMS', 400);
  }

  const { data, error } = await supabase
    .from('family_invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId)
    .eq('invited_by', userId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error || !data) {
    return errorResponse('Invitation not found or already used', 'NOT_FOUND', 404);
  }

  return jsonResponse({ invitation: data });
}

// ============================================================
// MATRA — Upload Person Avatar Edge Function
// ============================================================
// Accepts a person photo via multipart form data, uploads it
// to DigitalOcean Spaces (S3-compatible), and updates the
// person's avatar_url in the database.
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId, getServiceClient } from '../_shared/supabase.ts';
import { uploadToSpaces, deleteFromSpaces } from '../_shared/spaces.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = await getAuthUserId(req);
    const supabase = getServiceClient();

    // Parse multipart form data
    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;
    const personId = formData.get('personId') as string | null;

    if (!imageFile || !personId) {
      return errorResponse('Missing required fields: image, personId', 'MISSING_FIELDS', 400);
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(imageFile.type)) {
      return errorResponse('Invalid image type. Allowed: JPEG, PNG, WebP', 'INVALID_FILE_TYPE', 400);
    }

    // Validate file size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (imageFile.size > MAX_SIZE) {
      return errorResponse('Image too large. Maximum 5MB', 'FILE_TOO_LARGE', 400);
    }

    // Verify the person exists and user has access (include current avatar_url for cleanup)
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id, family_group_id, avatar_url')
      .eq('id', personId)
      .single();

    if (personError || !person) {
      return errorResponse('Person not found', 'NOT_FOUND', 404);
    }

    // Verify user is a member of the family group (editor+)
    const { data: membership } = await supabase
      .from('family_group_members')
      .select('role')
      .eq('family_group_id', person.family_group_id)
      .eq('user_id', userId)
      .not('accepted_at', 'is', null)
      .single();

    if (!membership || membership.role === 'viewer') {
      return errorResponse('Not authorized to update this person', 'UNAUTHORIZED', 403);
    }

    // Determine file extension from MIME type
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = extMap[imageFile.type] || 'jpg';

    // Delete old avatar from DO Spaces if it exists (and extension differs)
    if (person.avatar_url) {
      try {
        await deleteFromSpaces(person.avatar_url);
      } catch {
        // Non-fatal — old file may already be gone
      }
    }

    // Upload to DO Spaces (under matra/avatars/)
    const imageBytes = new Uint8Array(await imageFile.arrayBuffer());
    const avatarUrl = await uploadToSpaces(
      `avatars/${personId}.${ext}`,
      imageBytes,
      imageFile.type,
      { cacheBust: true },
    );

    // Update the person's avatar_url in the database
    const { error: updateError } = await supabase
      .from('people')
      .update({ avatar_url: avatarUrl })
      .eq('id', personId);

    if (updateError) {
      return errorResponse('Failed to update person record', 'DB_ERROR', 500, updateError);
    }

    return jsonResponse({ avatar_url: avatarUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('upload-person-avatar error:', message);
    return errorResponse(message, 'INTERNAL_ERROR', 500);
  }
});

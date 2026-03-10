// ============================================================
// Matra — Get Signed URLs Edge Function
// ============================================================
// Accepts an array of storage keys (or legacy CDN URLs) and
// returns time-limited presigned URLs for private DO Spaces
// objects. Requires authentication.
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId } from '../_shared/supabase.ts';
import { getPresignedUrl } from '../_shared/spaces.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Verify authentication
    await getAuthUserId(req);

    const { keys } = await req.json() as { keys: string[] };

    if (!Array.isArray(keys) || keys.length === 0) {
      return errorResponse('Missing or empty "keys" array', 'MISSING_KEYS', 400);
    }

    if (keys.length > 50) {
      return errorResponse('Maximum 50 keys per request', 'TOO_MANY_KEYS', 400);
    }

    // Generate presigned URLs for all keys in parallel
    const urls: Record<string, string> = {};
    await Promise.all(
      keys.map(async (key) => {
        try {
          urls[key] = await getPresignedUrl(key, 3600);
        } catch {
          // Skip keys that fail (e.g. deleted files)
        }
      }),
    );

    return jsonResponse({ urls });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'Unauthorized') {
      return errorResponse(message, 'UNAUTHORIZED', 401);
    }
    console.error('get-signed-urls error:', message);
    return errorResponse(message, 'INTERNAL_ERROR', 500);
  }
});

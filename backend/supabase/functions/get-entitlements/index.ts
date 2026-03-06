// ============================================================
// MATRA — User Entitlements Check
// ============================================================
// Quick endpoint for the frontend to check feature access.
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId } from '../_shared/supabase.ts';
import { getUserEntitlements } from '../_shared/feature-gate.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = await getAuthUserId(req);
    const entitlements = await getUserEntitlements(userId);
    return jsonResponse({
      tier: entitlements.tier,
      limits: entitlements.limits,
      usage: {
        interview_count: entitlements.interviewCount,
      },
      familySharingActive: entitlements.familySharingActive,
    });
  } catch (err) {
    return errorResponse(
      err.message || 'Internal server error',
      'INTERNAL_ERROR',
      err.message === 'Unauthorized' ? 401 : 500
    );
  }
});

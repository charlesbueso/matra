// ============================================================
// MATRA — Export Memory Book Edge Function
// ============================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { getAuthUserId, getServiceClient } from '../_shared/supabase.ts';
import { checkFeatureAccess } from '../_shared/feature-gate.ts';

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    const userId = await getAuthUserId(req);

    // Check premium access
    const access = await checkFeatureAccess(userId, 'memoryBookExport');
    if (!access.allowed) {
      return errorResponse(access.reason!, 'FEATURE_LOCKED', 403);
    }

    const { familyGroupId, config } = await req.json();
    if (!familyGroupId) {
      return errorResponse('Missing familyGroupId', 'MISSING_FIELDS', 400);
    }

    const supabase = getServiceClient();

    // Create export job
    const { data: exportRecord, error: exportError } = await supabase
      .from('exports')
      .insert({
        family_group_id: familyGroupId,
        requested_by: userId,
        export_type: 'memory_book',
        status: 'queued',
        config: config || {},
      })
      .select()
      .single();

    if (exportError) {
      return errorResponse('Failed to create export', 'DB_ERROR', 500, exportError);
    }

    // Create processing job for background generation
    await supabase.from('processing_jobs').insert({
      job_type: 'export',
      export_id: exportRecord.id,
      user_id: userId,
      payload: {
        exportId: exportRecord.id,
        familyGroupId,
        exportType: 'memory_book',
      },
    });

    return jsonResponse({
      exportId: exportRecord.id,
      status: 'queued',
      message: 'Your memory book is being generated. You will be notified when it is ready.',
    });
  } catch (err) {
    console.error('Export error:', err);
    return errorResponse(
      err.message || 'Internal server error',
      'INTERNAL_ERROR',
      err.message === 'Unauthorized' ? 401 : 500
    );
  }
});

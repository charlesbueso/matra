// ============================================================
// Matra — Supabase Client Factory
// ============================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

let anonClient: SupabaseClient | null = null;
let serviceClient: SupabaseClient | null = null;

/**
 * Get a Supabase client authenticated as the requesting user.
 * Uses the Authorization header JWT.
 */
export function getUserClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: { Authorization: authHeader },
      },
    }
  );
}

/**
 * Get a Supabase client with service role (bypasses RLS).
 * Use ONLY in Edge Functions for admin operations.
 */
export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
  }
  return serviceClient;
}

/**
 * Get the authenticated user's ID from the request.
 */
export async function getAuthUserId(req: Request): Promise<string> {
  const client = getUserClient(req);
  const { data: { user }, error } = await client.auth.getUser();

  if (error || !user) {
    throw new Error('Unauthorized');
  }

  return user.id;
}

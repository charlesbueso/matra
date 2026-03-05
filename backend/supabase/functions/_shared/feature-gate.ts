// ============================================================
// MATRA — Feature Gating
// ============================================================
// Server-side feature gate enforcement.
// NEVER trust client-side tier claims.
// ============================================================

import { getServiceClient } from './supabase.ts';
import { SubscriptionTier, FeatureLimits, TIER_LIMITS } from './types.ts';

export interface UserEntitlements {
  tier: SubscriptionTier;
  limits: FeatureLimits;
  interviewCount: number;
  storageUsedBytes: number;
}

/**
 * Get user's current subscription tier and limits.
 * Checks actual subscription status, not cached profile value.
 */
export async function getUserEntitlements(userId: string): Promise<UserEntitlements> {
  const supabase = getServiceClient();

  // Get profile with denormalized tier
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('subscription_tier, interview_count, storage_used_bytes')
    .eq('id', userId)
    .single();

  if (profileError || !profile) {
    throw new Error('User profile not found');
  }

  // Verify against active subscription (source of truth)
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('tier, status, expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let tier: SubscriptionTier = 'free';

  if (subscription) {
    // Check if subscription is still valid
    const isExpired = subscription.expires_at && 
      new Date(subscription.expires_at) < new Date();
    
    if (!isExpired) {
      tier = subscription.tier as SubscriptionTier;
    }
  }

  // Sync profile if tier drifted
  if (tier !== profile.subscription_tier) {
    await supabase
      .from('profiles')
      .update({ subscription_tier: tier })
      .eq('id', userId);
  }

  return {
    tier,
    limits: TIER_LIMITS[tier],
    interviewCount: profile.interview_count,
    storageUsedBytes: profile.storage_used_bytes,
  };
}

/**
 * Check if user can create a new interview.
 */
export async function canCreateInterview(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const entitlements = await getUserEntitlements(userId);

  if (entitlements.interviewCount >= entitlements.limits.maxInterviews) {
    return {
      allowed: false,
      reason: `Free tier limited to ${entitlements.limits.maxInterviews} interviews. Upgrade to Premium for unlimited interviews.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if a specific feature is available for the user.
 */
export async function checkFeatureAccess(
  userId: string,
  feature: keyof FeatureLimits
): Promise<{ allowed: boolean; reason?: string; tier: SubscriptionTier }> {
  const entitlements = await getUserEntitlements(userId);
  const value = entitlements.limits[feature];

  if (typeof value === 'boolean' && !value) {
    return {
      allowed: false,
      reason: `${feature} requires a Premium subscription.`,
      tier: entitlements.tier,
    };
  }

  return { allowed: true, tier: entitlements.tier };
}

/**
 * Check if user has enough storage.
 */
export async function checkStorageLimit(
  userId: string,
  additionalBytes: number
): Promise<{ allowed: boolean; reason?: string }> {
  const entitlements = await getUserEntitlements(userId);
  const totalAfter = entitlements.storageUsedBytes + additionalBytes;

  if (totalAfter > entitlements.limits.maxStorageBytes) {
    const limitMB = Math.round(entitlements.limits.maxStorageBytes / (1024 * 1024));
    return {
      allowed: false,
      reason: `Storage limit of ${limitMB} MB exceeded. Upgrade to Premium for more storage.`,
    };
  }

  return { allowed: true };
}

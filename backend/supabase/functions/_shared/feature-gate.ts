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
    .select('subscription_tier, interview_count')
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
  };
}

/**
 * Check if user can create a new interview.
 * Enforces total, monthly, and daily rate limits.
 */
export async function canCreateInterview(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const entitlements = await getUserEntitlements(userId);

  // Total limit (free tier)
  if (entitlements.interviewCount >= entitlements.limits.maxInterviews) {
    return {
      allowed: false,
      reason: `Free tier limited to ${entitlements.limits.maxInterviews} interviews. Upgrade to Premium for more.`,
    };
  }

  // Monthly and daily rate limits (premium only — free is capped by total limit above)
  if (entitlements.limits.maxInterviewsPerMonth < Infinity || entitlements.limits.maxInterviewsPerDay < Infinity) {
    const supabase = getServiceClient();
    const now = new Date();

    // Start of current calendar month (UTC)
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    // Start of current day (UTC)
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

    const [monthlyResult, dailyResult] = await Promise.all([
      supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', monthStart)
        .is('deleted_at', null),
      supabase
        .from('interviews')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', dayStart)
        .is('deleted_at', null),
    ]);

    const monthlyCount = monthlyResult.count ?? 0;
    const dailyCount = dailyResult.count ?? 0;

    if (monthlyCount >= entitlements.limits.maxInterviewsPerMonth) {
      return {
        allowed: false,
        reason: `You've reached your monthly limit of ${entitlements.limits.maxInterviewsPerMonth} interviews. Resets next month.`,
      };
    }

    if (dailyCount >= entitlements.limits.maxInterviewsPerDay) {
      return {
        allowed: false,
        reason: `You've reached your daily limit of ${entitlements.limits.maxInterviewsPerDay} interviews. Try again tomorrow.`,
      };
    }
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

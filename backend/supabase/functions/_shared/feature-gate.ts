// ============================================================
// MATRA — Feature Gating
// ============================================================
// Server-side feature gate enforcement.
// NEVER trust client-side tier claims.
// ============================================================

import { getServiceClient } from './supabase.ts';
import { SubscriptionTier, FeatureLimits, DowngradeInfo, TIER_LIMITS } from './types.ts';

export interface UserEntitlements {
  tier: SubscriptionTier;
  limits: FeatureLimits;
  interviewCount: number;
  /** True if user belongs to a family group owned by a premium user. */
  familySharingActive: boolean;
  /** Downgrade/grace-period state for lapsed premium users. */
  downgrade: DowngradeInfo;
}

/**
 * Get user's current subscription tier and limits.
 * Checks actual subscription status, not cached profile value.
 * Handles grace periods and billing retries gracefully.
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

  // Check for active or grace-period/billing-retry subscriptions
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('tier, status, expires_at, grace_period_ends_at, export_access_until')
    .eq('user_id', userId)
    .in('status', ['active', 'grace_period', 'billing_retry'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let tier: SubscriptionTier = 'free';
  const downgrade: DowngradeInfo = {
    isLapsed: false,
    inGracePeriod: false,
    gracePeriodEndsAt: null,
    exportAccessUntil: null,
  };

  if (subscription) {
    const now = new Date();

    if (subscription.status === 'active') {
      // Active subscription — check expiry
      const isExpired = subscription.expires_at &&
        new Date(subscription.expires_at) < now;

      if (!isExpired) {
        tier = subscription.tier as SubscriptionTier;
      }
    } else if (subscription.status === 'billing_retry') {
      // Payment failed but store is retrying — keep full access
      // Apple/Google retry for ~16 days; don't punish the user
      tier = subscription.tier as SubscriptionTier;
    } else if (subscription.status === 'grace_period') {
      const graceEnd = subscription.grace_period_ends_at
        ? new Date(subscription.grace_period_ends_at)
        : null;

      if (graceEnd && graceEnd > now) {
        // Still in grace period — full premium access
        tier = subscription.tier as SubscriptionTier;
        downgrade.inGracePeriod = true;
        downgrade.gracePeriodEndsAt = subscription.grace_period_ends_at;
      } else {
        // Grace period has expired — transition to free
        tier = 'free';
        downgrade.isLapsed = true;

        // Check if export access is still available
        const exportEnd = subscription.export_access_until
          ? new Date(subscription.export_access_until)
          : null;
        if (exportEnd && exportEnd > now) {
          downgrade.exportAccessUntil = subscription.export_access_until;
        }

        // Finalize the subscription record
        await supabase
          .from('subscriptions')
          .update({ status: 'expired' })
          .eq('user_id', userId)
          .eq('status', 'grace_period');
      }
    }
  } else {
    // No active/grace/retry subscription — check if they're a lapsed premium user
    const { data: expiredSub } = await supabase
      .from('subscriptions')
      .select('tier, export_access_until')
      .eq('user_id', userId)
      .eq('status', 'expired')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (expiredSub && expiredSub.tier === 'premium') {
      downgrade.isLapsed = true;
      const exportEnd = expiredSub.export_access_until
        ? new Date(expiredSub.export_access_until)
        : null;
      if (exportEnd && exportEnd > new Date()) {
        downgrade.exportAccessUntil = expiredSub.export_access_until;
      }
    }
  }

  // Build limits — lapsed users with export grace get export access on free tier
  let limits = { ...TIER_LIMITS[tier] };
  if (tier === 'free' && downgrade.exportAccessUntil) {
    limits = { ...limits, memoryBookExport: true };
  }

  // Sync profile if tier drifted
  if (tier !== profile.subscription_tier) {
    await supabase
      .from('profiles')
      .update({ subscription_tier: tier })
      .eq('id', userId);
  }

  // Check if user is part of a family group owned by a premium user
  let familySharingActive = false;
  if (tier === 'free') {
    const { data: memberships } = await supabase
      .from('family_group_members')
      .select('family_group_id')
      .eq('user_id', userId)
      .not('accepted_at', 'is', null);

    if (memberships && memberships.length > 0) {
      const groupIds = memberships.map((m: any) => m.family_group_id);
      // Check if any group has an owner who is premium
      for (const gid of groupIds) {
        const { data: owner } = await supabase
          .from('family_group_members')
          .select('user_id')
          .eq('family_group_id', gid)
          .eq('role', 'owner')
          .single();

        if (owner && owner.user_id !== userId) {
          const { data: ownerProfile } = await supabase
            .from('profiles')
            .select('subscription_tier')
            .eq('id', owner.user_id)
            .single();

          if (ownerProfile?.subscription_tier === 'premium') {
            familySharingActive = true;
            break;
          }
        }
      }
    }
  }

  return {
    tier,
    limits,
    interviewCount: profile.interview_count,
    familySharingActive,
    downgrade,
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
    const reason = entitlements.downgrade.isLapsed
      ? `Your previous interviews are safe! Re-subscribe to create new ones.`
      : `Free tier limited to ${entitlements.limits.maxInterviews} interviews. Upgrade to Premium for more.`;
    return { allowed: false, reason };
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

// ============================================================
// MATRA — Subscription Store (RevenueCat + Entitlements)
// ============================================================

import { create } from 'zustand';
import { supabase, invokeFunction } from '../services/supabase';
import type { SubscriptionTier, FeatureLimits } from '../types';

// Feature limits by tier (client-side mirror of server TIER_LIMITS)
export const TIER_LIMITS: Record<SubscriptionTier, FeatureLimits> = {
  free: {
    max_interviews: 5,
    max_audio_minutes: 10,
    max_family_members: 10,
    max_storage_mb: 100,
    can_export: false,
    can_generate_biography: false,
    can_generate_documentary: false,
    ai_summary: false,
  },
  premium: {
    max_interviews: -1,
    max_audio_minutes: 60,
    max_family_members: -1,
    max_storage_mb: 5_000,
    can_export: true,
    can_generate_biography: true,
    can_generate_documentary: true,
    ai_summary: true,
  },
};

interface SubscriptionState {
  tier: SubscriptionTier;
  limits: FeatureLimits;
  interviewCount: number;
  storageUsedMb: number;
  isLoading: boolean;
  /** True if user belongs to a premium user's family group. */
  familySharingActive: boolean;

  fetchEntitlements: () => Promise<void>;
  canPerform: (feature: keyof FeatureLimits) => boolean;
  isAtInterviewLimit: () => boolean;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  tier: 'free',
  limits: TIER_LIMITS.free,
  interviewCount: 0,
  storageUsedMb: 0,
  isLoading: false,
  familySharingActive: false,

  fetchEntitlements: async () => {
    set({ isLoading: true });
    try {
      const data = await invokeFunction<{
        tier: SubscriptionTier;
        limits: FeatureLimits;
        usage: { interview_count: number; storage_used_mb: number };
        familySharingActive?: boolean;
      }>('get-entitlements');

      set({
        tier: data.tier,
        limits: data.limits,
        interviewCount: data.usage.interview_count,
        storageUsedMb: data.usage.storage_used_mb,
        familySharingActive: data.familySharingActive ?? false,
      });
    } catch {
      // Fallback to free tier on error
      set({ tier: 'free', limits: TIER_LIMITS.free });
    } finally {
      set({ isLoading: false });
    }
  },

  canPerform: (feature) => {
    const { limits } = get();
    return Boolean(limits[feature]);
  },

  isAtInterviewLimit: () => {
    const { limits, interviewCount } = get();
    if (limits.max_interviews === -1) return false;
    return interviewCount >= limits.max_interviews;
  },
}));

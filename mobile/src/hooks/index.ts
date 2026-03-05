// ============================================================
// MATRA — Custom Hooks
// ============================================================

import { useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '../stores/authStore';
import { useFamilyStore } from '../stores/familyStore';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { supabase } from '../services/supabase';

// ----- useAppReady -----
// Orchestrates app initialization: auth → profile → family → entitlements
export function useAppReady() {
  const initialize = useAuthStore((s) => s.initialize);
  const profile = useAuthStore((s) => s.profile);
  const loadFamilyGroups = useFamilyStore((s) => s.fetchFamilyGroups);
  const fetchEntitlements = useSubscriptionStore((s) => s.fetchEntitlements);

  useEffect(() => {
    initialize();
  }, []);

  // Once we have a profile, load family data + entitlements in parallel
  useEffect(() => {
    if (profile) {
      Promise.all([loadFamilyGroups(), fetchEntitlements()]);
    }
  }, [profile?.id]);

  return { isReady: !!profile, profile };
}

// ----- useRealtimeInterviews -----
// Subscribe to interview status changes via Supabase Realtime
export function useRealtimeInterviews(familyGroupId?: string) {
  const loadInterviews = useFamilyStore((s) => s.fetchInterviews);

  useEffect(() => {
    if (!familyGroupId) return;

    const channel = supabase
      .channel(`interviews:${familyGroupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'interviews',
          filter: `family_group_id=eq.${familyGroupId}`,
        },
        () => {
          // Reload interviews when any change occurs
          loadInterviews();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [familyGroupId]);
}

// ----- useRealtimeStories -----
export function useRealtimeStories(familyGroupId?: string) {
  const loadStories = useFamilyStore((s) => s.fetchStories);

  useEffect(() => {
    if (!familyGroupId) return;

    const channel = supabase
      .channel(`stories:${familyGroupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stories',
          filter: `family_group_id=eq.${familyGroupId}`,
        },
        () => loadStories()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [familyGroupId]);
}

// ----- useAppForeground -----
// Run callback when app returns to foreground (e.g. re-fetch entitlements)
export function useAppForeground(callback: () => void) {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        callback();
      }
      appState.current = next;
    });

    return () => sub.remove();
  }, [callback]);
}

// ----- usePaywall -----
// Convenience hook for subscription gating
export function usePaywall() {
  const tier = useSubscriptionStore((s) => s.tier);
  const limits = useSubscriptionStore((s) => s.limits);
  const canPerform = useSubscriptionStore((s) => s.canPerform);
  const isAtInterviewLimit = useSubscriptionStore((s) => s.isAtInterviewLimit);

  const isPremium = tier === 'premium' || tier === 'lifetime';

  return {
    tier,
    limits,
    isPremium,
    canPerform,
    isAtInterviewLimit,
  };
}

// ----- useDebounce -----
export function useDebounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), ms);
    },
    [fn, ms]
  ) as T;

  return debounced;
}

// ============================================================
// MATRA — Auth Store (Zustand)
// ============================================================

import { create } from 'zustand';
import { supabase, invokeFunction } from '../services/supabase';
import { clearSignedUrlCache } from '../services/signedUrl';
import { changeLanguage, getCurrentLanguage, type LanguageCode } from '../i18n';
import type { Session, User } from '@supabase/supabase-js';

interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  onboarding_completed: boolean;
  subscription_tier: 'free' | 'premium';
  interview_count: number;
  storage_used_bytes: number;
  self_person_id: string | null;
  deactivated_at: string | null;
  preferences: { language?: LanguageCode; [key: string]: any };
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isInitialized: boolean;
  pendingPasswordRecovery: boolean;

  initialize: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  deleteAccount: () => Promise<void>;
  deactivateAccount: () => Promise<void>;
  reactivateAccount: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  setLanguage: (lang: LanguageCode) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isLoading: false,
  isInitialized: false,
  pendingPasswordRecovery: false,

  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        // Validate the session JWT with the server — clears stale tokens after DB resets
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) {
          await supabase.auth.signOut();
        } else {
          set({ session, user });
          await get().fetchProfile();
        }
      }
      
      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        set({ session, user: session?.user ?? null });

        if (event === 'PASSWORD_RECOVERY') {
          set({ pendingPasswordRecovery: true });
        }
        
        if (session) {
          await get().fetchProfile();
        } else {
          set({ profile: null });
        }
      });
    } finally {
      set({ isInitialized: true });
    }
  },

  signUp: async (email, password, displayName) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: displayName },
        },
      });
      if (error) throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true });
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    clearSignedUrlCache();
    set({ session: null, user: null, profile: null });
  },

  fetchProfile: async () => {
    const user = get().user;
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!error && data) {
      const profile = data as Profile;
      if (!profile.preferences) profile.preferences = {};
      set({ profile });
      // Sync i18n language from stored preference
      if (profile.preferences.language) {
        changeLanguage(profile.preferences.language);
      }
    }
  },

  updateProfile: async (updates) => {
    const user = get().user;
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (!error) {
      set((state) => ({
        profile: state.profile ? { ...state.profile, ...updates } : null,
      }));
    }
  },

  deleteAccount: async () => {
    await invokeFunction('delete-account');
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  },

  deactivateAccount: async () => {
    await invokeFunction('deactivate-account', { action: 'deactivate' });
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null });
  },

  reactivateAccount: async () => {
    await invokeFunction('deactivate-account', { action: 'reactivate' });
    await get().fetchProfile();
  },

  resetPassword: async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'matra://reset-password',
    });
    if (error) throw error;
  },

  updatePassword: async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    set({ pendingPasswordRecovery: false });
  },

  setLanguage: async (lang: LanguageCode) => {
    changeLanguage(lang);
    const user = get().user;
    const profile = get().profile;
    if (!user || !profile) return;
    const newPrefs = { ...(profile.preferences || {}), language: lang };
    const { error } = await supabase
      .from('profiles')
      .update({ preferences: newPrefs })
      .eq('id', user.id);
    if (!error) {
      set({ profile: { ...profile, preferences: newPrefs } });
    }
  },
}));

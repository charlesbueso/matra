// ============================================================
// MATRA — Supabase Client (Frontend)
// ============================================================

import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Derive the Supabase URL from the Metro bundler host so it works on
// both emulators (10.0.2.2) and physical devices (LAN IP).
// hostUri is available whenever the app is loaded from a Metro dev server,
// regardless of the --no-dev flag.
function getSupabaseUrl(): string {
  const configured = Constants.expoConfig?.extra?.supabaseUrl || '';

  const debuggerHost = Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;
  if (debuggerHost) {
    let host = debuggerHost.split(':')[0]; // strip port
    // Android emulator (not physical device) can't reach host via localhost;
    // use the special 10.0.2.2 alias. On physical devices localhost is routed
    // through adb reverse, so keep it as-is.
    const isEmulator = Platform.OS === 'android' && !Constants.isDevice;
    if (isEmulator && (host === 'localhost' || host === '127.0.0.1')) {
      host = '10.0.2.2';
    }
    return `http://${host}:54321`;
  }
  return configured;
}

const supabaseUrl = getSupabaseUrl();
console.log('[Supabase] URL:', supabaseUrl);
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || '';

// Secure storage adapter for Supabase auth tokens
const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ── Edge Function helpers ──

export async function invokeFunction<T = unknown>(
  name: string,
  body?: unknown,
  options?: { formData?: FormData }
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };

  let fetchBody: BodyInit | undefined;

  if (options?.formData) {
    fetchBody = options.formData;
    // Don't set Content-Type for FormData — browser sets it with boundary
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/${name}`,
    {
      method: 'POST',
      headers,
      body: fetchBody,
    }
  );

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error?.message || 'Request failed');
  }

  return result.data as T;
}

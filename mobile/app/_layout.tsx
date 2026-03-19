// ============================================================
// Matra — Root Layout
// ============================================================

import React, { useEffect, useState } from 'react';
import { Alert, ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import {
  SpaceGrotesk_700Bold,
  SpaceGrotesk_500Medium,
} from '@expo-google-fonts/space-grotesk';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Purchases from 'react-native-purchases';
import * as Sentry from '@sentry/react-native';
import { ThemeProvider } from '../src/theme';
import { useAuthStore } from '../src/stores/authStore';
import { useSubscriptionStore } from '../src/stores/subscriptionStore';
import { useNotificationStore } from '../src/stores/notificationStore';
import AnimatedSplash from '../src/components/AnimatedSplash';
import { supabase } from '../src/services/supabase';
import { configurePurchases, isPremiumActive } from '../src/services/purchases';
import { initAnalytics, identifyUser, resetUser, trackScreen, flushAnalytics } from '../src/services/analytics';
import { Colors } from '../src/theme/tokens';
import '../src/i18n'; // Initialize i18n

SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const pendingPasswordRecovery = useAuthStore((s) => s.pendingPasswordRecovery);
  const reactivateAccount = useAuthStore((s) => s.reactivateAccount);
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const { t } = useTranslation();

  const [splashDone, setSplashDone] = useState(false);

  const [fontsLoaded] = useFonts({
    'SpaceGrotesk-Bold': SpaceGrotesk_700Bold,
    'SpaceGrotesk-Medium': SpaceGrotesk_500Medium,
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
  });

  useEffect(() => {
    initAnalytics();
    initialize();
    useNotificationStore.getState().requestPermissions();
    useNotificationStore.getState().scheduleInactivityNudges();
    configurePurchases();
  }, []);

  // Handle notification taps — navigate to relevant screen
  useEffect(() => {
    let sub: { remove: () => void } | null = null;
    (async () => {
      try {
        const Notif = await import('expo-notifications');
        sub = Notif.addNotificationResponseReceivedListener((response) => {
          const route = response.notification.request.content.data?.route as string | undefined;
          if (route) {
            router.push(route as any);
          } else {
            // Default: go home
            router.push('/(tabs)/home');
          }
        });
      } catch {
        // expo-notifications unavailable
      }
    })();
    return () => sub?.remove();
  }, []);

  // Identify / reset user in analytics when auth changes
  useEffect(() => {
    if (session?.user?.id && profile) {
      identifyUser(session.user.id, {
        email: session.user.email,
        subscription_tier: profile.subscription_tier,
        interview_count: profile.interview_count,
        onboarding_completed: profile.onboarding_completed,
      });
    } else if (!session) {
      resetUser();
    }
  }, [session?.user?.id, profile?.subscription_tier]);

  // Track screen views when navigation segments change
  useEffect(() => {
    if (segments.length > 0) {
      trackScreen(segments.join('/'));
    }
  }, [segments.join('/')]);

  // Sync RevenueCat user when auth session changes
  useEffect(() => {
    const syncPurchaseUser = useSubscriptionStore.getState().syncPurchaseUser;
    const clearPurchaseUser = useSubscriptionStore.getState().clearPurchaseUser;

    if (session?.user?.id) {
      syncPurchaseUser(session.user.id);
    } else {
      clearPurchaseUser();
    }
  }, [session?.user?.id]);

  // Listen for real-time purchase/subscription changes from RevenueCat
  useEffect(() => {
    const listener = (info: any) => {
      const premium = isPremiumActive(info);
      useSubscriptionStore.getState().applyCustomerInfo(premium);
      // Also re-fetch server entitlements to sync usage counters
      useSubscriptionStore.getState().fetchEntitlements();
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => Purchases.removeCustomerInfoUpdateListener(listener);
  }, []);

  // Hide the native splash as soon as assets are ready — the AnimatedSplash overlay takes over
  useEffect(() => {
    if (fontsLoaded && isInitialized) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isInitialized]);

  // Navigate based on auth state changes
  useEffect(() => {
    if (!isInitialized) return;
    if (!navigationState?.key) return; // navigator not yet mounted

    const inAuthGroup = segments[0] === '(auth)';
    const inPublicPage = segments[0] === 'terms-of-service' || segments[0] === 'privacy-policy';

    if (!session && !inAuthGroup && !inPublicPage) {
      // Signed out but not on auth screen → redirect to welcome
      router.replace('/(auth)/welcome');
    } else if (session && inAuthGroup && !pendingPasswordRecovery) {
      // Signed in but still on auth screen → redirect to app
      router.replace('/(tabs)/home');
    }
  }, [session, isInitialized, segments, navigationState?.key, pendingPasswordRecovery]);

  // Navigate to reset-password screen when a recovery event is detected
  useEffect(() => {
    if (!isInitialized || !navigationState?.key) return;
    if (pendingPasswordRecovery && session) {
      router.push('/(auth)/reset-password');
    }
  }, [pendingPasswordRecovery, session, isInitialized, navigationState?.key]);

  // Handle deep links (invitations + password recovery)
  useEffect(() => {
    if (!isInitialized || !navigationState?.key) return;

    const handleUrl = (event: { url: string }) => {
      const parsed = Linking.parse(event.url);

      // Family invitations: matra://invite/{code}
      if (parsed.hostname === 'invite' || parsed.path?.startsWith('invite/')) {
        const code = parsed.path?.replace('invite/', '') || parsed.queryParams?.code;
        if (code) {
          router.push(`/accept-invite?code=${encodeURIComponent(String(code))}`);
        }
        return;
      }

      // Password recovery: matra://reset-password (Supabase redirects here after email link)
      if (parsed.hostname === 'reset-password' || parsed.path?.startsWith('reset-password')) {
        router.push('/(auth)/reset-password');
        return;
      }

      // Email confirmation: matra://login (Supabase redirects here after email verify)
      // Supabase appends session tokens as URL fragments: #access_token=...&refresh_token=...
      if (parsed.hostname === 'login' || parsed.path?.startsWith('login')) {
        const fragment = event.url.split('#')[1];
        const hashParams = fragment ? new URLSearchParams(fragment) : null;
        const accessToken = hashParams?.get('access_token') || (parsed.queryParams?.access_token as string);
        const refreshToken = hashParams?.get('refresh_token') || (parsed.queryParams?.refresh_token as string);

        if (accessToken && refreshToken) {
          // Auto sign-in with the tokens from the email confirmation redirect
          supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        } else if (!session) {
          router.replace('/(auth)/sign-in');
        }
        return;
      }

      // Email change confirmation: matra://email-changed
      if (parsed.hostname === 'email-changed' || parsed.path?.startsWith('email-changed')) {
        // Force refresh user/session to pick up the new email immediately
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) {
            useAuthStore.getState().fetchProfile();
          }
        });
        Alert.alert(
          t('settings.changeEmailSent'),
          t('settings.emailChangedSuccess'),
        );
      }
    };

    // Handle URL if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });

    // Listen for deep links while app is open
    const subscription = Linking.addEventListener('url', handleUrl);
    return () => subscription.remove();
  }, [isInitialized, navigationState?.key]);

  const [isReactivating, setIsReactivating] = useState(false);

  // Prompt reactivation when a deactivated user signs in
  useEffect(() => {
    if (!session || !profile?.deactivated_at || isReactivating) return;

    const showReactivationPrompt = () => {
      Alert.alert(
        t('layout.accountDeactivatedTitle'),
        t('layout.accountDeactivatedMessage'),
        [
          {
            text: t('common.signOut'),
            style: 'cancel',
            onPress: () => signOut(),
          },
          {
            text: t('layout.reactivate'),
            onPress: async () => {
              setIsReactivating(true);
              try {
                await reactivateAccount();
              } catch (err: any) {
                Alert.alert(
                  t('common.error'),
                  t('layout.reactivationFailed'),
                  [
                    { text: t('common.signOut'), style: 'cancel', onPress: () => signOut() },
                    { text: t('layout.tryAgain'), onPress: () => showReactivationPrompt() },
                  ],
                  { cancelable: false },
                );
              } finally {
                setIsReactivating(false);
              }
            },
          },
        ],
        { cancelable: false },
      );
    };

    showReactivationPrompt();
  }, [session, profile?.deactivated_at]);

  if (!fontsLoaded || !isInitialized) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <StatusBar style="dark" />
        {!splashDone && (
          <AnimatedSplash onFinish={() => setSplashDone(true)} />
        )}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background.void },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="(onboarding)" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="interview/[id]"
            options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }}
          />
          <Stack.Screen
            name="paywall"
            options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
          />
          <Stack.Screen name="person/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="story/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="privacy-policy" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="terms-of-service" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="about" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="family-group" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="invite-family" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen
            name="accept-invite"
            options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }}
          />
        </Stack>
        {isReactivating && (
          <View style={reactivationStyles.overlay}>
            <View style={reactivationStyles.card}>
              <ActivityIndicator size="large" color={Colors.accent.cyan} />
              <Text style={reactivationStyles.text}>{t('layout.reactivating')}</Text>
            </View>
          </View>
        )}
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(RootLayout);

const reactivationStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    backgroundColor: Colors.background.cream,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
  },
  text: {
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    color: Colors.text.primary,
  },
});

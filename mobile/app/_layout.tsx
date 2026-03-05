// ============================================================
// MATRA — Root Layout
// ============================================================

import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments, useRootNavigationState } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
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
import { ThemeProvider } from '../src/theme';
import { useAuthStore } from '../src/stores/authStore';
import { useNotificationStore } from '../src/stores/notificationStore';
import { Colors } from '../src/theme/tokens';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const reactivateAccount = useAuthStore((s) => s.reactivateAccount);
  const signOut = useAuthStore((s) => s.signOut);
  const router = useRouter();
  const segments = useSegments();
  const navigationState = useRootNavigationState();

  const [fontsLoaded] = useFonts({
    'SpaceGrotesk-Bold': SpaceGrotesk_700Bold,
    'SpaceGrotesk-Medium': SpaceGrotesk_500Medium,
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
  });

  useEffect(() => {
    initialize();
    useNotificationStore.getState().requestPermissions();
  }, []);

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

    if (!session && !inAuthGroup) {
      // Signed out but not on auth screen → redirect to welcome
      router.replace('/(auth)/welcome');
    } else if (session && inAuthGroup) {
      // Signed in but still on auth screen → redirect to app
      router.replace('/(tabs)/home');
    }
  }, [session, isInitialized, segments, navigationState?.key]);

  // Prompt reactivation when a deactivated user signs in
  useEffect(() => {
    if (!session || !profile?.deactivated_at) return;
    Alert.alert(
      'Account Deactivated',
      'Your account was deactivated. Would you like to reactivate it and restore your data?',
      [
        {
          text: 'Sign Out',
          style: 'cancel',
          onPress: () => signOut(),
        },
        {
          text: 'Reactivate',
          onPress: async () => {
            try {
              await reactivateAccount();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ],
      { cancelable: false }
    );
  }, [session, profile?.deactivated_at]);

  if (!fontsLoaded || !isInitialized) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <StatusBar style="dark" />
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
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

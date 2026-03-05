// ============================================================
// MATRA — Entry Point (Router Redirect)
// ============================================================

import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';

export default function Index() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);

  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (profile && !profile.onboarding_completed) {
    return <Redirect href="/(onboarding)" />;
  }

  return <Redirect href="/(tabs)/home" />;
}

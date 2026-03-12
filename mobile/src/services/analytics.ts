// ============================================================
// MATRA — Analytics & Error Tracking
// PostHog (product analytics) + Sentry (error tracking)
// ============================================================

import PostHog from 'posthog-react-native';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

// ── Configuration ──────────────────────────────────────────
// Set these in app.json > extra (or use EAS secrets for production)
const POSTHOG_API_KEY = Constants.expoConfig?.extra?.posthogApiKey ?? '';
const POSTHOG_HOST = Constants.expoConfig?.extra?.posthogHost ?? 'https://us.i.posthog.com';
const SENTRY_DSN = Constants.expoConfig?.extra?.sentryDsn ?? '';

let posthog: PostHog | null = null;

// ── Initialization ─────────────────────────────────────────

export function initAnalytics() {
  // Skip analytics in local development to keep dashboards clean.
  // Events will only be sent in EAS builds (preview / production).
  // if (__DEV__) return; // ← Temporarily disabled for dashboard testing

  // PostHog
  if (POSTHOG_API_KEY) {
    posthog = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      enableSessionReplay: false, // enable later if needed
    });
  }

  // Sentry
  if (SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 0.2, // 20% of transactions for performance monitoring
      enableAutoPerformanceTracing: true,
      enableNativeFramesTracking: true,
    });
  }
}

// ── User Identification ────────────────────────────────────

export function identifyUser(userId: string, traits?: Record<string, any>) {
  posthog?.identify(userId, traits);
  Sentry.setUser({ id: userId, ...traits });
}

export function resetUser() {
  posthog?.reset();
  Sentry.setUser(null);
}

export function setUserProperties(properties: Record<string, any>) {
  posthog?.identify(undefined, properties);
}

// ── Event Tracking ─────────────────────────────────────────

export function trackEvent(event: string, properties?: Record<string, any>) {
  posthog?.capture(event, properties);
}

// ── Screen Tracking ────────────────────────────────────────

export function trackScreen(screenName: string, properties?: Record<string, any>) {
  posthog?.screen(screenName, properties);
}

// ── Error Tracking ─────────────────────────────────────────

export function captureError(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.captureMessage(message, level);
}

export function addBreadcrumb(category: string, message: string, data?: Record<string, any>) {
  Sentry.addBreadcrumb({ category, message, data, level: 'info' });
}

// ── Flush (call on app background) ─────────────────────────

export async function flushAnalytics() {
  await posthog?.flush();
}

// ── Pre-defined Event Helpers ──────────────────────────────
// Consistent event names across the app

export const AnalyticsEvents = {
  // Auth
  SIGN_UP: 'sign_up',
  SIGN_IN: 'sign_in',
  SIGN_OUT: 'sign_out',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  ACCOUNT_DELETED: 'account_deleted',
  ACCOUNT_DEACTIVATED: 'account_deactivated',
  ACCOUNT_REACTIVATED: 'account_reactivated',

  // Onboarding
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_COMPLETED: 'onboarding_completed',

  // Recording / Interviews
  RECORDING_STARTED: 'recording_started',
  RECORDING_STOPPED: 'recording_stopped',
  INTERVIEW_PROCESSING_STARTED: 'interview_processing_started',
  INTERVIEW_PROCESSING_COMPLETED: 'interview_processing_completed',
  INTERVIEW_PROCESSING_FAILED: 'interview_processing_failed',
  INTERVIEW_DELETED: 'interview_deleted',

  // Stories
  STORY_VIEWED: 'story_viewed',
  BIOGRAPHY_GENERATED: 'biography_generated',

  // Family tree
  PERSON_ADDED: 'person_added',
  PERSON_VIEWED: 'person_viewed',
  RELATIONSHIP_ADDED: 'relationship_added',
  AVATAR_UPLOADED: 'avatar_uploaded',

  // Family sharing
  INVITATION_SENT: 'invitation_sent',
  INVITATION_ACCEPTED: 'invitation_accepted',

  // Subscription
  PAYWALL_VIEWED: 'paywall_viewed',
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',

  // Export
  DATA_EXPORTED: 'data_exported',
  MEMORY_BOOK_EXPORTED: 'memory_book_exported',

  // Settings
  LANGUAGE_CHANGED: 'language_changed',
} as const;

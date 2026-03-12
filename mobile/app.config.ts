import { ExpoConfig, ConfigContext } from 'expo/config';

const IS_DEV = process.env.APP_ENV === 'development' || !process.env.APP_ENV;

// ── Supabase ──────────────────────────────────────────────────────────────────
const SUPABASE_URL_DEV = 'http://10.0.2.2:54321';
const SUPABASE_ANON_KEY_DEV = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const SUPABASE_URL_PROD = 'https://kuqhbkovpakmrmyrwtud.supabase.co';
const SUPABASE_ANON_KEY_PROD = 'sb_publishable_jANsZSzMCNx1nKwa5tjbXQ_apQTBedu';

// ── RevenueCat ────────────────────────────────────────────────────────────────
// Public API keys (not secret sk_ keys). Production keys are set up after store publishing.
const REVENUECAT_IOS_KEY = 'test_bmWiLIcOcpPxCGzNauOeQftXnaJ';
const REVENUECAT_ANDROID_KEY = 'test_bmWiLIcOcpPxCGzNauOeQftXnaJ';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []).filter(
      (p) => !(typeof p === 'string' ? p : p[0]).toString().includes('sentry')
    ),
    [
      '@sentry/react-native/expo',
      {
        organization: 'mobile-apps-99',
        project: 'matra-app',
      },
    ],
  ],
  extra: {
    eas: {
      projectId: 'a476bd24-8a1d-4cd4-8406-8092f812b9e1',
    },
    supabaseUrl: IS_DEV ? SUPABASE_URL_DEV : SUPABASE_URL_PROD,
    supabaseAnonKey: IS_DEV ? SUPABASE_ANON_KEY_DEV : SUPABASE_ANON_KEY_PROD,
    revenueCatApiKeyIos: REVENUECAT_IOS_KEY,
    revenueCatApiKeyAndroid: REVENUECAT_ANDROID_KEY,
    posthogApiKey: 'phc_AGRWKlaTN8wVMWYH3eAg4xDsEmJhO4ZwLadWIW4Akwn',
    posthogHost: 'https://us.i.posthog.com',
    sentryDsn: 'https://5b79a6e81fec8e1aeca5a59c9b4927ed@o4510999365287936.ingest.us.sentry.io/4510999396417536',
  },
});

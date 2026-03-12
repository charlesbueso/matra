// ============================================================
// MATRA — i18n Configuration
// ============================================================

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import en from './en.json';
import es from './es.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

// Detect the device locale and map to a supported language
function getDefaultLanguage(): LanguageCode {
  const locale = Localization.getLocales()[0]?.languageCode ?? 'en';
  if (locale.startsWith('es')) return 'es';
  return 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: getDefaultLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  // Pluralization: i18next v4 uses _one/_other suffixes
});

export default i18n;

/**
 * Change the app language at runtime.
 * Call this when the user picks a language in onboarding or settings.
 */
export function changeLanguage(lang: LanguageCode) {
  i18n.changeLanguage(lang);
}

/**
 * Get the current language code.
 */
export function getCurrentLanguage(): LanguageCode {
  return (i18n.language as LanguageCode) || 'en';
}

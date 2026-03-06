// ============================================================
// MATRA — Input Validation Utilities
// ============================================================

import i18next from 'i18next';

const t = (key: string, options?: Record<string, unknown>) => i18next.t(key, options) as string;

/** RFC 5322–inspired email regex — covers 99.9% of valid addresses */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Minimum password requirements for production apps */
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const NAME_MIN_LENGTH = 1;
const NAME_MAX_LENGTH = 100;

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  suggestions: string[];
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return t('validation.emailRequired');
  if (!EMAIL_REGEX.test(trimmed)) return t('validation.emailInvalid');
  if (trimmed.length > 254) return t('validation.emailTooLong');
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return t('validation.passwordRequired');
  if (password.length < PASSWORD_MIN_LENGTH)
    return t('validation.passwordMinLength', { min: PASSWORD_MIN_LENGTH });
  if (password.length > PASSWORD_MAX_LENGTH)
    return t('validation.passwordMaxLength', { max: PASSWORD_MAX_LENGTH });
  if (!/[A-Z]/.test(password))
    return t('validation.passwordUppercase');
  if (!/[a-z]/.test(password))
    return t('validation.passwordLowercase');
  if (!/[0-9]/.test(password))
    return t('validation.passwordNumber');
  if (!/[^A-Za-z0-9]/.test(password))
    return t('validation.passwordSpecial');
  return null;
}

export function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return t('validation.confirmPasswordRequired');
  if (password !== confirm) return t('validation.passwordsMismatch');
  return null;
}

export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return t('validation.nameRequired');
  if (trimmed.length < NAME_MIN_LENGTH) return t('validation.nameTooShort');
  if (trimmed.length > NAME_MAX_LENGTH) return t('validation.nameTooLong', { max: NAME_MAX_LENGTH });
  return null;
}

export function getPasswordStrength(password: string): PasswordStrength {
  const suggestions: string[] = [];
  let score = 0;

  if (password.length >= PASSWORD_MIN_LENGTH) score++;
  else suggestions.push(t('validation.passwordSuggestion8Chars', { min: PASSWORD_MIN_LENGTH }));

  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  else suggestions.push(t('validation.passwordSuggestionCase'));

  if (/[0-9]/.test(password)) score++;
  else suggestions.push(t('validation.passwordSuggestionNumber'));

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else suggestions.push(t('validation.passwordSuggestionSpecial'));

  const labels = [
    t('validation.passwordTooWeak'),
    t('validation.passwordWeak'),
    t('validation.passwordFair'),
    t('validation.passwordStrong'),
    t('validation.passwordVeryStrong'),
  ];

  return { score: score as PasswordStrength['score'], label: labels[score], suggestions };
}

/** Sanitize user input — trim and collapse internal whitespace */
export function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Map Supabase auth error codes to user-friendly messages */
export function friendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials'))
    return 'Incorrect email or password. Please try again.';
  if (lower.includes('email not confirmed'))
    return 'Please check your inbox and confirm your email before signing in.';
  if (lower.includes('user already registered') || lower.includes('already been registered'))
    return 'An account with this email already exists. Try signing in instead.';
  if (lower.includes('signup is disabled'))
    return 'New sign-ups are temporarily disabled. Please try again later.';
  if (lower.includes('rate limit') || lower.includes('too many requests'))
    return 'Too many attempts. Please wait a moment and try again.';
  if (lower.includes('network') || lower.includes('fetch'))
    return 'Network error. Please check your connection and try again.';
  if (lower.includes('weak password'))
    return 'Password is too weak. Please use a stronger password.';
  if (lower.includes('email rate limit'))
    return 'Too many emails sent. Please wait before trying again.';
  return message;
}

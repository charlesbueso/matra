// ============================================================
// Matra — Sign Up Screen (Production)
// ============================================================

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { StarField, Button, BioAlgae, CornerBush } from '../../src/components/ui';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/tokens';
import {
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  validateDisplayName,
  sanitizeName,
  friendlyAuthError,
} from '../../src/utils/validation';

// ── Password requirement row ──
function PasswordRequirement({ label, met }: { label: string; met: boolean }) {
  return (
    <View style={reqStyles.row}>
      <Text style={[reqStyles.icon, met && reqStyles.iconMet]}>
        {met ? '✓' : '○'}
      </Text>
      <Text style={[reqStyles.label, met && reqStyles.labelMet]}>{label}</Text>
    </View>
  );
}

const reqStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  icon: {
    fontSize: 14,
    width: 18,
    textAlign: 'center',
    color: Colors.text.twilight,
    fontWeight: '700',
  },
  iconMet: {
    color: Colors.semantic.success,
  },
  label: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
  },
  labelMet: {
    color: Colors.semantic.success,
  },
});

export default function SignUpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signUp, isLoading } = useAuthStore();

  // ── Form state ──
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // ── Field-level errors (shown on blur / submit) ──
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // ── Refs for field focusing ──
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  // ── Validate a single field ──
  const validateField = useCallback(
    (field: string, value?: string) => {
      let error: string | null = null;
      switch (field) {
        case 'name':
          error = validateDisplayName(value ?? name);
          break;
        case 'email':
          error = validateEmail(value ?? email);
          break;
        case 'password':
          error = validatePassword(value ?? password);
          break;
        case 'confirm':
          error = validateConfirmPassword(
            value !== undefined ? value : password,
            value !== undefined ? confirmPassword : confirmPassword,
          );
          // Special: when called for confirm, use current values
          error = validateConfirmPassword(password, value ?? confirmPassword);
          break;
      }
      setErrors((prev) => ({ ...prev, [field]: error }));
      return error;
    },
    [name, email, password, confirmPassword],
  );

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    validateField(field);
  };

  // ── Full-form validation ──
  const validateAll = (): boolean => {
    const nameErr = validateDisplayName(name);
    const emailErr = validateEmail(email);
    const passErr = validatePassword(password);
    const confirmErr = validateConfirmPassword(password, confirmPassword);

    const newErrors = {
      name: nameErr,
      email: emailErr,
      password: passErr,
      confirm: confirmErr,
    };
    setErrors(newErrors);
    setTouched({ name: true, email: true, password: true, confirm: true });

    return !nameErr && !emailErr && !passErr && !confirmErr;
  };

  // ── Submit ──
  const handleSignUp = async () => {
    Keyboard.dismiss();

    if (!validateAll()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (!agreedToTerms) {
      Alert.alert(
        t('auth.termsRequired'),
        t('auth.termsRequiredMessage'),
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    try {
      const needsConfirmation = await signUp(email.trim().toLowerCase(), password, sanitizeName(name));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (needsConfirmation) {
        Alert.alert(
          t('auth.checkInbox'),
          t('auth.checkInboxSignUp'),
          [{ text: t('common.goBack'), onPress: () => router.push('/(auth)/sign-in') }],
        );
      } else {
        router.replace('/');
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('auth.signUpFailed'), friendlyAuthError(err.message));
    }
  };

  return (
    <StarField starCount={25}>
      <BioAlgae strandCount={30} height={0.15} />
      <CornerBush />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={Keyboard.dismiss} accessible={false}>
            {/* ── Header ── */}
            <View style={styles.header}>
              <Text style={styles.title}>{t('auth.plantYourRoots')}</Text>
              <Text style={styles.subtitle}>
                {t('auth.startPreserving')}
              </Text>
            </View>

            <View style={styles.form}>
              {/* ── Name ── */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('auth.yourName')}</Text>
                <TextInput
                  style={[
                    styles.input,
                    touched.name && errors.name ? styles.inputError : null,
                  ]}
                  placeholder={t('auth.namePlaceholder')}
                  placeholderTextColor={Colors.text.twilight}
                  value={name}
                  onChangeText={setName}
                  onBlur={() => handleBlur('name')}
                  autoComplete="name"
                  textContentType="name"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  blurOnSubmit={false}
                  maxLength={100}
                  accessibilityLabel="Your name"
                  accessibilityHint="Enter your display name"
                />
                {touched.name && errors.name ? (
                  <Text style={styles.errorText}>{errors.name}</Text>
                ) : null}
              </View>

              {/* ── Email ── */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('auth.email')}</Text>
                <TextInput
                  ref={emailRef}
                  style={[
                    styles.input,
                    touched.email && errors.email ? styles.inputError : null,
                  ]}
                  placeholder={t('auth.emailPlaceholder')}
                  placeholderTextColor={Colors.text.twilight}
                  value={email}
                  onChangeText={setEmail}
                  onBlur={() => handleBlur('email')}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  blurOnSubmit={false}
                  maxLength={254}
                  accessibilityLabel="Email address"
                  accessibilityHint="Enter a valid email address"
                />
                {touched.email && errors.email ? (
                  <Text style={styles.errorText}>{errors.email}</Text>
                ) : null}
              </View>

              {/* ── Password ── */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('auth.password')}</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    ref={passwordRef}
                    style={[
                      styles.input,
                      styles.passwordInput,
                      touched.password && errors.password
                        ? styles.inputError
                        : null,
                    ]}
                    placeholder={t('auth.passwordHint')}
                    placeholderTextColor={Colors.text.twilight}
                    value={password}
                    onChangeText={setPassword}
                    onBlur={() => handleBlur('password')}
                    secureTextEntry={!showPassword}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="next"
                    onSubmitEditing={() => confirmRef.current?.focus()}
                    blurOnSubmit={false}
                    maxLength={128}
                    accessibilityLabel="Password"
                    accessibilityHint="Create a strong password"
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityLabel={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    accessibilityRole="button"
                    hitSlop={12}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={Colors.text.twilight}
                    />
                  </Pressable>
                </View>

                {/* Password requirement checklist */}
                <View style={styles.requirementsList}>
                  <PasswordRequirement
                    label={t('auth.passwordReq8Chars')}
                    met={password.length >= 8}
                  />
                  <PasswordRequirement
                    label={t('auth.passwordReqUppercase')}
                    met={/[A-Z]/.test(password)}
                  />
                  <PasswordRequirement
                    label={t('auth.passwordReqLowercase')}
                    met={/[a-z]/.test(password)}
                  />
                  <PasswordRequirement
                    label={t('auth.passwordReqNumber')}
                    met={/[0-9]/.test(password)}
                  />
                  <PasswordRequirement
                    label={t('auth.passwordReqSpecial')}
                    met={/[^A-Za-z0-9]/.test(password)}
                  />
                </View>
              </View>

              {/* ── Confirm Password ── */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('auth.confirmPassword')}</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    ref={confirmRef}
                    style={[
                      styles.input,
                      styles.passwordInput,
                      touched.confirm && errors.confirm
                        ? styles.inputError
                        : null,
                    ]}
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    placeholderTextColor={Colors.text.twilight}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onBlur={() => handleBlur('confirm')}
                    secureTextEntry={!showConfirm}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="done"
                    onSubmitEditing={handleSignUp}
                    maxLength={128}
                    accessibilityLabel="Confirm password"
                    accessibilityHint="Re-enter your password to confirm"
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowConfirm((v) => !v)}
                    accessibilityLabel={showConfirm ? t('auth.hidePassword') : t('auth.showPassword')}
                    accessibilityRole="button"
                    hitSlop={12}
                  >
                    <Ionicons
                      name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={Colors.text.twilight}
                    />
                  </Pressable>
                </View>
                {touched.confirm && errors.confirm ? (
                  <Text style={styles.errorText}>{errors.confirm}</Text>
                ) : null}
              </View>

              {/* ── Terms of Service checkbox ── */}
              <View style={styles.termsRow}>
                <Pressable
                  onPress={() => setAgreedToTerms((v) => !v)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: agreedToTerms }}
                  accessibilityLabel="Agree to Terms of Service and Privacy Policy"
                  hitSlop={8}
                >
                  <View
                    style={[
                      styles.checkbox,
                      agreedToTerms && styles.checkboxChecked,
                    ]}
                  >
                    {agreedToTerms && (
                      <Text style={styles.checkmark}>✓</Text>
                    )}
                  </View>
                </Pressable>
                <Text style={styles.termsText}>
                  {t('auth.agreeToTerms')}{' '}
                  <Text
                    style={styles.termsLink}
                    onPress={() => router.push('/terms-of-service')}
                    accessibilityRole="link"
                  >
                    {t('auth.termsOfService')}
                  </Text>{' '}
                  {t('auth.and')}{' '}
                  <Text
                    style={styles.termsLink}
                    onPress={() => router.push('/privacy-policy')}
                    accessibilityRole="link"
                  >
                    {t('auth.privacyPolicy')}
                  </Text>
                </Text>
              </View>

              {/* ── Submit ── */}
              <Button
                title={t('auth.createAccount')}
                onPress={handleSignUp}
                loading={isLoading}
                disabled={isLoading}
                size="lg"
              />

              <Button
                title={t('auth.hasAccount')}
                onPress={() => router.push('/(auth)/sign-in')}
                variant="ghost"
              />
            </View>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </StarField>
  );
}

// ── Styles ──

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxxl,
  },
  header: {
    marginBottom: Spacing.xxl,
  },
  title: {
    fontSize: Typography.sizes.h1,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  form: {
    gap: Spacing.lg,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  label: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.text.moonlight,
    letterSpacing: Typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: Colors.background.abyss,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(139, 115, 85, 0.15)',
    padding: Spacing.lg,
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.starlight,
  },
  inputError: {
    borderColor: Colors.semantic.error,
    borderWidth: 1.5,
  },
  errorText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.semantic.error,
    marginTop: 2,
  },
  // ── Password visibility toggle ──
  passwordWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  passwordInput: {
    paddingRight: 52,
  },
  eyeButton: {
    position: 'absolute',
    right: Spacing.md,
    padding: Spacing.xs,
  },

  // ── Requirements list ──
  requirementsList: {
    gap: Spacing.xs,
    marginTop: 4,
  },
  // ── Terms checkbox ──
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.text.twilight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.accent.cyan,
    borderColor: Colors.accent.cyan,
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  termsText: {
    flex: 1,
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.caption * Typography.lineHeights.relaxed,
  },
  termsLink: {
    color: Colors.accent.cyan,
    fontFamily: Typography.fonts.bodyMedium,
    textDecorationLine: 'underline',
  },
});

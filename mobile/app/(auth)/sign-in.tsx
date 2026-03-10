// ============================================================
// Matra — Sign In Screen (Production)
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
  friendlyAuthError,
} from '../../src/utils/validation';

export default function SignInScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signIn, resetPassword, isLoading } = useAuthStore();

  // ── Form state ──
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ── Field-level errors ──
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const passwordRef = useRef<TextInput>(null);

  const handleBlur = useCallback(
    (field: string) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      if (field === 'email') {
        setErrors((prev) => ({ ...prev, email: validateEmail(email) }));
      }
    },
    [email],
  );

  // ── Submit ──
  const handleSignIn = async () => {
    Keyboard.dismiss();

    const emailErr = validateEmail(email);
    const passErr = !password ? t('validation.passwordRequired') : null;

    setErrors({ email: emailErr, password: passErr });
    setTouched({ email: true, password: true });

    if (emailErr || passErr) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    try {
      await signIn(email.trim().toLowerCase(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('auth.signInFailed'), friendlyAuthError(err.message));
    }
  };

  // ── Forgot Password ──
  const handleForgotPassword = () => {
    const emailErr = validateEmail(email);
    if (emailErr) {
      Alert.alert(
        t('auth.enterYourEmail'),
        t('auth.enterEmailMessage'),
      );
      return;
    }

    Alert.alert(
      t('auth.resetPassword'),
      `${t('auth.resetPasswordMessage')}\n${email.trim()}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('auth.sendResetLink'),
          onPress: async () => {
            try {
              await resetPassword(email.trim().toLowerCase());
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              Alert.alert(
                t('auth.checkInbox'),
                t('auth.checkInboxMessage'),
              );
            } catch (err: any) {
              Alert.alert(t('common.error'), friendlyAuthError(err.message));
            }
          },
        },
      ],
    );
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
              <Text style={styles.title}>{t('auth.welcomeBack')}</Text>
              <Text style={styles.subtitle}>
                {t('auth.signInSubtitle')}
              </Text>
            </View>

            <View style={styles.form}>
              {/* ── Email ── */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('auth.email')}</Text>
                <TextInput
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
                  accessibilityHint="Enter the email you registered with"
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
                    placeholder={t('auth.passwordPlaceholder')}
                    placeholderTextColor={Colors.text.twilight}
                    value={password}
                    onChangeText={setPassword}
                    onBlur={() => handleBlur('password')}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    textContentType="password"
                    returnKeyType="done"
                    onSubmitEditing={handleSignIn}
                    maxLength={128}
                    accessibilityLabel="Password"
                    accessibilityHint="Enter your account password"
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
                {touched.password && errors.password ? (
                  <Text style={styles.errorText}>{errors.password}</Text>
                ) : null}
              </View>

              {/* ── Forgot Password ── */}
              <Pressable
                onPress={handleForgotPassword}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
              >
                <Text style={styles.forgotText}>{t('auth.forgotPassword')}</Text>
              </Pressable>

              {/* ── Submit ── */}
              <Button
                title={t('auth.signIn')}
                onPress={handleSignIn}
                loading={isLoading}
                disabled={isLoading}
                size="lg"
              />

              <Button
                title={t('auth.noAccount')}
                onPress={() => router.push('/(auth)/sign-up')}
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
    marginBottom: Spacing.xxxl,
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

  // ── Forgot password ──
  forgotText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.accent.cyan,
    textAlign: 'right',
  },
});

// ============================================================
// Matra — Reset Password Screen
// ============================================================

import React, { useRef, useState } from 'react';
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
  validatePassword,
  validateConfirmPassword,
  friendlyAuthError,
} from '../../src/utils/validation';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const updatePassword = useAuthStore((s) => s.updatePassword);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const confirmRef = useRef<TextInput>(null);

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (field === 'password') {
      setErrors((prev) => ({ ...prev, password: validatePassword(password) }));
    }
    if (field === 'confirmPassword') {
      setErrors((prev) => ({
        ...prev,
        confirmPassword: validateConfirmPassword(password, confirmPassword),
      }));
    }
  };

  const handleSubmit = async () => {
    Keyboard.dismiss();

    const passErr = validatePassword(password);
    const confirmErr = validateConfirmPassword(password, confirmPassword);

    setErrors({ password: passErr, confirmPassword: confirmErr });
    setTouched({ password: true, confirmPassword: true });

    if (passErr || confirmErr) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setIsLoading(true);
    try {
      await updatePassword(password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        t('auth.passwordUpdated'),
        t('auth.passwordUpdatedMessage'),
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/home') }],
      );
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(t('auth.passwordUpdateFailed'), friendlyAuthError(err.message));
    } finally {
      setIsLoading(false);
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
              <Text style={styles.title}>{t('auth.setNewPassword')}</Text>
              <Text style={styles.subtitle}>
                {t('auth.setNewPasswordSubtitle')}
              </Text>
            </View>

            <View style={styles.form}>
              {/* ── New Password ── */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('auth.newPassword')}</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.passwordInput,
                      touched.password && errors.password
                        ? styles.inputError
                        : null,
                    ]}
                    placeholder={t('auth.newPasswordPlaceholder')}
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
                    accessibilityLabel="New password"
                    accessibilityHint="Enter your new password"
                  />
                  <Pressable
                    style={styles.eyeButton}
                    onPress={() => setShowPassword((v) => !v)}
                    accessibilityLabel={
                      showPassword ? t('auth.hidePassword') : t('auth.showPassword')
                    }
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
                <Text style={styles.hintText}>{t('auth.passwordHint')}</Text>
                {touched.password && errors.password ? (
                  <Text style={styles.errorText}>{errors.password}</Text>
                ) : null}
              </View>

              {/* ── Confirm Password ── */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('auth.confirmPassword')}</Text>
                <TextInput
                  ref={confirmRef}
                  style={[
                    styles.input,
                    touched.confirmPassword && errors.confirmPassword
                      ? styles.inputError
                      : null,
                  ]}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  placeholderTextColor={Colors.text.twilight}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onBlur={() => handleBlur('confirmPassword')}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  maxLength={128}
                  accessibilityLabel="Confirm new password"
                  accessibilityHint="Re-enter your new password"
                />
                {touched.confirmPassword && errors.confirmPassword ? (
                  <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                ) : null}
              </View>

              {/* ── Submit ── */}
              <Button
                title={isLoading ? t('auth.updating') : t('auth.updatePassword')}
                onPress={handleSubmit}
                loading={isLoading}
                disabled={isLoading}
                size="lg"
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.starlight,
  },
  inputError: {
    borderColor: Colors.semantic.error,
  },
  errorText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.semantic.error,
  },
  hintText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
  },
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
});

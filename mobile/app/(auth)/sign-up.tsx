// ============================================================
// MATRA — Sign Up Screen
// ============================================================

import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StarField, Button, BioAlgae, CornerBush } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/tokens';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, isLoading } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignUp = async () => {
    if (!name || !email || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.');
      return;
    }

    try {
      await signUp(email, password, name);
      router.replace('/');
    } catch (err: any) {
      Alert.alert('Sign up failed', err.message);
    }
  };

  return (
    <StarField starCount={25}>
      <BioAlgae strandCount={30} height={0.15} />
      <CornerBush />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Plant Your Roots</Text>
          <Text style={styles.subtitle}>Start preserving your family's stories</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput
              style={styles.input}
              placeholder="How should we call you?"
              placeholderTextColor={Colors.text.twilight}
              value={name}
              onChangeText={setName}
              autoComplete="name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="your@email.com"
              placeholderTextColor={Colors.text.twilight}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder="At least 8 characters"
              placeholderTextColor={Colors.text.twilight}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />
          </View>

          <Button
            title="Create Account"
            onPress={handleSignUp}
            loading={isLoading}
            size="lg"
          />

          <Button
            title="Already have an account? Sign in"
            onPress={() => router.push('/(auth)/sign-in')}
            variant="ghost"
          />
        </View>
      </KeyboardAvoidingView>
    </StarField>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
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
});

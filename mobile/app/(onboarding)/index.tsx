// ============================================================
// MATRA — Onboarding Flow
// ============================================================

import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, Dimensions, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { 
  useSharedValue, useAnimatedStyle, withSpring, interpolate,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { StarField, Button, BioAlgae, CornerBush } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useFamilyStore } from '../../src/stores/familyStore';
import { Colors, Typography, Spacing } from '../../src/theme/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ONBOARDING_STEPS = [
  {
    icon: '🎙',
    title: 'Record a Conversation',
    description:
      'Sit down with a family member and hit record. Talk about their life, their memories, their stories. Just be natural.',
  },
  {
    icon: '✨',
    title: 'AI Does the Heavy Lifting',
    description:
      'Our AI transcribes the conversation, extracts names, dates, relationships, and key stories — all automatically.',
  },
  {
    icon: '🌿',
    title: 'Your Family Canopy',
    description:
      'Watch your family tree grow like a living canopy. Each person becomes a warm node, connected by organic branches of ancestry.',
  },
  {
    icon: '📖',
    title: 'Stories That Last Forever',
    description:
      'AI writes biographies, creates memory books, and preserves the voices and stories of your loved ones for generations.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { updateProfile } = useAuthStore();
  const { createFamilyGroup, createPerson } = useFamilyStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showIdentity, setShowIdentity] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const handleNext = async () => {
    if (currentIndex < ONBOARDING_STEPS.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      setCurrentIndex(currentIndex + 1);
    } else {
      setShowIdentity(true);
    }
  };

  const handleCompleteOnboarding = async () => {
    if (!firstName.trim()) {
      Alert.alert('Enter your name', 'We need at least your first name to place you in your family tree.');
      return;
    }
    setIsSubmitting(true);
    try {
      const familyGroup = await createFamilyGroup('My Family');
      const person = await createPerson({
        first_name: firstName.trim(),
        last_name: lastName.trim() || null,
      });
      await updateProfile({
        onboarding_completed: true,
        self_person_id: person.id,
      } as any);
      router.replace('/(tabs)/home');
    } catch (e) {
      console.error('Onboarding error:', e);
      Alert.alert('Error', 'Could not complete setup. Is Supabase running?');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showIdentity) {
    return (
      <StarField particleCount={30}>
        <BioAlgae strandCount={30} height={0.15} />
        <CornerBush />
        <View style={styles.identityContainer}>
          <Text style={styles.identityIcon}>🌳</Text>
          <Text style={styles.identityTitle}>Who are you?</Text>
          <Text style={styles.identitySubtitle}>
            You'll be the first node in your family tree
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>First name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="e.g. Carlos"
              placeholderTextColor={Colors.text.shadow}
              autoFocus
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Last name (optional)</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="e.g. Bueso"
              placeholderTextColor={Colors.text.shadow}
            />
          </View>

          <View style={{ marginTop: Spacing.xl }}>
            <Button
              title={isSubmitting ? 'Creating...' : 'Plant Your Roots'}
              onPress={handleCompleteOnboarding}
              size="lg"
              disabled={isSubmitting}
            />
          </View>
        </View>
      </StarField>
    );
  }

  return (
    <StarField particleCount={40}>
      <BioAlgae strandCount={30} height={0.15} />
      <CornerBush />
      <View style={styles.container}>
        <Animated.FlatList
          ref={flatListRef}
          data={ONBOARDING_STEPS}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={scrollHandler}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setCurrentIndex(idx);
          }}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item, index }) => (
            <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
              <Text style={styles.icon}>{item.icon}</Text>
              <Text style={styles.stepTitle}>{item.title}</Text>
              <Text style={styles.stepDescription}>{item.description}</Text>
            </View>
          )}
        />

        <View style={styles.footer}>
          {/* Dot indicators */}
          <View style={styles.dots}>
            {ONBOARDING_STEPS.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  i === currentIndex && styles.dotActive,
                ]}
              />
            ))}
          </View>

          <Button
            title={currentIndex === ONBOARDING_STEPS.length - 1 ? 'Plant Your Roots' : 'Next'}
            onPress={handleNext}
            size="lg"
          />

          {currentIndex < ONBOARDING_STEPS.length - 1 && (
            <Button
              title="Skip"
              onPress={() => setShowIdentity(true)}
              variant="ghost"
            />
          )}
        </View>
      </View>
    </StarField>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  icon: {
    fontSize: 64,
    marginBottom: Spacing.xxl,
  },
  stepTitle: {
    fontSize: Typography.sizes.h1,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  stepDescription: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    textAlign: 'center',
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
    maxWidth: 300,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
    gap: Spacing.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.text.shadow,
  },
  dotActive: {
    backgroundColor: Colors.accent.cyan,
    width: 24,
  },
  identityContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  identityIcon: {
    fontSize: 64,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  identityTitle: {
    fontSize: Typography.sizes.h1,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  identitySubtitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.twilight,
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(139, 115, 85, 0.20)',
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.starlight,
    backgroundColor: '#FFFFFF',
  },
});

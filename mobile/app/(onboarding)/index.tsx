// ============================================================
// MATRA — Onboarding Flow
// ============================================================

import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, FlatList, Dimensions, Pressable, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { 
  useSharedValue, useAnimatedStyle, withSpring, interpolate,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { StarField, Button, BioAlgae, CornerBush } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useFamilyStore } from '../../src/stores/familyStore';
import { Colors, Typography, Spacing } from '../../src/theme/tokens';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../../src/i18n';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { updateProfile, setLanguage } = useAuthStore();
  const { createFamilyGroup, createPerson } = useFamilyStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showIdentity, setShowIdentity] = useState(false);
  const [showLanguage, setShowLanguage] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useSharedValue(0);

  const ONBOARDING_STEPS = [
    {
      icon: '🎙',
      title: t('onboarding.step1Title'),
      description: t('onboarding.step1Description'),
    },
    {
      icon: '✨',
      title: t('onboarding.step2Title'),
      description: t('onboarding.step2Description'),
    },
    {
      icon: '🌿',
      title: t('onboarding.step3Title'),
      description: t('onboarding.step3Description'),
    },
    {
      icon: '📖',
      title: t('onboarding.step4Title'),
      description: t('onboarding.step4Description'),
    },
  ];

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
      Alert.alert(t('onboarding.enterNameTitle'), t('onboarding.enterNameMessage'));
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
      Alert.alert(t('common.error'), t('onboarding.setupError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showLanguage) {
    return (
      <StarField particleCount={30}>
        <BioAlgae strandCount={30} height={0.15} />
        <CornerBush />
        <View style={styles.identityContainer}>
          <Text style={styles.identityIcon}>🌍</Text>
          <Text style={styles.identityTitle}>{t('onboarding.chooseLanguage')}</Text>
          <Text style={styles.identitySubtitle}>{t('onboarding.chooseLanguageSubtitle')}</Text>
          <View style={styles.languageOptions}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <Pressable
                key={lang.code}
                style={styles.languageOption}
                onPress={async () => {
                  await setLanguage(lang.code as LanguageCode);
                  setShowLanguage(false);
                }}
              >
                <Text style={styles.languageOptionText}>{lang.nativeLabel}</Text>
                <Text style={styles.languageOptionSubtext}>{lang.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </StarField>
    );
  }

  if (showIdentity) {
    return (
      <StarField particleCount={30}>
        <BioAlgae strandCount={30} height={0.15} />
        <CornerBush />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.identityContainer}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Text style={styles.identityIcon}>🌳</Text>
            <Text style={styles.identityTitle}>{t('onboarding.whoAreYou')}</Text>
            <Text style={styles.identitySubtitle}>
              {t('onboarding.firstNode')}
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('onboarding.firstName')}</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder={t('onboarding.firstNamePlaceholder')}
                placeholderTextColor={Colors.text.shadow}
                autoFocus
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('onboarding.lastName')}</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder={t('onboarding.lastNamePlaceholder')}
                placeholderTextColor={Colors.text.shadow}
              />
            </View>

            <View style={{ marginTop: Spacing.xl }}>
              <Button
                title={isSubmitting ? t('onboarding.creating') : t('onboarding.plantYourRoots')}
                onPress={handleCompleteOnboarding}
                size="lg"
                disabled={isSubmitting}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
            title={currentIndex === ONBOARDING_STEPS.length - 1 ? t('onboarding.plantYourRoots') : t('common.next')}
            onPress={handleNext}
            size="lg"
          />

          {currentIndex < ONBOARDING_STEPS.length - 1 && (
            <Button
              title={t('common.skip')}
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
    flexGrow: 1,
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
  languageOptions: {
    gap: Spacing.md,
  },
  languageOption: {
    borderWidth: 1,
    borderColor: 'rgba(139, 115, 85, 0.20)',
    borderRadius: 12,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  languageOptionText: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
  },
  languageOptionSubtext: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: Spacing.xxs,
  },
});

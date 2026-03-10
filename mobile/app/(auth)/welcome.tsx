// ============================================================
// Matra — Welcome Screen
// ============================================================

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { StarField, BioAlgae, Button } from '../../src/components/ui';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing } from '../../src/theme/tokens';

export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <StarField starCount={40}>
      <BioAlgae strandCount={55} height={0.22} />
      <View style={styles.container}>
        <View style={styles.hero}>
          {/* Logo placeholder — replace with actual logo */}
          <View style={styles.logoContainer}>
            <Text style={styles.logoGlyph}>🌳</Text>
          </View>

          <Text style={styles.title}>{t('welcome.title')}</Text>
          <Text style={styles.subtitle}>
            {t('welcome.subtitle')}
          </Text>
        </View>

        <View style={styles.features}>
          <FeatureItem
            icon="🎙"
            title={t('welcome.feature1Title')}
            description={t('welcome.feature1Desc')}
          />
          <FeatureItem
            icon="🌳"
            title={t('welcome.feature2Title')}
            description={t('welcome.feature2Desc')}
          />
          <FeatureItem
            icon="📖"
            title={t('welcome.feature3Title')}
            description={t('welcome.feature3Desc')}
          />
        </View>

        <View style={styles.actions}>
          <Button
            title={t('welcome.getStarted')}
            onPress={() => router.push('/(auth)/sign-up')}
            size="lg"
          />
          <Button
            title={t('welcome.haveAccount')}
            onPress={() => router.push('/(auth)/sign-in')}
            variant="ghost"
            size="md"
          />
        </View>
      </View>
    </StarField>
  );
}

function FeatureItem({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: 80,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(107, 143, 60, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(107, 143, 60, 0.25)',
    marginBottom: Spacing.xl,
    shadowColor: Colors.accent.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  logoGlyph: {
    fontSize: 36,
    color: Colors.accent.cyan,
  },
  title: {
    fontSize: Typography.sizes.hero,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    marginBottom: Spacing.sm,
    letterSpacing: Typography.letterSpacing.widest,
  },
  subtitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    textAlign: 'center',
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  features: {
    gap: Spacing.xl,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  featureIcon: {
    fontSize: 28,
    width: 48,
    height: 48,
    textAlign: 'center',
    lineHeight: 48,
    backgroundColor: 'rgba(107, 143, 60, 0.08)',
    borderRadius: 14,
    overflow: 'hidden',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.caption * Typography.lineHeights.normal,
  },
  actions: {
    gap: Spacing.md,
  },
});

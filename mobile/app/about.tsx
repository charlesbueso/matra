// ============================================================
// Matra — About Screen
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { StarField, BioAlgae, CornerBush, Card } from '../src/components/ui';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/tokens';

export default function AboutScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <StarField starCount={25}>
      <BioAlgae strandCount={30} height={0.15} />
      <CornerBush />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={Colors.text.starlight} />
        </Pressable>

        {/* Hero Brand Mark */}
        <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.hero}>
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={Colors.gradients.bioluminescent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logoGradient}
            >
              <Text style={styles.logoIcon}>🌿</Text>
            </LinearGradient>
          </View>
          <Text style={styles.brandName}>{t('common.matra')}</Text>
          <Text style={styles.tagline}>{t('about.tagline')}</Text>
        </Animated.View>

        {/* Mission */}
        <Animated.View entering={FadeInDown.delay(200).duration(600)}>
          <Card variant="elevated" style={styles.missionCard}>
            <Text style={styles.missionIcon}>🌳</Text>
            <Text style={styles.missionTitle}>{t('about.missionTitle')}</Text>
            <Text style={styles.missionText}>
              {t('about.missionBody')}
            </Text>
          </Card>
        </Animated.View>

        {/* How It Works */}
        <Animated.View entering={FadeInDown.delay(300).duration(600)}>
          <Text style={styles.sectionTitle}>{t('about.howItWorksTitle')}</Text>
          <View style={styles.stepsContainer}>
            <StepItem
              icon="🎙"
              title={t('about.howRecord')}
              description={t('about.howRecordDesc')}
            />
            <View style={styles.stepDivider}>
              <View style={styles.stepLine} />
              <Text style={styles.stepLeaf}>🍃</Text>
              <View style={styles.stepLine} />
            </View>
            <StepItem
              icon="✨"
              title={t('about.howDiscover')}
              description={t('about.howDiscoverDesc')}
            />
            <View style={styles.stepDivider}>
              <View style={styles.stepLine} />
              <Text style={styles.stepLeaf}>🍃</Text>
              <View style={styles.stepLine} />
            </View>
            <StepItem
              icon="🌿"
              title={t('about.howPreserve')}
              description={t('about.howPreserveDesc')}
            />
          </View>
        </Animated.View>

        {/* Values */}
        <Animated.View entering={FadeInDown.delay(400).duration(600)}>
          <Text style={styles.sectionTitle}>{t('about.valuesTitle')}</Text>
          <View style={styles.valuesGrid}>
            <ValueCard icon="🌱" title={t('about.valueGrowth').split(' - ')[0]} description={t('about.valueGrowth').split(' - ')[1]} />
            <ValueCard icon="🔒" title={t('about.valuePrivacy').split(' - ')[0]} description={t('about.valuePrivacy').split(' - ')[1]} />
            <ValueCard icon="🌎" title={t('about.valueHeritage').split(' - ')[0]} description={t('about.valueHeritage').split(' - ')[1]} />
            <ValueCard icon="💚" title={t('about.valueConnection').split(' - ')[0]} description={t('about.valueConnection').split(' - ')[1]} />
          </View>
        </Animated.View>

        {/* Footer */}
        <Animated.View entering={FadeInUp.delay(500).duration(600)} style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerEmoji}>🍂</Text>
          <Text style={styles.footerText}>
            {t('about.footer')}
          </Text>
          <Text style={styles.footerVersion}>{t('common.version')}</Text>
          <Text style={styles.footerContact}>{t('about.contact')}</Text>
        </Animated.View>
      </ScrollView>
    </StarField>
  );
}

function StepItem({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <Card variant="elevated" style={styles.stepCard}>
      <Text style={styles.stepIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepDescription}>{description}</Text>
      </View>
    </Card>
  );
}

function ValueCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <Card variant="default" style={styles.valueCard}>
      <Text style={styles.valueIcon}>{icon}</Text>
      <Text style={styles.valueTitle}>{title}</Text>
      <Text style={styles.valueDescription}>{description}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 100,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background.abyss,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },


  // Hero
  hero: {
    alignItems: 'center',
    marginBottom: Spacing.xl * 1.5,
  },
  logoContainer: {
    marginBottom: Spacing.md,
  },
  logoGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  logoIcon: {
    fontSize: 36,
  },
  brandName: {
    fontSize: Typography.sizes.hero,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    letterSpacing: 6,
    marginBottom: Spacing.sm,
  },
  tagline: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Mission
  missionCard: {
    alignItems: 'center',
    marginBottom: Spacing.xl * 1.5,
    paddingVertical: Spacing.xl,
  },
  missionIcon: {
    fontSize: 32,
    marginBottom: Spacing.md,
  },
  missionTitle: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    marginBottom: Spacing.md,
  },
  missionText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },

  // Section
  sectionTitle: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    marginBottom: Spacing.lg,
  },

  // Steps
  stepsContainer: {
    marginBottom: Spacing.xl * 1.5,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stepIcon: {
    fontSize: 28,
  },
  stepTitle: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
    marginBottom: 2,
  },
  stepDescription: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: 18,
  },
  stepDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  stepLine: {
    height: 1,
    flex: 1,
    backgroundColor: Colors.accent.glow,
    opacity: 0.3,
  },
  stepLeaf: {
    fontSize: 14,
    marginHorizontal: Spacing.sm,
    opacity: 0.6,
  },

  // Values
  valuesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  valueCard: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  valueIcon: {
    fontSize: 24,
    marginBottom: Spacing.sm,
  },
  valueTitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
    marginBottom: 4,
  },
  valueDescription: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    textAlign: 'center',
    lineHeight: 17,
  },

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  footerDivider: {
    width: 60,
    height: 1,
    backgroundColor: Colors.accent.glow,
    opacity: 0.3,
    marginBottom: Spacing.md,
  },
  footerEmoji: {
    fontSize: 20,
    marginBottom: Spacing.sm,
    opacity: 0.6,
  },
  footerText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: Spacing.sm,
  },
  footerVersion: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.shadow,
    marginBottom: 4,
  },
  footerContact: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.accent.azure,
  },
});

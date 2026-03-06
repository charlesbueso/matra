// ============================================================
// MATRA — Paywall Screen
// ============================================================

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StarField, Button, Card, BioAlgae, CornerBush } from '../src/components/ui';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/tokens';

type PlanType = 'monthly' | 'annual';

export default function PaywallScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');

  const plans: Record<PlanType, { price: string; period: string; savings?: string }> = {
    monthly: { price: '$6.99', period: '/month', savings: undefined },
    annual: { price: '$49.99', period: '/year', savings: 'Save 40%' },
  };

  const handlePurchase = async () => {
    // TODO: Integrate with RevenueCat
    // Purchases.purchasePackage(package)
    Alert.alert(t('common.comingSoon'), t('paywall.comingSoon'));
  };

  const features = [
    { icon: '🎙️', title: t('paywall.feature1Title'), description: t('paywall.feature1Desc') },
    { icon: '⏱️', title: t('paywall.feature2Title'), description: t('paywall.feature2Desc') },
    { icon: '✨', title: t('paywall.feature3Title'), description: t('paywall.feature3Desc') },
    { icon: '🔊', title: t('paywall.feature4Title'), description: t('paywall.feature4Desc') },
    { icon: '📖', title: t('paywall.feature5Title'), description: t('paywall.feature5Desc') },
    { icon: '📚', title: t('paywall.feature6Title'), description: t('paywall.feature6Desc') },
    { icon: '👨‍👩‍👧‍👦', title: t('paywall.feature7Title'), description: t('paywall.feature7Desc') },
    { icon: '🔒', title: t('paywall.feature8Title'), description: t('paywall.feature8Desc') },
  ];

  return (
    <StarField starCount={25}>
      <BioAlgae strandCount={30} height={0.15} />
      <CornerBush />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Close Button */}
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Text style={styles.closeIcon}>✕</Text>
        </Pressable>

        {/* Hero */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.hero}>
          <Text style={styles.heroIcon}>◈</Text>
          <Text style={styles.heroTitle}>{t('paywall.title')}</Text>
          <Text style={styles.heroSubtitle}>
            {t('paywall.subtitle')}
          </Text>
        </Animated.View>

        {/* Plan Selector */}
        <Animated.View entering={FadeInDown.delay(200)} style={styles.planSelector}>
          <Pressable
            onPress={() => setSelectedPlan('monthly')}
            style={[styles.planOption, selectedPlan === 'monthly' && styles.planOptionSelected]}
          >
            <Text style={styles.planPrice}>{plans.monthly.price}</Text>
            <Text style={styles.planPeriod}>{plans.monthly.period}</Text>
          </Pressable>

          <Pressable
            onPress={() => setSelectedPlan('annual')}
            style={[styles.planOption, selectedPlan === 'annual' && styles.planOptionSelected]}
          >
            {plans.annual.savings && (
              <View style={styles.savingsBadge}>
                <Text style={styles.savingsText}>{t('paywall.save40')}</Text>
              </View>
            )}
            <Text style={styles.planPrice}>{plans.annual.price}</Text>
            <Text style={styles.planPeriod}>{plans.annual.period}</Text>
          </Pressable>
        </Animated.View>

        {/* Features List */}
        <View style={styles.featuresList}>
          {features.map((feature, i) => (
            <Animated.View key={i} entering={FadeInDown.delay(300 + i * 60)} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{feature.icon}</Text>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        {/* CTA */}
        <Animated.View entering={FadeInDown.delay(700)}>
          <Button
            title={t('paywall.subscribeFor', { price: plans[selectedPlan].price, period: selectedPlan === 'annual' ? '/yr' : '/mo' })}
            onPress={handlePurchase}
            variant="premium"
            size="lg"
          />
          <Text style={styles.legalText}>
            {t('paywall.cancelAnytime', { frequency: selectedPlan === 'annual' ? t('paywall.annually') : t('paywall.monthly') })}
          </Text>
        </Animated.View>

        {/* Restore */}
        <Button
          title={t('paywall.restorePurchases')}
          onPress={() => Alert.alert(t('common.restore'), t('paywall.restoreMessage'))}
          variant="ghost"
          size="sm"
        />
      </ScrollView>
    </StarField>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
    paddingBottom: 60,
  },
  closeButton: {
    alignSelf: 'flex-end',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background.depth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxs,
  },
  closeIcon: {
    fontSize: 16,
    color: Colors.text.moonlight,
  },
  hero: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  heroIcon: {
    fontSize: 48,
    color: Colors.accent.amber,
    marginBottom: Spacing.md,
  },
  heroTitle: {
    fontSize: Typography.sizes.h1,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    textAlign: 'center',
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  planSelector: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  planOption: {
    flex: 1,
    backgroundColor: Colors.background.trench,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.overlay.light,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  planOptionSelected: {
    borderColor: Colors.accent.amber,
    backgroundColor: Colors.background.depth,
  },
  planPrice: {
    fontSize: Typography.sizes.h2,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
  },
  planPeriod: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: Spacing.xxs,
  },
  savingsBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: Colors.accent.amber,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: BorderRadius.sm,
  },
  savingsText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.background.void,
  },
  featuresList: {
    marginBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  featureIcon: {
    fontSize: 24,
    width: 40,
    textAlign: 'center',
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
  },
  featureDescription: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  legalText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.shadow,
    textAlign: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
});

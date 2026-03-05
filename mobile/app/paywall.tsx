// ============================================================
// MATRA — Paywall Screen
// ============================================================

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StarField, Button, Card, BioAlgae, CornerBush } from '../src/components/ui';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/tokens';

type PlanType = 'monthly' | 'lifetime';

export default function PaywallScreen() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('monthly');

  const plans: Record<PlanType, { price: string; period: string; savings?: string }> = {
    monthly: { price: '$9.99', period: '/month', savings: undefined },
    lifetime: { price: '$49.99', period: 'one time', savings: 'Best Value' },
  };

  const handlePurchase = async () => {
    // TODO: Integrate with RevenueCat
    // Purchases.purchasePackage(package)
    Alert.alert('Coming Soon', 'In-app purchases will be available when the app is published.');
  };

  const features = [
    { icon: '∞', title: 'Unlimited Conversations', description: 'No more limits on recording' },
    { icon: '✨', title: 'AI Story Summarization', description: 'Beautiful summaries of every conversation' },
    { icon: '📖', title: 'AI Biography Generation', description: 'Auto-written bios for each family member' },
    { icon: '📚', title: 'Memory Book Export', description: 'Beautiful PDF family memory books' },
    { icon: '👨‍👩‍👧‍👦', title: 'Family Sharing', description: 'Invite family members to collaborate' },
    { icon: '🔒', title: 'Encrypted Cloud Archive', description: 'Your stories, safe forever' },
    { icon: '🎬', title: 'Documentary Script', description: 'AI-generated family documentary script' },
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
          <Text style={styles.heroTitle}>Unlock the Full Canopy</Text>
          <Text style={styles.heroSubtitle}>
            Preserve every story, every branch, every memory.
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
            onPress={() => setSelectedPlan('lifetime')}
            style={[styles.planOption, selectedPlan === 'lifetime' && styles.planOptionSelected]}
          >
            {plans.lifetime.savings && (
              <View style={styles.savingsBadge}>
                <Text style={styles.savingsText}>{plans.lifetime.savings}</Text>
              </View>
            )}
            <Text style={styles.planPrice}>{plans.lifetime.price}</Text>
            <Text style={styles.planPeriod}>{plans.lifetime.period}</Text>
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
            title={`Subscribe for ${plans[selectedPlan].price}${selectedPlan === 'monthly' ? '/mo' : ''}`}
            onPress={handlePurchase}
            variant="premium"
            size="lg"
          />
          <Text style={styles.legalText}>
            {selectedPlan === 'monthly'
              ? 'Cancel anytime. Subscription auto-renews monthly.'
              : 'One-time purchase. Yours forever.'}
          </Text>
        </Animated.View>

        {/* Restore */}
        <Button
          title="Restore Purchases"
          onPress={() => Alert.alert('Restore', 'Checking previous purchases...')}
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

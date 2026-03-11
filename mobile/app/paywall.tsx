// ============================================================
// Matra — Paywall Screen
// ============================================================

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StarField, Button, BioAlgae, CornerBush } from '../src/components/ui';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/tokens';
import { useSubscriptionStore } from '../src/stores/subscriptionStore';
import { trackEvent, AnalyticsEvents } from '../src/services/analytics';
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isPremiumActive,
  isUserCancellation,
} from '../src/services/purchases';
import type { PurchasesPackage } from 'react-native-purchases';

type PlanType = 'monthly' | 'annual';

export default function PaywallScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const tier = useSubscriptionStore((s) => s.tier);
  const fetchEntitlements = useSubscriptionStore((s) => s.fetchEntitlements);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('annual');
  const [isLoadingOfferings, setIsLoadingOfferings] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [packages, setPackages] = useState<Record<PlanType, PurchasesPackage | null>>({
    monthly: null,
    annual: null,
  });

  // Load offerings from RevenueCat (prices from App Store / Play Store)
  useEffect(() => {
    trackEvent(AnalyticsEvents.PAYWALL_VIEWED);
    let mounted = true;
    (async () => {
      try {
        const offering = await getOfferings();
        if (!mounted || !offering) {
          setIsLoadingOfferings(false);
          return;
        }
        const monthly = offering.monthly ?? offering.availablePackages.find(
          (p) => p.packageType === 'MONTHLY'
        ) ?? null;
        const annual = offering.annual ?? offering.availablePackages.find(
          (p) => p.packageType === 'ANNUAL'
        ) ?? null;
        setPackages({ monthly, annual });
      } catch (err) {
        console.warn('[Paywall] Failed to load offerings:', err);
      } finally {
        if (mounted) setIsLoadingOfferings(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const downgrade = useSubscriptionStore((s) => s.downgrade);

  // If already premium AND not in grace/lapsed state, show confirmation and go back
  useEffect(() => {
    if (tier === 'premium' && !downgrade.inGracePeriod && !downgrade.isLapsed) {
      Alert.alert(
        t('paywall.alreadyPremiumTitle'),
        t('paywall.alreadyPremiumMessage'),
        [{ text: 'OK', onPress: () => router.back() }],
      );
    }
  }, [tier, downgrade.inGracePeriod, downgrade.isLapsed]);

  const selectedPackage = packages[selectedPlan];

  const getDisplayPrice = (plan: PlanType): string => {
    const pkg = packages[plan];
    if (pkg) return pkg.product.priceString;
    return plan === 'monthly' ? '$9.99' : '$59.99';
  };

  const getDisplayPeriod = (plan: PlanType): string => {
    return plan === 'monthly' ? t('paywall.perMonth') : t('paywall.perYear');
  };

  const handlePurchase = async () => {
    if (!selectedPackage) {
      Alert.alert(t('common.error'), t('paywall.noPackageAvailable'));
      return;
    }

    setIsPurchasing(true);
    try {
      const customerInfo = await purchasePackage(selectedPackage);
      if (isPremiumActive(customerInfo)) {
        // Sync with backend
        await fetchEntitlements();
        Alert.alert(
          t('paywall.purchaseSuccessTitle'),
          t('paywall.purchaseSuccessMessage'),
          [{ text: 'OK', onPress: () => router.back() }],
        );
      }
    } catch (error: any) {
      if (!isUserCancellation(error)) {
        Alert.alert(t('common.error'), t('paywall.purchaseError'));
        console.error('[Paywall] Purchase error:', error);
      }
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setIsRestoring(true);
    try {
      const customerInfo = await restorePurchases();
      if (isPremiumActive(customerInfo)) {
        await fetchEntitlements();
        Alert.alert(
          t('paywall.restoreSuccessTitle'),
          t('paywall.restoreSuccessMessage'),
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else {
        Alert.alert(t('paywall.noSubscriptionFound'), t('paywall.noSubscriptionFoundMessage'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('paywall.restoreError'));
      console.error('[Paywall] Restore error:', error);
    } finally {
      setIsRestoring(false);
    }
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
            <Text style={styles.planPrice}>{getDisplayPrice('monthly')}</Text>
            <Text style={styles.planPeriod}>{getDisplayPeriod('monthly')}</Text>
          </Pressable>

          <Pressable
            onPress={() => setSelectedPlan('annual')}
            style={[styles.planOption, selectedPlan === 'annual' && styles.planOptionSelected]}
          >
            <View style={styles.savingsBadge}>
              <Text style={styles.savingsText}>{t('paywall.save40')}</Text>
            </View>
            <Text style={styles.planPrice}>{getDisplayPrice('annual')}</Text>
            <Text style={styles.planPeriod}>{getDisplayPeriod('annual')}</Text>
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
          {isLoadingOfferings ? (
            <ActivityIndicator size="large" color={Colors.accent.amber} style={{ marginVertical: Spacing.lg }} />
          ) : (
            <Button
              title={isPurchasing
                ? t('paywall.purchasing')
                : t('paywall.subscribeFor', {
                    price: getDisplayPrice(selectedPlan),
                    period: selectedPlan === 'annual' ? '/yr' : '/mo',
                  })
              }
              onPress={handlePurchase}
              variant="premium"
              size="lg"
              disabled={isPurchasing || !selectedPackage}
            />
          )}
          <Text style={styles.legalText}>
            {t('paywall.cancelAnytime', { frequency: selectedPlan === 'annual' ? t('paywall.annually') : t('paywall.monthly') })}
          </Text>
        </Animated.View>

        {/* Restore */}
        <Pressable
          onPress={handleRestore}
          disabled={isRestoring || isPurchasing}
          style={{ alignSelf: 'center', paddingVertical: Spacing.sm }}
        >
          <Text style={styles.restoreText}>
            {isRestoring ? t('paywall.restoring') : t('paywall.restorePurchases')}
          </Text>
        </Pressable>
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
  restoreText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.amber,
    textAlign: 'center',
  },
});

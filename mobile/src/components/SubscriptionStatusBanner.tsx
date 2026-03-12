// ============================================================
// MATRA — Subscription Status Banners
// ============================================================
// Context-aware banners shown on the home screen during
// grace period, billing retry, and lapsed subscription states.
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from './ui';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { Colors, Typography, Spacing, BorderRadius } from '../theme/tokens';

/**
 * Shows the appropriate in-app banner based on subscription downgrade state.
 * Renders nothing if the user has no downgrade conditions.
 */
export function SubscriptionStatusBanner() {
  const { t } = useTranslation();
  const router = useRouter();
  const downgrade = useSubscriptionStore((s) => s.downgrade);

  if (!downgrade.inGracePeriod && !downgrade.isLapsed) return null;

  const daysRemaining = (dateStr: string | null) => {
    if (!dateStr) return 0;
    const diff = new Date(dateStr).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  // Grace Period: full access, gentle nudge
  if (downgrade.inGracePeriod && downgrade.gracePeriodEndsAt) {
    const days = daysRemaining(downgrade.gracePeriodEndsAt);
    return (
      <View style={[styles.banner, styles.graceBanner]}>
        <View style={styles.bannerContent}>
          <Text style={styles.graceIcon}>⏳</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.graceText}>
              {t('home.gracePeriodBanner', { days })}
            </Text>
          </View>
        </View>
        <Button
          title={t('home.gracePeriodAction')}
          onPress={() => router.push('/paywall')}
          variant="premium"
          size="sm"
          style={{ marginTop: Spacing.sm, alignSelf: 'flex-start' }}
        />
      </View>
    );
  }

  // Lapsed: warm welcome-back, show export grace if applicable
  if (downgrade.isLapsed) {
    const exportDays = daysRemaining(downgrade.exportAccessUntil);
    return (
      <View style={[styles.banner, styles.lapsedBanner]}>
        <View style={styles.bannerContent}>
          <Text style={styles.graceIcon}>🌱</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.lapsedText}>
              {t('home.lapsedBanner')}
            </Text>
            {downgrade.exportAccessUntil && exportDays > 0 && (
              <Text style={styles.exportHint}>
                {t('home.lapsedExportBanner', { days: exportDays })}
              </Text>
            )}
          </View>
        </View>
        <Button
          title={t('home.resubscribe')}
          onPress={() => router.push('/paywall')}
          variant="premium"
          size="sm"
          style={{ marginTop: Spacing.sm, alignSelf: 'flex-start' }}
        />
      </View>
    );
  }

  return null;
}

/**
 * Billing retry banner — separate because it uses different store data.
 * This needs to be detected via the subscription status, not downgrade info.
 * Currently shown from the parent based on subscription status.
 */
export function BillingRetryBanner() {
  const { t } = useTranslation();

  return (
    <View style={[styles.banner, styles.billingBanner]}>
      <View style={styles.bannerContent}>
        <Text style={styles.graceIcon}>💳</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.billingText}>
            {t('home.billingRetryBanner')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
  },
  graceBanner: {
    backgroundColor: '#FBF3E0',
    borderColor: Colors.accent.amber + '40',
  },
  lapsedBanner: {
    backgroundColor: '#FBF3E0',
    borderColor: Colors.accent.amber + '40',
  },
  billingBanner: {
    backgroundColor: '#1f1210',
    borderColor: Colors.accent.coral + '25',
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  graceIcon: {
    fontSize: 22,
    marginTop: 1,
  },
  graceText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodyMedium,
    color: '#7A6520',
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  lapsedText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodyMedium,
    color: '#7A6520',
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  exportHint: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: '#996633',
    marginTop: Spacing.xs,
    lineHeight: Typography.sizes.caption * Typography.lineHeights.relaxed,
  },
  billingText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
});

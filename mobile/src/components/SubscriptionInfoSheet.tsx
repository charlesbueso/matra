// ============================================================
// MATRA — Subscription Info Bottom Sheet
// ============================================================
// Shows users exactly what happens when they cancel, and where
// they stand during grace period / lapsed states.
// ============================================================

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from './ui';
import { useSubscriptionStore } from '../stores/subscriptionStore';
import { Colors, Typography, Spacing, BorderRadius } from '../theme/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function InfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={rowStyles.icon}>{icon}</Text>
      <Text style={rowStyles.text}>{text}</Text>
    </View>
  );
}

export function SubscriptionInfoSheet({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const downgrade = useSubscriptionStore((s) => s.downgrade);
  const tier = useSubscriptionStore((s) => s.tier);

  if (!visible) return null;

  const isGrace = downgrade.inGracePeriod;
  const isLapsed = downgrade.isLapsed;
  const hasExportGrace = !!downgrade.exportAccessUntil;

  const graceEndDate = downgrade.gracePeriodEndsAt
    ? new Date(downgrade.gracePeriodEndsAt).toLocaleDateString()
    : '';
  const exportEndDate = downgrade.exportAccessUntil
    ? new Date(downgrade.exportAccessUntil).toLocaleDateString()
    : '';

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
      style={styles.overlay}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View
        entering={SlideInDown.duration(300)}
        exiting={SlideOutDown.duration(200)}
        style={styles.sheet}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {isGrace
              ? t('settings.gracePeriodInfoTitle')
              : isLapsed
                ? t('settings.lapsedInfoTitle')
                : t('settings.cancelInfoTitle')}
          </Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Context-aware header description */}
          {isGrace && (
            <View style={styles.statusCard}>
              <Text style={styles.statusIcon}>⏳</Text>
              <Text style={styles.statusText}>
                {t('settings.gracePeriodInfoDesc', { date: graceEndDate })}
              </Text>
            </View>
          )}

          {isLapsed && (
            <View style={[styles.statusCard, styles.statusCardLapsed]}>
              <Text style={styles.statusIcon}>🌱</Text>
              <Text style={styles.statusText}>
                {t('settings.lapsedInfoDesc')}
              </Text>
            </View>
          )}

          {hasExportGrace && isLapsed && (
            <View style={[styles.statusCard, styles.statusCardExport]}>
              <Text style={styles.statusIcon}>📦</Text>
              <Text style={styles.statusText}>
                {t('settings.exportGraceReminder', { date: exportEndDate })}
              </Text>
            </View>
          )}

          {/* What happens checklist — shown for active premium users and always */}
          {!isGrace && !isLapsed && (
            <Text style={styles.sectionLabel}>
              {t('settings.whatIfICancel')}
            </Text>
          )}

          <View style={styles.infoList}>
            <InfoRow icon="🛡️" text={t('settings.cancelInfoGrace')} />
            <InfoRow icon="📚" text={t('settings.cancelInfoRead')} />
            <InfoRow icon="📦" text={t('settings.cancelInfoExport')} />
            <InfoRow icon="🎙️" text={t('settings.cancelInfoCreate')} />
            <InfoRow icon="✨" text={t('settings.cancelInfoAI')} />
            <InfoRow icon="👨‍👩‍👧‍👦" text={t('settings.cancelInfoFamily')} />
            <InfoRow icon="🔄" text={t('settings.cancelInfoResub')} />
          </View>

          {/* Download CTA */}
          <View style={styles.downloadSection}>
            <Text style={styles.downloadHint}>
              {t('settings.cancelInfoDownload')}
            </Text>
            <Button
              title={t('settings.cancelInfoDownloadAction')}
              onPress={() => {
                onClose();
                // Navigate to settings which has the download action
                router.push({ pathname: '/(tabs)/settings', params: { scrollTo: 'data' } });
              }}
              variant="secondary"
              size="sm"
              style={{ marginTop: Spacing.sm }}
            />
          </View>

          {/* Re-subscribe CTA for lapsed/grace users */}
          {(isGrace || isLapsed) && (
            <Button
              title={isGrace ? t('home.gracePeriodAction') : t('home.resubscribe')}
              onPress={() => {
                onClose();
                router.push('/paywall');
              }}
              variant="premium"
              size="md"
              style={{ marginTop: Spacing.lg }}
            />
          )}

          <View style={{ height: Spacing.xl }} />
        </ScrollView>
      </Animated.View>
    </Animated.View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  icon: {
    fontSize: 18,
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
});

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: Colors.background.void,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.text.shadow,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background.current,
  },
  headerTitle: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    flex: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background.depth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    color: Colors.text.twilight,
  },
  scroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.accent.amber + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.accent.amber + '30',
  },
  statusCardLapsed: {
    backgroundColor: Colors.accent.cyan + '10',
    borderColor: Colors.accent.cyan + '25',
  },
  statusCardExport: {
    backgroundColor: Colors.accent.coral + '10',
    borderColor: Colors.accent.coral + '25',
  },
  statusIcon: {
    fontSize: 22,
    marginTop: 1,
  },
  statusText: {
    flex: 1,
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.text.starlight,
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  sectionLabel: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
    marginBottom: Spacing.sm,
  },
  infoList: {
    gap: Spacing.xxs,
  },
  downloadSection: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.background.trench,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  downloadHint: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.caption * Typography.lineHeights.relaxed,
  },
});

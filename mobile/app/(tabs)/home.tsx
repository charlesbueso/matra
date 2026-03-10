// ============================================================
// MATRA — Home Tab
// ============================================================

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StarField, BioAlgae, Card, Button, TreeTrunk } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useFamilyStore } from '../../src/stores/familyStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { useTranslation } from 'react-i18next';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/tokens';
import { SubscriptionStatusBanner } from '../../src/components/SubscriptionStatusBanner';

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const selfPersonId = useAuthStore((s) => s.profile?.self_person_id);
  const { people, interviews, stories, isLoading, fetchAllFamilyData, fetchFamilyGroups } = useFamilyStore();
  const isProcessingInterview = useFamilyStore((s) => s.isProcessingInterview);
  const backgroundJobs = useFamilyStore((s) => s.backgroundJobs);
  const dismissJob = useFamilyStore((s) => s.dismissJob);
  const fetchEntitlements = useSubscriptionStore((s) => s.fetchEntitlements);
  const tier = useSubscriptionStore((s) => s.tier);
  const downgrade = useSubscriptionStore((s) => s.downgrade);
  const [refreshing, setRefreshing] = React.useState(false);

  const isPremium = tier === 'premium';
  const familyGroups = useFamilyStore((s) => s.familyGroups);
  const relationships = useFamilyStore((s) => s.relationships);

  useEffect(() => {
    fetchFamilyGroups().then(() => fetchAllFamilyData());
    fetchEntitlements();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllFamilyData();
    setRefreshing(false);
  };

  const conversationsRemaining = profile?.subscription_tier === 'free'
    ? Math.max(0, 2 - (profile?.interview_count || 0))
    : null;

  const hasConversations = interviews.length > 0;

  // People who don't have a conversation yet (excluding self)
  const peopleWithoutConversation = people.filter((p) => p.id !== selfPersonId);

  return (
    <StarField starCount={30}>
      <TreeTrunk opacity={0.18} />
      <BioAlgae strandCount={60} height={0.22} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent.cyan} />
        }
      >
        {/* Greeting */}
        <View style={styles.greeting}>
          <View style={styles.greetingRow}>
            <Text style={styles.greetingText}>
              {t('home.welcomeBack', { name: profile?.display_name || 'Explorer' })}
            </Text>
            {isPremium && (
              <LinearGradient
                colors={Colors.gradients.premium as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.premiumBadge}
              >
                <Text style={styles.premiumBadgeText}>◈ {t('home.premium')}</Text>
              </LinearGradient>
            )}
          </View>
          <Text style={styles.greetingSubtext}>
            {people.length <= 1 ? t('home.startConversation') : t('home.treeGrowing')}
          </Text>
        </View>

        {/* Subscription Status Banners (grace period / lapsed / billing retry) */}
        <SubscriptionStatusBanner />

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <StatCard label={t('home.people', { count: people.length })} value={people.length} icon="🌳" onPress={() => router.push('/(tabs)/tree')} isPremium={isPremium} />
          <StatCard label={t('home.sessions', { count: interviews.length })} value={interviews.length} icon="🎙" onPress={() => router.push({ pathname: '/(tabs)/settings', params: { scrollTo: 'conversations' } })} isPremium={isPremium} />
          <StatCard label={t('home.stories', { count: stories.length })} value={stories.length} icon="📖" onPress={() => router.push('/(tabs)/stories')} isPremium={isPremium} />
        </View>

        {/* Processing / Completed Job Banners */}
        {backgroundJobs.filter((j) => j.status === 'processing').length > 0 && (
          <Card variant="glow" style={styles.processingBanner} onPress={() => router.push('/(tabs)/record')}>
            <View style={styles.processingBannerContent}>
              <ActivityIndicator size="small" color={Colors.accent.glow} />
              <View style={{ flex: 1 }}>
                <Text style={styles.processingBannerTitle}>
                  {t('home.processingCount', { count: backgroundJobs.filter((j) => j.status === 'processing').length })}
                </Text>
                <Text style={styles.processingBannerDetail}>
                  {t('home.processingDetail')}
                </Text>
              </View>
            </View>
          </Card>
        )}
        {backgroundJobs.filter((j) => j.status === 'completed').map((job) => (
          <Pressable
            key={job.id}
            style={styles.completedBanner}
            onPress={() => {
              dismissJob(job.id);
              if (job.interviewId) router.push(`/interview/${job.interviewId}`);
            }}
          >
            <Text style={styles.completedBannerIcon}>✅</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.completedBannerTitle}>{t('home.jobReady', { title: job.title })}</Text>
              <Text style={styles.completedBannerDetail}>{t('home.jobReadyDetail')}</Text>
            </View>
          </Pressable>
        ))}
        {backgroundJobs.filter((j) => j.status === 'failed').map((job) => (
          <Pressable
            key={job.id}
            style={styles.failedBanner}
            onPress={() => dismissJob(job.id)}
          >
            <Text style={styles.completedBannerIcon}>❌</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.completedBannerTitle}>{t('home.jobFailed', { title: job.title })}</Text>
              <Text style={styles.completedBannerDetail}>{job.error || t('home.jobFailedDetail')}</Text>
            </View>
          </Pressable>
        ))}

        {/* First-time family setup prompt — shown when user just onboarded */}
        {people.length <= 1 && interviews.length === 0 && (
          <Card variant="glow" style={styles.ctaCard}>
            <Text style={styles.ctaTitle}>{t('home.setupFamilyTitle')}</Text>
            <Text style={styles.ctaDescription}>{t('home.setupFamilyDesc')}</Text>
            <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
              <Button
                title={t('home.setupFamilyAction')}
                onPress={() => router.push('/family-group')}
                variant="primary"
                size="md"
              />
            </View>
          </Card>
        )}

        {/* First Conversation CTA — shown when no conversations exist */}
        {!hasConversations && (
          <Card variant="glow" style={[styles.ctaCard, isPremium && styles.ctaCardPremium]}>
            <Text style={styles.ctaTitle}>{t('home.shareStoryFirst')}</Text>
            <Text style={styles.ctaDescription}>
              {t('home.shareStoryFirstDesc')}
            </Text>
            {conversationsRemaining !== null && (
              <Text style={styles.ctaLimit}>
                {t('home.freeSessionsRemaining', { count: conversationsRemaining })}
              </Text>
            )}
            <Button
              title={t('home.shareMyStory')}
              onPress={() => {
                if (selfPersonId) {
                  router.push({ pathname: '/(tabs)/record', params: { personId: selfPersonId } });
                } else {
                  router.push('/(tabs)/record');
                }
              }}
              variant={isPremium ? 'premium' : 'primary'}
              size="md"
              style={{ marginTop: Spacing.md }}
            />
          </Card>
        )}

        {/* General Record CTA — shown when conversations exist */}
        {hasConversations && (
          <Card variant="glow" style={[styles.ctaCard, isPremium && styles.ctaCardPremium]}>
            <Text style={styles.ctaTitle}>{t('home.recordConversation')}</Text>
            <Text style={styles.ctaDescription}>
              {t('home.recordConversationDesc')}
            </Text>
            {conversationsRemaining !== null && (
              <Text style={styles.ctaLimit}>
                {t('home.freeSessionsRemaining', { count: conversationsRemaining })}
              </Text>
            )}
            <Button
              title={t('home.startRecording')}
              onPress={() => router.push('/(tabs)/record')}
              variant={isPremium ? 'premium' : 'primary'}
              size="md"
              style={{ marginTop: Spacing.md }}
            />
          </Card>
        )}

        {/* Quick Record for Existing People */}
        {hasConversations && peopleWithoutConversation.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('home.captureMoreStories')}</Text>
            <Text style={styles.sectionSubtitle}>
              {t('home.captureMoreStoriesDesc')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.personChipsContainer}
            >
              {peopleWithoutConversation.slice(0, 8).map((person) => {
                const name = `${person.first_name}${person.last_name ? ' ' + person.last_name.charAt(0) + '.' : ''}`;
                return (
                  <Card
                    key={person.id}
                    variant="default"
                    style={styles.personChipCard}
                    onPress={() => router.push({ pathname: '/(tabs)/record', params: { personId: person.id } })}
                  >
                    <View style={styles.personChipAvatar}>
                      <Text style={styles.personChipAvatarText}>
                        {person.first_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.personChipName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.personChipAction}>{t('home.recordEmoji')}</Text>
                  </Card>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Recent Conversations */}
        {interviews.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('home.recentConversations')}</Text>
            {interviews.slice(0, 3).map((interview) => (
              <Card
                key={interview.id}
                variant="default"
                style={styles.interviewCard}
                onPress={() => router.push(`/interview/${interview.id}`)}
              >
                <Text style={styles.interviewTitle}>{interview.title || t('common.untitledConversation')}</Text>
                <Text style={styles.interviewDate}>
                  {new Date(interview.created_at).toLocaleDateString()}
                </Text>
                {interview.ai_summary && (
                  <Text style={styles.interviewSummary} numberOfLines={2}>
                    {interview.ai_summary}
                  </Text>
                )}
                <View style={styles.interviewMeta}>
                  <Text style={styles.statusBadge}>
                    {interview.status === 'completed' ? t('common.processed') : t('common.processing')}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Premium Features Section (premium users) */}
        {isPremium && (
          <View style={styles.premiumFeaturesCard}>
            <View style={styles.premiumFeaturesHeader}>
              <Text style={styles.premiumFeaturesIcon}>◈</Text>
              <Text style={styles.premiumFeaturesTitle}>{t('home.premiumFeatures')}</Text>
            </View>
            <View style={styles.premiumFeaturesGrid}>
              <View style={styles.premiumFeatureItem}>
                <Text style={styles.premiumFeatureEmoji}>🎙️</Text>
                <Text style={styles.premiumFeatureLabel}>{t('home.premium30mo')}</Text>
              </View>
              <View style={styles.premiumFeatureItem}>
                <Text style={styles.premiumFeatureEmoji}>✨</Text>
                <Text style={styles.premiumFeatureLabel}>{t('home.premiumAI')}</Text>
              </View>
              <View style={styles.premiumFeatureItem}>
                <Text style={styles.premiumFeatureEmoji}>📖</Text>
                <Text style={styles.premiumFeatureLabel}>{t('home.premiumExport')}</Text>
              </View>
              <View style={styles.premiumFeatureItem}>
                <Text style={styles.premiumFeatureEmoji}>👨‍👩‍👧‍👦</Text>
                <Text style={styles.premiumFeatureLabel}>{t('home.premiumSharing')}</Text>
              </View>
              <View style={styles.premiumFeatureItem}>
                <Text style={styles.premiumFeatureEmoji}>🔊</Text>
                <Text style={styles.premiumFeatureLabel}>{t('home.premiumAudioSnippets')}</Text>
              </View>
              <View style={styles.premiumFeatureItem}>
                <Text style={styles.premiumFeatureEmoji}>🌟</Text>
                <Text style={styles.premiumFeatureLabel}>{t('home.premiumMoreStories')}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Upgrade Banner (free tier only, not shown for lapsed users who already see their banner) */}
        {!isPremium && !downgrade.isLapsed && !downgrade.inGracePeriod && (
          <Card
            variant="elevated"
            style={styles.upgradeCard}
            onPress={() => router.push('/paywall')}
          >
            <Text style={styles.upgradeTitle}>{t('home.unlockPremium')}</Text>
            <Text style={styles.upgradeDescription}>
              {t('home.unlockPremiumDesc')}
            </Text>
            <Button
              title={t('home.seePlans')}
              onPress={() => router.push('/paywall')}
              variant="premium"
              size="sm"
              style={{ marginTop: Spacing.sm, alignSelf: 'flex-start' }}
            />
          </Card>
        )}
      </ScrollView>
    </StarField>
  );
}

function StatCard({ label, value, icon, onPress, isPremium }: { label: string; value: number; icon: string; onPress?: () => void; isPremium?: boolean }) {
  return (
    <Card variant="default" style={[styles.statCard, isPremium && styles.statCardPremium]} onPress={onPress}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={[styles.statLabel, isPremium && styles.statLabelPremium]}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    paddingTop: 60,
    paddingBottom: 100,
  },
  greeting: {
    marginBottom: Spacing.xxl,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  greetingText: {
    fontSize: Typography.sizes.h2,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
  },
  premiumBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: BorderRadius.sm,
    alignSelf: 'center',
  },
  premiumBadgeText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.bodySemiBold,
    color: '#FFFFFF',
    letterSpacing: Typography.letterSpacing.wide,
  },
  greetingSubtext: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    marginTop: Spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
  },
  statCardPremium: {
    borderColor: Colors.accent.amber + '30',
    borderWidth: 1,
  },
  statIcon: {
    fontSize: 20,
    marginBottom: Spacing.xs,
    color: Colors.accent.cyan,
  },
  statValue: {
    fontSize: Typography.sizes.h2,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
  },
  statLabel: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    textTransform: 'uppercase',
    letterSpacing: Typography.letterSpacing.wider,
  },
  statLabelPremium: {
    color: Colors.accent.amber,
  },
  ctaCard: {
    marginBottom: Spacing.xl,
  },
  ctaCardPremium: {
    borderColor: Colors.accent.amber + '25',
    shadowColor: Colors.accent.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  ctaTitle: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    marginBottom: Spacing.sm,
  },
  ctaDescription: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  ctaLimit: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.accent.amber,
    marginTop: Spacing.sm,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    marginBottom: Spacing.md,
    lineHeight: Typography.sizes.caption * Typography.lineHeights.relaxed,
  },
  interviewCard: {
    marginBottom: Spacing.md,
  },
  interviewTitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
  },
  interviewDate: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: Spacing.xxs,
  },
  interviewSummary: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    marginTop: Spacing.sm,
    lineHeight: Typography.sizes.caption * Typography.lineHeights.relaxed,
  },
  interviewMeta: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
  },
  statusBadge: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.semantic.success,
  },
  premiumFeaturesCard: {
    backgroundColor: Colors.accent.amber + '08',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.accent.amber + '20',
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  premiumFeaturesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  premiumFeaturesIcon: {
    fontSize: 18,
    color: Colors.accent.amber,
  },
  premiumFeaturesTitle: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.subheading,
    color: Colors.accent.amber,
    letterSpacing: Typography.letterSpacing.wide,
    textTransform: 'uppercase',
  },
  premiumFeaturesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  premiumFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.accent.amber + '10',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  premiumFeatureEmoji: {
    fontSize: 14,
  },
  premiumFeatureLabel: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.text.moonlight,
  },
  upgradeCard: {
    borderColor: Colors.accent.amber,
    borderWidth: 1,
    backgroundColor: '#FBF3E0',
  },
  upgradeTitle: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.heading,
    color: Colors.accent.amber,
    marginBottom: Spacing.xs,
  },
  upgradeDescription: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.caption * Typography.lineHeights.relaxed,
  },
  // ── Person Chip Styles ──
  personChipsContainer: {
    gap: Spacing.md,
    paddingRight: Spacing.xl,
  },
  personChipCard: {
    width: 110,
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  personChipAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personChipAvatarText: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.heading,
    color: '#FFFFFF',
  },
  personChipName: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
    textAlign: 'center',
  },
  personChipAction: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.accent.cyan,
  },
  // ── Processing Banner ──
  processingBanner: {
    marginBottom: Spacing.lg,
  },
  processingBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  processingBannerTitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.subheading,
    color: Colors.accent.glow,
  },
  processingBannerDetail: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    marginTop: 2,
  },
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background.trench,
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent.cyan,
    marginBottom: Spacing.sm,
  },
  failedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.background.trench,
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent.coral + '60',
    marginBottom: Spacing.sm,
  },
  completedBannerIcon: {
    fontSize: 20,
  },
  completedBannerTitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
  },
  completedBannerDetail: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: 2,
  },
});

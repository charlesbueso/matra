// ============================================================
// MATRA — Home Tab
// ============================================================

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { StarField, BioAlgae, Card, Button, TreeTrunk } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useFamilyStore } from '../../src/stores/familyStore';
import { Colors, Typography, Spacing } from '../../src/theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const selfPersonId = useAuthStore((s) => s.profile?.self_person_id);
  const { people, interviews, stories, isLoading, fetchAllFamilyData, fetchFamilyGroups } = useFamilyStore();
  const [refreshing, setRefreshing] = React.useState(false);

  useEffect(() => {
    fetchFamilyGroups().then(() => fetchAllFamilyData());
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
          <Text style={styles.greetingText}>
            Welcome back, {profile?.display_name || 'Explorer'}
          </Text>
          <Text style={styles.greetingSubtext}>
            Your family tree is growing
          </Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <StatCard label="People" value={people.length} icon="🌳" onPress={() => router.push('/(tabs)/tree')} />
          <StatCard label="Sessions" value={interviews.length} icon="🎙" onPress={() => router.push({ pathname: '/(tabs)/settings', params: { scrollTo: 'conversations' } })} />
          <StatCard label="Stories" value={stories.length} icon="📖" onPress={() => router.push('/(tabs)/stories')} />
        </View>

        {/* First Conversation CTA — shown when no conversations exist */}
        {!hasConversations && (
          <Card variant="glow" style={styles.ctaCard}>
            <Text style={styles.ctaTitle}>Share Your Story First</Text>
            <Text style={styles.ctaDescription}>
              Start by recording your own memories and family lore. This helps the AI understand your family tree so future conversations are even richer.
            </Text>
            {conversationsRemaining !== null && (
              <Text style={styles.ctaLimit}>
                {conversationsRemaining} free session{conversationsRemaining !== 1 ? 's' : ''} remaining
              </Text>
            )}
            <Button
              title="Share My Story"
              onPress={() => {
                if (selfPersonId) {
                  router.push({ pathname: '/(tabs)/record', params: { personId: selfPersonId } });
                } else {
                  router.push('/(tabs)/record');
                }
              }}
              variant="primary"
              size="md"
              style={{ marginTop: Spacing.md }}
            />
          </Card>
        )}

        {/* General Record CTA — shown when conversations exist */}
        {hasConversations && (
          <Card variant="glow" style={styles.ctaCard}>
            <Text style={styles.ctaTitle}>Record a Conversation</Text>
            <Text style={styles.ctaDescription}>
              Sit down with a family member and let their stories become branches in your living tree.
            </Text>
            {conversationsRemaining !== null && (
              <Text style={styles.ctaLimit}>
                {conversationsRemaining} free session{conversationsRemaining !== 1 ? 's' : ''} remaining
              </Text>
            )}
            <Button
              title="Start Recording"
              onPress={() => router.push('/(tabs)/record')}
              variant="primary"
              size="md"
              style={{ marginTop: Spacing.md }}
            />
          </Card>
        )}

        {/* Quick Record for Existing People */}
        {hasConversations && peopleWithoutConversation.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Capture More Stories</Text>
            <Text style={styles.sectionSubtitle}>
              Record a conversation with a family member to grow their branch.
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
                    <Text style={styles.personChipAction}>Record 🎙</Text>
                  </Card>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Recent Conversations */}
        {interviews.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Conversations</Text>
            {interviews.slice(0, 3).map((interview) => (
              <Card
                key={interview.id}
                variant="default"
                style={styles.interviewCard}
                onPress={() => router.push(`/interview/${interview.id}`)}
              >
                <Text style={styles.interviewTitle}>{interview.title || 'Untitled Conversation'}</Text>
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
                    {interview.status === 'completed' ? '✓ Processed' : '⏳ Processing...'}
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Upgrade Banner (free tier only) */}
        {profile?.subscription_tier === 'free' && (
          <Card
            variant="elevated"
            style={styles.upgradeCard}
            onPress={() => router.push('/paywall')}
          >
            <Text style={styles.upgradeTitle}>◈ Unlock Premium</Text>
            <Text style={styles.upgradeDescription}>
              Unlimited conversations, AI biographies, memory book exports, and more.
            </Text>
            <Button
              title="See Plans"
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

function StatCard({ label, value, icon, onPress }: { label: string; value: number; icon: string; onPress?: () => void }) {
  return (
    <Card variant="default" style={styles.statCard} onPress={onPress}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
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
  greetingText: {
    fontSize: Typography.sizes.h2,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
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
  ctaCard: {
    marginBottom: Spacing.xl,
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
});

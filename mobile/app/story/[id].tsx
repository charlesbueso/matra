// ============================================================
// MATRA — Story Detail Screen
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StarField, Card, Button, BioAlgae, CornerBush } from '../../src/components/ui';
import { useFamilyStore } from '../../src/stores/familyStore';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/tokens';

export default function StoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { stories, people, interviews } = useFamilyStore();

  const story = stories.find((s) => s.id === id);

  if (!story) {
    return (
      <StarField>
        <BioAlgae strandCount={30} height={0.15} />
        <CornerBush />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Story not found</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="ghost" />
        </View>
      </StarField>
    );
  }

  // Find interviewee name
  const interview = interviews.find((i) => i.id === story.interview_id);
  const interviewPerson = interview
    ? people.find((p) => p.id === interview.person_id)
    : null;

  // Find mentioned people by scanning story content
  const mentionedPeople = people.filter(
    (p) =>
      story.content.includes(p.first_name) && p.id !== interview?.person_id
  );

  const formattedDate = story.time_period
    || (story.created_at
        ? new Date(story.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : '');

  return (
    <StarField starCount={18}>
      <BioAlgae strandCount={30} height={0.15} />
      <CornerBush />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Back Button */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>

        {/* Story Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          {story.ai_generated && (
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>✨ AI-crafted narrative</Text>
            </View>
          )}
          <Text style={styles.title}>{story.title}</Text>
          <View style={styles.meta}>
            {interviewPerson && (
              <Pressable
                onPress={() => router.push(`/person/${interviewPerson.id}`)}
                style={styles.metaChip}
              >
                <Text style={styles.metaChipText}>
                  Told by {interviewPerson.first_name}
                </Text>
              </Pressable>
            )}
            {formattedDate ? (
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{formattedDate}</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* Story Content */}
        <Animated.View entering={FadeInDown.delay(200)}>
          <Card variant="glow" style={styles.contentCard}>
            <Text style={styles.body}>{story.content}</Text>
          </Card>
        </Animated.View>

        {/* People Mentioned */}
        {mentionedPeople.length > 0 && (
          <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
            <Text style={styles.sectionTitle}>People in this story</Text>
            <View style={styles.peoplePills}>
              {mentionedPeople.map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.personPill}
                  onPress={() => router.push(`/person/${p.id}`)}
                >
                  <View style={styles.personAvatar}>
                    <Text style={styles.personAvatarText}>
                      {p.first_name[0]}
                    </Text>
                  </View>
                  <Text style={styles.personName}>
                    {p.first_name} {p.last_name?.[0] ? `${p.last_name[0]}.` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Source Interview */}
        {interview && (
          <Animated.View entering={FadeInDown.delay(400)} style={styles.section}>
            <Text style={styles.sectionTitle}>Source Interview</Text>
            <Card variant="default" style={styles.interviewCard}>
              <View style={styles.interviewRow}>
                <View>
                  <Text style={styles.interviewTitle}>{interview.title}</Text>
                  <Text style={styles.interviewDate}>
                    {new Date(interview.recorded_at || interview.created_at).toLocaleDateString()}
                    {interview.duration_seconds
                      ? ` · ${Math.floor(interview.duration_seconds / 60)} min`
                      : ''}
                  </Text>
                </View>
              </View>
            </Card>
          </Animated.View>
        )}
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
    paddingTop: 50,
    paddingBottom: 100,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  backIcon: {
    fontSize: 20,
    color: Colors.text.starlight,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: -1,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  aiBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(107, 143, 60, 0.12)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
  aiBadgeText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.glow,
  },
  title: {
    fontSize: Typography.sizes.h1,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    lineHeight: Typography.sizes.h1 * Typography.lineHeights.tight,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  metaChip: {
    backgroundColor: Colors.overlay.light,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  metaChipText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
  },
  contentCard: {
    marginBottom: Spacing.xxl,
  },
  body: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  section: {
    marginBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
    marginBottom: Spacing.md,
  },
  peoplePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  personPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.overlay.light,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  personAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarText: {
    fontSize: 12,
    fontFamily: Typography.fonts.bodySemiBold,
    color: '#FFFFFF',
  },
  personName: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.starlight,
  },
  interviewCard: {
    padding: Spacing.lg,
  },
  interviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    marginTop: 2,
  },
  notFound: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  notFoundText: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
  },
});

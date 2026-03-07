// ============================================================
// MATRA — Stories Tab
// ============================================================

import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StarField, Card, BioAlgae, CornerBush } from '../../src/components/ui';
import { useFamilyStore } from '../../src/stores/familyStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useTranslation } from 'react-i18next';
import { useNotificationStore } from '../../src/stores/notificationStore';
import { Colors, Typography, Spacing } from '../../src/theme/tokens';

export default function StoriesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { stories, fetchStories } = useFamilyStore();
  const { profile } = useAuthStore();
  const isFree = profile?.subscription_tier !== 'premium';

  useEffect(() => {
    fetchStories();
  }, []);

  // Mark stories as read when this tab is viewed
  useFocusEffect(
    useCallback(() => {
      useNotificationStore.getState().markStoriesRead();
    }, [])
  );

  if (stories.length === 0) {
    return (
      <StarField starCount={30}>
        <BioAlgae strandCount={30} height={0.15} />
        <CornerBush />
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📖</Text>
          <Text style={styles.emptyTitle}>{t('stories.noStories')}</Text>
          <Text style={styles.emptySubtitle}>
            {t('stories.noStoriesDesc')}
          </Text>
        </View>
      </StarField>
    );
  }

  return (
    <StarField starCount={25}>
      <BioAlgae strandCount={30} height={0.15} />
      <CornerBush />
      <View style={styles.container}>
        <Text style={styles.title}>{t('stories.title')}</Text>
        <Text style={styles.subtitle}>{t('stories.memoriesPreserved', { count: stories.length })}</Text>

        <FlatList
          data={stories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
              <Card
                variant="default"
                style={styles.storyCard}
                onPress={() => router.push(`/story/${item.id}`)}
              >
                <View style={styles.storyHeader}>
                  <Text style={styles.storyTitle}>{item.title}</Text>
                  {item.ai_generated && (
                    <Text style={styles.aiBadge}>{t('stories.aiBadge')}</Text>
                  )}
                </View>
                <Text style={styles.storyContent} numberOfLines={3}>
                  {item.content}
                </Text>
                <View style={styles.storyMeta}>
                  {item.event_date && (
                    <Text style={styles.storyDate}>
                      📅 {new Date(item.event_date).toLocaleDateString()}
                    </Text>
                  )}
                  {item.event_location && (
                    <Text style={styles.storyLocation}>📍 {item.event_location}</Text>
                  )}
                </View>
                <Text style={styles.storyGenerated}>
                  {t('stories.generatedOn', { date: new Date(item.created_at).toLocaleDateString() })}
                </Text>
                {isFree && (
                  <View style={styles.snippetHint}>
                    <Text style={styles.snippetHintText}>
                      {t('stories.premiumAudioHint')}
                    </Text>
                  </View>
                )}
              </Card>
            </Animated.View>
          )}
        />
      </View>
    </StarField>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
  },
  title: {
    fontSize: Typography.sizes.h2,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
  },
  subtitle: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginBottom: Spacing.lg,
  },
  list: {
    gap: Spacing.md,
    paddingBottom: 100,
  },
  storyCard: {},
  storyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  storyTitle: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
    flex: 1,
  },
  aiBadge: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.accent.glow,
    backgroundColor: Colors.background.current,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xxs,
    borderRadius: 4,
    overflow: 'hidden',
    marginLeft: Spacing.sm,
  },
  storyContent: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  storyMeta: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.md,
  },
  storyDate: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
  },
  storyLocation: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
  },
  storyGenerated: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: Spacing.sm,
    opacity: 0.7,
  },
  snippetHint: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139, 115, 85, 0.08)',
  },
  snippetHintText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.accent.amber,
    opacity: 0.8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xxl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: Spacing.xl,
  },
  emptyTitle: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptySubtitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    textAlign: 'center',
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
});

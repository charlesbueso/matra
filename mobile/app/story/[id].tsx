// ============================================================
// MATRA — Story Detail Screen
// ============================================================

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Audio } from 'expo-av';
import { StarField, Card, Button, BioAlgae, CornerBush } from '../../src/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useFamilyStore, type AudioSnippet } from '../../src/stores/familyStore';
import { useAuthStore } from '../../src/stores/authStore';
import { trackEvent, AnalyticsEvents } from '../../src/services/analytics';
import { useTranslation } from 'react-i18next';
import { useSignedUrl } from '../../src/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/tokens';

export default function StoryDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { stories, people, interviews } = useFamilyStore();
  const { profile } = useAuthStore();
  const isFree = profile?.subscription_tier !== 'premium';

  const story = stories.find((s) => s.id === id);
  const interview = story ? interviews.find((i) => i.id === story.interview_id) : null;

  // Audio snippet player state
  const audioSnippets: AudioSnippet[] = (!isFree && story?.metadata?.audioSnippets) || [];
  const audioKey = interview?.audio_storage_path || null;
  const audioUrl = useSignedUrl(audioSnippets.length > 0 ? audioKey : null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    if (story) trackEvent(AnalyticsEvents.STORY_VIEWED, { storyId: id });
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      soundRef.current?.unloadAsync();
    };
  }, []);

  const playSnippet = useCallback(async (snippet: AudioSnippet, idx: number) => {
    if (!audioUrl) return;

    // If already playing this snippet, stop it
    if (playingIdx === idx) {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
      soundRef.current = null;
      setPlayingIdx(null);
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      return;
    }

    // Stop any currently playing snippet
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    }

    setLoadingIdx(idx);
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { positionMillis: snippet.startMs, shouldPlay: true },
      );
      soundRef.current = sound;
      setPlayingIdx(idx);
      setLoadingIdx(null);

      // Auto-stop at endMs
      const duration = snippet.endMs - snippet.startMs;
      stopTimerRef.current = setTimeout(async () => {
        await sound.stopAsync();
        await sound.unloadAsync();
        soundRef.current = null;
        setPlayingIdx(null);
      }, duration);

      // Also handle natural completion
      sound.setOnPlaybackStatusUpdate((status) => {
        if ('didJustFinish' in status && status.didJustFinish) {
          if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
          sound.unloadAsync();
          soundRef.current = null;
          setPlayingIdx(null);
        }
      });
    } catch (err) {
      console.warn('[story] Audio snippet playback failed:', err);
      setLoadingIdx(null);
      setPlayingIdx(null);
    }
  }, [audioUrl, playingIdx]);

  if (!story) {
    return (
      <StarField>
        <BioAlgae strandCount={30} height={0.15} />
        <CornerBush />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>{t('storyDetail.notFound')}</Text>
          <Button title={t('common.goBack')} onPress={() => router.back()} variant="ghost" />
        </View>
      </StarField>
    );
  }

  // Find interviewee name
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
          <Ionicons name="arrow-back" size={20} color={Colors.text.starlight} />
        </Pressable>

        {/* Story Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          {story.ai_generated && (
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>{t('storyDetail.aiCrafted')}</Text>
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
                  {t('storyDetail.toldBy', { name: interviewPerson.first_name })}
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
            {isFree && (
              <Pressable onPress={() => router.push('/paywall')} style={styles.snippetPromo}>
                <Ionicons name="volume-medium-outline" size={18} color={Colors.accent.amber} />
                <Text style={styles.snippetPromoText}>
                  {t('storyDetail.premiumAudioPromo')}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.accent.amber} />
              </Pressable>
            )}
            <Text style={styles.generatedAt}>
              {t('storyDetail.generatedAt', { date: new Date(story.created_at).toLocaleString() })}
            </Text>
          </Card>
        </Animated.View>

        {/* Audio Snippets (Premium) */}
        {audioSnippets.length > 0 && (
          <Animated.View entering={FadeInDown.delay(250)} style={styles.section}>
            <Text style={styles.sectionTitle}>{t('storyDetail.listenToKeyMoments')}</Text>
            <View style={styles.snippetList}>
              {audioSnippets.map((snippet, idx) => (
                <Pressable
                  key={idx}
                  style={[
                    styles.snippetCard,
                    playingIdx === idx && styles.snippetCardActive,
                  ]}
                  onPress={() => playSnippet(snippet, idx)}
                >
                  <View style={styles.snippetPlayBtn}>
                    {loadingIdx === idx ? (
                      <ActivityIndicator size="small" color={Colors.accent.cyan} />
                    ) : (
                      <Ionicons
                        name={playingIdx === idx ? 'stop' : 'play'}
                        size={16}
                        color={playingIdx === idx ? Colors.accent.coral : Colors.accent.cyan}
                      />
                    )}
                  </View>
                  <View style={styles.snippetContent}>
                    <Text style={styles.snippetLabel}>{snippet.label}</Text>
                    <Text style={styles.snippetQuote} numberOfLines={2}>
                      “{snippet.quote}”
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        {/* People Mentioned */}
        {mentionedPeople.length > 0 && (
          <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
            <Text style={styles.sectionTitle}>{t('storyDetail.peopleInStory')}</Text>
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
            <Card
              variant="default"
              style={styles.interviewCard}
              onPress={() => router.push(`/interview/${interview.id}`)}
            >
              <View style={styles.interviewRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.interviewTitle}>{interview.title}</Text>
                  <Text style={styles.interviewDate}>
                    {new Date(interview.recorded_at || interview.created_at).toLocaleDateString()}
                    {interview.duration_seconds
                      ? ` · ${Math.floor(interview.duration_seconds / 60)} min`
                      : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.text.twilight} />
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
  generatedAt: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: Spacing.lg,
    opacity: 0.7,
  },
  snippetPromo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: 'rgba(196, 164, 105, 0.08)',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(196, 164, 105, 0.15)',
  },
  snippetPromoText: {
    flex: 1,
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.accent.amber,
    lineHeight: Typography.sizes.small * Typography.lineHeights.relaxed,
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
  snippetList: {
    gap: Spacing.sm,
  },
  snippetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.overlay.light,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(107, 143, 60, 0.1)',
  },
  snippetCardActive: {
    backgroundColor: 'rgba(107, 143, 60, 0.08)',
    borderColor: Colors.accent.glow,
  },
  snippetPlayBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(107, 143, 60, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  snippetContent: {
    flex: 1,
    gap: 2,
  },
  snippetLabel: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.glow,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  snippetQuote: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    fontStyle: 'italic',
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.small * Typography.lineHeights.relaxed,
  },
});

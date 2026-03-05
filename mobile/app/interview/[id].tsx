// ============================================================
// MATRA — Interview Detail Screen
// ============================================================

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StarField, Card, Button, BioAlgae, CornerBush } from '../../src/components/ui';
import { useFamilyStore } from '../../src/stores/familyStore';
import { supabase } from '../../src/services/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/tokens';

interface Transcript {
  id: string;
  full_text: string;
  provider: string;
  language: string | null;
  confidence: number | null;
  created_at: string;
}

export default function InterviewDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { interviews, people } = useFamilyStore();
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);

  const interview = interviews.find((i) => i.id === id);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase
        .from('transcripts')
        .select('id, full_text, provider, language, confidence, created_at')
        .eq('interview_id', id)
        .limit(1)
        .single();
      if (data) setTranscript(data);
      setLoading(false);
    })();
  }, [id]);

  if (!interview) {
    return (
      <StarField>
        <BioAlgae strandCount={30} height={0.15} />
        <CornerBush />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Interview not found</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="ghost" />
        </View>
      </StarField>
    );
  }

  const formattedDate = new Date(interview.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <StarField starCount={20}>
      <BioAlgae strandCount={30} height={0.15} />
      <CornerBush />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Back Button */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>

        {/* Interview Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <Text style={styles.title}>{interview.title || 'Untitled Interview'}</Text>
          <View style={styles.meta}>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>
                {interview.status === 'completed' ? '✓ Processed' : '⏳ Processing'}
              </Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>{formattedDate}</Text>
            </View>
          </View>
        </Animated.View>

        {/* AI Summary */}
        {interview.ai_summary && (
          <Animated.View entering={FadeInDown.delay(200)}>
            <Card variant="glow" style={styles.section}>
              <Text style={styles.sectionTitle}>AI Summary</Text>
              <Text style={styles.summaryText}>{interview.ai_summary}</Text>
            </Card>
          </Animated.View>
        )}

        {/* Key Topics */}
        {interview.ai_key_topics && interview.ai_key_topics.length > 0 && (
          <Animated.View entering={FadeInDown.delay(300)} style={styles.topicsContainer}>
            <Text style={styles.sectionTitle}>Key Topics</Text>
            <View style={styles.topicPills}>
              {interview.ai_key_topics.map((topic, i) => (
                <View key={i} style={styles.topicPill}>
                  <Text style={styles.topicText}>{topic}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Transcript */}
        <Animated.View entering={FadeInDown.delay(400)}>
          <Card variant="default" style={styles.section}>
            <Text style={styles.sectionTitle}>Transcript</Text>
            {loading ? (
              <ActivityIndicator color={Colors.accent.cyan} style={{ marginVertical: Spacing.xl }} />
            ) : transcript ? (
              <>
                <Text style={styles.transcriptText}>{transcript.full_text}</Text>
                <View style={styles.transcriptMeta}>
                  <Text style={styles.transcriptMetaText}>
                    Provider: {transcript.provider} · Language: {transcript.language || 'en'}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.noTranscript}>No transcript available</Text>
            )}
          </Card>
        </Animated.View>
      </ScrollView>
    </StarField>
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background.depth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
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
  title: {
    fontSize: Typography.sizes.h2,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    marginBottom: Spacing.sm,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metaChip: {
    backgroundColor: Colors.background.trench,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  metaChipText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.accent.cyan,
    marginBottom: Spacing.md,
  },
  summaryText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.starlight,
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  topicsContainer: {
    marginBottom: Spacing.lg,
  },
  topicPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  topicPill: {
    backgroundColor: 'rgba(107, 143, 60, 0.08)',
    borderWidth: 1,
    borderColor: Colors.accent.cyan,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  topicText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.accent.cyan,
  },
  transcriptText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  transcriptMeta: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.background.trench,
  },
  transcriptMetaText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
  },
  noTranscript: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    fontStyle: 'italic',
  },
  notFound: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notFoundText: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    marginBottom: Spacing.md,
  },
});

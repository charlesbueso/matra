// ============================================================
// MATRA — Record Tab (Conversation Entry Point)
// ============================================================

import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, ScrollView, FlatList } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { StarField, BioAlgae, Button, VoiceWaveform, TreeTrunk, Card } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useFamilyStore, Person } from '../../src/stores/familyStore';
import { useNotificationStore } from '../../src/stores/notificationStore';
import { Colors, Typography, Spacing } from '../../src/theme/tokens';

const DEV_TRANSCRIPT = `So my grandmother, Maria Santos, she was born in 1932 in a small village outside Lisbon, Portugal. She married my grandfather, Antonio Santos, in 1955. They had three children — my mother Elena, my uncle Carlos, and my aunt Sofia.

Grandma Maria always told us stories about growing up on the farm. She said her father, my great-grandfather José, used to wake up before sunrise every morning to tend to the olive trees. He passed away in 1968, and that's when the family decided to move to America.

They settled in Newark, New Jersey in 1970. Antonio got a job at a factory and Maria worked as a seamstress. My mother Elena was born in Portugal in 1958, but she grew up mostly in New Jersey. She met my father, David Chen, at a community college in 1982. They got married in 1985.

Uncle Carlos, he stayed in Portugal actually. He married a woman named Isabel and they have two kids — my cousins Pedro and Ana. We used to visit them every summer when I was a kid.

Aunt Sofia became a nurse. She never married but she was everyone's favorite aunt. She used to make this incredible bacalhau recipe that grandma taught her. Sofia passed away in 2019 and we all miss her terribly.

One of my favorite memories is Christmas at grandma's house. The whole family would gather — sometimes twenty people crammed into that little house in Newark. She'd cook for days. Her caldo verde soup was legendary in the neighborhood.`;

export default function RecordScreen() {
  const router = useRouter();
  const { personId: preselectedPersonId } = useLocalSearchParams<{ personId?: string }>();
  const profile = useAuthStore((s) => s.profile);
  const selfPersonId = useAuthStore((s) => s.profile?.self_person_id);
  const { activeFamilyGroupId, people, processInterview, fetchAllFamilyData, fetchFamilyGroups } = useFamilyStore();
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Ensure data is loaded (the tab may mount before home finishes fetching)
  React.useEffect(() => {
    if (people.length === 0) {
      fetchFamilyGroups().then(() => fetchAllFamilyData());
    }
  }, []);

  // Auto-select person if passed via route params
  React.useEffect(() => {
    if (preselectedPersonId && people.length > 0) {
      const person = people.find((p) => p.id === preselectedPersonId);
      if (person) setSelectedPerson(person);
    }
  }, [preselectedPersonId, people]);

  // Auto-select self when there's only one person (first-time experience)
  React.useEffect(() => {
    if (!selectedPerson && people.length === 1 && selfPersonId && people[0].id === selfPersonId) {
      setSelectedPerson(people[0]);
    }
  }, [people, selfPersonId, selectedPerson]);

  // Pulse animation for recording button
  const pulse = useSharedValue(1);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: interpolate(pulse.value, [1, 1.3], [0.5, 0]),
  }));

  const startRecording = async () => {
    try {
      // Check conversation limit
      if (profile?.subscription_tier === 'free' && (profile?.interview_count || 0) >= 2) {
        router.push('/paywall');
        return;
      }

      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Microphone access is required to record conversations.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      recordingRef.current = recording;
      setIsRecording(true);
      setDuration(0);

      // Start pulse
      pulse.value = withRepeat(
        withTiming(1.3, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
      clearInterval(timerRef.current);
      pulse.value = withTiming(1, { duration: 300, easing: Easing.inOut(Easing.quad) });

      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);

      if (!uri || !activeFamilyGroupId) {
        Alert.alert('Error', 'Recording failed. Please try again.');
        return;
      }

      // Enter review state — let user choose to process or re-record
      setRecordedUri(uri);
    } catch (err) {
      console.error('Failed to stop recording:', err);
    }
  };

  const processRecording = async () => {
    if (!recordedUri || !activeFamilyGroupId) return;

    setIsProcessing(true);
    try {
      const personName = selectedPerson
        ? `${selectedPerson.first_name}${selectedPerson.last_name ? ' ' + selectedPerson.last_name : ''}`
        : 'Unknown';
      await processInterview(
        recordedUri,
        activeFamilyGroupId,
        `Conversation with ${personName}`,
        undefined,
        selectedPerson?.id
      );
      await useNotificationStore.getState().sendLocalNotification(
        'Conversation Saved!',
        'Your conversation has been transcribed and analyzed. Check your lineage map for new connections!',
      );
      Alert.alert(
        'Conversation Saved!',
        'Your conversation has been transcribed and analyzed. Check your lineage map for new connections!',
        [{ text: 'View Lineage', onPress: () => router.push('/(tabs)/tree') }]
      );
    } catch (err: any) {
      Alert.alert('Processing failed', err.message);
    } finally {
      setIsProcessing(false);
      setRecordedUri(null);
      setDuration(0);
    }
  };

  const cancelRecording = () => {
    Alert.alert(
      'Discard Recording?',
      'This will delete the voice note. Are you sure you want to re-record?',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            if (recordedUri) {
              try {
                await FileSystem.deleteAsync(recordedUri, { idempotent: true });
              } catch (_) {}
            }
            setRecordedUri(null);
            setDuration(0);
          },
        },
      ]
    );
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const sendDevTranscript = async () => {
    if (!activeFamilyGroupId) {
      Alert.alert('Error', 'No active family group. Please create one first.');
      return;
    }
    setIsProcessing(true);
    try {
      await processInterview(
        null,
        activeFamilyGroupId,
        'Dev Conversation',
        DEV_TRANSCRIPT,
        selectedPerson?.id
      );
      await useNotificationStore.getState().sendLocalNotification(
        'Conversation Saved!',
        'Your conversation has been transcribed and analyzed. Check your lineage map for new connections!',
      );
      Alert.alert(
        'Dev Conversation Processed!',
        'Fake transcript was analyzed. Check the lineage map!',
        [{ text: 'View Lineage', onPress: () => router.push('/(tabs)/tree') }]
      );
    } catch (err: any) {
      Alert.alert('Processing failed', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const isSelf = selectedPerson?.id === selfPersonId;
  const personDisplayName = selectedPerson
    ? `${selectedPerson.first_name}${selectedPerson.last_name ? ' ' + selectedPerson.last_name : ''}`
    : null;

  // ── Person Selection Screen ──
  if (!selectedPerson && !isRecording && !isProcessing) {
    return (
      <StarField starCount={30}>
        <TreeTrunk opacity={0.18} />
        <BioAlgae strandCount={50} height={0.22} />
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Who's sharing today?</Text>
            <Text style={styles.subtitle}>
              Select the person whose stories you'd like to capture.
            </Text>
          </View>

          <ScrollView style={styles.personList} contentContainerStyle={styles.personListContent}>
            {people.map((person) => {
              const isUserSelf = person.id === selfPersonId;
              const name = `${person.first_name}${person.last_name ? ' ' + person.last_name : ''}`;
              return (
                <Card
                  key={person.id}
                  variant="default"
                  style={styles.personCard}
                  onPress={() => setSelectedPerson(person)}
                >
                  <View style={styles.personCardContent}>
                    <View style={styles.personAvatar}>
                      <Text style={styles.personAvatarText}>
                        {person.first_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.personInfo}>
                      <Text style={styles.personName}>{name}</Text>
                      {isUserSelf && (
                        <Text style={styles.personSelfBadge}>You</Text>
                      )}
                    </View>
                    <Text style={styles.personArrow}>→</Text>
                  </View>
                </Card>
              );
            })}
          </ScrollView>

          {/* Dev mode: fake conversation button */}
          {__DEV__ && (
            <Pressable onPress={sendDevTranscript} style={styles.devButton}>
              <Text style={styles.devButtonText}>🧪 Dev: Fake Conversation</Text>
            </Pressable>
          )}
        </View>
        <BioAlgae strandCount={50} height={0.22} />
      </StarField>
    );
  }

  // ── Recording / Processing Screen ──
  return (
    <StarField starCount={30}>
      <TreeTrunk opacity={0.18} />
      <BioAlgae strandCount={50} height={0.22} />
      <View style={styles.container}>
        <View style={styles.header}>
          {!isRecording && !isProcessing && !recordedUri && (
            <Pressable onPress={() => setSelectedPerson(null)} style={styles.changePersonButton}>
              <Text style={styles.changePersonText}>← Change person</Text>
            </Pressable>
          )}
          <Text style={styles.title}>
            {isRecording
              ? 'Recording...'
              : isProcessing
              ? 'Processing...'
              : recordedUri
              ? 'Recording Complete'
              : 'Ready to Record'}
          </Text>
          <Text style={styles.subtitle}>
            {isRecording
              ? isSelf
                ? 'Share your memories and family stories naturally.'
                : `Let ${selectedPerson?.first_name} share their stories naturally.`
              : isProcessing
              ? 'AI is transcribing and analyzing the conversation.'
              : recordedUri
              ? 'Review your recording before processing.'
              : isSelf
              ? 'Share your own memories, family lore, and experiences.'
              : `Record ${personDisplayName}'s stories and memories.`}
          </Text>
          {!isRecording && !isProcessing && !recordedUri && selectedPerson && (
            <View style={styles.selectedPersonChip}>
              <Text style={styles.selectedPersonChipText}>
                🎙 {personDisplayName}{isSelf ? ' (You)' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Waveform */}
        <View style={styles.waveformContainer}>
          <VoiceWaveform isActive={isRecording} barCount={32} />
          <Text style={styles.timer}>{formatDuration(duration)}</Text>
        </View>

        {/* Recording Controls */}
        <View style={styles.controls}>
          {!isRecording && !isProcessing && !recordedUri && (
            <Pressable onPress={startRecording} style={styles.recordButtonOuter}>
              <View style={styles.recordButtonInner}>
                <Text style={styles.recordIcon}>🎙</Text>
              </View>
            </Pressable>
          )}

          {isRecording && (
            <View style={styles.recordingControls}>
              {/* Pulse ring */}
              <Animated.View style={[styles.pulseRing, pulseStyle]} />
              
              <Pressable onPress={stopRecording} style={styles.stopButton}>
                <View style={styles.stopIcon} />
              </Pressable>
            </View>
          )}

          {recordedUri && !isProcessing && (
            <View style={styles.reviewControls}>
              <Pressable onPress={processRecording} style={styles.processButton}>
                <Text style={styles.processButtonText}>✓ Process</Text>
              </Pressable>
              <Pressable onPress={cancelRecording} style={styles.rerecordButton}>
                <Text style={styles.rerecordButtonText}>Re-record</Text>
              </Pressable>
            </View>
          )}

          {isProcessing && (
            <View style={styles.processingContainer}>
              <Text style={styles.processingText}>◈ Analyzing the conversation...</Text>
              <Text style={styles.processingDetail}>
                This may take a minute. You'll be notified when it's done.
              </Text>
            </View>
          )}
        </View>

        {/* Tips */}
        {!isRecording && !isProcessing && !recordedUri && (
          <View style={styles.tips}>
            <Text style={styles.tipTitle}>
              {isSelf ? 'Tips for sharing your story:' : 'Tips for a great conversation:'}
            </Text>
            {isSelf ? (
              <>
                <Text style={styles.tip}>• Find a quiet, comfortable place</Text>
                <Text style={styles.tip}>• Talk about your earliest family memories</Text>
                <Text style={styles.tip}>• Mention names, places, and dates you recall</Text>
                <Text style={styles.tip}>• Share stories your parents or grandparents told you</Text>
              </>
            ) : (
              <>
                <Text style={styles.tip}>• Find a quiet place</Text>
                <Text style={styles.tip}>• Encourage them to share freely</Text>
                <Text style={styles.tip}>• Let them tell stories in their own words</Text>
                <Text style={styles.tip}>• Ask about specific memories and people</Text>
              </>
            )}
          </View>
        )}

        {/* Dev mode: fake conversation button */}
        {__DEV__ && !isRecording && !isProcessing && !recordedUri && (
          <Pressable onPress={sendDevTranscript} style={styles.devButton}>
            <Text style={styles.devButtonText}>🧪 Dev: Fake Conversation</Text>
          </Pressable>
        )}
      </View>
    </StarField>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.sizes.h2,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  waveformContainer: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  timer: {
    fontSize: Typography.sizes.hero,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    letterSpacing: Typography.letterSpacing.wider,
  },
  controls: {
    alignItems: 'center',
  },
  recordButtonOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.background.abyss,
    borderWidth: 3,
    borderColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
  },
  recordButtonInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordIcon: {
    fontSize: 32,
  },
  recordingControls: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: Colors.accent.coral,
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.accent.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: {
    width: 28,
    height: 28,
    borderRadius: 4,
    backgroundColor: Colors.text.starlight,
  },
  processingContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  processingText: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.accent.glow,
  },
  processingDetail: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    textAlign: 'center',
  },
  reviewControls: {
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
  },
  processButton: {
    width: '100%',
    backgroundColor: Colors.accent.cyan,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  processButtonText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: '#FFFFFF',
  },
  rerecordButton: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accent.coral,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  rerecordButtonText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.coral,
  },
  tips: {
    backgroundColor: Colors.background.abyss,
    borderRadius: 12,
    padding: Spacing.lg,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: 'rgba(139, 115, 85, 0.08)',
  },
  tipTitle: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.moonlight,
    marginBottom: Spacing.xs,
  },
  tip: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    lineHeight: Typography.sizes.caption * Typography.lineHeights.relaxed,
  },
  devButton: {
    backgroundColor: Colors.background.abyss,
    borderWidth: 1,
    borderColor: Colors.accent.glow,
    borderRadius: 8,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignSelf: 'center',
    marginTop: Spacing.md,
  },
  devButtonText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.glow,
  },
  // ── Person Selection Styles ──
  personList: {
    flex: 1,
    marginTop: Spacing.lg,
  },
  personListContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  personCard: {
    padding: Spacing.md,
  },
  personCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  personAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarText: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.heading,
    color: '#FFFFFF',
  },
  personInfo: {
    flex: 1,
    gap: Spacing.xxs,
  },
  personName: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
  },
  personSelfBadge: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.accent.cyan,
  },
  personArrow: {
    fontSize: Typography.sizes.h4,
    color: Colors.text.twilight,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: Typography.sizes.h4,
  },
  changePersonButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
  },
  changePersonText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.accent.cyan,
  },
  selectedPersonChip: {
    marginTop: Spacing.md,
    backgroundColor: Colors.overlay.medium,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: 20,
    alignSelf: 'center',
  },
  selectedPersonChipText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.cyan,
  },
});

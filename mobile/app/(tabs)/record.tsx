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
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../src/stores/authStore';
import { useFamilyStore, Person, BackgroundJob } from '../../src/stores/familyStore';
import { trackEvent, AnalyticsEvents } from '../../src/services/analytics';
import { Colors, Typography, Spacing } from '../../src/theme/tokens';

const DEV_TRANSCRIPT = `So my grandmother, Rose Thompson, she was born in 1932 in a small town in the countryside. She married my grandfather, Walter Thompson, in 1955. They had three children — my mother Helen, my uncle James, and my aunt Dorothy.

Grandma Rose always told us stories about growing up on the farm. She said her father, my great-grandfather Arthur, used to wake up before sunrise every morning to tend to the orchard. He passed away in 1968, and that's when the family decided to move to the city.

They settled in a small apartment in 1970. Walter got a job at a factory and Rose worked as a seamstress. My mother Helen was born in 1958, but she grew up mostly in the city. She met my father, Robert Lee, at a community college in 1982. They got married in 1985.

Uncle James, he stayed in the countryside actually. He married a woman named Margaret and they have two kids — my cousins Peter and Anne. We used to visit them every summer when I was a kid.

Aunt Dorothy became a nurse. She never married but she was everyone's favorite aunt. She used to make this incredible stew recipe that grandma taught her. Dorothy passed away in 2019 and we all miss her terribly.

One of my favorite memories is Christmas at grandma's house. The whole family would gather — sometimes twenty people crammed into that little house. She'd cook for days. Her soup was legendary in the neighborhood.`;

export default function RecordScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { personId: preselectedPersonId } = useLocalSearchParams<{ personId?: string }>();
  const profile = useAuthStore((s) => s.profile);
  const selfPersonId = useAuthStore((s) => s.profile?.self_person_id);

  // Recording duration limits per tier (seconds) — mirrors backend TIER_LIMITS
  const MAX_RECORDING_SECONDS: Record<string, number> = {
    free: 5 * 60,      // 5 minutes
    premium: 30 * 60,  // 30 minutes
  };
  const maxSeconds = MAX_RECORDING_SECONDS[profile?.subscription_tier || 'free'];
  const { activeFamilyGroupId, people, fetchAllFamilyData, fetchFamilyGroups } = useFamilyStore();
  const isProcessing = useFamilyStore((s) => s.isProcessingInterview);
  const backgroundJobs = useFamilyStore((s) => s.backgroundJobs);
  const dismissJob = useFamilyStore((s) => s.dismissJob);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const [processingStage, setProcessingStage] = useState(0);

  // Ensure data is loaded (the tab may mount before home finishes fetching)
  React.useEffect(() => {
    if (people.length === 0) {
      fetchFamilyGroups().then(() => fetchAllFamilyData());
    }
  }, []);

  // Animate processing stages for visual feedback
  const activeJobs = backgroundJobs.filter((j) => j.status === 'processing');
  const completedJobs = backgroundJobs.filter((j) => j.status === 'completed');
  const failedJobs = backgroundJobs.filter((j) => j.status === 'failed');

  React.useEffect(() => {
    if (activeJobs.length === 0) {
      setProcessingStage(0);
      return;
    }
    let current = 0;
    const interval = setInterval(() => {
      current = Math.min(current + 1, 3);
      setProcessingStage(current);
    }, 8000);
    return () => clearInterval(interval);
  }, [activeJobs.length]);

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
        Alert.alert(t('record.micPermission'), t('record.micPermissionMessage'));
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
      trackEvent(AnalyticsEvents.RECORDING_STARTED, {
        person: selectedPerson?.first_name,
      });

      // Start pulse
      pulse.value = withRepeat(
        withTiming(1.3, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
        -1,
        true
      );

      // Start timer
      timerRef.current = setInterval(() => {
        setDuration((d) => {
          const next = d + 1;
          // Auto-stop 1 second before hard limit to ensure clean cutoff
          if (next >= maxSeconds) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to start recording:', err);
      Alert.alert(t('common.error'), t('record.recordError'));
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
        Alert.alert(t('common.error'), t('record.recordingFailed'));
        return;
      }

      // Enter review state — let user choose to process or re-record
      setRecordedUri(uri);
      trackEvent(AnalyticsEvents.RECORDING_STOPPED, { duration });
    } catch (err) {
      console.error('Failed to stop recording:', err);
    }
  };

  const processRecording = () => {
    if (!recordedUri || !activeFamilyGroupId) return;

    const personName = selectedPerson
      ? `${selectedPerson.first_name}${selectedPerson.last_name ? ' ' + selectedPerson.last_name : ''}`
      : 'Unknown';
    useFamilyStore.getState().processInterviewInBackground(
      recordedUri,
      activeFamilyGroupId,
      `Conversation with ${personName}`,
      undefined,
      selectedPerson?.id
    );
    setRecordedUri(null);
    setDuration(0);
  };

  const cancelRecording = () => {
    Alert.alert(
      t('record.discardTitle'),
      t('record.discardMessage'),
      [
        { text: t('record.keep'), style: 'cancel' },
        {
          text: t('record.discard'),
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

  const sendDevTranscript = () => {
    if (!activeFamilyGroupId) {
      Alert.alert(t('common.error'), t('record.noFamilyGroup'));
      return;
    }
    useFamilyStore.getState().processInterviewInBackground(
      null,
      activeFamilyGroupId,
      'Dev Conversation',
      DEV_TRANSCRIPT,
      selectedPerson?.id
    );
  };

  const isSelf = selectedPerson?.id === selfPersonId;
  const personDisplayName = selectedPerson
    ? `${selectedPerson.first_name}${selectedPerson.last_name ? ' ' + selectedPerson.last_name : ''}`
    : null;

  // ── Person Selection Screen ──
  if (!selectedPerson && !isRecording && !recordedUri) {
    return (
      <StarField starCount={30}>
        <TreeTrunk opacity={0.18} />
        <BioAlgae strandCount={50} height={0.22} />
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('record.whoSharing')}</Text>
            <Text style={styles.subtitle}>
              {t('record.selectPerson')}
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
                        <Text style={styles.personSelfBadge}>{t('common.you')}</Text>
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
              <Text style={styles.devButtonText}>{t('record.devFake')}</Text>
            </Pressable>
          )}

          {/* Background job notifications */}
          {backgroundJobs.length > 0 && (
            <View style={styles.jobNotifications}>
              {activeJobs.length > 0 && (
                <View style={styles.jobCard}>
                  <Text style={styles.jobCardIcon}>🧠</Text>
                  <Text style={styles.jobCardText}>
                    {t('record.processingConversations', { count: activeJobs.length })}
                  </Text>
                </View>
              )}
              {completedJobs.map((job) => (
                <Pressable
                  key={job.id}
                  style={styles.jobCardCompleted}
                  onPress={() => {
                    dismissJob(job.id);
                    if (job.interviewId) router.push(`/interview/${job.interviewId}`);
                  }}
                >
                  <Text style={styles.jobCardIcon}>✅</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobCardText}>{t('record.jobReady', { title: job.title })}</Text>
                    <Text style={styles.jobCardHint}>{t('record.tapToView')}</Text>
                  </View>
                </Pressable>
              ))}
              {failedJobs.map((job) => (
                <Pressable
                  key={job.id}
                  style={styles.jobCardFailed}
                  onPress={() => dismissJob(job.id)}
                >
                  <Text style={styles.jobCardIcon}>❌</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.jobCardText}>{t('record.jobFailed', { title: job.title })}</Text>
                    <Text style={styles.jobCardHint}>{t('record.tapToDismiss')}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
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
              <Text style={styles.changePersonText}>{t('record.changePerson')}</Text>
            </Pressable>
          )}
          <Text style={styles.title}>
            {isRecording
              ? t('record.recording')
              : isProcessing
              ? t('record.processingTitle')
              : recordedUri
              ? t('record.recordingComplete')
              : t('record.readyToRecord')}
          </Text>
          <Text style={styles.subtitle}>
            {isRecording
              ? isSelf
                ? t('record.shareYourMemories')
                : t('record.letPersonShare', { name: selectedPerson?.first_name })
              : isProcessing
              ? t('record.aiTranscribing')
              : recordedUri
              ? t('record.reviewRecording')
              : isSelf
              ? t('record.shareOwnMemories')
              : t('record.recordPersonStories', { name: personDisplayName })}
          </Text>
          {!isRecording && !isProcessing && !recordedUri && selectedPerson && (
            <View style={styles.selectedPersonChip}>
              <Text style={styles.selectedPersonChipText}>
                {isSelf ? t('record.selectedPersonYou', { name: personDisplayName }) : t('record.selectedPerson', { name: personDisplayName })}
              </Text>
            </View>
          )}
          {!isRecording && !isProcessing && !recordedUri && (
            <Text style={styles.recordingLimitHint}>
              {t('record.upToMinutes', { minutes: Math.floor(maxSeconds / 60) })}
            </Text>
          )}
        </View>

        {/* Waveform */}
        <View style={styles.waveformContainer}>
          <VoiceWaveform isActive={isRecording} barCount={32} />
          <Text style={styles.timer}>{formatDuration(duration)}</Text>
          {isRecording && (
            <Text style={[
              styles.limitText,
              maxSeconds - duration <= 60 && { color: Colors.semantic.error },
            ]}>
              {t('record.remaining', { time: formatDuration(maxSeconds - duration) })}
            </Text>
          )}
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
                <Text style={styles.processButtonText}>{t('record.process')}</Text>
              </Pressable>
              <Pressable onPress={cancelRecording} style={styles.rerecordButton}>
                <Text style={styles.rerecordButtonText}>{t('record.reRecord')}</Text>
              </Pressable>
            </View>
          )}

          {isProcessing && !isRecording && !recordedUri && (
            <View style={styles.processingContainer}>
              {[
                { icon: '☁️', label: t('record.uploadingAudio') },
                { icon: '🎧', label: t('record.transcribingConversation') },
                { icon: '🧠', label: t('record.extractingPeople') },
                { icon: '🌳', label: t('record.buildingTree') },
              ].map((stage, i) => (
                <View key={i} style={[styles.processingStep, i <= processingStage && styles.processingStepActive]}>
                  <Text style={[styles.processingStepIcon, i <= processingStage && styles.processingStepIconActive]}>
                    {i < processingStage ? '✓' : stage.icon}
                  </Text>
                  <Text style={[styles.processingStepLabel, i <= processingStage && styles.processingStepLabelActive]}>
                    {stage.label}
                  </Text>
                </View>
              ))}
              <Text style={styles.processingDetail}>
                {t('record.processingTime')}
              </Text>
              <Pressable
                style={styles.recordAnotherButton}
                onPress={() => setSelectedPerson(null)}
              >
                <Text style={styles.recordAnotherText}>{t('record.recordAnother')}</Text>
              </Pressable>
            </View>
          )}
        </View>

        {/* Tips */}
        {!isRecording && !isProcessing && !recordedUri && (
          <View style={styles.tips}>
            <Text style={styles.tipTitle}>
              {isSelf ? t('record.tipsTitle') : t('record.tipsConversationTitle')}
            </Text>
            {isSelf ? (
              <>
                <Text style={styles.tip}>{t('record.tipSelf1')}</Text>
                <Text style={styles.tip}>{t('record.tipSelf2')}</Text>
                <Text style={styles.tip}>{t('record.tipSelf3')}</Text>
                <Text style={styles.tip}>{t('record.tipSelf4')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.tip}>{t('record.tipOther1')}</Text>
                <Text style={styles.tip}>{t('record.tipOther2')}</Text>
                <Text style={styles.tip}>{t('record.tipOther3')}</Text>
                <Text style={styles.tip}>{t('record.tipOther4')}</Text>
              </>
            )}
          </View>
        )}

        {/* Dev mode: fake conversation button */}
        {__DEV__ && !isRecording && !isProcessing && !recordedUri && (
          <Pressable onPress={sendDevTranscript} style={styles.devButton}>
            <Text style={styles.devButtonText}>{t('record.devFake')}</Text>
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
  limitText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
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
    alignItems: 'flex-start',
    gap: Spacing.md,
    width: '100%',
    paddingHorizontal: Spacing.lg,
  },
  processingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    opacity: 0.35,
  },
  processingStepActive: {
    opacity: 1,
  },
  processingStepIcon: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
  },
  processingStepIconActive: {
    opacity: 1,
  },
  processingStepLabel: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  processingStepLabelActive: {
    color: Colors.text.starlight,
    fontFamily: Typography.fonts.subheading,
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
    alignSelf: 'center',
    marginTop: Spacing.sm,
  },
  recordAnotherButton: {
    marginTop: Spacing.lg,
    alignSelf: 'center',
    backgroundColor: Colors.accent.cyan,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.xl,
    borderRadius: 20,
  },
  recordAnotherText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: '#FFFFFF',
  },
  jobNotifications: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.background.depth,
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent.cyan + '30',
  },
  jobCardCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.background.depth,
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent.cyan,
  },
  jobCardFailed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.background.depth,
    borderRadius: 12,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent.coral + '60',
  },
  jobCardIcon: {
    fontSize: 18,
  },
  jobCardText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
  },
  jobCardHint: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: 2,
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
  recordingLimitHint: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    textAlign: 'center',
    marginTop: Spacing.sm,
    opacity: 0.7,
  },
});

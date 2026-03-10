// ============================================================
// Matra — Record Tab (Conversation Entry Point)
// ============================================================

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, Pressable, ScrollView, FlatList, Modal, KeyboardAvoidingView, Platform } from 'react-native';
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
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/stores/authStore';
import { useFamilyStore, Person, BackgroundJob } from '../../src/stores/familyStore';
import { trackEvent, AnalyticsEvents } from '../../src/services/analytics';
import { Colors, Typography, Spacing } from '../../src/theme/tokens';

const ADD_NEW_RELATIONSHIP_OPTIONS = [
  { type: 'parent', labelKey: 'relationships.parent' },
  { type: 'child', labelKey: 'relationships.child' },
  { type: 'spouse', labelKey: 'relationships.spouse' },
  { type: 'ex_spouse', labelKey: 'relationships.ex_spouse' },
  { type: 'sibling', labelKey: 'relationships.sibling' },
  { type: 'half_sibling', labelKey: 'relationships.half_sibling' },
  { type: 'grandparent', labelKey: 'relationships.grandparent' },
  { type: 'grandchild', labelKey: 'relationships.grandchild' },
  { type: 'great_grandparent', labelKey: 'relationships.great_grandparent' },
  { type: 'great_grandchild', labelKey: 'relationships.great_grandchild' },
  { type: 'uncle_aunt', labelKey: 'relationships.uncle_aunt' },
  { type: 'nephew_niece', labelKey: 'relationships.nephew_niece' },
  { type: 'cousin', labelKey: 'relationships.cousin' },
  { type: 'in_law', labelKey: 'relationships.in_law' },
  { type: 'parent_in_law', labelKey: 'relationships.parent_in_law' },
  { type: 'child_in_law', labelKey: 'relationships.child_in_law' },
  { type: 'step_parent', labelKey: 'relationships.step_parent' },
  { type: 'step_child', labelKey: 'relationships.step_child' },
  { type: 'step_sibling', labelKey: 'relationships.step_sibling' },
  { type: 'adopted_parent', labelKey: 'relationships.adopted_parent' },
  { type: 'adopted_child', labelKey: 'relationships.adopted_child' },
  { type: 'godparent', labelKey: 'relationships.godparent' },
  { type: 'godchild', labelKey: 'relationships.godchild' },
  { type: 'other', labelKey: 'relationships.other' },
];

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
  const { activeFamilyGroupId, people, relationships, fetchAllFamilyData, fetchFamilyGroups } = useFamilyStore();
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

  // Add new person flow
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPersonFirstName, setNewPersonFirstName] = useState('');
  const [newPersonLastName, setNewPersonLastName] = useState('');
  const [newPersonRelType, setNewPersonRelType] = useState<string | null>(null);
  const [connectedThroughId, setConnectedThroughId] = useState<string | null>(null);
  const [isCreatingPerson, setIsCreatingPerson] = useState(false);
  const { createPerson, createRelationship } = useFamilyStore();

  // Lineage chain: for multi-gen types, try each fallback level until we find
  // existing intermediate people. `inverse` means the chain link direction is
  // reversed (intermediate IS chainRelType OF newPerson) — used for descendants.
  type ChainOption = { lookupType: string; chainRelType: string; inverse?: boolean };
  const CHAIN_LEVELS: Record<string, ChainOption[]> = {
    grandparent:             [{ lookupType: 'parent',             chainRelType: 'parent' }],
    grandchild:              [{ lookupType: 'child',              chainRelType: 'parent', inverse: true }],
    great_grandparent:       [{ lookupType: 'grandparent',        chainRelType: 'parent' },
                              { lookupType: 'parent',             chainRelType: 'grandparent' }],
    great_grandchild:        [{ lookupType: 'grandchild',         chainRelType: 'parent', inverse: true },
                              { lookupType: 'child',              chainRelType: 'grandparent', inverse: true }],
    great_great_grandparent: [{ lookupType: 'great_grandparent',  chainRelType: 'parent' },
                              { lookupType: 'grandparent',        chainRelType: 'grandparent' },
                              { lookupType: 'parent',             chainRelType: 'great_grandparent' }],
    great_great_grandchild:  [{ lookupType: 'great_grandchild',   chainRelType: 'parent', inverse: true },
                              { lookupType: 'grandchild',         chainRelType: 'grandparent', inverse: true },
                              { lookupType: 'child',              chainRelType: 'great_grandparent', inverse: true }],
    uncle_aunt:              [{ lookupType: 'parent',             chainRelType: 'sibling' }],
    nephew_niece:            [{ lookupType: 'sibling',            chainRelType: 'parent', inverse: true }],
  };

  const INVERSE_TYPES: Record<string, string> = {
    parent: 'child', child: 'parent',
    grandparent: 'grandchild', grandchild: 'grandparent',
    great_grandparent: 'great_grandchild', great_grandchild: 'great_grandparent',
    sibling: 'sibling',
  };

  // Helper: find people of a given relationship type relative to self
  const findRelatedPeople = useCallback((lookupType: string): Person[] => {
    if (!selfPersonId) return [];
    const ids: string[] = [];
    // A is lookupType of B — find As where B is self
    relationships.forEach((r) => {
      if (r.relationship_type === lookupType && r.person_b_id === selfPersonId) {
        if (!ids.includes(r.person_a_id)) ids.push(r.person_a_id);
      }
    });
    // Check inverse: if self IS inverseType OF someone
    const inv = INVERSE_TYPES[lookupType];
    if (inv) {
      relationships.forEach((r) => {
        if (r.relationship_type === inv && r.person_a_id === selfPersonId) {
          if (!ids.includes(r.person_b_id)) ids.push(r.person_b_id);
        }
      });
    }
    return people.filter((p) => ids.includes(p.id));
  }, [selfPersonId, relationships, people]);

  // Resolve the first non-empty fallback level for the current relationship type
  const { connectablepeople, activeChainOption } = useMemo(() => {
    if (!newPersonRelType || !selfPersonId) return { connectablepeople: [], activeChainOption: null };
    const levels = CHAIN_LEVELS[newPersonRelType];
    if (!levels) return { connectablepeople: [], activeChainOption: null };
    for (const opt of levels) {
      const found = findRelatedPeople(opt.lookupType);
      if (found.length > 0) return { connectablepeople: found, activeChainOption: opt };
    }
    return { connectablepeople: [], activeChainOption: null };
  }, [newPersonRelType, selfPersonId, findRelatedPeople]);
  // Map real processing stage from backend to UI step index
  const activeJobs = backgroundJobs.filter((j) => j.status === 'processing');
  const completedJobs = backgroundJobs.filter((j) => j.status === 'completed');
  const failedJobs = backgroundJobs.filter((j) => j.status === 'failed');

  const stageToIndex: Record<string, number> = {
    uploading: 0,
    transcribing: 1,
    extracting: 2,
    summarizing: 3,
    completed: 4,
  };
  const activeJob = activeJobs[0];
  const processingStage = activeJob?.processingStage
    ? stageToIndex[activeJob.processingStage] ?? 0
    : 0;

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

  const handleAddNewPerson = async () => {
    if (!newPersonFirstName.trim()) {
      Alert.alert(t('common.error'), t('record.newPersonNameRequired'));
      return;
    }
    setIsCreatingPerson(true);
    try {
      const person = await createPerson({
        first_name: newPersonFirstName.trim(),
        last_name: newPersonLastName.trim() || null,
      });
      if (newPersonRelType && selfPersonId) {
        await createRelationship(person.id, selfPersonId, newPersonRelType);
        // Create intermediate chain relationship for lineage placement
        if (activeChainOption && connectedThroughId) {
          if (activeChainOption.inverse) {
            await createRelationship(connectedThroughId, person.id, activeChainOption.chainRelType);
          } else {
            await createRelationship(person.id, connectedThroughId, activeChainOption.chainRelType);
          }
        }
      }
      setSelectedPerson(person);
      setShowAddPerson(false);
      setNewPersonFirstName('');
      setNewPersonLastName('');
      setNewPersonRelType(null);
      setConnectedThroughId(null);
    } catch (e) {
      console.error('Failed to create person:', e);
      Alert.alert(t('common.error'), t('record.newPersonError'));
    } finally {
      setIsCreatingPerson(false);
    }
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
            {/* Add Someone New card */}
            <Card
              variant="default"
              style={styles.personCard}
              onPress={() => setShowAddPerson(true)}
            >
              <View style={styles.personCardContent}>
                <View style={[styles.personAvatar, styles.addPersonAvatar]}>
                  <Ionicons name="add" size={24} color={Colors.text.starlight} />
                </View>
                <View style={styles.personInfo}>
                  <Text style={styles.personName}>{t('record.addNewPerson')}</Text>
                  <Text style={styles.personSelfBadge}>{t('record.addNewPersonHint')}</Text>
                </View>
                <Text style={styles.personArrow}>→</Text>
              </View>
            </Card>
          </ScrollView>

          {/* Add New Person Modal */}
          <Modal
            visible={showAddPerson}
            transparent
            animationType="slide"
            onRequestClose={() => setShowAddPerson(false)}
          >
            <KeyboardAvoidingView
              style={styles.modalOverlay}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
              <Pressable style={styles.modalOverlay} onPress={() => setShowAddPerson(false)}>
                <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
                  <ScrollView
                    bounces={false}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    <Text style={styles.modalTitle}>{t('record.newPersonTitle')}</Text>
                    <Text style={styles.modalSubtitle}>{t('record.newPersonSubtitle')}</Text>

                    <Text style={styles.modalLabel}>{t('record.newPersonFirstName')}</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={newPersonFirstName}
                      onChangeText={setNewPersonFirstName}
                      placeholder={t('record.newPersonFirstNamePlaceholder')}
                      placeholderTextColor={Colors.text.shadow}
                      autoFocus
                      returnKeyType="next"
                    />

                    <Text style={styles.modalLabel}>{t('record.newPersonLastName')}</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={newPersonLastName}
                      onChangeText={setNewPersonLastName}
                      placeholder={t('record.newPersonLastNamePlaceholder')}
                      placeholderTextColor={Colors.text.shadow}
                      returnKeyType="done"
                    />

                    <Text style={[styles.modalLabel, { marginTop: Spacing.sm }]}>{t('record.newPersonRelationship')}</Text>
                    <View style={styles.relGrid}>
                      {ADD_NEW_RELATIONSHIP_OPTIONS.map((opt) => (
                        <Pressable
                          key={opt.type}
                          style={[
                            styles.relPill,
                            newPersonRelType === opt.type && styles.relPillActive,
                          ]}
                          onPress={() => {
                            const next = newPersonRelType === opt.type ? null : opt.type;
                            setNewPersonRelType(next);
                            setConnectedThroughId(null);
                          }}
                        >
                          <Text
                            style={[
                              styles.relPillText,
                              newPersonRelType === opt.type && styles.relPillTextActive,
                            ]}
                          >
                            {t(opt.labelKey)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {connectablepeople.length > 0 && newPersonRelType && CHAIN_LEVELS[newPersonRelType] && (
                      <View style={styles.chainSection}>
                        <Text style={styles.chainLabel}>{t('record.connectedThrough')}</Text>
                        <View style={styles.relGrid}>
                          {connectablepeople.map((p) => (
                            <Pressable
                              key={p.id}
                              style={[
                                styles.relPill,
                                connectedThroughId === p.id && styles.relPillActive,
                              ]}
                              onPress={() => setConnectedThroughId(
                                connectedThroughId === p.id ? null : p.id
                              )}
                            >
                              <Text
                                style={[
                                  styles.relPillText,
                                  connectedThroughId === p.id && styles.relPillTextActive,
                                ]}
                              >
                                {p.first_name}{p.last_name ? ` ${p.last_name}` : ''}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    )}

                    {newPersonRelType && newPersonFirstName.trim() ? (
                      <Text style={styles.relGuideText}>
                        {newPersonFirstName.trim()} {t('record.newPersonRelGuide', { relationship: t(ADD_NEW_RELATIONSHIP_OPTIONS.find(o => o.type === newPersonRelType)?.labelKey || '').toLowerCase() })} {profile?.display_name || t('common.you')}
                      </Text>
                    ) : null}

                    <View style={styles.modalActions}>
                      <Button
                        title={isCreatingPerson ? t('record.newPersonCreating') : t('record.newPersonCreate')}
                        onPress={handleAddNewPerson}
                        variant="primary"
                        size="md"
                        disabled={isCreatingPerson}
                      />
                      <Pressable onPress={() => setShowAddPerson(false)} style={styles.modalCancelButton}>
                        <Text style={styles.modalCancelText}>{t('common.cancel')}</Text>
                      </Pressable>
                    </View>
                  </ScrollView>
                </Pressable>
              </Pressable>
            </KeyboardAvoidingView>
          </Modal>

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
                <Text style={styles.tip}>{t('record.tipOneSpeaker')}</Text>
                <Text style={styles.tip}>{t('record.tipSelf2')}</Text>
                <Text style={styles.tip}>{t('record.tipSelf3')}</Text>
                <Text style={styles.tip}>{t('record.tipSelf4')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.tip}>{t('record.tipOther1')}</Text>
                <Text style={styles.tip}>{t('record.tipOneSpeaker')}</Text>
                <Text style={styles.tip}>{t('record.tipOther2')}</Text>
                <Text style={styles.tip}>{t('record.tipOther3')}</Text>
                <Text style={styles.tip}>{t('record.tipOther4')}</Text>
              </>
            )}
          </View>
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
  addPersonAvatar: {
    backgroundColor: Colors.overlay.heavy,
    borderWidth: 1,
    borderColor: Colors.overlay.dark,
    borderStyle: 'dashed',
  },
  // ── Add Person Modal ──
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalSheet: {
    backgroundColor: Colors.background.abyss,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.xl,
    paddingBottom: Spacing.xxl + Spacing.xl,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    marginBottom: Spacing.xs,
  },
  modalSubtitle: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginBottom: Spacing.lg,
  },
  modalLabel: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.moonlight,
    marginBottom: Spacing.xs,
  },
  modalInput: {
    backgroundColor: Colors.background.trench,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.starlight,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.overlay.dark,
  },
  relGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  relPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.overlay.heavy,
    backgroundColor: Colors.background.trench,
  },
  relPillActive: {
    backgroundColor: Colors.accent.cyan + '20',
    borderColor: Colors.accent.cyan,
  },
  relPillText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  relPillTextActive: {
    color: Colors.accent.cyan,
    fontFamily: Typography.fonts.bodySemiBold,
  },
  relGuideText: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    fontStyle: 'italic' as const,
    color: Colors.accent.cyan,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  chainSection: {
    marginBottom: Spacing.sm,
  },
  chainLabel: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.twilight,
    marginBottom: Spacing.xs,
  },
  modalActions: {
    gap: Spacing.sm,
  },
  modalCancelButton: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  modalCancelText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
  },
  // ── Person Selection Styles ──
  personList: {
    flex: 1,
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

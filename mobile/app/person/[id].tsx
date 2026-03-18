// ============================================================
// MATRA — Person Detail Screen
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, TextInput, Platform, KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { StarField, Card, Button, VoiceWaveform, BioAlgae, CornerBush, AvatarViewer } from '../../src/components/ui';
import { useTranslation } from 'react-i18next';
import { useFamilyStore, Person } from '../../src/stores/familyStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useSignedUrl } from '../../src/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/tokens';
import { resizeImageForUpload } from '../../src/utils/image';
import { shareBiography } from '../../src/utils/share';

const RELATIONSHIP_TYPE_VALUES = [
  'parent', 'child', 'spouse', 'ex_spouse', 'sibling', 'half_sibling',
  'grandparent', 'grandchild', 'great_grandparent', 'great_grandchild',
  'great_great_grandparent', 'great_great_grandchild',
  'uncle_aunt', 'nephew_niece', 'cousin', 'in_law', 'parent_in_law', 'child_in_law',
  'step_parent', 'step_child', 'step_sibling',
  'adopted_parent', 'adopted_child',
  'godparent', 'godchild', 'other',
];

function getRelLabel(value: string, t: (key: string) => string): string {
  return t(`relationships.${value}`) || value.replace('_', ' ');
}

// When the current person is personB, we need to show the inverse label
const INVERSE_TYPE: Record<string, string> = {
  parent: 'child', child: 'parent',
  grandparent: 'grandchild', grandchild: 'grandparent',
  great_grandparent: 'great_grandchild', great_grandchild: 'great_grandparent',
  great_great_grandparent: 'great_great_grandchild', great_great_grandchild: 'great_great_grandparent',
  uncle_aunt: 'nephew_niece', nephew_niece: 'uncle_aunt',
  step_parent: 'step_child', step_child: 'step_parent',
  parent_in_law: 'child_in_law', child_in_law: 'parent_in_law',
  adopted_parent: 'adopted_child', adopted_child: 'adopted_parent',
  godparent: 'godchild', godchild: 'godparent',
};
const SYMMETRIC_TYPES = ['spouse', 'ex_spouse', 'sibling', 'half_sibling', 'step_sibling', 'cousin', 'in_law', 'other'];

function getEffectiveType(type: string, isPersonA: boolean): string {
  if (isPersonA || SYMMETRIC_TYPES.includes(type)) return type;
  return INVERSE_TYPE[type] || type;
}

export default function PersonDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { people, relationships, stories, interviews,
    generateBiography, verifyRelationship, updateRelationship,
    createRelationship, deleteRelationship, uploadPersonAvatar, renamePerson,
    updatePerson, deletePerson, mergePeople,
  } = useFamilyStore();
  const profile = useAuthStore((s) => s.profile);
  const [isGenerating, setIsGenerating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addStep, setAddStep] = useState<'person' | 'type'>('person');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isViewingAvatar, setIsViewingAvatar] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [editingDetail, setEditingDetail] = useState<string | null>(null);
  const [editDetailValue, setEditDetailValue] = useState('');
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  const person = people.find((p) => p.id === id);
  const avatarUrl = useSignedUrl(person?.avatar_url ?? null);
  const fullName = person ? [person.first_name, person.last_name].filter(Boolean).join(' ') : '';

  if (!person) {
    return (
      <StarField>
        <BioAlgae strandCount={30} height={0.15} />
        <CornerBush />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>{t('person.notFound')}</Text>
          <Button title={t('common.goBack')} onPress={() => router.back()} variant="ghost" />
        </View>
      </StarField>
    );
  }

  // Get relationships for this person, excluding any where the other person was deleted
  // Deduplicate: if both directions exist for the same pair, keep only one
  const personRelationships = relationships.filter(
    (r) => r.person_a_id === id || r.person_b_id === id
  ).map((r) => {
    const isPersonA = r.person_a_id === id;
    const otherId = isPersonA ? r.person_b_id : r.person_a_id;
    const other = people.find((p) => p.id === otherId);
    return {
      ...r,
      otherPerson: other,
      isPersonA,
      // The effective type from the current person's perspective
      effectiveType: getEffectiveType(r.relationship_type, isPersonA),
    };
  }).filter((r) => r.otherPerson !== undefined)
    .filter((r, _i, arr) => {
      // If there's a duplicate pair (same two people), keep only the one
      // where the current person is personA (the canonical direction)
      if (!r.isPersonA) {
        const hasPrimary = arr.some(
          (other) => other.isPersonA && other.otherPerson?.id === r.otherPerson?.id
        );
        if (hasPrimary) return false;
      }
      return true;
    });

  // Check if person has at least one conversation or is mentioned in stories
  const personInterviews = interviews.filter(
    (i) => i.subject_person_id === id
  );
  const hasConversations = personInterviews.length > 0;

  // Get stories involving this person
  // (In a full implementation, we'd query story_people)
  const personStories = stories.filter(
    (s) => s.content.includes(person.first_name)
  );

  const hasMaterial = hasConversations || personStories.length > 3;

  // Check if new data has been added since last biography generation
  const bioGeneratedAt = person.ai_biography_generated_at;
  const hasNewDataSinceBio = !bioGeneratedAt || (() => {
    const bioTime = new Date(bioGeneratedAt).getTime();
    // Person details updated after bio?
    if (new Date(person.updated_at).getTime() > bioTime) return true;
    // New relationships added after bio?
    if (personRelationships.some((r) => new Date(r.created_at).getTime() > bioTime)) return true;
    // New stories mentioning this person after bio?
    if (personStories.some((s) => new Date(s.created_at).getTime() > bioTime)) return true;
    // New interviews about this person after bio?
    if (personInterviews.some((i) => new Date(i.created_at).getTime() > bioTime)) return true;
    return false;
  })();

  const handleGenerateBiography = async () => {
    if (profile?.subscription_tier === 'free') {
      router.push('/paywall');
      return;
    }

    setIsGenerating(true);
    try {
      await generateBiography(person.id);
      Alert.alert(t('person.bioGenerated'), t('person.bioGeneratedMessage'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('person.photoPermission'), t('person.photoPermissionMessage'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });

    if (result.canceled) return;

    setIsUploadingAvatar(true);
    try {
      const resizedUri = await resizeImageForUpload(result.assets[0].uri);
      await uploadPersonAvatar(person.id, resizedUri);
    } catch (err: any) {
      Alert.alert(t('person.uploadFailed'), err.message);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAvatarPress = () => {
    if (isUploadingAvatar) return;
    if (!avatarUrl) {
      handlePickAvatar();
      return;
    }
    Alert.alert(t('person.profilePicture'), undefined, [
      { text: t('person.viewPhoto'), onPress: () => setIsViewingAvatar(true) },
      { text: t('person.changePhoto'), onPress: handlePickAvatar },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
    <StarField starCount={25}>
      <BioAlgae strandCount={30} height={0.15} />
      <CornerBush />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Back button */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={Colors.text.starlight} />
        </Pressable>

        {/* Person Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <Pressable onPress={handleAvatarPress} style={styles.avatarLarge} disabled={isUploadingAvatar}>
            {isUploadingAvatar ? (
              <ActivityIndicator color="#FFFFFF" size="large" />
            ) : avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.avatarImage}
                contentFit="cover"
                transition={300}
              />
            ) : (
              <Text style={styles.avatarText}>
                {person.first_name[0].toUpperCase()}
              </Text>
            )}
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditBadgeText}>📷</Text>
            </View>
          </Pressable>

          {isEditingName ? (
            <View style={styles.nameEditContainer}>
              <TextInput
                style={styles.nameInput}
                value={editFirstName}
                onChangeText={setEditFirstName}
                placeholder={t('person.firstName')}
                placeholderTextColor={Colors.text.twilight}
                autoFocus
              />
              <TextInput
                style={styles.nameInput}
                value={editLastName}
                onChangeText={setEditLastName}
                placeholder={t('person.lastName')}
                placeholderTextColor={Colors.text.twilight}
              />
              <View style={styles.nameEditActions}>
                <Pressable
                  style={styles.nameEditCancel}
                  onPress={() => setIsEditingName(false)}
                >
                  <Text style={styles.nameEditCancelText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.nameEditSave, (!editFirstName.trim() || isSavingName) && styles.nameEditSaveDisabled]}
                  disabled={!editFirstName.trim() || isSavingName}
                  onPress={async () => {
                    const newFirst = editFirstName.trim();
                    const newLast = editLastName.trim() || null;
                    if (!newFirst) return;
                    if (newFirst === person.first_name && newLast === person.last_name) {
                      setIsEditingName(false);
                      return;
                    }
                    setIsSavingName(true);
                    try {
                      await renamePerson(person.id, newFirst, newLast);
                      setIsEditingName(false);
                    } catch (err: any) {
                      Alert.alert(t('common.error'), err.message);
                    } finally {
                      setIsSavingName(false);
                    }
                  }}
                >
                  <Text style={styles.nameEditSaveText}>
                    {isSavingName ? t('person.saving') : t('common.save')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                setEditFirstName(person.first_name);
                setEditLastName(person.last_name || '');
                setIsEditingName(true);
              }}
            >
              <View style={styles.nameRow}>
                <Text style={styles.name}>{fullName}</Text>
                <Text style={styles.nameEditIcon}>✎</Text>
              </View>
            </Pressable>
          )}
          {person.nickname && (
            <Text style={styles.nickname}>"{person.nickname}"</Text>
          )}

          <View style={styles.detailsRow}>
            <Pressable
              style={styles.detailChip}
              onPress={() => { setEditingDetail('birth_date'); setEditDetailValue(person.birth_date || ''); }}
            >
              <Text style={styles.detailChipText}>
                🎂 {person.birth_date
                  ? new Date(person.birth_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                    + (!person.death_date && !person.metadata?.is_deceased ? (() => {
                        const birth = new Date(person.birth_date + 'T00:00:00');
                        const now = new Date();
                        let age = now.getFullYear() - birth.getFullYear();
                        if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
                        return age > 0 ? ` (${age})` : '';
                      })() : '')
                  : t('person.addBirthday')}
              </Text>
            </Pressable>
            <Pressable
              style={styles.detailChip}
              onPress={() => { setEditingDetail('birth_place'); setEditDetailValue(person.birth_place || ''); }}
            >
              <Text style={styles.detailChipText}>
                📍 {person.birth_place || t('person.addBirthplace')}
              </Text>
            </Pressable>
          </View>
          <View style={styles.detailsRow}>
            <Pressable
              style={styles.detailChip}
              onPress={() => { setEditingDetail('current_location'); setEditDetailValue(person.current_location || ''); }}
            >
              <Text style={styles.detailChipText}>
                🏠 {person.current_location || t('person.addLocation')}
              </Text>
            </Pressable>
            <Pressable
              style={styles.detailChip}
              onPress={() => { setEditingDetail('profession'); setEditDetailValue(person.metadata?.profession || ''); }}
            >
              <Text style={styles.detailChipText}>
                💼 {person.metadata?.profession || t('person.addProfession')}
              </Text>
            </Pressable>
          </View>
          <View style={styles.detailsRow}>
            <Pressable
              style={styles.detailChip}
              onPress={() => {
                const current = person.metadata?.gender;
                const next = !current ? 'male' : current === 'male' ? 'female' : null;
                updatePerson(person.id, { metadata: { ...person.metadata, gender: next } });
              }}
            >
              <Text style={styles.detailChipText}>
                {person.metadata?.gender === 'male' ? `👤 ${t('person.genderMale')}`
                  : person.metadata?.gender === 'female' ? `👤 ${t('person.genderFemale')}`
                  : `👤 ${t('person.addGender')}`}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.detailChip, (person.death_date || person.metadata?.is_deceased) && styles.detailChipDeceased]}
              onPress={() => {
                if (person.death_date) {
                  setEditingDetail('death_date');
                  setEditDetailValue(person.death_date);
                } else if (person.metadata?.is_deceased) {
                  Alert.alert(t('person.passing'), t('person.markAliveOrDate'), [
                    { text: t('person.markAlive'), onPress: () => updatePerson(person.id, { metadata: { ...person.metadata, is_deceased: false } }) },
                    { text: t('person.addDate'), onPress: () => { setEditingDetail('death_date'); setEditDetailValue(''); } },
                    { text: t('common.cancel'), style: 'cancel' },
                  ]);
                } else {
                  Alert.alert(t('person.markAsDeceased'), undefined, [
                    { text: t('person.yesWithDate'), onPress: () => { setEditingDetail('death_date'); setEditDetailValue(''); } },
                    { text: t('person.yesNoDate'), onPress: () => updatePerson(person.id, { metadata: { ...person.metadata, is_deceased: true } }) },
                    { text: t('common.cancel'), style: 'cancel' },
                  ]);
                }
              }}
            >
              <Text style={styles.detailChipText}>
                {person.death_date
                  ? '🕊️ ' + new Date(person.death_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
                    + (person.birth_date ? (() => {
                        const birth = new Date(person.birth_date + 'T00:00:00');
                        const death = new Date(person.death_date + 'T00:00:00');
                        let age = death.getFullYear() - birth.getFullYear();
                        if (death.getMonth() < birth.getMonth() || (death.getMonth() === birth.getMonth() && death.getDate() < birth.getDate())) age--;
                        return age > 0 ? ` (age ${age})` : '';
                      })() : '')
                  : person.metadata?.is_deceased
                    ? `🕊️ ${t('person.deceased')}`
                    : `🕊️ ${t('person.alive')}`}
              </Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* Record Conversation CTA */}
        <Animated.View entering={FadeInDown.delay(150)}>
          <Pressable
            style={styles.recordCta}
            onPress={() => router.push({ pathname: '/(tabs)/record', params: { personId: person.id } })}
          >
            <Text style={styles.recordCtaIcon}>🎙</Text>
            <Text style={styles.recordCtaText}>{t('home.recordConversation')}</Text>
          </Pressable>
        </Animated.View>

        {/* Biography */}
        <Animated.View entering={FadeInDown.delay(200)}>
          <Card variant="glow" style={styles.biographyCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('person.biography')}</Text>
              {person.ai_biography && (
                <Pressable onPress={() => shareBiography(fullName, person.ai_biography!)} hitSlop={8}>
                  <Ionicons name="share-outline" size={20} color={Colors.accent.cyan} />
                </Pressable>
              )}
            </View>
            {person.ai_biography ? (
              <View>
                <Text style={styles.biography}>{person.ai_biography}</Text>
                <Button
                  title={profile?.subscription_tier === 'free' ? `🔒 ${t('person.updateBiography')}` : `✨ ${t('person.updateBiography')}`}
                  onPress={handleGenerateBiography}
                  loading={isGenerating}
                  variant="secondary"
                  size="sm"
                  style={{ marginTop: Spacing.md }}
                  disabled={!hasNewDataSinceBio}
                />
                <Text style={styles.biographyHint}>
                  {hasNewDataSinceBio
                    ? t('person.newData')
                    : t('person.noBio')}
                </Text>
              </View>
            ) : hasMaterial ? (
              <View style={styles.biographyEmpty}>
                <Text style={styles.biographyEmptyText}>
                  {t('person.noBio')}
                </Text>
                <Button
                  title={profile?.subscription_tier === 'free' ? `🔒 ${t('person.generateBiography')}` : `✨ ${t('person.generateBiography')}`}
                  onPress={handleGenerateBiography}
                  loading={isGenerating}
                  variant="secondary"
                  size="sm"
                />
                <Text style={styles.biographyHint}>
                  {t('person.biographyHint')}
                </Text>
              </View>
            ) : (
              <View style={styles.biographyEmpty}>
                <Text style={styles.biographyEmptyText}>
                  {t('person.noConversations')}
                </Text>
              </View>
            )}
          </Card>
        </Animated.View>

        {/* Relationships */}
        <Animated.View entering={FadeInDown.delay(300)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('person.relationships')}</Text>
            <Pressable
              style={styles.addConnectionButton}
              onPress={() => {
                setAddStep('person');
                setSelectedPersonId(null);
                setSelectedType(null);
                setShowAddModal(true);
              }}
            >
              <Text style={styles.addConnectionButtonText}>+ {t('person.addRelationship')}</Text>
            </Pressable>
          </View>
          <View style={styles.relationshipsList}>
            {personRelationships.length === 0 && (
              <Text style={styles.emptyConnectionsText}>
                {t('person.noConversations')}
              </Text>
            )}
            {personRelationships.map((rel) => {
              const isEditing = editingRelId === rel.id;

              const handleConfirm = async () => {
                setConfirmingId(rel.id);
                try {
                  await verifyRelationship(rel.id);
                } catch (err: any) {
                  Alert.alert(t('common.error'), err.message);
                } finally {
                  setConfirmingId(null);
                }
              };

              const handleChangeType = async (newType: string) => {
                // Convert from the current person's perspective back to stored direction
                const storedType = rel.isPersonA ? newType : getEffectiveType(newType, false);
                setConfirmingId(rel.id);
                try {
                  await updateRelationship(rel.id, {
                    relationship_type: storedType,
                    verified: true,
                  });
                } catch (err: any) {
                  Alert.alert(t('common.error'), err.message);
                } finally {
                  setConfirmingId(null);
                  setEditingRelId(null);
                }
              };

              const handleDelete = () => {
                Alert.alert(
                  t('person.removeConnection'),
                  t('person.removeConnectionConfirm', { name: rel.otherPerson?.first_name || t('person.unknown'), type: getRelLabel(rel.effectiveType, t) }),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('person.remove'), style: 'destructive',
                      onPress: async () => {
                        try { await deleteRelationship(rel.id); }
                        catch (err: any) { Alert.alert(t('common.error'), err.message); }
                      },
                    },
                  ]
                );
              };

              return (
              <Card
                key={rel.id}
                variant="default"
                style={styles.relationshipCard}
                onPress={() => !isEditing && rel.otherPerson && router.push(`/person/${rel.otherPerson.id}`)}
              >
                <View style={styles.relationshipRow}>
                  <View style={styles.relationshipAvatar}>
                    <Text style={styles.relationshipAvatarText}>
                      {rel.otherPerson?.first_name[0] || '?'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.relationshipName}>
                      {rel.otherPerson ? `${rel.otherPerson.first_name} ${rel.otherPerson.last_name || ''}`.trim() : t('person.unknown')}
                    </Text>
                    <View style={styles.relationshipMeta}>
                      <Text style={styles.relationshipType}>
                        {getRelLabel(rel.effectiveType, t)}
                      </Text>
                      {rel.verified ? (
                        <View style={styles.verifiedBadge}>
                          <Text style={styles.verifiedBadgeText}>✓ {t('person.verified')}</Text>
                        </View>
                      ) : (
                        <View style={styles.unverifiedBadge}>
                          <Text style={styles.unverifiedBadgeText}>{t('person.unverified')}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={styles.relationshipActions}>
                    {!rel.verified && (
                      <Pressable
                        onPress={(e) => { e.stopPropagation(); handleConfirm(); }}
                        style={styles.confirmButton}
                        disabled={confirmingId === rel.id}
                      >
                        <Text style={styles.confirmButtonText}>
                          {confirmingId === rel.id ? '...' : '✓'}
                        </Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); setEditingRelId(isEditing ? null : rel.id); }}
                      style={[styles.editButton, isEditing && styles.editButtonActive]}
                    >
                      <Text style={[styles.editButtonText, isEditing && styles.editButtonTextActive]}>✎</Text>
                    </Pressable>
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); handleDelete(); }}
                      style={styles.deleteButton}
                    >
                      <Text style={styles.deleteButtonText}>✕</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Inline type picker */}
                {isEditing && (
                  <Animated.View entering={FadeIn.duration(200)} style={styles.typePicker}>
                    <Text style={styles.typePickerLabel}>
                      {t('person.isRelationship', { personA: person.first_name, personB: rel.otherPerson?.first_name, type: getRelLabel(rel.effectiveType, t) })}
                    </Text>
                    <View style={styles.typePickerGrid}>
                      {RELATIONSHIP_TYPE_VALUES.map((typeValue) => (
                        <Pressable
                          key={typeValue}
                          style={[
                            styles.typeOption,
                            rel.effectiveType === typeValue && styles.typeOptionSelected,
                          ]}
                          onPress={(e) => {
                            e.stopPropagation();
                            if (typeValue !== rel.effectiveType) handleChangeType(typeValue);
                          }}
                        >
                          <Text style={[
                            styles.typeOptionText,
                            rel.effectiveType === typeValue && styles.typeOptionTextSelected,
                          ]}>
                            {t(`relationships.${typeValue}`)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  </Animated.View>
                )}
              </Card>
              );
            })}
          </View>
        </Animated.View>

        {/* Stories */}
        {personStories.length > 0 && (
          <Animated.View entering={FadeInDown.delay(400)}>
            <Text style={styles.sectionTitle}>{t('stories.title')}</Text>
            {personStories.map((story) => (
              <Card
                key={story.id}
                variant="default"
                style={styles.storyCard}
                onPress={() => router.push(`/story/${story.id}`)}
              >
                <Text style={styles.storyTitle}>{story.title}</Text>
                <Text style={styles.storyContent} numberOfLines={3}>
                  {story.content}
                </Text>
              </Card>
            ))}
          </Animated.View>
        )}

        {/* Delete / Merge Person */}
        {profile?.self_person_id !== person.id && (
          <Animated.View entering={FadeInDown.delay(500)}>
            <Pressable
              style={styles.mergePersonButton}
              onPress={() => setShowMergeModal(true)}
            >
              <Ionicons name="git-merge-outline" size={16} color={Colors.accent.glow} />
              <Text style={styles.mergePersonButtonText}>{t('person.mergeWith')}</Text>
            </Pressable>
            <Pressable
              style={styles.deletePersonButton}
              onPress={() => {
                Alert.alert(
                  t('person.deletePerson'),
                  t('person.deletePersonConfirm', { name: fullName }),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('common.delete'),
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await deletePerson(person.id);
                          router.replace('/(tabs)/tree');
                        } catch (err: any) {
                          Alert.alert(t('common.error'), err.message);
                        }
                      },
                    },
                  ],
                );
              }}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.accent.coral} />
              <Text style={styles.deletePersonButtonText}>{t('person.deletePerson')}</Text>
            </Pressable>
          </Animated.View>
        )}
      </ScrollView>
    </StarField>

    {/* Add Connection Overlay */}
    {showAddModal && (
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAddModal(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboardWrap}
          pointerEvents="box-none"
        >
        <Animated.View entering={SlideInDown.duration(300)} exiting={SlideOutDown.duration(200)} style={styles.modalContent}>
          {/* Drag handle */}
          <View style={styles.editDetailHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {addStep === 'person' ? t('person.selectPerson') : t('person.selectType')}
            </Text>
            <Pressable onPress={() => setShowAddModal(false)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </Pressable>
          </View>

          {addStep === 'person' ? (
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              {people
                .filter((p) => p.id !== id)
                .map((p) => {
                  const alreadyConnected = personRelationships.some(
                    (r) => r.otherPerson?.id === p.id
                  );
                  return (
                    <Pressable
                      key={p.id}
                      style={[styles.modalOption, alreadyConnected && styles.modalOptionDisabled]}
                      disabled={alreadyConnected}
                      onPress={() => {
                        setSelectedPersonId(p.id);
                        setAddStep('type');
                      }}
                    >
                      <View style={styles.modalOptionAvatar}>
                        <Text style={styles.modalOptionAvatarText}>
                          {p.first_name[0]}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalOptionName}>
                          {p.first_name} {p.last_name || ''}
                        </Text>
                        {alreadyConnected && (
                          <Text style={styles.modalOptionHint}>{t('person.alreadyConnected')}</Text>
                        )}
                      </View>
                      {!alreadyConnected && (
                        <Text style={styles.modalChevron}>›</Text>
                      )}
                    </Pressable>
                  );
                })}
              {people.filter((p) => p.id !== id).length === 0 && (
                <Text style={styles.emptyConnectionsText}>
                  {t('person.noConversations')}
                </Text>
              )}
            </ScrollView>
          ) : (
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.typePickerLabel}>
                {t('person.isRelationship', { personA: people.find((p) => p.id === selectedPersonId)?.first_name, personB: person.first_name, type: selectedType ? getRelLabel(selectedType, t) : '_____' })}
              </Text>
              <View style={[styles.typePickerGrid, { marginTop: Spacing.md }]}>
                {RELATIONSHIP_TYPE_VALUES.map((typeValue) => (
                  <Pressable
                    key={typeValue}
                    style={[
                      styles.typeOption,
                      selectedType === typeValue && styles.typeOptionSelected,
                    ]}
                    onPress={() => setSelectedType(typeValue)}
                  >
                    <Text style={[
                      styles.typeOptionText,
                      selectedType === typeValue && styles.typeOptionTextSelected,
                    ]}>
                      {t(`relationships.${typeValue}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.modalFooter}>
                <Pressable
                  style={styles.modalBackButton}
                  onPress={() => { setAddStep('person'); setSelectedType(null); }}
                >
                  <Text style={styles.modalBackButtonText}>← {t('person.back')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalSaveButton, !selectedType && styles.modalSaveButtonDisabled]}
                  disabled={!selectedType || isSaving}
                  onPress={async () => {
                    if (!selectedPersonId || !selectedType) return;
                    setIsSaving(true);
                    try {
                      await createRelationship(selectedPersonId, id!, selectedType);
                      setShowAddModal(false);
                    } catch (err: any) {
                      Alert.alert(t('common.error'), err.message);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                >
                  <Text style={styles.modalSaveButtonText}>
                    {isSaving ? t('common.loading') : t('person.addRelationship')}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    )}
    {/* Merge Person Modal */}
    {showMergeModal && (
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowMergeModal(false)} />
        <Animated.View entering={SlideInDown.duration(300)} exiting={SlideOutDown.duration(200)} style={styles.modalContent}>
          {/* Drag handle */}
          <View style={styles.editDetailHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('person.mergePerson')}</Text>
            <Pressable onPress={() => setShowMergeModal(false)} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.mergeDesc}>
              {t('person.mergePersonDesc', { name: fullName })}
            </Text>
            {people
              .filter((p) => p.id !== id && p.id !== profile?.self_person_id)
              .map((p) => (
                <Pressable
                  key={p.id}
                  style={styles.modalOption}
                  disabled={isMerging}
                  onPress={() => {
                    const sourceName = [p.first_name, p.last_name].filter(Boolean).join(' ');
                    Alert.alert(
                      t('person.mergeConfirm', { source: sourceName, target: fullName }),
                      t('person.mergeConfirmMessage', { source: sourceName, target: fullName }),
                      [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                          text: t('person.merge'),
                          style: 'destructive',
                          onPress: async () => {
                            setIsMerging(true);
                            try {
                              await mergePeople(person.id, p.id);
                              setShowMergeModal(false);
                              Alert.alert(
                                t('person.mergeComplete'),
                                t('person.mergeCompleteMessage', { source: sourceName, target: fullName }),
                              );
                            } catch (err: any) {
                              Alert.alert(t('common.error'), err.message);
                            } finally {
                              setIsMerging(false);
                            }
                          },
                        },
                      ],
                    );
                  }}
                >
                  <View style={styles.modalOptionAvatar}>
                    <Text style={styles.modalOptionAvatarText}>{p.first_name[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalOptionName}>
                      {p.first_name} {p.last_name || ''}
                    </Text>
                    {p.birth_date && (
                      <Text style={styles.modalOptionHint}>
                        {new Date(p.birth_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.modalChevron}>›</Text>
                </Pressable>
              ))}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    )}
    {editingDetail && (
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.editDetailOverlay}>
        <Pressable style={styles.editDetailBackdrop} onPress={() => setEditingDetail(null)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.editDetailKeyboardWrap}
          pointerEvents="box-none"
        >
          <Animated.View entering={SlideInDown.duration(300)} exiting={SlideOutDown.duration(200)} style={styles.editDetailCard}>
            {/* Drag handle */}
            <View style={styles.editDetailHandle} />

            {/* Header */}
            <View style={styles.editDetailHeader}>
              <Text style={styles.editDetailIcon}>
                {editingDetail === 'birth_date' ? '🎂' :
                 editingDetail === 'birth_place' ? '📍' :
                 editingDetail === 'current_location' ? '🏠' :
                 editingDetail === 'profession' ? '💼' :
                 editingDetail === 'death_date' ? '🕊️' : ''}
              </Text>
              <Text style={styles.editDetailTitle}>
                {editingDetail === 'birth_date' ? t('person.birthDate') :
                 editingDetail === 'birth_place' ? t('person.birthPlace') :
                 editingDetail === 'current_location' ? t('person.currentLocation') :
                 editingDetail === 'profession' ? t('person.profession') :
                 editingDetail === 'death_date' ? t('person.deathDate') : ''}
              </Text>
              <Pressable onPress={() => setEditingDetail(null)} style={styles.editDetailClose}>
                <Ionicons name="close" size={20} color={Colors.text.twilight} />
              </Pressable>
            </View>

            {/* Content */}
            {(editingDetail === 'birth_date' || editingDetail === 'death_date') ? (
              <View style={styles.datePickerContainer}>
                <DateTimePicker
                  value={editDetailValue ? new Date(editDetailValue + 'T00:00:00') : new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  maximumDate={new Date()}
                  themeVariant="light"
                  onChange={(_event: any, selectedDate?: Date) => {
                    if (selectedDate) {
                      const iso = selectedDate.toISOString().split('T')[0];
                      setEditDetailValue(iso);
                    }
                  }}
                />
              </View>
            ) : (
              <TextInput
                style={styles.editDetailInput}
                value={editDetailValue}
                onChangeText={setEditDetailValue}
                placeholder={
                  editingDetail === 'birth_place' ? t('person.cityCountry')
                  : editingDetail === 'current_location' ? t('person.cityCountry')
                  : editingDetail === 'profession' ? t('person.professionPlaceholder')
                  : ''
                }
                placeholderTextColor={Colors.text.shadow}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={async () => {
                  const val = editDetailValue.trim();
                  if (!val) { setEditingDetail(null); return; }
                  if (editingDetail === 'profession') {
                    await updatePerson(person.id, { metadata: { ...person.metadata, profession: val } });
                  } else {
                    await updatePerson(person.id, { [editingDetail]: val });
                  }
                  setEditingDetail(null);
                }}
              />
            )}

            {/* Actions */}
            <View style={styles.editDetailActions}>
              <Pressable
                style={styles.editDetailClearBtn}
                onPress={async () => {
                  if (editingDetail === 'profession') {
                    const meta = { ...person.metadata };
                    delete meta.profession;
                    await updatePerson(person.id, { metadata: meta });
                  } else if (editingDetail === 'death_date') {
                    await updatePerson(person.id, { death_date: null, metadata: { ...person.metadata, is_deceased: false } });
                  } else {
                    await updatePerson(person.id, { [editingDetail]: null });
                  }
                  setEditingDetail(null);
                }}
              >
                <Ionicons name="trash-outline" size={16} color={Colors.accent.coral} />
                <Text style={styles.editDetailClearText}>{t('common.delete')}</Text>
              </Pressable>
              <Pressable
                style={styles.editDetailSaveBtn}
                onPress={async () => {
                  const val = editDetailValue.trim();
                  if (!val) { setEditingDetail(null); return; }
                  if (editingDetail === 'profession') {
                    await updatePerson(person.id, { metadata: { ...person.metadata, profession: val } });
                  } else if (editingDetail === 'death_date') {
                    await updatePerson(person.id, { death_date: val, metadata: { ...person.metadata, is_deceased: true } });
                  } else {
                    await updatePerson(person.id, { [editingDetail]: val });
                  }
                  setEditingDetail(null);
                }}
              >
                <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                <Text style={styles.editDetailSaveText}>{t('common.save')}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Animated.View>
    )}
    <AvatarViewer
      visible={isViewingAvatar}
      uri={avatarUrl}
      onClose={() => setIsViewingAvatar(false)}
      name={fullName}
    />
    </View>
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
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  avatarLarge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: Colors.accent.cyan,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 16,
    position: 'relative',
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.background.depth,
    borderWidth: 2,
    borderColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadgeText: {
    fontSize: 12,
  },
  avatarText: {
    fontSize: 36,
    fontFamily: Typography.fonts.heading,
    color: '#FFFFFF',
  },
  name: {
    fontSize: Typography.sizes.h1,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  nameEditIcon: {
    fontSize: 16,
    color: Colors.text.twilight,
    marginTop: 2,
  },
  nameEditContainer: {
    alignItems: 'center',
    gap: Spacing.sm,
    width: '100%',
    paddingHorizontal: Spacing.lg,
  },
  nameInput: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.accent.cyan,
    paddingVertical: Spacing.xs,
    textAlign: 'center',
    width: '100%',
  },
  nameEditActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  nameEditCancel: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  nameEditCancelText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
  },
  nameEditSave: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.accent.cyan,
    borderRadius: BorderRadius.sm,
  },
  nameEditSaveDisabled: {
    opacity: 0.4,
  },
  nameEditSaveText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: '#FFFFFF',
  },
  nickname: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    justifyContent: 'center',
  },
  detail: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  detailChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  detailChipDeceased: {
    backgroundColor: 'rgba(255,200,200,0.08)',
    borderColor: 'rgba(255,200,200,0.15)',
  },
  detailChipText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  // ── Edit Detail Modal ──
  editDetailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 1000,
  },
  editDetailBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  editDetailKeyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  editDetailCard: {
    backgroundColor: Colors.background.void,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16,
  },
  editDetailHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.text.shadow,
    alignSelf: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  editDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  editDetailIcon: {
    fontSize: 24,
  },
  editDetailTitle: {
    flex: 1,
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
  },
  editDetailClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background.depth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editDetailInput: {
    backgroundColor: Colors.background.abyss,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.background.current,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? Spacing.lg : Spacing.md,
    color: Colors.text.starlight,
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.body,
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  editDetailActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  editDetailClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(196, 102, 90, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 102, 90, 0.15)',
  },
  editDetailClearText: {
    color: Colors.accent.coral,
    fontFamily: Typography.fonts.bodySemiBold,
    fontSize: Typography.sizes.body,
  },
  editDetailSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent.cyan,
  },
  editDetailSaveText: {
    color: '#FFFFFF',
    fontFamily: Typography.fonts.bodySemiBold,
    fontSize: Typography.sizes.body,
  },
  datePickerContainer: {
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  detailModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailModalClear: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(196, 102, 90, 0.08)',
  },
  detailModalClearText: {
    color: Colors.accent.coral,
    fontFamily: Typography.fonts.heading,
    fontSize: Typography.sizes.body,
  },
  detailModalSave: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent.cyan,
  },
  detailModalSaveText: {
    color: '#FFFFFF',
    fontFamily: Typography.fonts.heading,
    fontSize: Typography.sizes.body,
  },
  recordCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent.cyan,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  recordCtaIcon: {
    fontSize: 18,
  },
  recordCtaText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: '#FFFFFF',
  },
  biographyCard: {
    marginBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  biography: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
  biographyEmpty: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  biographyEmptyText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    textAlign: 'center',
    lineHeight: Typography.sizes.caption * Typography.lineHeights.relaxed,
  },
  biographyHint: {
    fontSize: Typography.sizes.caption - 1,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    textAlign: 'center',
    marginTop: Spacing.sm,
    opacity: 0.7,
  },
  relationshipsList: {
    gap: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  relationshipCard: {
    padding: Spacing.md,
  },
  relationshipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  relationshipAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background.current,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relationshipAvatarText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.glow,
  },
  relationshipName: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
  },
  relationshipType: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    textTransform: 'capitalize',
  },
  relationshipMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  verifiedBadge: {
    backgroundColor: 'rgba(107, 143, 60, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.glow,
  },
  unverifiedBadge: {
    backgroundColor: 'rgba(196, 154, 60, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
  },
  unverifiedBadgeText: {
    fontSize: 9,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.amber,
  },
  confirmButton: {
    backgroundColor: Colors.accent.glow,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: 14,
    fontFamily: Typography.fonts.bodySemiBold,
    color: '#FFFFFF',
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 115, 85, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButtonActive: {
    backgroundColor: Colors.accent.amber,
  },
  editButtonText: {
    fontSize: 14,
    color: Colors.text.twilight,
  },
  editButtonTextActive: {
    color: '#FFFFFF',
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(196, 102, 90, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    fontSize: 14,
    color: Colors.accent.coral,
  },
  relationshipActions: {
    flexDirection: 'row',
    gap: 6,
  },
  addConnectionButton: {
    backgroundColor: Colors.accent.glow,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  addConnectionButtonText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: '#FFFFFF',
  },
  emptyConnectionsText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  typePicker: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.background.current,
  },
  typePickerLabel: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.twilight,
    marginBottom: Spacing.sm,
  },
  typePickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeOption: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background.trench,
    borderWidth: 1.5,
    borderColor: Colors.background.current,
  },
  typeOptionSelected: {
    backgroundColor: Colors.accent.glow,
    borderColor: Colors.accent.glow,
  },
  typeOptionText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  typeOptionTextSelected: {
    color: '#FFFFFF',
    fontFamily: Typography.fonts.bodySemiBold,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalKeyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.background.void,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background.current,
  },
  modalTitle: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background.depth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: Colors.text.twilight,
  },
  modalScroll: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background.current,
    borderRadius: BorderRadius.sm,
  },
  modalOptionDisabled: {
    opacity: 0.4,
  },
  modalOptionAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background.current,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionAvatarText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.glow,
  },
  modalOptionName: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
  },
  modalOptionHint: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: 2,
  },
  modalChevron: {
    fontSize: 22,
    color: Colors.text.twilight,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  modalBackButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background.depth,
  },
  modalBackButtonText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.moonlight,
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent.glow,
    alignItems: 'center',
  },
  modalSaveButtonDisabled: {
    opacity: 0.4,
  },
  modalSaveButtonText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: '#FFFFFF',
  },
  storyCard: {
    marginBottom: Spacing.md,
  },
  storyTitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
    marginBottom: Spacing.xs,
  },
  storyContent: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: Typography.sizes.caption * Typography.lineHeights.relaxed,
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
  deletePersonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  deletePersonButtonText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.coral,
  },
  mergePersonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    marginTop: Spacing.xxl,
  },
  mergePersonButtonText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.glow,
  },
  mergeDesc: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginBottom: Spacing.md,
    lineHeight: Typography.sizes.caption * Typography.lineHeights.relaxed,
  },
});

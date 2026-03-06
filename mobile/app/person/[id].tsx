// ============================================================
// MATRA — Person Detail Screen
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, TextInput, Platform } from 'react-native';
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

const RELATIONSHIP_TYPES = [
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'ex_spouse', label: 'Ex-Spouse' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'grandchild', label: 'Grandchild' },
  { value: 'great_grandparent', label: 'Great Grandparent' },
  { value: 'great_grandchild', label: 'Great Grandchild' },
  { value: 'great_great_grandparent', label: 'Great Great Grandparent' },
  { value: 'great_great_grandchild', label: 'Great Great Grandchild' },
  { value: 'uncle_aunt', label: 'Uncle / Aunt' },
  { value: 'nephew_niece', label: 'Nephew / Niece' },
  { value: 'cousin', label: 'Cousin' },
  { value: 'in_law', label: 'In-law' },
  { value: 'step_parent', label: 'Step Parent' },
  { value: 'step_child', label: 'Step Child' },
  { value: 'step_sibling', label: 'Step Sibling' },
  { value: 'adopted_parent', label: 'Adopted Parent' },
  { value: 'adopted_child', label: 'Adopted Child' },
  { value: 'godparent', label: 'Godparent' },
  { value: 'godchild', label: 'Godchild' },
  { value: 'other', label: 'Other' },
];

function getRelLabel(value: string): string {
  return RELATIONSHIP_TYPES.find((t) => t.value === value)?.label || value.replace('_', ' ');
}

// When the current person is personB, we need to show the inverse label
const INVERSE_TYPE: Record<string, string> = {
  parent: 'child', child: 'parent',
  grandparent: 'grandchild', grandchild: 'grandparent',
  great_grandparent: 'great_grandchild', great_grandchild: 'great_grandparent',
  great_great_grandparent: 'great_great_grandchild', great_great_grandchild: 'great_great_grandparent',
  uncle_aunt: 'nephew_niece', nephew_niece: 'uncle_aunt',
  step_parent: 'step_child', step_child: 'step_parent',
  adopted_parent: 'adopted_child', adopted_child: 'adopted_parent',
  godparent: 'godchild', godchild: 'godparent',
};
const SYMMETRIC_TYPES = ['spouse', 'ex_spouse', 'sibling', 'step_sibling', 'cousin', 'in_law', 'other'];

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
    updatePerson,
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

  const person = people.find((p) => p.id === id);

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
      await uploadPersonAvatar(person.id, result.assets[0].uri);
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

  const avatarUrl = useSignedUrl(person.avatar_url);
  const fullName = [person.first_name, person.last_name].filter(Boolean).join(' ');

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
                placeholder="First name"
                placeholderTextColor={Colors.text.twilight}
                autoFocus
              />
              <TextInput
                style={styles.nameInput}
                value={editLastName}
                onChangeText={setEditLastName}
                placeholder="Last name"
                placeholderTextColor={Colors.text.twilight}
              />
              <View style={styles.nameEditActions}>
                <Pressable
                  style={styles.nameEditCancel}
                  onPress={() => setIsEditingName(false)}
                >
                  <Text style={styles.nameEditCancelText}>Cancel</Text>
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
                      Alert.alert('Error', err.message);
                    } finally {
                      setIsSavingName(false);
                    }
                  }}
                >
                  <Text style={styles.nameEditSaveText}>
                    {isSavingName ? 'Saving...' : 'Save'}
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
                  : 'Add birthday'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.detailChip}
              onPress={() => { setEditingDetail('birth_place'); setEditDetailValue(person.birth_place || ''); }}
            >
              <Text style={styles.detailChipText}>
                📍 {person.birth_place || 'Add birthplace'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.detailsRow}>
            <Pressable
              style={styles.detailChip}
              onPress={() => { setEditingDetail('current_location'); setEditDetailValue(person.current_location || ''); }}
            >
              <Text style={styles.detailChipText}>
                🏠 {person.current_location || 'Add location'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.detailChip}
              onPress={() => { setEditingDetail('profession'); setEditDetailValue(person.metadata?.profession || ''); }}
            >
              <Text style={styles.detailChipText}>
                💼 {person.metadata?.profession || 'Add profession'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.detailsRow}>
            <Pressable
              style={[styles.detailChip, (person.death_date || person.metadata?.is_deceased) && styles.detailChipDeceased]}
              onPress={() => {
                if (person.death_date) {
                  setEditingDetail('death_date');
                  setEditDetailValue(person.death_date);
                } else if (person.metadata?.is_deceased) {
                  Alert.alert('Passing', 'Mark as alive or add a date?', [
                    { text: 'Mark Alive', onPress: () => updatePerson(person.id, { metadata: { ...person.metadata, is_deceased: false } }) },
                    { text: 'Add Date', onPress: () => { setEditingDetail('death_date'); setEditDetailValue(''); } },
                    { text: 'Cancel', style: 'cancel' },
                  ]);
                } else {
                  Alert.alert('Mark as Deceased?', undefined, [
                    { text: 'Yes, with date', onPress: () => { setEditingDetail('death_date'); setEditDetailValue(''); } },
                    { text: 'Yes, no date', onPress: () => updatePerson(person.id, { metadata: { ...person.metadata, is_deceased: true } }) },
                    { text: 'Cancel', style: 'cancel' },
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
                    ? '🕊️ Deceased'
                    : '🕊️ Alive'}}
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
            <Text style={styles.sectionTitle}>{t('person.biography')}</Text>
            {person.ai_biography ? (
              <View>
                <Text style={styles.biography}>{person.ai_biography}</Text>
                <Button
                  title={profile?.subscription_tier === 'free' ? '🔒 Update Biography' : '✨ Update Biography'}
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
                  title={profile?.subscription_tier === 'free' ? '🔒 Generate Biography' : '✨ Generate Biography'}
                  onPress={handleGenerateBiography}
                  loading={isGenerating}
                  variant="secondary"
                  size="sm"
                />
                <Text style={styles.biographyHint}>
                  The more conversations you record, the more robust and complete the biography becomes.
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
                  Alert.alert('Error', err.message);
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
                  Alert.alert('Error', err.message);
                } finally {
                  setConfirmingId(null);
                  setEditingRelId(null);
                }
              };

              const handleDelete = () => {
                Alert.alert(
                  'Remove Connection',
                  `Remove ${rel.otherPerson?.first_name || 'this'} as ${getRelLabel(rel.effectiveType)}?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove', style: 'destructive',
                      onPress: async () => {
                        try { await deleteRelationship(rel.id); }
                        catch (err: any) { Alert.alert('Error', err.message); }
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
                      {rel.otherPerson ? `${rel.otherPerson.first_name} ${rel.otherPerson.last_name || ''}`.trim() : 'Unknown'}
                    </Text>
                    <View style={styles.relationshipMeta}>
                      <Text style={styles.relationshipType}>
                        {getRelLabel(rel.effectiveType)}
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
                      {person.first_name} is {rel.otherPerson?.first_name}'s {getRelLabel(rel.effectiveType)}
                    </Text>
                    <View style={styles.typePickerGrid}>
                      {RELATIONSHIP_TYPES.map((t) => (
                        <Pressable
                          key={t.value}
                          style={[
                            styles.typeOption,
                            rel.effectiveType === t.value && styles.typeOptionSelected,
                          ]}
                          onPress={(e) => {
                            e.stopPropagation();
                            if (t.value !== rel.effectiveType) handleChangeType(t.value);
                          }}
                        >
                          <Text style={[
                            styles.typeOptionText,
                            rel.effectiveType === t.value && styles.typeOptionTextSelected,
                          ]}>
                            {t.label}
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
      </ScrollView>
    </StarField>

    {/* Add Connection Overlay */}
    {showAddModal && (
      <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={styles.modalOverlay}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAddModal(false)} />
        <Animated.View entering={SlideInDown.duration(300)} exiting={SlideOutDown.duration(200)} style={styles.modalContent}>
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
                          <Text style={styles.modalOptionHint}>Already connected</Text>
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
                {people.find((p) => p.id === selectedPersonId)?.first_name} is {person.first_name}'s {selectedType ? getRelLabel(selectedType) : '_____'}
              </Text>
              <View style={[styles.typePickerGrid, { marginTop: Spacing.md }]}>
                {RELATIONSHIP_TYPES.map((t) => (
                  <Pressable
                    key={t.value}
                    style={[
                      styles.typeOption,
                      selectedType === t.value && styles.typeOptionSelected,
                    ]}
                    onPress={() => setSelectedType(t.value)}
                  >
                    <Text style={[
                      styles.typeOptionText,
                      selectedType === t.value && styles.typeOptionTextSelected,
                    ]}>
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.modalFooter}>
                <Pressable
                  style={styles.modalBackButton}
                  onPress={() => { setAddStep('person'); setSelectedType(null); }}
                >
                  <Text style={styles.modalBackButtonText}>← Back</Text>
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
                      Alert.alert('Error', err.message);
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
      </Animated.View>
    )}
    {editingDetail && (
      <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.modalOverlay}>
        <Pressable style={styles.modalOverlay} onPress={() => setEditingDetail(null)}>
          <Animated.View entering={SlideInDown} exiting={SlideOutDown} style={styles.modalContent}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>
                {editingDetail === 'birth_date' ? `🎂 ${t('person.birthDate')}` :
                 editingDetail === 'birth_place' ? `📍 ${t('person.birthPlace')}` :
                 editingDetail === 'current_location' ? `🏠 ${t('person.currentLocation')}` :
                 editingDetail === 'profession' ? `💼 ${t('person.profession')}` :
                 editingDetail === 'death_date' ? `🕊️ ${t('person.deathDate')}` : ''}
              </Text>
              {(editingDetail === 'birth_date' || editingDetail === 'death_date') ? (
                <View style={styles.datePickerContainer}>
                  <DateTimePicker
                    value={editDetailValue ? new Date(editDetailValue + 'T00:00:00') : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    maximumDate={new Date()}
                    themeVariant="dark"
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
                  style={styles.detailInput}
                  value={editDetailValue}
                  onChangeText={setEditDetailValue}
                  placeholder={
                    editingDetail === 'birth_place' ? 'City, Country'
                    : editingDetail === 'current_location' ? 'City, Country'
                    : editingDetail === 'profession' ? 'e.g. Teacher'
                    : ''
                  }
                  placeholderTextColor={Colors.text.starlight + '60'}
                  autoFocus
                />
              )}
              <View style={styles.detailModalButtons}>
                <Pressable
                  style={styles.detailModalClear}
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
                  <Text style={styles.detailModalClearText}>{t('common.delete')}</Text>
                </Pressable>
                <Pressable
                  style={styles.detailModalSave}
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
                  <Text style={styles.detailModalSaveText}>{t('common.save')}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Animated.View>
        </Pressable>
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
  detailInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    color: Colors.text.starlight,
    fontFamily: Typography.fonts.body,
    fontSize: Typography.sizes.body,
    marginBottom: Spacing.lg,
  },
  datePickerContainer: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  detailModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailModalClear: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    backgroundColor: 'rgba(255,100,100,0.15)',
  },
  detailModalClearText: {
    color: '#ff8888',
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
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  unverifiedBadgeText: {
    fontSize: 10,
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
    borderTopColor: 'rgba(139, 115, 85, 0.12)',
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(139, 115, 85, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 115, 85, 0.15)',
  },
  typeOptionSelected: {
    backgroundColor: Colors.accent.glow,
    borderColor: Colors.accent.glow,
  },
  typeOptionText: {
    fontSize: 12,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  typeOptionTextSelected: {
    color: '#FFFFFF',
    fontFamily: Typography.fonts.bodySemiBold,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: Colors.background.void,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 115, 85, 0.12)',
  },
  modalTitle: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 115, 85, 0.1)',
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
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 115, 85, 0.08)',
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
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(139, 115, 85, 0.1)',
  },
  modalBackButtonText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.moonlight,
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
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
});

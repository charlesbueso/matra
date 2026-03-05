// ============================================================
// MATRA — Person Detail Screen
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { StarField, Card, Button, VoiceWaveform, BioAlgae, CornerBush } from '../../src/components/ui';
import { useFamilyStore, Person } from '../../src/stores/familyStore';
import { useAuthStore } from '../../src/stores/authStore';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/tokens';

const RELATIONSHIP_TYPES = [
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'grandchild', label: 'Grandchild' },
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

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { people, relationships, stories, interviews,
    generateBiography, verifyRelationship, updateRelationship,
    createRelationship, deleteRelationship, uploadPersonAvatar,
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

  const person = people.find((p) => p.id === id);

  if (!person) {
    return (
      <StarField>
        <BioAlgae strandCount={30} height={0.15} />
        <CornerBush />
        <View style={styles.notFound}>
          <Text style={styles.notFoundText}>Person not found</Text>
          <Button title="Go Back" onPress={() => router.back()} variant="ghost" />
        </View>
      </StarField>
    );
  }

  // Get relationships for this person
  const personRelationships = relationships.filter(
    (r) => r.person_a_id === id || r.person_b_id === id
  ).map((r) => {
    const otherId = r.person_a_id === id ? r.person_b_id : r.person_a_id;
    const other = people.find((p) => p.id === otherId);
    return {
      ...r,
      otherPerson: other,
    };
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

  const handleGenerateBiography = async () => {
    if (profile?.subscription_tier === 'free') {
      router.push('/paywall');
      return;
    }

    setIsGenerating(true);
    try {
      await generateBiography(person.id);
      Alert.alert('Biography Generated!', 'AI has written a biography based on all known stories and information.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to add a picture.');
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
      Alert.alert('Upload failed', err.message);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const fullName = [person.first_name, person.last_name].filter(Boolean).join(' ');

  return (
    <View style={{ flex: 1 }}>
    <StarField starCount={25}>
      <BioAlgae strandCount={30} height={0.15} />
      <CornerBush />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Back button */}
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>

        {/* Person Header */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.header}>
          <Pressable onPress={handlePickAvatar} style={styles.avatarLarge} disabled={isUploadingAvatar}>
            {isUploadingAvatar ? (
              <ActivityIndicator color="#FFFFFF" size="large" />
            ) : person.avatar_url ? (
              <Image
                source={{ uri: person.avatar_url }}
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

          <Text style={styles.name}>{fullName}</Text>
          {person.nickname && (
            <Text style={styles.nickname}>"{person.nickname}"</Text>
          )}

          <View style={styles.detailsRow}>
            {person.birth_date && (
              <Text style={styles.detail}>
                🎂 {new Date(person.birth_date).toLocaleDateString()}
              </Text>
            )}
            {person.birth_place && (
              <Text style={styles.detail}>📍 {person.birth_place}</Text>
            )}
          </View>
        </Animated.View>

        {/* Record Conversation CTA */}
        <Animated.View entering={FadeInDown.delay(150)}>
          <Pressable
            style={styles.recordCta}
            onPress={() => router.push({ pathname: '/(tabs)/record', params: { personId: person.id } })}
          >
            <Text style={styles.recordCtaIcon}>🎙</Text>
            <Text style={styles.recordCtaText}>Record Conversation</Text>
          </Pressable>
        </Animated.View>

        {/* Biography */}
        <Animated.View entering={FadeInDown.delay(200)}>
          <Card variant="glow" style={styles.biographyCard}>
            <Text style={styles.sectionTitle}>Biography</Text>
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
                />
              </View>
            ) : hasMaterial ? (
              <View style={styles.biographyEmpty}>
                <Text style={styles.biographyEmptyText}>
                  No biography yet. Generate one using AI based on conversations and stories.
                </Text>
                <Button
                  title={profile?.subscription_tier === 'free' ? '🔒 Generate Biography' : '✨ Generate Biography'}
                  onPress={handleGenerateBiography}
                  loading={isGenerating}
                  variant="secondary"
                  size="sm"
                />
              </View>
            ) : (
              <View style={styles.biographyEmpty}>
                <Text style={styles.biographyEmptyText}>
                  Record a conversation with {person.first_name} first to generate their biography.
                </Text>
              </View>
            )}
          </Card>
        </Animated.View>

        {/* Relationships */}
        <Animated.View entering={FadeInDown.delay(300)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Connections</Text>
            <Pressable
              style={styles.addConnectionButton}
              onPress={() => {
                setAddStep('person');
                setSelectedPersonId(null);
                setSelectedType(null);
                setShowAddModal(true);
              }}
            >
              <Text style={styles.addConnectionButtonText}>+ Add</Text>
            </Pressable>
          </View>
          <View style={styles.relationshipsList}>
            {personRelationships.length === 0 && (
              <Text style={styles.emptyConnectionsText}>
                No connections yet. Add one manually or record a conversation.
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
                setConfirmingId(rel.id);
                try {
                  await updateRelationship(rel.id, {
                    relationship_type: newType,
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
                  `Remove ${rel.otherPerson?.first_name || 'this'} as ${getRelLabel(rel.relationship_type)}?`,
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
                        {getRelLabel(rel.relationship_type)}
                      </Text>
                      {rel.verified ? (
                        <View style={styles.verifiedBadge}>
                          <Text style={styles.verifiedBadgeText}>✓ Confirmed</Text>
                        </View>
                      ) : (
                        <View style={styles.unverifiedBadge}>
                          <Text style={styles.unverifiedBadgeText}>AI-detected</Text>
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
                    <Text style={styles.typePickerLabel}>Change relationship:</Text>
                    <View style={styles.typePickerGrid}>
                      {RELATIONSHIP_TYPES.map((t) => (
                        <Pressable
                          key={t.value}
                          style={[
                            styles.typeOption,
                            rel.relationship_type === t.value && styles.typeOptionSelected,
                          ]}
                          onPress={(e) => {
                            e.stopPropagation();
                            if (t.value !== rel.relationship_type) handleChangeType(t.value);
                          }}
                        >
                          <Text style={[
                            styles.typeOptionText,
                            rel.relationship_type === t.value && styles.typeOptionTextSelected,
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
            <Text style={styles.sectionTitle}>Stories</Text>
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
              {addStep === 'person' ? 'Select Person' : 'Select Relationship'}
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
                  No other people in your family tree yet.
                </Text>
              )}
            </ScrollView>
          ) : (
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.typePickerLabel}>
                How is {people.find((p) => p.id === selectedPersonId)?.first_name} related to {person.first_name}?
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
                      await createRelationship(id!, selectedPersonId, selectedType);
                      setShowAddModal(false);
                    } catch (err: any) {
                      Alert.alert('Error', err.message);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                >
                  <Text style={styles.modalSaveButtonText}>
                    {isSaving ? 'Saving...' : 'Add Connection'}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </Animated.View>
    )}
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
  nickname: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    fontStyle: 'italic',
    marginTop: Spacing.xs,
  },
  detailsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginTop: Spacing.md,
  },
  detail: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
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

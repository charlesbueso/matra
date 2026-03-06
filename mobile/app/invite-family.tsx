// ============================================================
// MATRA — Invite Family Members Screen
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  Alert, ActivityIndicator, Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StarField, Card, Button, BioAlgae, CornerBush } from '../src/components/ui';
import { useFamilyStore } from '../src/stores/familyStore';
import { useAuthStore } from '../src/stores/authStore';
import { invokeFunction } from '../src/services/supabase';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/tokens';

type RelOption = {
  type: string;
  labelKey: string;
};

const RELATIONSHIP_OPTIONS: RelOption[] = [
  { type: 'sibling', labelKey: 'relationships.sibling' },
  { type: 'parent', labelKey: 'relationships.parent' },
  { type: 'child', labelKey: 'relationships.child' },
  { type: 'spouse', labelKey: 'relationships.spouse' },
  { type: 'grandparent', labelKey: 'relationships.grandparent' },
  { type: 'grandchild', labelKey: 'relationships.grandchild' },
  { type: 'uncle_aunt', labelKey: 'relationships.uncle_aunt' },
  { type: 'nephew_niece', labelKey: 'relationships.nephew_niece' },
  { type: 'cousin', labelKey: 'relationships.cousin' },
  { type: 'in_law', labelKey: 'relationships.in_law' },
  { type: 'step_parent', labelKey: 'relationships.step_parent' },
  { type: 'step_child', labelKey: 'relationships.step_child' },
  { type: 'step_sibling', labelKey: 'relationships.step_sibling' },
  { type: 'godparent', labelKey: 'relationships.godparent' },
  { type: 'godchild', labelKey: 'relationships.godchild' },
  { type: 'other', labelKey: 'relationships.other' },
];

interface Invitation {
  id: string;
  invite_code: string;
  relationship_type: string;
  status: string;
  expires_at: string;
  created_at: string;
  accepted_by: string | null;
  profiles?: { display_name: string } | null;
}

export default function InviteFamilyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeFamilyGroupId, people } = useFamilyStore();
  const profile = useAuthStore((s) => s.profile);

  const [selectedRelType, setSelectedRelType] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPersonPicker, setShowPersonPicker] = useState(false);

  // Fetch existing invitations
  useEffect(() => {
    loadInvitations();
  }, []);

  const loadInvitations = async () => {
    try {
      setIsLoading(true);
      const result = await invokeFunction<{ invitations: Invitation[] }>('invite-family', undefined, 'GET');
      setInvitations(result.invitations || []);
    } catch {
      // Silently fail — user will see empty list
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!activeFamilyGroupId || !selectedRelType) return;

    setIsCreating(true);
    try {
      const result = await invokeFunction<{
        invitation: Invitation;
        inviteLink: string;
        inviterName: string;
      }>('invite-family', {
        action: 'create',
        familyGroupId: activeFamilyGroupId,
        relationshipType: selectedRelType,
        inviteePersonId: selectedPersonId,
      });

      // Share the link
      await Share.share({
        message: t('invite.shareMessage', {
          name: profile?.display_name || t('common.you'),
          link: result.inviteLink,
        }),
      });

      // Refresh list
      await loadInvitations();
      setSelectedRelType(null);
      setSelectedPersonId(null);
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = (invitation: Invitation) => {
    Alert.alert(
      t('invite.revokeTitle'),
      t('invite.revokeMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('invite.revoke'),
          style: 'destructive',
          onPress: async () => {
            try {
              await invokeFunction('invite-family', {
                action: 'revoke',
                invitationId: invitation.id,
              });
              await loadInvitations();
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message);
            }
          },
        },
      ]
    );
  };

  const handleResend = async (invitation: Invitation) => {
    const link = `matra://invite/${invitation.invite_code}`;
    await Share.share({
      message: t('invite.shareMessage', {
        name: profile?.display_name || t('common.you'),
        link,
      }),
    });
  };

  const pendingInvitations = invitations.filter((i) => i.status === 'pending');
  const acceptedInvitations = invitations.filter((i) => i.status === 'accepted');

  // Other people in tree (excluding self)
  const otherPeople = people.filter((p) => p.id !== profile?.self_person_id);

  return (
    <StarField starCount={15}>
      <BioAlgae strandCount={20} height={0.1} />
      <CornerBush />
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={Colors.text.starlight} />
        </Pressable>

        <Text style={styles.title}>{t('invite.title')}</Text>
        <Text style={styles.subtitle}>{t('invite.subtitle')}</Text>

        {/* Create New Invitation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('invite.newInvitation')}</Text>
          <Card variant="elevated">
            <Text style={styles.fieldLabel}>{t('invite.relationshipLabel')}</Text>

            <View style={styles.relGrid}>
              {RELATIONSHIP_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.type}
                  style={[
                    styles.relPill,
                    selectedRelType === opt.type && styles.relPillActive,
                  ]}
                  onPress={() => setSelectedRelType(opt.type)}
                >
                  <Text
                    style={[
                      styles.relPillText,
                      selectedRelType === opt.type && styles.relPillTextActive,
                    ]}
                  >
                    {t(opt.labelKey)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Optional: link to existing person in tree */}
            {otherPeople.length > 0 && (
              <>
                <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>
                  {t('invite.linkToPerson')}
                </Text>
                <Pressable
                  style={styles.personPicker}
                  onPress={() => setShowPersonPicker(!showPersonPicker)}
                >
                  <Text style={styles.personPickerText}>
                    {selectedPersonId
                      ? (() => {
                          const p = otherPeople.find((pp) => pp.id === selectedPersonId);
                          return p ? `${p.first_name}${p.last_name ? ` ${p.last_name}` : ''}` : t('invite.selectPerson');
                        })()
                      : t('invite.selectPersonOptional')}
                  </Text>
                  <Ionicons
                    name={showPersonPicker ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={Colors.text.twilight}
                  />
                </Pressable>

                {showPersonPicker && (
                  <View style={styles.personList}>
                    <Pressable
                      style={[styles.personItem, !selectedPersonId && styles.personItemActive]}
                      onPress={() => {
                        setSelectedPersonId(null);
                        setShowPersonPicker(false);
                      }}
                    >
                      <Text style={styles.personItemText}>{t('invite.noPersonLinked')}</Text>
                    </Pressable>
                    {otherPeople.map((person) => (
                      <Pressable
                        key={person.id}
                        style={[
                          styles.personItem,
                          selectedPersonId === person.id && styles.personItemActive,
                        ]}
                        onPress={() => {
                          setSelectedPersonId(person.id);
                          setShowPersonPicker(false);
                        }}
                      >
                        <Text style={styles.personItemText}>
                          {person.first_name}{person.last_name ? ` ${person.last_name}` : ''}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            )}

            <Button
              title={isCreating ? t('invite.creating') : t('invite.createAndShare')}
              onPress={handleCreate}
              variant="primary"
              size="md"
              disabled={!selectedRelType || isCreating}
              loading={isCreating}
              style={{ marginTop: Spacing.lg }}
            />
          </Card>
        </View>

        {/* Pending Invitations */}
        {isLoading ? (
          <ActivityIndicator color={Colors.accent.cyan} style={{ marginTop: Spacing.xl }} />
        ) : (
          <>
            {pendingInvitations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('invite.pending')}</Text>
                <Card variant="default">
                  {pendingInvitations.map((inv) => (
                    <View key={inv.id} style={styles.invitationRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invRelType}>
                          {t(`relationships.${inv.relationship_type}`)}
                        </Text>
                        <Text style={styles.invCode}>{inv.invite_code}</Text>
                        <Text style={styles.invExpiry}>
                          {t('invite.expiresAt', {
                            date: new Date(inv.expires_at).toLocaleDateString(),
                          })}
                        </Text>
                      </View>
                      <View style={styles.invActions}>
                        <Pressable
                          style={styles.invActionButton}
                          onPress={() => handleResend(inv)}
                        >
                          <Ionicons name="share-outline" size={18} color={Colors.accent.cyan} />
                        </Pressable>
                        <Pressable
                          style={styles.invActionButton}
                          onPress={() => handleRevoke(inv)}
                        >
                          <Ionicons name="close-circle-outline" size={18} color={Colors.semantic.error} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {acceptedInvitations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('invite.accepted')}</Text>
                <Card variant="default">
                  {acceptedInvitations.map((inv) => (
                    <View key={inv.id} style={styles.invitationRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.invRelType}>
                          {t(`relationships.${inv.relationship_type}`)}
                        </Text>
                        <Text style={styles.invAccepted}>
                          {t('invite.acceptedLabel')} ✓
                        </Text>
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </StarField>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { flex: 1 },
  content: {
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 100,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.background.abyss,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  title: {
    fontSize: Typography.sizes.h1,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    marginBottom: Spacing.xl,
  },
  section: { marginBottom: Spacing.xl },
  sectionTitle: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.twilight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Spacing.sm,
  },
  fieldLabel: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
    marginBottom: Spacing.sm,
  },
  relGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  relPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.overlay.light,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  relPillActive: {
    backgroundColor: Colors.accent.cyan + '20',
    borderColor: Colors.accent.cyan,
  },
  relPillText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.text.moonlight,
  },
  relPillTextActive: {
    color: Colors.accent.cyan,
    fontFamily: Typography.fonts.bodySemiBold,
  },
  personPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.overlay.dark,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background.void,
  },
  personPickerText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  personList: {
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.overlay.dark,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.background.abyss,
    maxHeight: 200,
  },
  personItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 115, 85, 0.08)',
  },
  personItemActive: {
    backgroundColor: Colors.accent.cyan + '15',
  },
  personItemText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.starlight,
  },
  invitationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 115, 85, 0.08)',
  },
  invRelType: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
  },
  invCode: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: 2,
  },
  invExpiry: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.shadow,
    marginTop: 2,
  },
  invActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  invActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  invAccepted: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.emerald,
    marginTop: 2,
  },
});

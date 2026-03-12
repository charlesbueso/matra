// ============================================================
// Matra — Manage Family Group
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { StarField, Card, Button, BioAlgae, CornerBush } from '../src/components/ui';
import { useTranslation } from 'react-i18next';
import { useFamilyStore } from '../src/stores/familyStore';
import { useAuthStore } from '../src/stores/authStore';
import { useSignedUrl } from '../src/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/tokens';
import { resizeImageForUpload } from '../src/utils/image';

export default function ManageFamilyGroupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { familyGroups, activeFamilyGroupId, updateFamilyGroup, people, uploadPersonAvatar } = useFamilyStore();
  const profile = useAuthStore((s) => s.profile);
  const isPremium = profile?.subscription_tier === 'premium';

  const group = familyGroups.find((g) => g.id === activeFamilyGroupId);

  const [name, setName] = useState(group?.name || '');
  const [description, setDescription] = useState(group?.description || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  const logoUrl = useSignedUrl(group?.cover_image_url);

  const handleSaveName = async () => {
    if (!group || !name.trim()) return;
    setIsSaving(true);
    try {
      await updateFamilyGroup(group.id, { name: name.trim() });
      Alert.alert(t('common.saved'), t('familyGroup.nameUpdated'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!group) return;
    setIsSaving(true);
    try {
      await updateFamilyGroup(group.id, { description: description.trim() || null });
      Alert.alert(t('common.saved'), t('familyGroup.descriptionUpdated'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePickLogo = async () => {
    if (!group) return;

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

    setIsUploadingLogo(true);
    try {
      // Resize then upload via Supabase storage directly
      const uri = await resizeImageForUpload(result.assets[0].uri);
      const fileName = `family-logo-${group.id}-${Date.now()}.jpg`;
      const response = await fetch(uri);
      const blob = await response.blob();

      const { data: uploadData, error: uploadError } = await (await import('../src/services/supabase')).supabase
        .storage
        .from('person-avatars')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) throw uploadError;

      await updateFamilyGroup(group.id, { cover_image_url: uploadData.path });
      Alert.alert(t('common.saved'), t('familyGroup.logoUpdated'));
    } catch (err: any) {
      Alert.alert(t('person.uploadFailed'), err.message);
    } finally {
      setIsUploadingLogo(false);
    }
  };

  if (!group) {
    return (
      <StarField starCount={15}>
        <BioAlgae strandCount={20} height={0.1} />
        <CornerBush />
        <View style={styles.container}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color={Colors.text.starlight} />
          </Pressable>
          <Text style={styles.title}>{t('familyGroup.noFamilyGroup')}</Text>
          <Text style={styles.emptyText}>{t('familyGroup.noFamilyGroupDesc')}</Text>
        </View>
      </StarField>
    );
  }

  return (
    <StarField starCount={15}>
      <BioAlgae strandCount={20} height={0.1} />
      <CornerBush />
      <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={Colors.text.starlight} />
        </Pressable>

        <Text style={styles.title}>{t('familyGroup.title')}</Text>

        {/* Group Name — available to all */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('familyGroup.groupName')}</Text>
          <Card variant="default">
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('familyGroup.groupNamePlaceholder')}
              placeholderTextColor={Colors.text.shadow}
            />
            <Button
              title={isSaving ? t('familyGroup.saving') : t('familyGroup.saveName')}
              onPress={handleSaveName}
              size="sm"
              disabled={isSaving || !name.trim() || name.trim() === group.name}
              style={{ marginTop: Spacing.sm }}
            />
          </Card>
        </View>

        {/* Premium: Family Logo */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('familyGroup.familyLogo')}</Text>
            {!isPremium && <Text style={styles.premiumBadge}>{t('common.premium')}</Text>}
          </View>
          <Card variant="default" style={{ alignItems: 'center' }}>
            {isPremium ? (
              <>
                <Pressable onPress={handlePickLogo} style={styles.logoContainer} disabled={isUploadingLogo}>
                  {isUploadingLogo ? (
                    <ActivityIndicator color={Colors.accent.cyan} />
                  ) : logoUrl ? (
                    <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="cover" transition={300} />
                  ) : (
                    <>
                      <View style={styles.logoPlaceholder}>
                        <Ionicons name="image-outline" size={32} color={Colors.text.twilight} />
                      </View>
                      <Text style={styles.logoPlaceholderText}>{t('familyGroup.tapToAdd')}</Text>
                    </>
                  )}
                </Pressable>
                <Text style={styles.hint}>{t('familyGroup.tapToChange')}</Text>
              </>
            ) : (
              <View style={styles.lockedContent}>
                <View style={styles.logoPlaceholder}>
                  <Ionicons name="image-outline" size={32} color={Colors.text.shadow} />
                </View>
                <Text style={styles.lockedText}>{t('familyGroup.upgradeForLogo')}</Text>
                <Button
                  title="Upgrade"
                  onPress={() => router.push('/paywall')}
                  variant="premium"
                  size="sm"
                  style={{ marginTop: Spacing.sm }}
                />
              </View>
            )}
          </Card>
        </View>

        {/* Premium: Description */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('familyGroup.description')}</Text>
            {!isPremium && <Text style={styles.premiumBadge}>{t('common.premium')}</Text>}
          </View>
          <Card variant="default">
            {isPremium ? (
              <>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder={t('familyGroup.descriptionPlaceholder')}
                  placeholderTextColor={Colors.text.shadow}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <Button
                  title={isSaving ? t('familyGroup.saving') : t('common.save')}
                  onPress={handleSaveDescription}
                  size="sm"
                  disabled={isSaving}
                  style={{ marginTop: Spacing.sm }}
                />
              </>
            ) : (
              <View style={styles.lockedContent}>
                <Text style={styles.lockedText}>{t('familyGroup.upgradeForDescription')}</Text>
              </View>
            )}
          </Card>
        </View>

        {/* Premium: Members */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('familyGroup.members')}</Text>
            {!isPremium && <Text style={styles.premiumBadge}>{t('common.premium')}</Text>}
          </View>
          <Card variant="default">
            {isPremium ? (
              <>
                {people.length === 0 ? (
                  <Text style={styles.emptyText}>{t('familyGroup.noMembers')}</Text>
                ) : (
                  people.map((person) => (
                    <Pressable
                      key={person.id}
                      style={styles.memberRow}
                      onPress={() => router.push(`/person/${person.id}`)}
                    >
                      <View style={styles.memberAvatar}>
                        <Text style={styles.memberAvatarText}>
                          {(person.first_name || '?')[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>
                          {person.first_name}{person.last_name ? ` ${person.last_name}` : ''}
                        </Text>
                        {person.id === profile?.self_person_id && (
                          <Text style={styles.memberYouBadge}>{t('familyGroup.you')}</Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={Colors.text.twilight} />
                    </Pressable>
                  ))
                )}
              </>
            ) : (
              <View style={styles.lockedContent}>
                <Text style={styles.lockedText}>
                  {t('familyGroup.upgradeForMembers')}
                </Text>
                <Button
                  title={t('common.upgrade')}
                  onPress={() => router.push('/paywall')}
                  variant="premium"
                  size="sm"
                  style={{ marginTop: Spacing.sm }}
                />
              </View>
            )}
          </Card>
        </View>

        {/* Invite Family Members — premium only */}
        {isPremium && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('familyGroup.inviteMembers')}</Text>
            <Card variant="default" style={{ alignItems: 'center' }}>
              <Text style={styles.inviteText}>{t('familyGroup.inviteMembersDesc')}</Text>
              <Button
                title={t('familyGroup.inviteMembersAction')}
                onPress={() => router.push('/invite-family')}
                variant="premium"
                size="md"
                style={{ marginTop: Spacing.md, alignSelf: 'stretch' }}
              />
            </Card>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </StarField>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
  },
  scrollContainer: {
    flex: 1,
  },
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
    marginBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.twilight,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  premiumBadge: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.amber,
  },
  input: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.starlight,
    borderWidth: 1,
    borderColor: Colors.overlay.dark,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.background.void,
  },
  textArea: {
    minHeight: 100,
  },
  hint: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: Spacing.sm,
  },
  logoContainer: {
    alignItems: 'center',
    marginVertical: Spacing.md,
  },
  logoImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  logoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.background.trench,
    borderWidth: 2,
    borderColor: Colors.overlay.dark,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPlaceholderText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  lockedContent: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  lockedText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    paddingVertical: Spacing.sm,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 115, 85, 0.08)',
    gap: Spacing.md,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.heading,
    color: '#FFFFFF',
  },
  memberName: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
  },
  memberYouBadge: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.accent.cyan,
  },
  inviteText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    textAlign: 'center',
    lineHeight: Typography.sizes.body * Typography.lineHeights.relaxed,
  },
});

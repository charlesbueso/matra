// ============================================================
// MATRA — Settings Tab
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { StarField, Card, Button, BioAlgae, CornerBush } from '../../src/components/ui';
import { useAuthStore } from '../../src/stores/authStore';
import { useFamilyStore, Interview } from '../../src/stores/familyStore';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/tokens';

export default function SettingsScreen() {
  const router = useRouter();
  const { scrollTo } = useLocalSearchParams<{ scrollTo?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const conversationsY = useRef(0);
  const { profile, signOut, updateProfile, deleteAccount, deactivateAccount } = useAuthStore();
  const { uploadPersonAvatar, interviews, deleteInterview, deleteAllInterviews } = useFamilyStore();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const handleDeleteInterview = (interview: Interview) => {
    Alert.alert(
      'Delete Conversation',
      `Are you sure you want to delete "${interview.title || 'Untitled Conversation'}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setIsDeletingId(interview.id);
            try {
              await deleteInterview(interview.id);
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setIsDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllInterviews = () => {
    if (interviews.length === 0) return;
    Alert.alert(
      'Delete All Conversations',
      `Are you sure you want to delete all ${interviews.length} conversation${interviews.length !== 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All', style: 'destructive',
          onPress: async () => {
            setIsDeletingAll(true);
            try {
              await deleteAllInterviews();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setIsDeletingAll(false);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const tierLabel = {
    free: 'Free',
    premium: 'Premium ◈',
    lifetime: 'Lifetime ◈◈',
  }[profile?.subscription_tier || 'free'];

  const storageUsedMB = Math.round((profile?.storage_used_bytes || 0) / (1024 * 1024));

  const handlePickAvatar = async () => {
    if (!profile?.self_person_id) {
      Alert.alert('No profile node', 'Record your first conversation to create your profile in the family tree.');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photo library to add a profile picture.');
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
      const avatarUrl = await uploadPersonAvatar(profile.self_person_id, result.assets[0].uri);
      await updateProfile({ avatar_url: avatarUrl });
    } catch (err: any) {
      Alert.alert('Upload failed', err.message);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <StarField starCount={20}>
      <BioAlgae strandCount={30} height={0.15} />
      <CornerBush />
      <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Settings</Text>

        {/* Profile Card */}
        <Card variant="elevated" style={styles.profileCard}>
          <Pressable onPress={handlePickAvatar} style={styles.avatar} disabled={isUploadingAvatar}>
            {isUploadingAvatar ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : profile?.avatar_url ? (
              <Image
                source={{ uri: profile.avatar_url }}
                style={styles.avatarImage}
                contentFit="cover"
                transition={300}
              />
            ) : (
              <Text style={styles.avatarText}>
                {(profile?.display_name || '?')[0].toUpperCase()}
              </Text>
            )}
            <View style={styles.avatarEditBadge}>
              <Text style={styles.avatarEditBadgeText}>📷</Text>
            </View>
          </Pressable>
          <Text style={styles.profileName}>{profile?.display_name || 'Explorer'}</Text>
          <View style={styles.tierBadge}>
            <Text style={styles.tierText}>{tierLabel}</Text>
          </View>
        </Card>

        {/* Subscription */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          
          <Card variant="default">
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Current Plan</Text>
              <Text style={styles.settingValue}>{tierLabel}</Text>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Conversations Used</Text>
              <Text style={styles.settingValue}>
                {profile?.interview_count || 0}
                {profile?.subscription_tier === 'free' ? ' / 2' : ''}
              </Text>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Storage Used</Text>
              <Text style={styles.settingValue}>{storageUsedMB} MB</Text>
            </View>

            {profile?.subscription_tier === 'free' && (
              <Button
                title="Upgrade to Premium"
                onPress={() => router.push('/paywall')}
                variant="premium"
                size="sm"
                style={{ marginTop: Spacing.md }}
              />
            )}
          </Card>
        </View>

        {/* Family */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Family</Text>
          <Card variant="default">
            <SettingItem label="Manage Family Groups" onPress={() => {}} />
            <SettingItem label="Invite Family Members" onPress={() => {}} locked={profile?.subscription_tier === 'free'} />
            <SettingItem label="Export Memory Book" onPress={() => {}} locked={profile?.subscription_tier === 'free'} />
          </Card>
        </View>

        {/* Conversations */}
        <View
          style={styles.section}
          onLayout={(e) => {
            conversationsY.current = e.nativeEvent.layout.y;
            if (scrollTo === 'conversations') {
              scrollViewRef.current?.scrollTo({ y: e.nativeEvent.layout.y, animated: true });
            }
          }}
        >
          <Text style={styles.sectionTitle}>Conversations</Text>
          <Card variant="default">
            {interviews.length === 0 ? (
              <Text style={styles.emptyText}>No conversations recorded yet.</Text>
            ) : (
              <>
                {interviews.map((interview) => (
                  <View key={interview.id} style={styles.conversationRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.conversationTitle} numberOfLines={1}>
                        {interview.title || 'Untitled Conversation'}
                      </Text>
                      <Text style={styles.conversationDate}>
                        {new Date(interview.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDeleteInterview(interview)}
                      style={styles.deleteConvButton}
                      disabled={isDeletingId === interview.id}
                    >
                      {isDeletingId === interview.id ? (
                        <ActivityIndicator color={Colors.semantic.error} size="small" />
                      ) : (
                        <Text style={styles.deleteConvButtonText}>✕</Text>
                      )}
                    </Pressable>
                  </View>
                ))}
                <Button
                  title={isDeletingAll ? 'Deleting...' : 'Delete All Conversations'}
                  onPress={handleDeleteAllInterviews}
                  variant="danger"
                  size="sm"
                  loading={isDeletingAll}
                  style={{ marginTop: Spacing.md }}
                />
              </>
            )}
          </Card>
        </View>

        {/* App */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          <Card variant="default">
            <SettingItem label="Privacy Policy" onPress={() => {}} />
            <SettingItem label="Terms of Service" onPress={() => {}} />
            <SettingItem label="About MATRA" onPress={() => {}} />
          </Card>
        </View>

        {/* Account */}
        <View style={styles.section}>
          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="ghost"
          />
          <Button
            title={isDeactivating ? 'Deactivating...' : 'Deactivate Account'}
            onPress={() => {
              Alert.alert(
                'Deactivate Account',
                'Your data will be preserved but hidden. You can reactivate your account by signing back in.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Deactivate',
                    style: 'destructive',
                    onPress: async () => {
                      setIsDeactivating(true);
                      try {
                        await deactivateAccount();
                      } catch (err: any) {
                        Alert.alert('Error', err.message);
                      } finally {
                        setIsDeactivating(false);
                      }
                    },
                  },
                ]
              );
            }}
            variant="ghost"
            size="sm"
            loading={isDeactivating}
          />
          <Button
            title={isDeletingAccount ? 'Deleting...' : 'Delete Account'}
            onPress={() => {
              Alert.alert(
                'Delete Account',
                'This will permanently delete your account and ALL your data. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete Everything',
                    style: 'destructive',
                    onPress: () => {
                      Alert.alert(
                        'Are you absolutely sure?',
                        'All your family data, conversations, and stories will be permanently lost.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Yes, Delete My Account',
                            style: 'destructive',
                            onPress: async () => {
                              setIsDeletingAccount(true);
                              try {
                                await deleteAccount();
                              } catch (err: any) {
                                Alert.alert('Error', err.message);
                                setIsDeletingAccount(false);
                              }
                            },
                          },
                        ]
                      );
                    },
                  },
                ]
              );
            }}
            variant="danger"
            size="sm"
            loading={isDeletingAccount}
          />
        </View>

        <Text style={styles.version}>MATRA v1.0.0</Text>
      </ScrollView>
    </StarField>
  );
}

function SettingItem({ label, onPress, locked }: { label: string; onPress: () => void; locked?: boolean }) {
  return (
    <Pressable onPress={onPress} style={styles.settingItem}>
      <Text style={styles.settingItemLabel}>{label}</Text>
      {locked && <Text style={styles.lockIcon}>🔒</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 100,
  },
  title: {
    fontSize: Typography.sizes.h2,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    marginBottom: Spacing.xl,
  },
  profileCard: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    shadowColor: Colors.accent.cyan,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    position: 'relative',
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.background.depth,
    borderWidth: 2,
    borderColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadgeText: {
    fontSize: 10,
  },
  avatarText: {
    fontSize: Typography.sizes.h1,
    fontFamily: Typography.fonts.heading,
    color: '#FFFFFF',
  },
  profileName: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    marginBottom: Spacing.sm,
  },
  tierBadge: {
    backgroundColor: Colors.background.current,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  tierText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.glow,
  },
  section: {
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.twilight,
    textTransform: 'uppercase',
    letterSpacing: Typography.letterSpacing.wider,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  settingLabel: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  settingValue: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 115, 85, 0.08)',
  },
  settingItemLabel: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.starlight,
  },
  lockIcon: {
    fontSize: 14,
  },
  emptyText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    paddingVertical: Spacing.sm,
  },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 115, 85, 0.08)',
  },
  conversationTitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
  },
  conversationDate: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginTop: 2,
  },
  deleteConvButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  deleteConvButtonText: {
    fontSize: 16,
    color: Colors.semantic.error,
  },
  version: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.shadow,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
});

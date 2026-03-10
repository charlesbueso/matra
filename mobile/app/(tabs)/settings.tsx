// ============================================================
// Matra — Settings Tab
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { File as FSFile, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StarField, Card, Button, BioAlgae, CornerBush, AvatarViewer } from '../../src/components/ui';
import { SubscriptionInfoSheet } from '../../src/components/SubscriptionInfoSheet';
import { SubscriptionStatusBanner } from '../../src/components/SubscriptionStatusBanner';
import { useAuthStore } from '../../src/stores/authStore';
import { useFamilyStore, Interview } from '../../src/stores/familyStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { invokeFunction } from '../../src/services/supabase';
import { useSignedUrl } from '../../src/hooks';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/theme/tokens';
import { SUPPORTED_LANGUAGES, getCurrentLanguage, type LanguageCode } from '../../src/i18n';
import { resizeImageForUpload } from '../../src/utils/image';

// ── Usage Row with Progress Bar ──
function UsageRow({ label, used, max, suffix, formatLabel }: {
  label: string;
  used: number;
  max: number;
  suffix?: string;
  formatLabel?: (used: number, max: number) => string;
}) {
  const ratio = Math.min(used / max, 1);
  const isNearLimit = ratio >= 0.8;
  const displayLabel = formatLabel
    ? formatLabel(used, max)
    : `${used} / ${max}${suffix ? ` ${suffix}` : ''}`;

  return (
    <View style={usageStyles.container}>
      <View style={usageStyles.row}>
        <Text style={usageStyles.label}>{label}</Text>
        <Text style={[usageStyles.value, isNearLimit && usageStyles.valueWarn]}>
          {displayLabel}
        </Text>
      </View>
      <View style={usageStyles.barTrack}>
        <View
          style={[
            usageStyles.barFill,
            { width: `${Math.max(ratio * 100, 2)}%` },
            isNearLimit && usageStyles.barFillWarn,
          ]}
        />
      </View>
    </View>
  );
}

const usageStyles = StyleSheet.create({
  container: { paddingVertical: Spacing.sm, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  value: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.starlight,
  },
  valueWarn: { color: Colors.accent.coral },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.overlay.medium,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Colors.accent.cyan,
  },
  barFillWarn: { backgroundColor: Colors.accent.coral },
});

export default function SettingsScreen() {
  const router = useRouter();
  const { scrollTo } = useLocalSearchParams<{ scrollTo?: string }>();
  const scrollViewRef = useRef<ScrollView>(null);
  const conversationsY = useRef(0);
  const { profile, signOut, updateProfile, deleteAccount, deactivateAccount, updateEmail } = useAuthStore();
  const setLanguage = useAuthStore((s) => s.setLanguage);
  const { t } = useTranslation();
  const { uploadPersonAvatar, interviews, stories, people, relationships, familyGroups, deleteInterview, deleteAllInterviews } = useFamilyStore();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isViewingAvatar, setIsViewingAvatar] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [isExportingMemoryBook, setIsExportingMemoryBook] = useState(false);
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [showSubscriptionInfo, setShowSubscriptionInfo] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const avatarUrl = useSignedUrl(profile?.avatar_url);
  const downgrade = useSubscriptionStore((s) => s.downgrade);

  const handleDeleteInterview = (interview: Interview) => {
    Alert.alert(
      t('settings.deleteConversation'),
      t('settings.deleteConversationConfirm', { title: interview.title || t('settings.untitledConversation') }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'), style: 'destructive',
          onPress: async () => {
            setIsDeletingId(interview.id);
            try {
              await deleteInterview(interview.id);
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message);
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
      t('settings.deleteAllConversations'),
      t('settings.deleteAllConversationsConfirm', { count: interviews.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.deleteAll'), style: 'destructive',
          onPress: async () => {
            setIsDeletingAll(true);
            try {
              await deleteAllInterviews();
            } catch (err: any) {
              Alert.alert(t('common.error'), err.message);
            } finally {
              setIsDeletingAll(false);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(t('settings.signOutConfirmTitle'), t('settings.signOutConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.signOut'), style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const tierLabel = {
    free: t('settings.free'),
    premium: t('settings.premium'),
  }[profile?.subscription_tier || 'free'];

  // Tier limits (mirrors backend)
  const tierLimits = {
    free:    { maxPerMonth: Infinity, maxPerDay: Infinity, maxRecordingMin: 5 },
    premium: { maxPerMonth: 30, maxPerDay: 5,  maxRecordingMin: 30 },
  }[profile?.subscription_tier || 'free'];

  // Count interviews this month and today (only relevant for premium)
  const isPremium = profile?.subscription_tier === 'premium';
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const interviewsThisMonth = isPremium
    ? interviews.filter((i) => new Date(i.created_at) >= monthStart).length
    : 0;
  const interviewsToday = isPremium
    ? interviews.filter((i) => new Date(i.created_at) >= dayStart).length
    : 0;

  const handleChangeEmail = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert(t('settings.changeEmail'), t('settings.changeEmailInvalid'));
      return;
    }
    if (trimmed === profile?.id) return; // same email, no-op

    setIsChangingEmail(true);
    try {
      await updateEmail(trimmed);
      setShowEmailInput(false);
      setNewEmail('');
      Alert.alert(
        t('settings.changeEmailSent'),
        t('settings.changeEmailSentMessage'),
      );
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handleExportData = async () => {
    setIsExportingData(true);
    try {
      const result = await invokeFunction<{
        csvFiles: Record<string, string>;
        fileDownloads: Record<string, string>;
        summary: Record<string, number>;
        exportedAt: string;
      }>('export-my-data', {});

      const { csvFiles, fileDownloads } = result;

      if (Object.keys(csvFiles).length === 0) {
        Alert.alert(t('common.error'), t('settings.noDataToExport'));
        return;
      }

      // Build a single combined text file with all CSV sections
      const sections: string[] = [];
      for (const [filename, content] of Object.entries(csvFiles)) {
        sections.push(`--- ${filename} ---\n${content}`);
      }

      // Append media download links at the end
      if (Object.keys(fileDownloads).length > 0) {
        const manifest = Object.entries(fileDownloads)
          .map(([key, url]) => `${key}\n${url}`)
          .join('\n\n');
        sections.push(`--- media_download_links ---\n${manifest}`);
      }

      const combinedContent = sections.join('\n\n\n');

      // Write to cache and share
      const exportDir = new Directory(Paths.cache, 'matra-export');
      if (exportDir.exists) {
        exportDir.delete();
      }
      exportDir.create({ intermediates: true });

      const timestamp = new Date().toISOString().slice(0, 10);
      const exportFile = new FSFile(exportDir, `matra-export-${timestamp}.csv`);
      exportFile.create();
      exportFile.write(combinedContent);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(exportFile.uri, {
          mimeType: 'text/csv',
          dialogTitle: t('settings.downloadMyData'),
        });
      }

      Alert.alert(t('settings.downloadReady'), t('settings.downloadReadyMessage'));
    } catch (err: any) {
      Alert.alert(t('settings.downloadFailed'), t('settings.downloadFailedMessage'));
    } finally {
      setIsExportingData(false);
    }
  };

  const handleExportMemoryBook = async () => {
    // Allow export for premium users and lapsed users within their export grace window
    const hasExportAccess = profile?.subscription_tier === 'premium' ||
      (downgrade.exportAccessUntil && new Date(downgrade.exportAccessUntil) > new Date());
    if (!hasExportAccess) {
      router.push('/paywall');
      return;
    }

    // First-time readiness check: prompt user to fill in family info
    const activeGroup = familyGroups[0];
    const groupNameFilled = activeGroup && activeGroup.name !== 'My Family' && activeGroup.name.trim().length > 0;
    const biosGenerated = people.filter((p) => p.ai_biography).length;
    const totalPeople = people.length;
    const verifiedRelationships = relationships.filter((r) => r.verified).length;
    const totalRelationships = relationships.length;

    const issues: string[] = [];
    if (!groupNameFilled) issues.push(t('settings.readinessGroupName'));
    if (biosGenerated < totalPeople) issues.push(t('settings.readinessBios', { done: biosGenerated, total: totalPeople }));
    if (totalRelationships > 0 && verifiedRelationships < totalRelationships) {
      issues.push(t('settings.readinessConnections', { done: verifiedRelationships, total: totalRelationships }));
    }

    if (issues.length > 0) {
      const checklist = issues.map((i) => `• ${i}`).join('\n');
      return new Promise<void>((resolve) => {
        Alert.alert(
          t('settings.readinessTitle'),
          `${t('settings.readinessMessage')}\n\n${checklist}`,
          [
            { text: t('settings.readinessGoFix'), style: 'cancel', onPress: () => resolve() },
            {
              text: t('settings.readinessContinue'),
              onPress: () => { resolve(); proceedWithExport(); },
            },
          ],
        );
      });
    }

    await proceedWithExport();
  };

  const proceedWithExport = async () => {
    setIsExportingMemoryBook(true);
    try {
      const result = await invokeFunction<{
        pdf: string;
        filename: string;
        size: number;
      }>('export-memory-book', {});

      // Decode base64 and write PDF to cache
      const binaryString = atob(result.pdf);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const exportDir = new Directory(Paths.cache, 'matra-memory-book');
      if (exportDir.exists) {
        exportDir.delete();
      }
      exportDir.create({ intermediates: true });

      const pdfFile = new FSFile(exportDir, result.filename);
      pdfFile.create();
      pdfFile.write(bytes);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfFile.uri, {
          mimeType: 'application/pdf',
          dialogTitle: t('settings.memoryBookShare'),
        });
      }

      Alert.alert(t('settings.memoryBookReady'), t('settings.memoryBookReadyMessage'));
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg.includes('once per week') || msg.includes('can generate a new memory book on')) {
        Alert.alert(t('settings.memoryBookRateLimited'), msg);
      } else if (msg.includes('No new data')) {
        Alert.alert(t('settings.memoryBookNoNewData'), msg);
      } else {
        Alert.alert(t('common.error'), t('settings.memoryBookError'));
      }
    } finally {
      setIsExportingMemoryBook(false);
    }
  };

  const handlePickAvatar = async () => {
    if (!profile?.self_person_id) {
      Alert.alert(t('settings.noProfileNode'), t('settings.noProfileNodeMessage'));
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('settings.permissionNeeded'), t('settings.photoLibraryPermission'));
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
      const avatarKey = await uploadPersonAvatar(profile.self_person_id, resizedUri);
      await updateProfile({ avatar_url: avatarKey });
    } catch (err: any) {
      Alert.alert(t('settings.uploadFailed'), err.message);
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
    Alert.alert(t('settings.profilePicture'), undefined, [
      { text: t('settings.viewPhoto'), onPress: () => setIsViewingAvatar(true) },
      { text: t('settings.changePhoto'), onPress: handlePickAvatar },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <StarField starCount={20}>
      <BioAlgae strandCount={30} height={0.15} />
      <CornerBush />
      <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('settings.title')}</Text>

        {/* Profile Card */}
        <Card variant="elevated" style={styles.profileCard}>
          <Pressable onPress={handleAvatarPress} style={styles.avatar} disabled={isUploadingAvatar}>
            {isUploadingAvatar ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : avatarUrl ? (
              <Image
                source={{ uri: avatarUrl }}
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
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{profile?.display_name || t('settings.explorer')}</Text>
            <View style={styles.tierBadge}>
              <Text style={styles.tierText}>{tierLabel}</Text>
            </View>
            <Pressable style={styles.profileEmailRow} onPress={() => setShowEmailInput(true)}>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {useAuthStore.getState().user?.email || '—'}
              </Text>
              <Text style={styles.profileEmailEdit}>✏️</Text>
            </Pressable>
          </View>
        </Card>

        {showEmailInput && (
          <Card variant="elevated" style={{ marginBottom: Spacing.md, padding: Spacing.md }}>
            <TextInput
              style={styles.emailInput}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder={t('settings.newEmailPlaceholder')}
              placeholderTextColor={Colors.text.shadow}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
              <Button
                title={t('common.cancel')}
                onPress={() => { setShowEmailInput(false); setNewEmail(''); }}
                variant="ghost"
                size="sm"
                style={{ flex: 1 }}
              />
              <Button
                title={isChangingEmail ? t('settings.changingEmail') : t('settings.confirmChangeEmail')}
                onPress={handleChangeEmail}
                size="sm"
                loading={isChangingEmail}
                disabled={isChangingEmail || !newEmail.trim()}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        )}

        {/* Subscription */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.subscription')}</Text>
          
          {/* Grace period / lapsed banner in settings context */}
          {(downgrade.inGracePeriod || downgrade.isLapsed) && (
            <SubscriptionStatusBanner />
          )}

          <Card variant="default">
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>{t('settings.currentPlan')}</Text>
              <Text style={styles.settingValue}>{tierLabel}</Text>
            </View>

            {profile?.subscription_tier === 'free' && !downgrade.isLapsed && (
              <Button
                title={t('settings.upgradeToPremium')}
                onPress={() => router.push('/paywall')}
                variant="premium"
                size="sm"
                style={{ marginTop: Spacing.sm }}
              />
            )}

            {/* Re-subscribe for lapsed users */}
            {downgrade.isLapsed && (
              <Button
                title={t('home.resubscribe')}
                onPress={() => router.push('/paywall')}
                variant="premium"
                size="sm"
                style={{ marginTop: Spacing.sm }}
              />
            )}
          </Card>
        </View>

        {/* Usage & Limits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.usageLimits')}</Text>
          <Card variant="default">
            {isPremium && (
              <>
                <UsageRow
                  label={t('settings.monthlyConversations')}
                  used={interviewsThisMonth}
                  max={tierLimits.maxPerMonth}
                  suffix={t('settings.thisMonth')}
                />
                <UsageRow
                  label={t('settings.dailyConversations')}
                  used={interviewsToday}
                  max={tierLimits.maxPerDay}
                  suffix={t('settings.today')}
                />
              </>
            )}
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>{t('settings.maxRecordingLength')}</Text>
              <Text style={styles.settingValue}>{tierLimits.maxRecordingMin} min</Text>
            </View>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>{t('settings.totalConversations')}</Text>
              <Text style={styles.settingValue}>
                {profile?.interview_count || 0}
                {profile?.subscription_tier === 'free' ? ' / 2' : ''}
              </Text>
            </View>
          </Card>
        </View>

        {/* Family */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.family')}</Text>
          <Card variant="default">
            <SettingItem label={t('settings.manageFamilyGroups')} onPress={() => router.push('/family-group')} badge={!familyGroups[0] || familyGroups[0].name === 'My Family' || !familyGroups[0].name.trim()} />
            <SettingItem label={t('settings.inviteFamilyMembers')} onPress={() => profile?.subscription_tier === 'free' ? router.push('/paywall') : router.push('/invite-family')} locked={profile?.subscription_tier === 'free'} premium />
            <SettingItem label={isExportingMemoryBook ? t('settings.memoryBookGenerating') : t('settings.exportMemoryBook')} onPress={handleExportMemoryBook} locked={profile?.subscription_tier === 'free' && !downgrade.exportAccessUntil} disabled={isExportingMemoryBook} premium />
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
          <Text style={styles.sectionTitle}>{t('settings.conversations')}</Text>
          <Card variant="default">
            {interviews.length === 0 ? (
              <Text style={styles.emptyText}>{t('settings.noConversations')}</Text>
            ) : (
              <>
                {interviews.map((interview) => (
                  <View key={interview.id} style={styles.conversationRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.conversationTitle} numberOfLines={1}>
                        {interview.title || t('settings.untitledConversation')}
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
                  title={isDeletingAll ? t('settings.deleting') : t('settings.deleteAllConversationsButton')}
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
          <Text style={styles.sectionTitle}>{t('settings.app')}</Text>
          <Card variant="default">
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>{t('settings.language')}</Text>
              <View style={styles.languageSelector}>
                {SUPPORTED_LANGUAGES.map((lang) => {
                  const isActive = getCurrentLanguage() === lang.code;
                  return (
                    <Pressable
                      key={lang.code}
                      style={[styles.languagePill, isActive && styles.languagePillActive]}
                      onPress={() => setLanguage(lang.code as LanguageCode)}
                    >
                      <Text style={[styles.languagePillText, isActive && styles.languagePillTextActive]}>
                        {lang.nativeLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <SettingItem label={t('settings.privacyPolicy')} onPress={() => router.push('/privacy-policy')} />
            <SettingItem label={t('settings.termsOfService')} onPress={() => router.push('/terms-of-service')} />
            <SettingItem label={t('settings.aboutMatra')} onPress={() => router.push('/about')} />
            {(isPremium || downgrade.isLapsed || downgrade.inGracePeriod) && (
              <SettingItem label={t('settings.whatIfICancel')} onPress={() => setShowSubscriptionInfo(true)} />
            )}
          </Card>
        </View>



        {/* Your Data */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.data')}</Text>
          <Card variant="default">
            <Text style={styles.dataExportDesc}>{t('settings.downloadMyDataDesc')}</Text>
            <Button
              title={isExportingData ? t('settings.downloading') : t('settings.downloadMyData')}
              onPress={handleExportData}
              variant="ghost"
              size="sm"
              loading={isExportingData}
              style={{ marginTop: Spacing.sm }}
            />
          </Card>
        </View>

        {/* Sign Out */}
        <View style={styles.section}>
          <Button
            title={t('common.signOut')}
            onPress={handleSignOut}
            variant="ghost"
          />
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.dangerZone')}</Text>
          <View style={styles.dangerZoneCard}>
            <Text style={styles.dangerZoneDesc}>{t('settings.dangerZoneDesc')}</Text>

            <View style={styles.dangerZoneItem}>
              <View style={styles.dangerZoneItemInfo}>
                <Text style={styles.dangerZoneItemTitle}>{t('settings.deactivateAccount')}</Text>
                <Text style={styles.dangerZoneItemDesc}>{t('settings.deactivateAccountDesc')}</Text>
              </View>
              <Button
                title={isDeactivating ? t('settings.deactivating') : t('settings.deactivate')}
                onPress={() => {
                  Alert.alert(
                    t('settings.deactivateAccount'),
                    t('settings.deactivateAccountMessage'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('settings.deactivate'),
                        style: 'destructive',
                        onPress: async () => {
                          setIsDeactivating(true);
                          try {
                            await deactivateAccount();
                          } catch (err: any) {
                            Alert.alert(t('common.error'), err.message);
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
            </View>

            <View style={styles.dangerZoneDivider} />

            <View style={styles.dangerZoneItem}>
              <View style={styles.dangerZoneItemInfo}>
                <Text style={styles.dangerZoneItemTitle}>{t('settings.deleteAccount')}</Text>
                <Text style={styles.dangerZoneItemDesc}>{t('settings.deleteAccountDesc')}</Text>
              </View>
              <Button
                title={isDeletingAccount ? t('settings.deletingAccount') : t('settings.deleteAccount')}
                onPress={() => {
                  Alert.alert(
                    t('settings.deleteAccount'),
                    t('settings.deleteAccountMessage'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('settings.deleteEverything'),
                        style: 'destructive',
                        onPress: () => {
                          Alert.alert(
                            t('settings.absolutelySure'),
                            t('settings.absolutelySureMessage'),
                            [
                              { text: t('common.cancel'), style: 'cancel' },
                              {
                                text: t('settings.yesDeleteAccount'),
                                style: 'destructive',
                                onPress: async () => {
                                  setIsDeletingAccount(true);
                                  try {
                                    await deleteAccount();
                                  } catch (err: any) {
                                    Alert.alert(t('common.error'), err.message);
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
          </View>
        </View>

        <Text style={styles.version}>Matra v1.0.0</Text>
      </ScrollView>
      <AvatarViewer
        visible={isViewingAvatar}
        uri={avatarUrl}
        onClose={() => setIsViewingAvatar(false)}
        name={profile?.display_name}
      />
      <SubscriptionInfoSheet
        visible={showSubscriptionInfo}
        onClose={() => setShowSubscriptionInfo(false)}
      />
    </StarField>
  );
}

function SettingItem({ label, onPress, locked, disabled, premium, badge }: { label: string; onPress: () => void; locked?: boolean; disabled?: boolean; premium?: boolean; badge?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.settingItem, disabled && { opacity: 0.5 }]}>
      <Text style={styles.settingItemLabel}>{label}</Text>
      {badge && <View style={styles.notificationBadge}><Text style={styles.notificationBadgeText}>1</Text></View>}
      {(locked || premium) && <Ionicons name="diamond" size={16} color="#C9A84C" />}
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
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.accent.cyan,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    position: 'relative',
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
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
    fontSize: 36,
    fontFamily: Typography.fonts.heading,
    color: '#FFFFFF',
  },
  profileInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  profileEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  profileEmail: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: 'rgba(120, 180, 130, 0.85)',
    flexShrink: 1,
  },
  profileEmailEdit: {
    fontSize: 12,
  },
  profileName: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
  },
  tierBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(201, 168, 76, 0.12)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  tierText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodySemiBold,
    color: '#C9A84C',
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
  storageBreakdown: {
    paddingLeft: Spacing.sm,
    paddingBottom: Spacing.xs,
    gap: 2,
  },
  storageDetail: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
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
  notificationBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.accent.coral,
    marginLeft: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: Typography.fonts.bodySemiBold,
    lineHeight: 13,
  },
  languageSelector: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  languagePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.overlay.light,
  },
  languagePillActive: {
    backgroundColor: Colors.accent.cyan,
  },
  languagePillText: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.bodyMedium,
    color: Colors.text.moonlight,
  },
  languagePillTextActive: {
    color: '#FFFFFF',
    fontFamily: Typography.fonts.bodySemiBold,
  },
  emptyText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    paddingVertical: Spacing.sm,
  },
  dataExportDesc: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    lineHeight: 18,
  },
  emailInput: {
    borderWidth: 1,
    borderColor: 'rgba(139, 115, 85, 0.20)',
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.starlight,
    backgroundColor: '#FFFFFF',
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
  dangerZoneCard: {
    borderWidth: 1,
    borderColor: 'rgba(196, 102, 90, 0.25)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    backgroundColor: 'rgba(196, 102, 90, 0.05)',
    gap: Spacing.lg,
  },
  dangerZoneDesc: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    lineHeight: 18,
  },
  dangerZoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  dangerZoneItemInfo: {
    flex: 1,
    gap: 2,
  },
  dangerZoneItemTitle: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.text.moonlight,
  },
  dangerZoneItemDesc: {
    fontSize: Typography.sizes.small,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    lineHeight: 16,
  },
  dangerZoneDivider: {
    height: 1,
    backgroundColor: 'rgba(196, 102, 90, 0.15)',
  },
});

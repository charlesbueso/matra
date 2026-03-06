// ============================================================
// MATRA — Accept Family Invitation Screen
// ============================================================
// Shown when user opens a matra://invite/{code} deep link.
// Previews the invitation details and lets them accept.
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StarField, Card, Button, BioAlgae, CornerBush } from '../src/components/ui';
import { useAuthStore } from '../src/stores/authStore';
import { useFamilyStore } from '../src/stores/familyStore';
import { invokeFunction } from '../src/services/supabase';
import { Colors, Typography, Spacing } from '../src/theme/tokens';

interface InvitePreview {
  valid: boolean;
  relationshipType: string;
  inviterName: string;
  inviterAvatar: string | null;
  familyGroupName: string;
}

export default function AcceptInviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const fetchAllFamilyData = useFamilyStore((s) => s.fetchAllFamilyData);

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError(t('invite.invalidCode'));
      setIsLoading(false);
      return;
    }
    loadPreview();
  }, [code]);

  const loadPreview = async () => {
    try {
      setIsLoading(true);
      setError(null);
      // Use GET with query param for preview (no auth required)
      const result = await invokeFunction<InvitePreview>(
        'accept-invitation?code=' + encodeURIComponent(code!),
        undefined,
        'GET'
      );
      setPreview(result);
    } catch (err: any) {
      setError(err.message || t('invite.invalidCode'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!session) {
      // User is not signed in — redirect to auth, preserve invite code
      router.replace(`/(auth)/sign-up?inviteCode=${code}`);
      return;
    }

    setIsAccepting(true);
    try {
      const result = await invokeFunction<{
        familyGroupId: string;
        peopleMerged: number;
        peopleCreated: number;
        relationshipsCreated: number;
        selfPersonId: string;
      }>('accept-invitation', { inviteCode: code });

      // Refresh data
      await fetchProfile();
      await fetchAllFamilyData();

      Alert.alert(
        t('invite.welcomeTitle'),
        t('invite.welcomeMessage', {
          group: preview?.familyGroupName ?? t('invite.family'),
          merged: result.peopleMerged,
          created: result.peopleCreated,
        }),
        [
          {
            text: t('invite.viewTree'),
            onPress: () => router.replace('/(tabs)/tree'),
          },
        ]
      );
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message);
    } finally {
      setIsAccepting(false);
    }
  };

  return (
    <StarField starCount={15}>
      <BioAlgae strandCount={20} height={0.1} />
      <CornerBush />
      <View style={styles.container}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.accent.cyan} size="large" />
            <Text style={styles.loadingText}>{t('common.loading')}</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorIcon}>❌</Text>
            <Text style={styles.errorTitle}>{t('invite.invalidInvitation')}</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            <Button
              title={t('common.goBack')}
              onPress={() => router.replace('/(tabs)/home')}
              variant="ghost"
              style={{ marginTop: Spacing.lg }}
            />
          </View>
        ) : preview ? (
          <View style={styles.center}>
            <Text style={styles.emoji}>🌳</Text>
            <Text style={styles.inviteTitle}>{t('invite.youreInvited')}</Text>
            <Card variant="elevated" style={styles.previewCard}>
              <Text style={styles.inviterName}>
                {t('invite.invitedBy', { name: preview.inviterName })}
              </Text>
              <Text style={styles.groupName}>{preview.familyGroupName}</Text>
              <View style={styles.relBadge}>
                <Text style={styles.relBadgeText}>
                  {t('invite.asRelationship', {
                    type: t(`relationships.${preview.relationshipType}`),
                  })}
                </Text>
              </View>
            </Card>

            <Text style={styles.explanationText}>
              {t('invite.acceptExplanation')}
            </Text>

            <Button
              title={isAccepting ? t('invite.accepting') : (session ? t('invite.acceptInvitation') : t('invite.signUpToAccept'))}
              onPress={handleAccept}
              variant="primary"
              size="lg"
              loading={isAccepting}
              style={{ marginTop: Spacing.lg, width: '100%' }}
            />

            <Button
              title={t('invite.decline')}
              onPress={() => router.replace('/(tabs)/home')}
              variant="ghost"
              style={{ marginTop: Spacing.sm }}
            />
          </View>
        ) : null}
      </View>
    </StarField>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
  },
  loadingText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    marginTop: Spacing.md,
  },
  emoji: {
    fontSize: 64,
    marginBottom: Spacing.lg,
  },
  inviteTitle: {
    fontSize: Typography.sizes.h2,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  previewCard: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  inviterName: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
  },
  groupName: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
  },
  relBadge: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: 20,
    backgroundColor: Colors.accent.cyan + '20',
    marginTop: Spacing.sm,
  },
  relBadgeText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.bodySemiBold,
    color: Colors.accent.cyan,
  },
  explanationText: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    textAlign: 'center',
    marginTop: Spacing.lg,
    lineHeight: 22,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  errorTitle: {
    fontSize: Typography.sizes.h3,
    fontFamily: Typography.fonts.heading,
    color: Colors.text.starlight,
    marginBottom: Spacing.sm,
  },
  errorMessage: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    textAlign: 'center',
  },
});

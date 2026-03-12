// ============================================================
// Matra — Terms of Service
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StarField, BioAlgae, CornerBush } from '../src/components/ui';
import { Colors, Typography, Spacing } from '../src/theme/tokens';

export default function TermsOfServiceScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <StarField starCount={15}>
      <BioAlgae strandCount={20} height={0.1} />
      <CornerBush />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={Colors.text.starlight} />
        </Pressable>

        <Text style={styles.title}>{t('termsOfServicePage.title')}</Text>
        <Text style={styles.updated}>{t('termsOfServicePage.updated')}</Text>

        <Section title={t('termsOfServicePage.s1Title')}>{t('termsOfServicePage.s1Body')}</Section>
        <Section title={t('termsOfServicePage.s2Title')}>{t('termsOfServicePage.s2Body')}</Section>
        <Section title={t('termsOfServicePage.s3Title')}>{t('termsOfServicePage.s3Body')}</Section>
        <Section title={t('termsOfServicePage.s4Title')}>{t('termsOfServicePage.s4Body')}</Section>
        <Section title={t('termsOfServicePage.s5Title')}>{t('termsOfServicePage.s5Body')}</Section>
        <Section title={t('termsOfServicePage.s6Title')}>{t('termsOfServicePage.s6Body')}</Section>
        <Section title={t('termsOfServicePage.s7Title')}>{t('termsOfServicePage.s7Body')}</Section>
        <Section title={t('termsOfServicePage.s8Title')}>{t('termsOfServicePage.s8Body')}</Section>
        <Section title={t('termsOfServicePage.s9Title')}>{t('termsOfServicePage.s9Body')}</Section>
        <Section title={t('termsOfServicePage.s10Title')}>{t('termsOfServicePage.s10Body')}</Section>
        <Section title={t('termsOfServicePage.s11Title')}>{t('termsOfServicePage.s11Body')}</Section>
        <Section title={t('termsOfServicePage.s12Title')}>{t('termsOfServicePage.s12Body')}</Section>

        <View style={{ height: 40 }} />
      </ScrollView>
    </StarField>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  updated: {
    fontSize: Typography.sizes.caption,
    fontFamily: Typography.fonts.body,
    color: Colors.text.twilight,
    marginBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.sizes.h4,
    fontFamily: Typography.fonts.subheading,
    color: Colors.text.starlight,
    marginBottom: Spacing.sm,
  },
  sectionBody: {
    fontSize: Typography.sizes.body,
    fontFamily: Typography.fonts.body,
    color: Colors.text.moonlight,
    lineHeight: 22,
  },
});

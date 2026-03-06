// ============================================================
// MATRA — Terms of Service
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StarField, BioAlgae, CornerBush } from '../src/components/ui';
import { Colors, Typography, Spacing } from '../src/theme/tokens';

export default function TermsOfServiceScreen() {
  const router = useRouter();

  return (
    <StarField starCount={15}>
      <BioAlgae strandCount={20} height={0.1} />
      <CornerBush />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={Colors.text.starlight} />
        </Pressable>

        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.updated}>Last updated: March 5, 2026</Text>

        <Section title="1. Acceptance">
          {`By downloading, installing, or using MATRA ("the App"), you agree to these Terms of Service. If you do not agree, please do not use the App.`}
        </Section>

        <Section title="2. What MATRA Does">
          {`MATRA is a personal family storytelling app. You record conversations, and our AI helps transcribe, organize, and preserve your family's stories and relationships. The App is provided "as is" for personal, non-commercial use.`}
        </Section>

        <Section title="3. Your Account">
          {`• You are responsible for keeping your account credentials secure.
• You must provide accurate information when creating your account.
• You may delete your account at any time from the Settings screen, which will permanently remove all your data.`}
        </Section>

        <Section title="4. Your Content">
          {`You own all content you create in MATRA — your recordings, your stories, your family data. By using the App, you grant MATRA a limited license to process your content solely for the purpose of providing the service (e.g., AI transcription and analysis). We do not claim ownership of your content.`}
        </Section>

        <Section title="5. Acceptable Use">
          {`You agree not to:

• Use the App for any unlawful purpose.
• Upload content that infringes on others' rights.
• Attempt to reverse-engineer, compromise, or interfere with the App's systems.
• Use the App to harass, harm, or impersonate others.`}
        </Section>

        <Section title="6. Subscriptions & Payments">
          {`• MATRA offers free and paid subscription tiers.
• Paid subscriptions are billed through the Apple App Store or Google Play Store. Billing, renewals, and cancellations are governed by the respective store's policies.
• We reserve the right to change pricing with reasonable notice.`}
        </Section>

        <Section title="7. AI-Generated Content">
          {`MATRA uses AI to generate transcriptions, summaries, biographies, and other content based on your recordings. AI-generated content may contain errors or inaccuracies. You are responsible for reviewing and verifying any AI-generated content before relying on it.`}
        </Section>

        <Section title="8. Limitation of Liability">
          {`MATRA is provided "as is" without warranties of any kind. To the maximum extent permitted by law, MATRA shall not be liable for any indirect, incidental, or consequential damages arising from your use of the App, including loss of data. Our total liability shall not exceed the amount you paid for the App in the 12 months preceding the claim.`}
        </Section>

        <Section title="9. Termination">
          {`We may suspend or terminate your access to the App if you violate these terms. You may stop using the App at any time. Upon termination, your right to use the App ceases, but sections regarding your content ownership, limitation of liability, and dispute resolution survive.`}
        </Section>

        <Section title="10. Changes">
          {`We may update these terms from time to time. Continued use of MATRA after changes constitutes acceptance. We will notify you of significant changes through the App.`}
        </Section>

        <Section title="11. Contact">
          {`For questions about these terms, contact us at:

voxcentra@gmail.com`}
        </Section>

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

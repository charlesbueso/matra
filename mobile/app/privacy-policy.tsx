// ============================================================
// MATRA — Privacy Policy
// ============================================================

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StarField, BioAlgae, CornerBush } from '../src/components/ui';
import { Colors, Typography, Spacing, BorderRadius } from '../src/theme/tokens';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <StarField starCount={15}>
      <BioAlgae strandCount={20} height={0.1} />
      <CornerBush />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={Colors.text.starlight} />
        </Pressable>

        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: March 5, 2026</Text>

        <Section title="1. What We Collect">
          {`When you use MATRA, we collect:

• Account information: your email address and display name.
• Audio recordings: conversations you choose to record within the app.
• Family data: names, relationships, stories, and biographical details you provide.
• Usage data: basic analytics such as app opens and feature usage to improve the experience.

We do not collect location data, contacts, or any data from other apps on your device.`}
        </Section>

        <Section title="2. How We Use Your Data">
          {`Your data is used solely to provide and improve the MATRA experience:

• Audio recordings are sent to our AI processing service to generate transcriptions, extract family information, and create story summaries.
• Family data is stored securely in your private account and is never sold, shared with advertisers, or used for marketing.
• Usage analytics help us fix bugs and improve the app.`}
        </Section>

        <Section title="3. AI Processing">
          {`MATRA uses third-party AI services (such as OpenAI and Anthropic) to transcribe and analyze your recorded conversations. Your audio and transcriptions are sent to these services for processing. We do not allow these providers to use your data for training their models. Processed results are stored in your private account.`}
        </Section>

        <Section title="4. Data Storage & Security">
          {`• Your data is stored on secure, encrypted servers powered by Supabase.
• Audio files are stored in private cloud storage buckets accessible only to your account.
• We use industry-standard encryption in transit (TLS) and at rest.
• We do not store your password in plain text.`}
        </Section>

        <Section title="5. Data Sharing">
          {`We do not sell your personal data. We share data only:

• With AI service providers, solely for processing your recordings (as described above).
• If required by law, such as in response to a valid legal request.
• With your explicit consent, such as when you choose to share your family tree with invited family members.`}
        </Section>

        <Section title="6. Your Rights">
          {`You have full control over your data:

• Export: You can export your family data at any time.
• Delete: You can delete individual conversations, or delete your entire account and all associated data from the Settings screen.
• Deactivate: You can deactivate your account to hide your data without permanently deleting it.`}
        </Section>

        <Section title="7. Children's Privacy">
          {`MATRA is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us personal information, please contact us so we can delete it.`}
        </Section>

        <Section title="8. Changes to This Policy">
          {`We may update this policy from time to time. If we make significant changes, we will notify you through the app. Continued use of MATRA after changes constitutes acceptance of the updated policy.`}
        </Section>

        <Section title="9. Contact">
          {`If you have questions about this privacy policy or your data, please contact us at:

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

// ============================================================
// Matra — Privacy Policy
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
        <Text style={styles.updated}>Last updated: March 10, 2026</Text>

        <Section title="1. What We Collect">
          {`When you use Matra, we collect:

• Account information: your email address and display name.
• Audio recordings: conversations you choose to record within the app.
• Family data: names, relationships, stories, and biographical details you provide.
• Usage and analytics data: app opens, feature usage, screen views, and performance metrics to improve the experience and fix issues.
• Subscription data: purchase history and entitlement status managed through RevenueCat.
• Crash and error reports: diagnostic data collected through Sentry to identify and resolve bugs.

We do not collect location data, contacts, or any data from other apps on your device.`}
        </Section>

        <Section title="2. How We Use Your Data">
          {`Your data is used solely to provide and improve the Matra experience:

• Audio recordings are sent to our AI processing service to generate transcriptions, extract family information, and create story summaries.
• Family data is stored securely in your private account and is never sold, shared with advertisers, or used for marketing.
• Usage analytics help us fix bugs and improve the app.`}
        </Section>

        <Section title="3. AI Processing">
          {`Matra uses third-party AI services (such as OpenAI and Groq) to transcribe and analyze your recorded conversations. Your audio and transcriptions are sent to these services for processing. We do not allow these providers to use your data for training their models. Processed results are stored in your private account.`}
        </Section>

        <Section title="4. Analytics, Monitoring & Subscriptions">
          {`Matra uses the following third-party services to operate and improve the app:

• PostHog (analytics): Collects anonymous usage data such as screen views, feature usage, and interaction patterns. This data helps us understand how the app is used and prioritize improvements. No personal family content is sent to PostHog.
• Sentry (error monitoring): Collects crash reports and diagnostic data when errors occur. This may include device type, OS version, and stack traces. No personal family content is included in error reports.
• RevenueCat (subscription management): Manages in-app purchases and subscription status. RevenueCat receives your anonymous user ID and purchase receipts from the Apple App Store or Google Play Store. It does not have access to your family data or recordings.

These services process data in accordance with their own privacy policies and are contractually prohibited from using your data for their own purposes.`}
        </Section>

        <Section title="5. Data Storage & Security">
          {`• Your data is stored on secure, encrypted servers powered by Supabase.
• Audio files are stored in private cloud storage buckets accessible only to your account.
• We use industry-standard encryption in transit (TLS) and at rest.
• We do not store your password in plain text.`}
        </Section>

        <Section title="6. Data Sharing">
          {`We do not sell your personal data. We share data only:

• With AI service providers, solely for processing your recordings (as described above).
• With analytics and monitoring providers (PostHog, Sentry) for app improvement and bug fixing.
• With RevenueCat for managing your subscription and purchase history.
• If required by law, such as in response to a valid legal request.
• With your explicit consent, such as when you choose to share your family tree with invited family members.`}
        </Section>

        <Section title="7. Your Rights">
          {`You have full control over your data:

• Export: You can export your family data at any time.
• Delete: You can delete individual conversations, or delete your entire account and all associated data from the Settings screen.
• Deactivate: You can deactivate your account to hide your data without permanently deleting it.`}
        </Section>

        <Section title="8. Children's Privacy">
          {`Matra is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided us personal information, please contact us so we can delete it.`}
        </Section>

        <Section title="9. Changes to This Policy">
          {`We may update this policy from time to time. If we make significant changes, we will notify you through the app. Continued use of Matra after changes constitutes acceptance of the updated policy.`}
        </Section>

        <Section title="10. Contact">
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

// ============================================================
// Matra — Tab Layout
// ============================================================

import React from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography } from '../../src/theme/tokens';
import { useNotificationStore } from '../../src/stores/notificationStore';
import { useSubscriptionStore } from '../../src/stores/subscriptionStore';
import { useFamilyStore } from '../../src/stores/familyStore';
import { useTranslation } from 'react-i18next';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 8);
  const { t } = useTranslation();
  const unreadLineage = useNotificationStore((s) => s.unreadLineageCount);
  const unreadStories = useNotificationStore((s) => s.unreadStoryCount);
  const isPremium = useSubscriptionStore((s) => s.tier) === 'premium';
  const familyGroups = useFamilyStore((s) => s.familyGroups);
  const needsFamilySetup = !familyGroups[0] || familyGroups[0].name === 'My Family' || !familyGroups[0].name.trim();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.tabBar, { height: 57 + bottomPadding, paddingBottom: bottomPadding }],
        tabBarActiveTintColor: Colors.accent.cyan,
        tabBarInactiveTintColor: Colors.text.twilight,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="water-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="tree"
        options={{
          title: t('tabs.lineage'),
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="git-network-outline" size={size} color={color} />
              {unreadLineage > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadLineage > 99 ? '99+' : unreadLineage}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: t('tabs.record'),
          tabBarLabel: () => null,
          tabBarIcon: ({ size }) => (
            <View style={[styles.recordButton, isPremium && styles.recordButtonPremium]}>
              <Ionicons name="mic" size={size + 4} color="#FFFFFF" />
              <Text style={styles.recordLabel}>{t('tabs.record')}</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="stories"
        options={{
          title: t('tabs.stories'),
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="book-outline" size={size} color={color} />
              {unreadStories > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadStories > 99 ? '99+' : unreadStories}</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="settings-outline" size={size} color={color} />
              {needsFamilySetup && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>1</Text>
                </View>
              )}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: 'rgba(139, 115, 85, 0.10)',
    borderTopWidth: 1,
    paddingTop: 8,
    shadowColor: '#8B7355',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  tabLabel: {
    fontFamily: Typography.fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  recordButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent.cyan,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#349113',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  recordButtonPremium: {
    backgroundColor: Colors.accent.amber,
    shadowColor: Colors.accent.amber,
    shadowOpacity: 0.45,
  },
  recordLabel: {
    color: '#FFFFFF',
    fontSize: 9,
    fontFamily: Typography.fonts.bodyMedium,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#E53935',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: Typography.fonts.bodySemiBold,
    lineHeight: 14,
  },
});

// ============================================================
// MATRA — Notification Store (Zustand)
// ============================================================
// Tracks unread counts for stories and lineage (people/relationships)
// changes, and provides local push notification helpers.
//
// Local notifications degrade gracefully in Expo Go — full
// support requires a development build.
// ============================================================

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

// Lazy-load expo-notifications to avoid the side-effect push-token
// registration that crashes in Expo Go.
let Notifications: typeof import('expo-notifications') | null = null;

async function getNotifications() {
  if (!Notifications) {
    try {
      Notifications = await import('expo-notifications');
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    } catch {
      // expo-notifications unavailable (e.g. web)
    }
  }
  return Notifications;
}

function getNumber(key: string): number {
  const val = SecureStore.getItem(key);
  return val ? parseInt(val, 10) || 0 : 0;
}

function setNumber(key: string, value: number) {
  SecureStore.setItem(key, String(value));
}

interface NotificationState {
  unreadStoryCount: number;
  unreadLineageCount: number;

  /** Record current counts as "seen" baseline */
  markStoriesRead: () => void;
  markLineageRead: () => void;

  /** Call after fetchAllFamilyData to compute new unread counts */
  updateUnreadCounts: (storyCount: number, peopleCount: number, relationshipCount?: number) => void;

  /** Send a local push notification */
  sendLocalNotification: (title: string, body: string) => Promise<void>;

  /** Request notification permissions (call once at app start) */
  requestPermissions: () => Promise<void>;

  /** Schedule local push notifications for subscription grace period */
  scheduleGracePeriodReminders: (gracePeriodEndsAt: string) => Promise<void>;

  /** Cancel any scheduled grace period notifications */
  cancelGracePeriodReminders: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  unreadStoryCount: 0,
  unreadLineageCount: 0,

  markStoriesRead: () => {
    const currentTotal = getNumber('lastStoryTotal');
    setNumber('seenStoryCount', currentTotal);
    set({ unreadStoryCount: 0 });
  },

  markLineageRead: () => {
    const currentPeopleTotal = getNumber('lastPeopleTotal');
    const currentRelTotal = getNumber('lastRelTotal');
    setNumber('seenPeopleCount', currentPeopleTotal);
    setNumber('seenRelCount', currentRelTotal);
    set({ unreadLineageCount: 0 });
  },

  updateUnreadCounts: (storyCount: number, peopleCount: number, relationshipCount: number = 0) => {
    const seenStories = getNumber('seenStoryCount');
    const seenPeople = getNumber('seenPeopleCount');
    const seenRels = getNumber('seenRelCount');

    setNumber('lastStoryTotal', storyCount);
    setNumber('lastPeopleTotal', peopleCount);
    setNumber('lastRelTotal', relationshipCount);

    const newPeople = Math.max(0, peopleCount - seenPeople);
    const newRels = Math.max(0, relationshipCount - seenRels);

    set({
      unreadStoryCount: Math.max(0, storyCount - seenStories),
      unreadLineageCount: newPeople + newRels,
    });
  },

  sendLocalNotification: async (title: string, body: string) => {
    try {
      const notif = await getNotifications();
      if (!notif) return;
      await notif.scheduleNotificationAsync({
        content: { title, body, sound: 'default' },
        trigger: null, // fire immediately
      });
    } catch {
      // Notifications not available (Expo Go / web) — silent no-op
    }
  },

  requestPermissions: async () => {
    try {
      const notif = await getNotifications();
      if (!notif) return;
      const { status } = await notif.getPermissionsAsync();
      if (status !== 'granted') {
        await notif.requestPermissionsAsync();
      }
    } catch {
      // Notifications not available — silent no-op
    }
  },

  scheduleGracePeriodReminders: async (gracePeriodEndsAt: string) => {
    try {
      const notif = await getNotifications();
      if (!notif) return;

      // Don't re-schedule if already scheduled
      const alreadyScheduled = SecureStore.getItem('gracePeriodNotisScheduled');
      if (alreadyScheduled === gracePeriodEndsAt) return;

      // Cancel any existing grace period notifications first
      await get().cancelGracePeriodReminders();

      const endDate = new Date(gracePeriodEndsAt);
      const now = Date.now();

      // Schedule reminders at key intervals
      const reminders = [
        { daysBeforeEnd: 5, title: '5 days left on your MATRA access', body: 'Your full premium access ends soon. Renew to keep all features.' },
        { daysBeforeEnd: 3, title: '3 days left on your MATRA access', body: 'Your grace period is almost over. Your memories are safe — renew to keep creating.' },
        { daysBeforeEnd: 1, title: 'Last day of full access', body: 'Your premium access ends tomorrow. Renew now to avoid interruption.' },
        { daysBeforeEnd: 0, title: 'Your premium access has ended', body: 'Your memories are safe and readable. You can export your data for 30 more days.' },
      ];

      for (const reminder of reminders) {
        const triggerDate = new Date(endDate.getTime() - reminder.daysBeforeEnd * 24 * 60 * 60 * 1000);
        if (triggerDate.getTime() <= now) continue; // Skip past notifications

        await notif.scheduleNotificationAsync({
          content: {
            title: reminder.title,
            body: reminder.body,
            sound: 'default',
          },
          trigger: { type: notif.SchedulableTriggerInputTypes.DATE, date: triggerDate },
          identifier: `grace-period-${reminder.daysBeforeEnd}`,
        });
      }

      SecureStore.setItem('gracePeriodNotisScheduled', gracePeriodEndsAt);
    } catch {
      // Notifications not available — silent no-op
    }
  },

  cancelGracePeriodReminders: async () => {
    try {
      const notif = await getNotifications();
      if (!notif) return;
      const ids = ['grace-period-5', 'grace-period-3', 'grace-period-1', 'grace-period-0'];
      for (const id of ids) {
        await notif.cancelScheduledNotificationAsync(id);
      }
      SecureStore.deleteItemAsync('gracePeriodNotisScheduled');
    } catch {
      // Notifications not available — silent no-op
    }
  },
}));

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
import i18next from 'i18next';

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

  /** Schedule tapering inactivity nudges (7d, 14d, 21d — then stop) */
  scheduleInactivityNudges: () => Promise<void>;

  /** Send a milestone notification (first story, people, stories) */
  sendMilestoneNotification: (milestone: 'firstStory' | 'fifteenPeople' | 'twentyFivePeople' | 'tenStories' | 'twentyStories') => Promise<void>;
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
        { daysBeforeEnd: 5, titleKey: 'notifications.grace5Title', bodyKey: 'notifications.grace5Body' },
        { daysBeforeEnd: 3, titleKey: 'notifications.grace3Title', bodyKey: 'notifications.grace3Body' },
        { daysBeforeEnd: 1, titleKey: 'notifications.grace1Title', bodyKey: 'notifications.grace1Body' },
        { daysBeforeEnd: 0, titleKey: 'notifications.grace0Title', bodyKey: 'notifications.grace0Body' },
      ];

      for (const reminder of reminders) {
        const triggerDate = new Date(endDate.getTime() - reminder.daysBeforeEnd * 24 * 60 * 60 * 1000);
        if (triggerDate.getTime() <= now) continue; // Skip past notifications

        await notif.scheduleNotificationAsync({
          content: {
            title: i18next.t(reminder.titleKey),
            body: i18next.t(reminder.bodyKey),
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

  scheduleInactivityNudges: async () => {
    try {
      const notif = await getNotifications();
      if (!notif) return;

      // Cancel any previously scheduled inactivity nudges
      const nudgeIds = ['inactivity-7d', 'inactivity-14d', 'inactivity-21d'];
      for (const id of nudgeIds) {
        await notif.cancelScheduledNotificationAsync(id);
      }

      const DAY = 24 * 60 * 60;

      // Tapering schedule: 7 days, 14 days, 21 days — then silence
      const nudges = [
        { id: 'inactivity-7d', seconds: 7 * DAY, titleKey: 'notifications.nudge7dTitle', bodyKey: 'notifications.nudge7dBody' },
        { id: 'inactivity-14d', seconds: 14 * DAY, titleKey: 'notifications.nudge14dTitle', bodyKey: 'notifications.nudge14dBody' },
        { id: 'inactivity-21d', seconds: 21 * DAY, titleKey: 'notifications.nudge21dTitle', bodyKey: 'notifications.nudge21dBody' },
      ];

      for (const nudge of nudges) {
        await notif.scheduleNotificationAsync({
          content: {
            title: i18next.t(nudge.titleKey),
            body: i18next.t(nudge.bodyKey),
            sound: 'default',
            data: { route: '/(tabs)/record' },
          },
          trigger: {
            type: notif.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: nudge.seconds,
          },
          identifier: nudge.id,
        });
      }
    } catch {
      // Notifications not available — silent no-op
    }
  },

  sendMilestoneNotification: async (milestone) => {
    const alreadySent = SecureStore.getItem(`milestone-${milestone}`);
    if (alreadySent) return;

    const titles: Record<string, string> = {
      firstStory: i18next.t('notifications.milestoneFirstStoryTitle'),
      fifteenPeople: i18next.t('notifications.milestoneFifteenPeopleTitle'),
      twentyFivePeople: i18next.t('notifications.milestoneTwentyFivePeopleTitle'),
      tenStories: i18next.t('notifications.milestoneTenStoriesTitle'),
      twentyStories: i18next.t('notifications.milestoneTwentyStoriesTitle'),
    };
    const bodies: Record<string, string> = {
      firstStory: i18next.t('notifications.milestoneFirstStoryBody'),
      fifteenPeople: i18next.t('notifications.milestoneFifteenPeopleBody'),
      twentyFivePeople: i18next.t('notifications.milestoneTwentyFivePeopleBody'),
      tenStories: i18next.t('notifications.milestoneTenStoriesBody'),
      twentyStories: i18next.t('notifications.milestoneTwentyStoriesBody'),
    };

    await get().sendLocalNotification(titles[milestone], bodies[milestone]);
    SecureStore.setItem(`milestone-${milestone}`, '1');
  },
}));

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
  updateUnreadCounts: (storyCount: number, peopleCount: number) => void;

  /** Send a local push notification */
  sendLocalNotification: (title: string, body: string) => Promise<void>;

  /** Request notification permissions (call once at app start) */
  requestPermissions: () => Promise<void>;
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
    const currentTotal = getNumber('lastPeopleTotal');
    setNumber('seenPeopleCount', currentTotal);
    set({ unreadLineageCount: 0 });
  },

  updateUnreadCounts: (storyCount: number, peopleCount: number) => {
    const seenStories = getNumber('seenStoryCount');
    const seenPeople = getNumber('seenPeopleCount');

    setNumber('lastStoryTotal', storyCount);
    setNumber('lastPeopleTotal', peopleCount);

    set({
      unreadStoryCount: Math.max(0, storyCount - seenStories),
      unreadLineageCount: Math.max(0, peopleCount - seenPeople),
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
}));

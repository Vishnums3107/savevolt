/**
 * NotificationHelper bridges NotificationService with the app's energy data. It decides which
 * alerts the current data warrants and makes sure each one is sent at most once per period, so
 * frequent dashboard recalculations never spam the user.
 *
 * Safe to call where native push isn't configured: errors are logged, never thrown.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { Appliance, AppSettings, DashboardData, Streak } from '../../types';
import NotificationService, { NotificationType } from '../NotificationService';
import { householdStorageKey } from '../../store/householdStorage';

export interface NotificationPayload {
  /** Stable id per alert kind; re-sending replaces the previous notification of that kind. */
  id: string;
  /** Unique per alert kind and period; an alert with an already-sent key is skipped. */
  dedupeKey: string;
  title: string;
  message: string;
  type: 'energy_alert' | 'goal_reminder' | 'achievement' | 'daily_tip' | 'streak';
}

export const HIGH_ENERGY_THRESHOLD_KWH = 300;
export const HIGH_COST_THRESHOLD = 50;

const SENT_LOG_KEY = '@energy_app_notification_log';
const MAX_LOG_ENTRIES = 60;

// Fixed numeric ids (Android requires integer ids). Reminder ids start far above these.
const NOTIFICATION_IDS = {
  highEnergy: '101',
  streak: '102',
  inactiveAppliances: '103',
  highCost: '104',
} as const;

/**
 * Evaluate whether any notification-worthy conditions exist
 * and return a list of notification payloads.
 */
export const evaluateNotifications = (
  appliances: Appliance[],
  dashboard: DashboardData | null,
  streak: Streak,
  settings: AppSettings,
  now: Date = new Date(),
): NotificationPayload[] => {
  if (!settings.notificationsEnabled) return [];

  const day = format(now, 'yyyy-MM-dd');
  const notifications: NotificationPayload[] = [];

  // High energy consumption alert — at most once a day
  if (dashboard && dashboard.totalEnergyConsumed > HIGH_ENERGY_THRESHOLD_KWH) {
    notifications.push({
      id: NOTIFICATION_IDS.highEnergy,
      dedupeKey: `high-energy:${day}`,
      title: '⚡ High Energy Usage',
      message: `Your monthly consumption is ${dashboard.totalEnergyConsumed.toFixed(1)} kWh. Consider reviewing your top consumers.`,
      type: 'energy_alert',
    });
  }

  // Streak encouragement — once per weekly milestone
  if (streak.currentStreak >= 7 && streak.currentStreak % 7 === 0) {
    notifications.push({
      id: NOTIFICATION_IDS.streak,
      dedupeKey: `streak:${streak.currentStreak}:${streak.lastActivityDate}`,
      title: '🔥 Streak Milestone!',
      message: `Amazing! You've maintained a ${streak.currentStreak}-day energy tracking streak!`,
      type: 'streak',
    });
  }

  // Paused appliances reminder — at most once a day
  const inactiveCount = appliances.filter((a) => !a.isActive).length;
  if (inactiveCount > 0 && appliances.length > 3) {
    notifications.push({
      id: NOTIFICATION_IDS.inactiveAppliances,
      dedupeKey: `inactive:${day}`,
      title: '📋 Appliance Check',
      message: `You have ${inactiveCount} paused ${inactiveCount === 1 ? 'appliance' : 'appliances'}. Review your audit to keep data accurate.`,
      type: 'daily_tip',
    });
  }

  // Cost alert — at most once a day
  if (dashboard && dashboard.totalCost > HIGH_COST_THRESHOLD) {
    notifications.push({
      id: NOTIFICATION_IDS.highCost,
      dedupeKey: `high-cost:${day}`,
      title: '💰 Monthly Cost Alert',
      message: `Your projected monthly cost is ${settings.currency}${dashboard.totalCost.toFixed(2)}. Check your AI recommendations for savings.`,
      type: 'energy_alert',
    });
  }

  return notifications;
};

/** Returns the payloads whose dedupe key has not been sent yet. */
export const selectUnsentNotifications = (
  payloads: NotificationPayload[],
  sentKeys: string[],
): NotificationPayload[] => {
  const sent = new Set(sentKeys);
  return payloads.filter((payload) => !sent.has(payload.dedupeKey));
};

export const toServiceType = (type: NotificationPayload['type']): NotificationType => {
  switch (type) {
    case 'energy_alert':
      return 'energy';
    case 'goal_reminder':
      return 'goal';
    case 'daily_tip':
      return 'tip';
    case 'achievement':
    case 'streak':
    default:
      return 'achievement';
  }
};

const readSentLog = async (householdId: string): Promise<string[]> => {
  try {
    const raw = await AsyncStorage.getItem(householdStorageKey(SENT_LOG_KEY, householdId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === 'string') : [];
  } catch {
    return [];
  }
};

let dispatchQueue: Promise<void> = Promise.resolve();

/**
 * Evaluate the current energy data and show any alerts not already sent in their period.
 * Calls are serialized so overlapping dashboard updates cannot send the same alert twice.
 */
export const dispatchEnergyNotifications = (
  appliances: Appliance[],
  dashboard: DashboardData | null,
  streak: Streak,
  settings: AppSettings,
  householdId = 'default',
): Promise<void> => {
  dispatchQueue = dispatchQueue.then(async () => {
    try {
      const payloads = evaluateNotifications(appliances, dashboard, streak, settings);
      if (payloads.length === 0 || !NotificationService.isEnabled()) return;

      const sentKeys = await readSentLog(householdId);
      const unsent = selectUnsentNotifications(payloads, sentKeys);
      if (unsent.length === 0) return;

      for (const payload of unsent) {
        await NotificationService.sendLocalNotification({
          id: payload.id,
          title: payload.title,
          message: payload.message,
          type: toServiceType(payload.type),
          priority: payload.type === 'energy_alert' ? 'high' : 'normal',
        });
      }

      const updatedLog = [...sentKeys, ...unsent.map((payload) => payload.dedupeKey)].slice(-MAX_LOG_ENTRIES);
      await AsyncStorage.setItem(householdStorageKey(SENT_LOG_KEY, householdId), JSON.stringify(updatedLog));
    } catch (error) {
      console.warn('Energy notifications could not be sent.', error);
    }
  });
  return dispatchQueue;
};

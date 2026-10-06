/**
 * Turns saved reminders into weekly repeating local notifications.
 *
 * Each active reminder gets one notification per selected weekday. Ids are derived from the
 * reminder id and weekday, and every id scheduled is recorded, so a sync can cancel exactly what
 * it scheduled before (including reminders that were since edited or deleted).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Reminder } from '../../types';
import NotificationService from '../NotificationService';
import { hashString } from '../../utils/hash';

const SCHEDULED_IDS_KEY = '@energy_app_scheduled_reminder_ids';
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type ReminderSyncStatus = 'scheduled' | 'disabled' | 'exact-alarm-denied';

export interface ReminderSyncResult {
  status: ReminderSyncStatus;
  scheduled: number;
}

export interface ScheduledReminder {
  notificationId: string;
  reminderId: string;
  day: number;
  title: string;
  message: string;
  date: Date;
}

/**
 * Stable numeric notification id for a reminder on a weekday (0 = Sunday). Always well above
 * the fixed alert ids and below Android's 32-bit limit.
 */
export const reminderNotificationId = (reminderId: string, day: number): string =>
  String((1000 + (hashString(reminderId) % 100_000_000)) * 8 + day);

/**
 * The next moment after `from` that falls on `day` (0 = Sunday) at `time` ("HH:MM", local).
 * Returns null for an invalid time or day.
 */
export const getNextOccurrence = (time: string, day: number, from: Date): Date | null => {
  const match = TIME_PATTERN.exec(time);
  if (!match || !Number.isInteger(day) || day < 0 || day > 6) return null;

  const next = new Date(from);
  next.setHours(Number(match[1]), Number(match[2]), 0, 0);
  const daysAhead = (day - from.getDay() + 7) % 7;
  next.setDate(next.getDate() + daysAhead);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 7);
  }
  return next;
};

/** Every notification the given reminders should have, starting after `from`. */
export const buildReminderSchedule = (reminders: Reminder[], from: Date): ScheduledReminder[] =>
  reminders
    .filter((reminder) => reminder.isActive)
    .flatMap((reminder) =>
      [...new Set(reminder.days)].flatMap((day) => {
        const date = getNextOccurrence(reminder.time, day, from);
        return date
          ? [{
              notificationId: reminderNotificationId(reminder.id, day),
              reminderId: reminder.id,
              day,
              title: `⏰ ${reminder.title}`,
              message: reminder.message,
              date,
            }]
          : [];
      }),
    );

const readScheduledIds = async (): Promise<string[]> => {
  try {
    const raw = await AsyncStorage.getItem(SCHEDULED_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

let syncQueue: Promise<ReminderSyncResult> = Promise.resolve({ status: 'disabled', scheduled: 0 });

/**
 * Cancel previously scheduled reminder notifications and schedule the current set. Calls are
 * serialized so rapid edits cannot interleave cancels and schedules.
 */
export const syncReminderNotifications = (
  reminders: Reminder[],
  enabled: boolean,
  now: Date = new Date(),
): Promise<ReminderSyncResult> => {
  syncQueue = syncQueue
    .catch(() => ({ status: 'disabled' as const, scheduled: 0 }))
    .then(async () => {
      const previousIds = await readScheduledIds();
      previousIds.forEach((id) => NotificationService.cancelNotification(id));

      let result: ReminderSyncResult;
      const scheduledIds: string[] = [];

      if (!enabled) {
        result = { status: 'disabled', scheduled: 0 };
      } else if (!(await NotificationService.canScheduleExactAlarms())) {
        result = { status: 'exact-alarm-denied', scheduled: 0 };
      } else {
        for (const item of buildReminderSchedule(reminders, now)) {
          const scheduled = await NotificationService.scheduleNotification(
            {
              id: item.notificationId,
              title: item.title,
              message: item.message,
              type: 'reminder',
              priority: 'high',
              data: { reminderId: item.reminderId },
            },
            item.date,
            { repeatType: 'week' },
          );
          if (scheduled) scheduledIds.push(item.notificationId);
        }
        result = { status: 'scheduled', scheduled: scheduledIds.length };
      }

      try {
        await AsyncStorage.setItem(SCHEDULED_IDS_KEY, JSON.stringify(scheduledIds));
      } catch (error) {
        console.warn('Could not record scheduled reminders.', error);
      }
      return result;
    });
  return syncQueue;
};

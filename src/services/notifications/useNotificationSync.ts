import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { useEnergy } from '../../context/EnergyContext';
import { useEnergyStore } from '../../store/energyStore';
import NotificationService from '../NotificationService';
import { dispatchEnergyNotifications } from './NotificationHelper';
import { ReminderSyncStatus, syncReminderNotifications } from './reminderScheduler';

/** Delay before evaluating alerts so a burst of dashboard updates is evaluated once. */
const ALERT_DEBOUNCE_MS = 1500;

interface NotificationStatusState {
  /** Result of the most recent reminder sync; null until the first sync finishes. */
  reminderStatus: ReminderSyncStatus | null;
  scheduledReminders: number;
}

/** Read-only status for screens (e.g. Reminders explains when exact alarms are blocked). */
export const useNotificationStatus = create<NotificationStatusState>(() => ({
  reminderStatus: null,
  scheduledReminders: 0,
}));

const runReminderSync = async () => {
  const { reminders, settings } = useEnergyStore.getState();
  await NotificationService.initialize();
  const result = await syncReminderNotifications(reminders, settings.notificationsEnabled);
  useNotificationStatus.setState({
    reminderStatus: result.status,
    scheduledReminders: result.scheduled,
  });
};

/**
 * Keeps device notifications in step with app data. Mount once, inside the providers.
 *  - mirrors the Notifications setting and asks for OS permission when it is on
 *  - schedules reminders whenever they or the setting change, and again when the app returns
 *    to the foreground (the user may have granted exact-alarm access in system settings)
 *  - sends energy alerts (deduplicated per day) and announces newly earned badges
 */
export const useNotificationSync = () => {
  const { isLoading, reminders, dashboardData, streak, badges, appliances, settings, activeHouseholdId } = useEnergy(
    'isLoading',
    'reminders',
    'dashboardData',
    'streak',
    'badges',
    'appliances',
    'settings',
    'activeHouseholdId',
  );
  const enabled = settings.notificationsEnabled;

  // Setting + permission
  useEffect(() => {
    if (isLoading) return;
    NotificationService.setEnabled(enabled);
    if (enabled) {
      NotificationService.initialize()
        .then(() => NotificationService.ensurePermission())
        .catch((error) => console.warn('Notification setup failed.', error));
    }
  }, [isLoading, enabled]);

  // Reminder schedule
  useEffect(() => {
    if (isLoading) return;
    runReminderSync().catch((error) => console.warn('Reminder sync failed.', error));
  }, [isLoading, reminders, enabled]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !useEnergyStore.getState().isLoading) {
        runReminderSync().catch((error) => console.warn('Reminder sync failed.', error));
      }
    });
    return () => subscription.remove();
  }, []);

  // Energy alerts
  useEffect(() => {
    if (isLoading || !enabled || !dashboardData) return;
    const timeout = setTimeout(() => {
      NotificationService.initialize()
        .then(() => {
          if (useEnergyStore.getState().activeHouseholdId !== activeHouseholdId) return;
          return dispatchEnergyNotifications(appliances, dashboardData, streak, settings, activeHouseholdId);
        })
        .catch((error) => console.warn('Energy alerts failed.', error));
    }, ALERT_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [isLoading, enabled, dashboardData, appliances, streak, settings, activeHouseholdId]);

  // Newly earned badges (badges already earned at startup are not announced)
  const earnedRef = useRef<Set<string> | null>(null);
  const badgeHouseholdRef = useRef(activeHouseholdId);
  useEffect(() => {
    if (isLoading) return;
    if (badgeHouseholdRef.current !== activeHouseholdId) {
      earnedRef.current = null;
      badgeHouseholdRef.current = activeHouseholdId;
    }
    const earned = new Set(badges.filter((badge) => badge.isEarned).map((badge) => badge.id));
    const previous = earnedRef.current;
    earnedRef.current = earned;
    if (!previous || !enabled) return;

    badges
      .filter((badge) => badge.isEarned && !previous.has(badge.id))
      .forEach((badge) => {
        NotificationService.sendLocalNotification({
          id: `badge-${badge.id}`,
          title: `${badge.icon} Badge earned: ${badge.name}`,
          message: badge.description,
          type: 'achievement',
          priority: 'normal',
        }).catch((error) => console.warn('Badge notification failed.', error));
      });
  }, [isLoading, badges, enabled, activeHouseholdId]);
};

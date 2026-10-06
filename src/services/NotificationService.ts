/**
 * Push Notification Service
 * Handles local notifications (alerts, achievements, scheduled reminders) and, when Firebase is
 * configured for the build, remote push via Firebase Cloud Messaging.
 *
 * Every entry point is safe to call when native push is unavailable: failures are logged and
 * never thrown into UI code.
 */

import messaging from '@react-native-firebase/messaging';
import PushNotification, { Importance } from 'react-native-push-notification';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { hashString } from '../utils/hash';

export interface NotificationPreferences {
  enabled: boolean;
  energyAlerts: boolean;
  goalReminders: boolean;
  communityUpdates: boolean;
  challengeNotifications: boolean;
  achievementAlerts: boolean;
  dailyTips: boolean;
  weeklyReports: boolean;
  quietHoursStart?: string; // "22:00"
  quietHoursEnd?: string; // "08:00"
}

export type NotificationType =
  | 'energy'
  | 'goal'
  | 'achievement'
  | 'community'
  | 'challenge'
  | 'tip'
  | 'alert'
  | 'reminder';

export interface CustomNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  priority: 'high' | 'normal' | 'low';
  data?: any;
  scheduledTime?: Date;
}

export interface ScheduleOptions {
  /** Repeat the notification at the same time every day or week. */
  repeatType?: 'day' | 'week';
}

/** Native helper registered by the Android app (android/app/.../ExactAlarmModule.kt). */
interface ExactAlarmNativeModule {
  canScheduleExactAlarms(): Promise<boolean>;
  openExactAlarmSettings(): Promise<boolean>;
}

const PREFERENCES_KEY = 'notification_preferences';
const FCM_TOKEN_KEY = 'fcm_token';
const MAX_NATIVE_ID = 2147483647; // Android parses notification ids as a signed 32-bit int

/**
 * Converts any id to the numeric string Android requires. Numeric ids pass through; other
 * strings hash to a stable positive integer so the same id always maps to the same notification.
 */
export const toNativeNotificationId = (id: string): string => {
  if (/^\d+$/.test(id) && Number(id) > 0 && Number(id) <= MAX_NATIVE_ID) {
    return id;
  }
  return String((hashString(id) % (MAX_NATIVE_ID - 1)) + 1);
};

class NotificationService {
  private static instance: NotificationService;
  private initPromise: Promise<void> | null = null;
  private remoteMessagingReady = false;
  private enabled = true;
  private fcmToken: string | null = null;
  private preferences: NotificationPreferences = {
    enabled: true,
    energyAlerts: true,
    goalReminders: true,
    communityUpdates: true,
    challengeNotifications: true,
    achievementAlerts: true,
    dailyTips: true,
    weeklyReports: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
  };

  private constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Configure local notifications and load stored preferences. Safe to call repeatedly; the work
   * runs once and later calls wait for the same result.
   */
  public initialize(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        try {
          this.configurePushNotifications();
        } catch (error) {
          console.warn('Local notifications are unavailable on this build.', error);
        }
        await this.loadPreferences();
      })();
    }
    return this.initPromise;
  }

  /**
   * Mirrors the in-app "Notifications" setting. When disabled, no alert is shown; scheduled
   * reminders are cancelled by the reminder scheduler.
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled && this.preferences.enabled;
  }

  /**
   * Ask the OS for permission to show notifications (Android 13+ and iOS). Returns whether
   * notifications can be shown. Never throws.
   */
  public async ensurePermission(): Promise<boolean> {
    try {
      let granted = true;
      if (Platform.OS === 'android') {
        if (Number(Platform.Version) >= 33) {
          const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
          granted = await PermissionsAndroid.check(permission);
          if (!granted) {
            const result = await PermissionsAndroid.request(permission);
            granted = result === PermissionsAndroid.RESULTS.GRANTED;
          }
        }
      } else {
        await PushNotification.requestPermissions();
      }

      if (granted) {
        await this.setupRemoteMessaging();
      }
      return granted;
    } catch (error) {
      console.warn('Notification permission request failed.', error);
      return false;
    }
  }

  /**
   * Whether time-based reminders can be scheduled. Android 12+ requires the exact-alarm
   * permission; scheduling without it throws inside the native push library.
   */
  public async canScheduleExactAlarms(): Promise<boolean> {
    if (Platform.OS !== 'android' || Number(Platform.Version) < 31) {
      return true;
    }
    const alarmModule: ExactAlarmNativeModule | undefined = NativeModules.SaveVoltAlarms;
    if (!alarmModule) {
      return false;
    }
    try {
      return await alarmModule.canScheduleExactAlarms();
    } catch {
      return false;
    }
  }

  /** Opens the Android "Alarms & reminders" settings page for SaveVolt. Returns false elsewhere. */
  public async openExactAlarmSettings(): Promise<boolean> {
    const alarmModule: ExactAlarmNativeModule | undefined = NativeModules.SaveVoltAlarms;
    if (Platform.OS !== 'android' || !alarmModule) {
      return false;
    }
    try {
      return await alarmModule.openExactAlarmSettings();
    } catch {
      return false;
    }
  }

  /**
   * Remote push via Firebase. Only works when the build includes a Firebase configuration;
   * otherwise it is skipped quietly and local notifications keep working.
   */
  private async setupRemoteMessaging(): Promise<void> {
    if (this.remoteMessagingReady) {
      return;
    }
    this.remoteMessagingReady = true;
    try {
      const authStatus = await messaging().requestPermission();
      const authorized =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      if (!authorized) {
        return;
      }

      this.fcmToken = await messaging().getToken();
      await this.saveFCMToken(this.fcmToken);

      messaging().onTokenRefresh(async (token) => {
        this.fcmToken = token;
        await this.saveFCMToken(token);
      });
      messaging().onMessage(async (remoteMessage) => {
        await this.handleRemoteNotification(remoteMessage);
      });
      messaging().setBackgroundMessageHandler(async (remoteMessage) => {
        await this.handleRemoteNotification(remoteMessage);
      });
    } catch (error) {
      console.warn('Firebase messaging is not configured; remote push is disabled.', error);
    }
  }

  /**
   * Configure local push notifications
   */
  private configurePushNotifications(): void {
    PushNotification.configure({
      onNotification: (notification: any) => {
        notification.finish?.(PushNotification.FetchResult.NoData);
      },
      permissions: {
        alert: true,
        badge: true,
        sound: true,
      },
      popInitialNotification: true,
      // Permission is requested from ensurePermission() once the user has notifications enabled
      requestPermissions: false,
    });

    this.createNotificationChannels();
  }

  /**
   * Create notification channels for Android
   */
  private createNotificationChannels(): void {
    const channels = [
      {
        channelId: 'energy-alerts',
        channelName: 'Energy Alerts',
        channelDescription: 'High energy consumption alerts',
        importance: Importance.HIGH,
      },
      {
        channelId: 'reminders',
        channelName: 'Reminders',
        channelDescription: 'Your scheduled energy-saving reminders',
        importance: Importance.HIGH,
      },
      {
        channelId: 'goal-reminders',
        channelName: 'Goal Reminders',
        channelDescription: 'Energy saving goal reminders',
        importance: Importance.DEFAULT,
      },
      {
        channelId: 'achievements',
        channelName: 'Achievements',
        channelDescription: 'Achievement unlocked notifications',
        importance: Importance.HIGH,
      },
      {
        channelId: 'community',
        channelName: 'Community Updates',
        channelDescription: 'Community goal and challenge updates',
        importance: Importance.DEFAULT,
      },
      {
        channelId: 'daily-tips',
        channelName: 'Daily Tips',
        channelDescription: 'Daily energy saving tips',
        importance: Importance.LOW,
      },
    ];

    channels.forEach((channel) => {
      PushNotification.createChannel(
        {
          channelId: channel.channelId,
          channelName: channel.channelName,
          channelDescription: channel.channelDescription,
          importance: channel.importance,
          vibrate: true,
        },
        () => {},
      );
    });
  }

  /**
   * Show a notification now. Skipped when notifications are off, during quiet hours, or when
   * the user has muted this type.
   */
  public async sendLocalNotification(notification: CustomNotification): Promise<void> {
    if (!this.isEnabled() || this.isQuietHours() || !this.isNotificationTypeEnabled(notification.type)) {
      return;
    }

    try {
      PushNotification.localNotification({
        id: toNativeNotificationId(notification.id),
        channelId: this.getChannelId(notification.type),
        title: notification.title,
        message: notification.message,
        priority: notification.priority,
        vibrate: true,
        playSound: true,
        userInfo: notification.data,
        smallIcon: 'ic_launcher',
        largeIcon: 'ic_launcher',
      });
    } catch (error) {
      console.warn('Failed to show notification.', error);
    }
  }

  /**
   * Schedule a notification for later. Returns whether it was scheduled. The caller decides
   * whether scheduling is wanted; this only checks that the device allows it.
   */
  public async scheduleNotification(
    notification: CustomNotification,
    date: Date,
    options: ScheduleOptions = {},
  ): Promise<boolean> {
    if (!this.preferences.enabled || !(await this.canScheduleExactAlarms())) {
      return false;
    }

    try {
      PushNotification.localNotificationSchedule({
        id: toNativeNotificationId(notification.id),
        channelId: this.getChannelId(notification.type),
        title: notification.title,
        message: notification.message,
        date,
        allowWhileIdle: true,
        repeatType: options.repeatType,
        priority: notification.priority,
        vibrate: true,
        playSound: true,
        userInfo: notification.data,
        smallIcon: 'ic_launcher',
      });
      return true;
    } catch (error) {
      console.warn('Failed to schedule notification.', error);
      return false;
    }
  }

  /**
   * Send energy spike alert
   */
  public async sendEnergySpikeAlert(consumption: number, threshold: number): Promise<void> {
    await this.sendLocalNotification({
      id: `energy-spike-${Date.now()}`,
      title: '⚡ High Energy Usage Detected!',
      message: `Your energy consumption (${consumption.toFixed(1)} kWh) exceeded ${threshold.toFixed(1)} kWh threshold.`,
      type: 'energy',
      priority: 'high',
      data: { consumption, threshold },
    });
  }

  /**
   * Send goal achievement notification
   */
  public async sendGoalAchievement(goalName: string, savings: number): Promise<void> {
    await this.sendLocalNotification({
      id: `goal-achieved-${Date.now()}`,
      title: '🎉 Goal Achieved!',
      message: `Congratulations! You completed "${goalName}" and saved ${savings.toFixed(1)} kWh!`,
      type: 'achievement',
      priority: 'high',
      data: { goalName, savings },
    });
  }

  /**
   * Send community update
   */
  public async sendCommunityUpdate(message: string): Promise<void> {
    await this.sendLocalNotification({
      id: `community-${Date.now()}`,
      title: '🤝 Community Update',
      message,
      type: 'community',
      priority: 'normal',
    });
  }

  /**
   * Send daily tip notification
   */
  public async sendDailyTip(tip: string): Promise<void> {
    await this.sendLocalNotification({
      id: `daily-tip-${Date.now()}`,
      title: '💡 Daily Energy Tip',
      message: tip,
      type: 'tip',
      priority: 'low',
    });
  }

  /**
   * Send challenge reminder
   */
  public async sendChallengeReminder(challengeName: string, daysLeft: number): Promise<void> {
    await this.sendLocalNotification({
      id: `challenge-reminder-${Date.now()}`,
      title: '🎯 Challenge Reminder',
      message: `${challengeName} ends in ${daysLeft} day${daysLeft > 1 ? 's' : ''}!`,
      type: 'challenge',
      priority: 'normal',
      data: { challengeName, daysLeft },
    });
  }

  /**
   * Send weekly report
   */
  public async sendWeeklyReport(totalSavings: number, treesEquivalent: number): Promise<void> {
    await this.sendLocalNotification({
      id: `weekly-report-${Date.now()}`,
      title: '📊 Weekly Energy Report',
      message: `You saved ${totalSavings.toFixed(1)} kWh this week! That's ${treesEquivalent} tree${treesEquivalent > 1 ? 's' : ''} planted! 🌳`,
      type: 'goal',
      priority: 'normal',
      data: { totalSavings, treesEquivalent },
    });
  }

  /**
   * Handle remote notification from FCM
   */
  private async handleRemoteNotification(remoteMessage: any): Promise<void> {
    if (remoteMessage.notification) {
      await this.sendLocalNotification({
        id: remoteMessage.messageId || `remote-${Date.now()}`,
        title: remoteMessage.notification.title || 'SaveVolt',
        message: remoteMessage.notification.body || '',
        type: remoteMessage.data?.type || 'energy',
        priority: 'normal',
        data: remoteMessage.data,
      });
    }
  }

  /**
   * Get notification preferences
   */
  public getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  /**
   * Update notification preferences
   */
  public async updatePreferences(
    preferences: Partial<NotificationPreferences>
  ): Promise<void> {
    this.preferences = { ...this.preferences, ...preferences };
    try {
      await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(this.preferences));
    } catch (error) {
      console.warn('Failed to save notification preferences:', error);
    }
  }

  /**
   * Load preferences from storage
   */
  private async loadPreferences(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(PREFERENCES_KEY);
      if (stored) {
        this.preferences = { ...this.preferences, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Failed to load notification preferences:', error);
    }
  }

  /**
   * Check if currently in quiet hours
   */
  private isQuietHours(): boolean {
    if (!this.preferences.quietHoursStart || !this.preferences.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMinute] = this.preferences.quietHoursStart.split(':').map(Number);
    const [endHour, endMinute] = this.preferences.quietHoursEnd.split(':').map(Number);

    const startTime = startHour * 60 + startMinute;
    const endTime = endHour * 60 + endMinute;

    if (startTime < endTime) {
      return currentTime >= startTime && currentTime < endTime;
    }
    // Quiet hours span midnight
    return currentTime >= startTime || currentTime < endTime;
  }

  /**
   * Check if notification type is enabled
   */
  private isNotificationTypeEnabled(type: NotificationType): boolean {
    const mapping: Partial<Record<NotificationType, keyof NotificationPreferences>> = {
      energy: 'energyAlerts',
      alert: 'energyAlerts',
      goal: 'goalReminders',
      reminder: 'goalReminders',
      achievement: 'achievementAlerts',
      community: 'communityUpdates',
      challenge: 'challengeNotifications',
      tip: 'dailyTips',
    };

    const prefKey = mapping[type];
    return prefKey ? Boolean(this.preferences[prefKey]) : true;
  }

  /**
   * Get channel ID for notification type
   */
  private getChannelId(type: NotificationType): string {
    const mapping: Record<NotificationType, string> = {
      energy: 'energy-alerts',
      alert: 'energy-alerts',
      reminder: 'reminders',
      goal: 'goal-reminders',
      achievement: 'achievements',
      community: 'community',
      challenge: 'community',
      tip: 'daily-tips',
    };

    return mapping[type] || 'energy-alerts';
  }

  /**
   * Store the FCM token locally. A backend would receive it here to send targeted pushes.
   */
  private async saveFCMToken(token: string): Promise<void> {
    try {
      await AsyncStorage.setItem(FCM_TOKEN_KEY, token);
    } catch (error) {
      console.warn('Failed to save FCM token:', error);
    }
  }

  /**
   * Get FCM token
   */
  public getFCMToken(): string | null {
    return this.fcmToken;
  }

  /**
   * Cancel a scheduled or delivered notification
   */
  public cancelNotification(id: string): void {
    try {
      PushNotification.cancelLocalNotification(toNativeNotificationId(id));
    } catch (error) {
      console.warn('Failed to cancel notification.', error);
    }
  }

  /**
   * Cancel all notifications
   */
  public cancelAllNotifications(): void {
    try {
      PushNotification.cancelAllLocalNotifications();
    } catch (error) {
      console.warn('Failed to cancel notifications.', error);
    }
  }

  /**
   * Get delivered notifications
   */
  public async getDeliveredNotifications(): Promise<any[]> {
    return new Promise((resolve) => {
      PushNotification.getDeliveredNotifications((notifications: any[]) => {
        resolve(notifications);
      });
    });
  }
}

export default NotificationService.getInstance();

import AsyncStorage from '@react-native-async-storage/async-storage';
import PushNotification from 'react-native-push-notification';
import { NativeModules, Platform } from 'react-native';
import NotificationService, { toNativeNotificationId } from '../src/services/NotificationService';
import {
  dispatchEnergyNotifications,
  evaluateNotifications,
  HIGH_COST_THRESHOLD,
  HIGH_ENERGY_THRESHOLD_KWH,
  NotificationPayload,
  selectUnsentNotifications,
  toServiceType,
} from '../src/services/notifications/NotificationHelper';
import {
  buildReminderSchedule,
  getNextOccurrence,
  reminderNotificationId,
  syncReminderNotifications,
} from '../src/services/notifications/reminderScheduler';
import {
  Appliance,
  ApplianceCategory,
  AppSettings,
  DashboardData,
  Reminder,
  Streak,
} from '../src/types';

const MAX_NATIVE_ID = 2147483647;

// Wednesday 14 January 2026, 10:00 local time (no DST change nearby)
const NOW = new Date(2026, 0, 14, 10, 0, 0, 0);
const DAY_KEY = '2026-01-14';

const settings: AppSettings = {
  electricityRate: 0.12,
  currency: '$',
  co2Factor: 0.92,
  notificationsEnabled: true,
  weatherLocation: 'New York',
  darkMode: false,
  voiceEnabled: false,
};

const noStreak: Streak = { currentStreak: 0, longestStreak: 0, lastActivityDate: '', totalDaysActive: 0 };

const makeAppliance = (id: string, isActive = true): Appliance => ({
  id,
  name: `Appliance ${id}`,
  powerRating: 100,
  hoursPerDay: 2,
  quantity: 1,
  category: ApplianceCategory.OTHER,
  createdAt: '2026-01-01T00:00:00.000Z',
  isActive,
});

const makeDashboard = (totalEnergyConsumed: number, totalCost: number): DashboardData => ({
  totalEnergyConsumed,
  totalCost,
  totalCO2Saved: 0,
  treesEquivalent: 0,
  topConsumers: [],
  consumptionByCategory: [],
});

const makeReminder = (overrides: Partial<Reminder> = {}): Reminder => ({
  id: 'reminder-1',
  title: 'Turn off the AC',
  message: 'Switch the bedroom AC off before leaving.',
  time: '18:30',
  days: [1, 3],
  isActive: true,
  ...overrides,
});

const push = PushNotification as unknown as {
  localNotification: jest.Mock;
  localNotificationSchedule: jest.Mock;
  cancelLocalNotification: jest.Mock;
};

const scheduledCalls = () =>
  push.localNotificationSchedule.mock.calls.map(([options]) => options as {
    id: string;
    date: Date;
    repeatType?: string;
    title: string;
  });

const cancelledIds = () => push.cancelLocalNotification.mock.calls.map(([id]) => id as string);

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('NotificationHelper.evaluateNotifications', () => {
  it('returns nothing when notifications are disabled', () => {
    const payloads = evaluateNotifications(
      [makeAppliance('a'), makeAppliance('b', false), makeAppliance('c'), makeAppliance('d')],
      makeDashboard(900, 200),
      { ...noStreak, currentStreak: 14, lastActivityDate: DAY_KEY },
      { ...settings, notificationsEnabled: false },
      NOW,
    );
    expect(payloads).toEqual([]);
  });

  it('returns nothing below every threshold', () => {
    const payloads = evaluateNotifications(
      [makeAppliance('a', false)],
      makeDashboard(HIGH_ENERGY_THRESHOLD_KWH, HIGH_COST_THRESHOLD),
      { ...noStreak, currentStreak: 6 },
      settings,
      NOW,
    );
    expect(payloads).toEqual([]);
  });

  it('returns nothing without dashboard data', () => {
    expect(evaluateNotifications([], null, noStreak, settings, NOW)).toEqual([]);
  });

  it('alerts on high energy only above the threshold, once per day', () => {
    const at = evaluateNotifications([], makeDashboard(HIGH_ENERGY_THRESHOLD_KWH, 0), noStreak, settings, NOW);
    expect(at).toEqual([]);

    const above = evaluateNotifications([], makeDashboard(HIGH_ENERGY_THRESHOLD_KWH + 0.1, 0), noStreak, settings, NOW);
    expect(above).toHaveLength(1);
    expect(above[0]).toMatchObject({
      id: '101',
      dedupeKey: `high-energy:${DAY_KEY}`,
      type: 'energy_alert',
    });
    expect(above[0].message).toContain('300.1 kWh');
  });

  it('alerts on high cost only above the threshold and uses the currency', () => {
    expect(evaluateNotifications([], makeDashboard(0, HIGH_COST_THRESHOLD), noStreak, settings, NOW)).toEqual([]);

    const payloads = evaluateNotifications(
      [],
      makeDashboard(0, 72.5),
      noStreak,
      { ...settings, currency: '€' },
      NOW,
    );
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({ id: '104', dedupeKey: `high-cost:${DAY_KEY}`, type: 'energy_alert' });
    expect(payloads[0].message).toContain('€72.50');
  });

  it('celebrates streaks only on weekly milestones, keyed by streak and activity date', () => {
    const streakAt = (currentStreak: number) =>
      evaluateNotifications([], null, { ...noStreak, currentStreak, lastActivityDate: DAY_KEY }, settings, NOW);

    expect(streakAt(0)).toEqual([]);
    expect(streakAt(6)).toEqual([]);
    expect(streakAt(8)).toEqual([]);
    expect(streakAt(7)).toEqual([
      expect.objectContaining({ id: '102', dedupeKey: `streak:7:${DAY_KEY}`, type: 'streak' }),
    ]);
    expect(streakAt(14)[0].dedupeKey).toBe(`streak:14:${DAY_KEY}`);
  });

  it('reminds about paused appliances only with more than three appliances', () => {
    const three = [makeAppliance('a'), makeAppliance('b', false), makeAppliance('c')];
    expect(evaluateNotifications(three, null, noStreak, settings, NOW)).toEqual([]);

    const allActive = [makeAppliance('a'), makeAppliance('b'), makeAppliance('c'), makeAppliance('d')];
    expect(evaluateNotifications(allActive, null, noStreak, settings, NOW)).toEqual([]);

    const onePaused = [...three, makeAppliance('d')];
    const single = evaluateNotifications(onePaused, null, noStreak, settings, NOW);
    expect(single).toEqual([
      expect.objectContaining({ id: '103', dedupeKey: `inactive:${DAY_KEY}`, type: 'daily_tip' }),
    ]);
    expect(single[0].message).toContain('1 paused appliance.');

    const twoPaused = [...onePaused, makeAppliance('e', false)];
    expect(evaluateNotifications(twoPaused, null, noStreak, settings, NOW)[0].message).toContain('2 paused appliances');
  });

  it('uses a new dedupe key on a new day', () => {
    const dashboard = makeDashboard(450, 80);
    const today = evaluateNotifications([], dashboard, noStreak, settings, NOW);
    const tomorrow = evaluateNotifications([], dashboard, noStreak, settings, new Date(2026, 0, 15, 9, 0));

    expect(today.map((p) => p.dedupeKey)).toEqual([`high-energy:${DAY_KEY}`, `high-cost:${DAY_KEY}`]);
    expect(tomorrow.map((p) => p.dedupeKey)).toEqual(['high-energy:2026-01-15', 'high-cost:2026-01-15']);
    // Same alert kind keeps the same notification id so it replaces the previous one
    expect(tomorrow.map((p) => p.id)).toEqual(today.map((p) => p.id));
  });
});

describe('NotificationHelper.selectUnsentNotifications', () => {
  const payload = (dedupeKey: string): NotificationPayload => ({
    id: '101',
    dedupeKey,
    title: 't',
    message: 'm',
    type: 'energy_alert',
  });

  it('drops payloads whose dedupe key was already sent', () => {
    const payloads = [payload('high-energy:2026-01-14'), payload('high-cost:2026-01-14')];
    expect(selectUnsentNotifications(payloads, ['high-energy:2026-01-14'])).toEqual([payloads[1]]);
  });

  it('keeps everything when nothing was sent and nothing when all were sent', () => {
    const payloads = [payload('a'), payload('b')];
    expect(selectUnsentNotifications(payloads, [])).toEqual(payloads);
    expect(selectUnsentNotifications(payloads, ['b', 'a', 'c'])).toEqual([]);
  });
});

describe('NotificationHelper.toServiceType', () => {
  it.each([
    ['energy_alert', 'energy'],
    ['goal_reminder', 'goal'],
    ['daily_tip', 'tip'],
    ['achievement', 'achievement'],
    ['streak', 'achievement'],
  ] as const)('maps %s to %s', (type, expected) => {
    expect(toServiceType(type)).toBe(expected);
  });
});

describe('NotificationHelper.dispatchEnergyNotifications', () => {
  beforeEach(() => {
    // Fix the clock at midday (outside quiet hours) without faking timers or microtasks
    jest.useFakeTimers({
      now: new Date(2026, 0, 14, 12, 0, 0, 0),
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends each alert once per period even when dispatched repeatedly', async () => {
    const dashboard = makeDashboard(450, 80);
    await Promise.all([
      dispatchEnergyNotifications([], dashboard, noStreak, settings),
      dispatchEnergyNotifications([], dashboard, noStreak, settings),
    ]);
    await dispatchEnergyNotifications([], dashboard, noStreak, settings);

    expect(push.localNotification).toHaveBeenCalledTimes(2);
    expect(push.localNotification.mock.calls.map(([options]) => options.id)).toEqual(['101', '104']);
    expect(push.localNotification.mock.calls[0][0].channelId).toBe('energy-alerts');
  });

  it('sends nothing when the setting is off', async () => {
    await dispatchEnergyNotifications([], makeDashboard(450, 80), noStreak, {
      ...settings,
      notificationsEnabled: false,
    });
    expect(push.localNotification).not.toHaveBeenCalled();
  });
});

describe('NotificationService.toNativeNotificationId', () => {
  it('passes positive 32-bit numeric ids through unchanged', () => {
    expect(toNativeNotificationId('101')).toBe('101');
    expect(toNativeNotificationId('1')).toBe('1');
    expect(toNativeNotificationId(String(MAX_NATIVE_ID))).toBe(String(MAX_NATIVE_ID));
  });

  it.each(['badge-badge-1', 'energy-spike-1700000000000', '0', '2147483648', '99999999999', ''])(
    'maps %p to a stable numeric id within the Android range',
    (id) => {
      const nativeId = toNativeNotificationId(id);
      expect(nativeId).toMatch(/^\d+$/);
      expect(Number(nativeId)).toBeGreaterThanOrEqual(1);
      expect(Number(nativeId)).toBeLessThanOrEqual(MAX_NATIVE_ID);
      expect(toNativeNotificationId(id)).toBe(nativeId);
    },
  );

  it('maps different non-numeric ids to different numeric ids', () => {
    const ids = ['badge-badge-1', 'badge-badge-2', 'community-1', 'daily-tip-1'].map(toNativeNotificationId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('reminderScheduler.reminderNotificationId', () => {
  it('is stable for the same reminder and day', () => {
    expect(reminderNotificationId('reminder-1', 3)).toBe(reminderNotificationId('reminder-1', 3));
  });

  it('is distinct per weekday and per reminder', () => {
    const ids = [0, 1, 2, 3, 4, 5, 6].map((day) => reminderNotificationId('reminder-1', day));
    expect(new Set(ids).size).toBe(7);
    expect(reminderNotificationId('reminder-2', 3)).not.toBe(reminderNotificationId('reminder-1', 3));
  });

  it('stays numeric, above the fixed alert ids and within the Android range', () => {
    for (const reminderId of ['reminder-1', 'reminder-1700000000000', 'x']) {
      for (let day = 0; day < 7; day += 1) {
        const id = reminderNotificationId(reminderId, day);
        expect(id).toMatch(/^\d+$/);
        expect(Number(id)).toBeGreaterThan(1000);
        expect(Number(id)).toBeLessThanOrEqual(MAX_NATIVE_ID);
        // Numeric ids reach the native layer unchanged
        expect(toNativeNotificationId(id)).toBe(id);
      }
    }
  });
});

describe('reminderScheduler.getNextOccurrence', () => {
  // NOW is a Wednesday (day 3) at 10:00
  it('returns later the same day when the time is still ahead', () => {
    expect(getNextOccurrence('18:30', 3, NOW)).toEqual(new Date(2026, 0, 14, 18, 30, 0, 0));
  });

  it('rolls over to next week when the time already passed today', () => {
    expect(getNextOccurrence('08:00', 3, NOW)).toEqual(new Date(2026, 0, 21, 8, 0, 0, 0));
  });

  it('rolls over to next week when the time is exactly now', () => {
    expect(getNextOccurrence('10:00', 3, NOW)).toEqual(new Date(2026, 0, 21, 10, 0, 0, 0));
  });

  it('finds the next matching weekday', () => {
    expect(getNextOccurrence('07:15', 5, NOW)).toEqual(new Date(2026, 0, 16, 7, 15, 0, 0)); // Friday
    expect(getNextOccurrence('07:15', 1, NOW)).toEqual(new Date(2026, 0, 19, 7, 15, 0, 0)); // Monday
    expect(getNextOccurrence('00:00', 0, NOW)).toEqual(new Date(2026, 0, 18, 0, 0, 0, 0)); // Sunday
  });

  it('does not modify the start date', () => {
    const from = new Date(NOW);
    getNextOccurrence('18:30', 5, from);
    expect(from).toEqual(NOW);
  });

  it.each(['24:00', '7:00', '12:60', 'noon', ''])('returns null for invalid time %p', (time) => {
    expect(getNextOccurrence(time, 3, NOW)).toBeNull();
  });

  it.each([-1, 7, 1.5])('returns null for invalid day %p', (day) => {
    expect(getNextOccurrence('08:00', day, NOW)).toBeNull();
  });
});

describe('reminderScheduler.buildReminderSchedule', () => {
  it('skips inactive reminders and invalid times, and dedupes days', () => {
    const schedule = buildReminderSchedule(
      [
        makeReminder({ id: 'active', days: [1, 1, 3] }),
        makeReminder({ id: 'paused', isActive: false, days: [2] }),
        makeReminder({ id: 'broken', time: '25:00', days: [4] }),
      ],
      NOW,
    );

    expect(schedule).toHaveLength(2);
    expect(schedule.map((item) => item.reminderId)).toEqual(['active', 'active']);
    expect(schedule.map((item) => item.day)).toEqual([1, 3]);
    expect(schedule[0]).toMatchObject({
      notificationId: reminderNotificationId('active', 1),
      title: '⏰ Turn off the AC',
      message: 'Switch the bedroom AC off before leaving.',
      date: new Date(2026, 0, 19, 18, 30, 0, 0),
    });
    expect(schedule[1].date).toEqual(new Date(2026, 0, 14, 18, 30, 0, 0));
  });

  it('returns nothing for no reminders', () => {
    expect(buildReminderSchedule([], NOW)).toEqual([]);
  });
});

describe('reminderScheduler.syncReminderNotifications', () => {
  it('schedules weekly repeating notifications with numeric ids', async () => {
    const reminders = [makeReminder({ id: 'r1', days: [1, 3] }), makeReminder({ id: 'r2', days: [5], isActive: false })];

    const result = await syncReminderNotifications(reminders, true, NOW);

    expect(result).toEqual({ status: 'scheduled', scheduled: 2 });
    const calls = scheduledCalls();
    expect(calls).toHaveLength(2);
    calls.forEach((options) => {
      expect(options.repeatType).toBe('week');
      expect(options.id).toMatch(/^\d+$/);
      expect(options.title).toBe('⏰ Turn off the AC');
    });
    expect(calls.map((options) => options.id)).toEqual([reminderNotificationId('r1', 1), reminderNotificationId('r1', 3)]);
    expect(calls.map((options) => options.date)).toEqual([
      new Date(2026, 0, 19, 18, 30, 0, 0),
      new Date(2026, 0, 14, 18, 30, 0, 0),
    ]);
    // Nothing was scheduled before, so nothing is cancelled
    expect(push.cancelLocalNotification).not.toHaveBeenCalled();
  });

  it('cancels the previously scheduled ids on the next sync', async () => {
    await syncReminderNotifications([makeReminder({ id: 'r1', days: [1, 3] })], true, NOW);
    const firstIds = scheduledCalls().map((options) => options.id);
    jest.clearAllMocks();

    // The reminder was edited: now only Friday
    const result = await syncReminderNotifications([makeReminder({ id: 'r1', days: [5] })], true, NOW);

    expect(result).toEqual({ status: 'scheduled', scheduled: 1 });
    expect(cancelledIds().sort()).toEqual([...firstIds].sort());
    expect(scheduledCalls().map((options) => options.id)).toEqual([reminderNotificationId('r1', 5)]);
  });

  it('cancels everything and schedules nothing when notifications are disabled', async () => {
    await syncReminderNotifications([makeReminder({ id: 'r1', days: [1, 3] })], true, NOW);
    const firstIds = scheduledCalls().map((options) => options.id);
    jest.clearAllMocks();

    const result = await syncReminderNotifications([makeReminder({ id: 'r1', days: [1, 3] })], false, NOW);

    expect(result).toEqual({ status: 'disabled', scheduled: 0 });
    expect(push.localNotificationSchedule).not.toHaveBeenCalled();
    expect(cancelledIds().sort()).toEqual([...firstIds].sort());

    // Nothing is left over to cancel afterwards
    jest.clearAllMocks();
    await syncReminderNotifications([], false, NOW);
    expect(push.cancelLocalNotification).not.toHaveBeenCalled();
  });

  it('serializes overlapping syncs so each cancels what the previous one scheduled', async () => {
    const first = syncReminderNotifications([makeReminder({ id: 'r1', days: [2] })], true, NOW);
    const second = syncReminderNotifications([makeReminder({ id: 'r2', days: [4] })], true, NOW);
    await Promise.all([first, second]);

    expect(scheduledCalls().map((options) => options.id)).toEqual([
      reminderNotificationId('r1', 2),
      reminderNotificationId('r2', 4),
    ]);
    expect(cancelledIds()).toEqual([reminderNotificationId('r1', 2)]);
  });

  describe('on Android 12+', () => {
    type AlarmModule = { canScheduleExactAlarms: () => Promise<boolean> };
    const nativeModules = NativeModules as { SaveVoltAlarms?: AlarmModule };

    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'android');
      jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
    });

    afterEach(() => {
      delete nativeModules.SaveVoltAlarms;
    });

    it('reports exact-alarm-denied and schedules nothing without the native alarm module', async () => {
      expect(nativeModules.SaveVoltAlarms).toBeUndefined();
      await expect(NotificationService.canScheduleExactAlarms()).resolves.toBe(false);

      const result = await syncReminderNotifications([makeReminder()], true, NOW);

      expect(result).toEqual({ status: 'exact-alarm-denied', scheduled: 0 });
      expect(push.localNotificationSchedule).not.toHaveBeenCalled();
    });

    it('reports exact-alarm-denied when the user has not granted exact alarms', async () => {
      nativeModules.SaveVoltAlarms = { canScheduleExactAlarms: jest.fn(() => Promise.resolve(false)) };

      const result = await syncReminderNotifications([makeReminder()], true, NOW);

      expect(result).toEqual({ status: 'exact-alarm-denied', scheduled: 0 });
      expect(push.localNotificationSchedule).not.toHaveBeenCalled();
    });

    it('schedules once exact alarms are allowed', async () => {
      nativeModules.SaveVoltAlarms = { canScheduleExactAlarms: jest.fn(() => Promise.resolve(true)) };

      const result = await syncReminderNotifications([makeReminder({ days: [1, 3] })], true, NOW);

      expect(result).toEqual({ status: 'scheduled', scheduled: 2 });
      expect(push.localNotificationSchedule).toHaveBeenCalledTimes(2);
    });
  });

  it('restores the iOS platform after the Android tests', async () => {
    expect(Platform.OS).toBe('ios');
    await expect(NotificationService.canScheduleExactAlarms()).resolves.toBe(true);
  });
});

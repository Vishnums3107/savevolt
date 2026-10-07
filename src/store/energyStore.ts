import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Appliance,
  UsageRecord,
  DashboardData,
  EnergyTip,
  Reminder,
  UserGoal,
  Streak,
  Badge,
  AppSettings,
  WeatherData,
  Room,
  CommunityGoal,
  CommunityContribution,
  Challenge,
  DailySnapshot,
  CountdownTimer,
  Household,
  HouseholdData,
  MeterReading,
  PointsLedger,
  InsightState,
  SavingsCertificate,
  UtilityBill,
  FriendScore,
  ChatMessage,
  SmartHomeConfig,
  DEVICE_SETTING_KEYS,
  DeviceSettingKey,
} from '../types';
import {
  calculateEnergyConsumptions,
  calculateConsumptionByCategory,
  getTopConsumers,
  calculateCost,
  calculateCO2Emissions,
  co2ToTrees,
} from '../utils/energy';
import { generateEnergyTips, getWeatherBasedTips } from '../utils/tips';
import { fetchWeatherData } from '../services/api/weatherApi';
import { PredictionEngine } from '../services/ai/predictionEngine';
import { generateDemoData } from '../services/demo/demoDataGenerator';
import { ACTIVE_HOUSEHOLD_KEY, DEFAULT_HOUSEHOLD, HOUSEHOLDS_KEY, householdStorageKey, isHousehold, validateHouseholdName } from './householdStorage';
import { validateHouseholdData } from '../services/sync/householdData';
import {
  addDayKey,
  buildDayRecord,
  dayKey,
  evaluateChallenge,
  evaluateGoal,
  isMeasured,
  meterDailyUsage,
  normalizeRecords,
  periodLastDay,
  profileDailyKwh,
  recordSavings,
  recordsInRange,
  round,
  summarizeRange,
  toDayKey,
  typicalDailyKwh,
  validateMeterReading,
} from '../utils/analytics';
import { BADGE_DEFINITIONS, challengePoints, EMPTY_LEDGER, levelFor, mergeBadges, POINTS } from '../utils/gamification';
import { decodeShareCode, encodeShareCode } from '../utils/shareCodes';
import { draftCertificate, issueCertificate } from '../utils/certificates';

/** Per-home keys (the original home keeps the bare key; others get a `:homeId` suffix). */
const STORAGE_KEYS = {
  APPLIANCES: '@energy_app_appliances',
  USAGE_RECORDS: '@energy_app_usage_records',
  REMINDERS: '@energy_app_reminders',
  GOALS: '@energy_app_goals',
  STREAK: '@energy_app_streak',
  BADGES: '@energy_app_badges',
  SETTINGS: '@energy_app_settings',
  ROOMS: '@energy_app_rooms',
  COMMUNITY_GOALS: '@energy_app_community_goals',
  CHALLENGES: '@energy_app_challenges',
  SNAPSHOTS: '@energy_app_snapshots',
  TIMERS: '@energy_app_timers',
  METER_READINGS: '@energy_app_meter_readings',
  POINTS: '@energy_app_points',
  INSIGHTS: '@energy_app_insights',
  CERTIFICATES: '@energy_app_certificates',
  BILLS: '@energy_app_bills',
  CHAT: '@energy_app_chat',
  SMART_HOME: '@energy_app_smart_home',
  ONBOARDING: '@energy_app_onboarding',
};

/** Device-wide keys: shared by every home on this phone. */
const GLOBAL_KEYS = {
  ONBOARDING: STORAGE_KEYS.ONBOARDING,
  DEVICE_SETTINGS: '@energy_app_device_settings',
  FRIENDS: '@energy_app_friends',
  PROFILE_ID: '@energy_app_profile_id',
};
const GLOBAL_KEY_SET = new Set(Object.values(GLOBAL_KEYS));

const DEFAULT_SETTINGS: AppSettings = {
  electricityRate: 0.12,
  currency: '$',
  co2Factor: 0.92,
  notificationsEnabled: true,
  weatherLocation: 'New York',
  darkMode: false,
  voiceEnabled: false,
  geminiApiKey: '',
};

const EMPTY_INSIGHTS: InsightState = { dismissed: {}, done: {}, saved: {}, undo: {} };
const DEFAULT_SMART_HOME: SmartHomeConfig = { provider: 'virtual', shellyDevices: [] };
const EMPTY_STREAK: Streak = { currentStreak: 0, longestStreak: 0, lastActivityDate: '', totalDaysActive: 0 };
const MAX_CHAT_MESSAGES = 120;
const MAX_POINT_EVENTS = 250;

/**
 * Parses a persisted JSON value, falling back when it is missing or corrupt so
 * one bad key cannot prevent the rest of the app data from loading.
 */
const parseStored = <T,>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn('Ignoring unreadable stored value:', error);
    return fallback;
  }
};

const isDeviceKey = (key: string): key is DeviceSettingKey => (DEVICE_SETTING_KEYS as readonly string[]).includes(key);

const pickDeviceSettings = (settings: Partial<AppSettings>) =>
  Object.fromEntries(Object.entries(settings).filter(([key]) => isDeviceKey(key))) as Partial<AppSettings>;

const pickHomeSettings = (settings: Partial<AppSettings>) =>
  Object.fromEntries(Object.entries(settings).filter(([key]) => !isDeviceKey(key))) as Partial<AppSettings>;

/** Copy of a record without one key. */
const omit = <T extends object>(value: T, key: string): T => {
  const copy = { ...value } as Record<string, unknown>;
  delete copy[key];
  return copy as T;
};

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const today = () => dayKey(new Date());
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'member';

const INITIAL_BADGES: Badge[] = BADGE_DEFINITIONS.map((badge) => ({ ...badge }));

export interface ScoreSummary {
  name: string;
  points: number;
  level: number;
  levelName: string;
  weekSavedKwh: number;
  savingsPercent: number;
  streak: number;
  badges: number;
}

export interface ImportResult {
  kind: 'score' | 'goal' | 'contribution';
  title: string;
  message: string;
}

export interface EnergyStore {
  // State
  households: Household[];
  activeHouseholdId: string;
  isSwitchingHousehold: boolean;
  appliances: Appliance[];
  usageRecords: UsageRecord[];
  tips: EnergyTip[];
  reminders: Reminder[];
  goals: UserGoal[];
  streak: Streak;
  badges: Badge[];
  settings: AppSettings;
  weatherData: WeatherData | null;
  dashboardData: DashboardData | null;
  rooms: Room[];
  communityGoals: CommunityGoal[];
  challenges: Challenge[];
  snapshots: DailySnapshot[];
  activeTimers: CountdownTimer[];
  meterReadings: MeterReading[];
  points: PointsLedger;
  insightState: InsightState;
  certificates: SavingsCertificate[];
  bills: UtilityBill[];
  chatMessages: ChatMessage[];
  smartHome: SmartHomeConfig;
  friends: FriendScore[];
  profileId: string;
  hasSeenOnboarding: boolean;
  isLoading: boolean;
  isWeatherLoading: boolean;

  // Homes
  createHousehold: (name: string) => Promise<string>;
  switchHousehold: (id: string) => Promise<void>;
  renameHousehold: (id: string, name: string) => Promise<void>;
  deleteHousehold: (id: string) => Promise<void>;
  updateHouseholdCloudLink: (id: string, ownerId: string, cloudId: string, revision: number) => Promise<void>;
  exportHouseholdData: () => HouseholdData;
  captureHouseholdData: () => Promise<{ household: Household; data: HouseholdData }>;
  restoreHousehold: (name: string, data: HouseholdData, cloud?: { ownerId: string; id: string; revision: number }) => Promise<string>;
  resetHouseholdData: () => Promise<void>;
  loadAllData: () => Promise<void>;
  loadDemoData: () => Promise<void>;
  refreshDashboard: () => void;
  syncGoals: () => void;
  /** Recomputes goals, challenges and shared goals from the latest data. */
  syncProgress: () => void;

  // Appliances
  addAppliance: (appliance: Omit<Appliance, 'id' | 'createdAt'>) => Promise<string>;
  updateAppliance: (id: string, updates: Partial<Appliance>) => Promise<void>;
  deleteAppliance: (id: string) => Promise<void>;
  toggleAppliance: (id: string) => Promise<void>;
  setMeasuredWatts: (id: string, watts: number | null) => Promise<void>;

  // Usage
  /** Saves what actually ran on a day (hours per appliance). */
  logDay: (date: string, hours: Record<string, number>, note?: string) => Promise<UsageRecord>;
  deleteUsageRecord: (id: string) => Promise<void>;
  addMeterReading: (reading: { value: number; takenAt: string; note?: string }) => Promise<{ daysUpdated: number }>;
  deleteMeterReading: (id: string) => Promise<void>;
  addBill: (bill: Omit<UtilityBill, 'id' | 'createdAt'>) => Promise<void>;
  deleteBill: (id: string) => Promise<void>;
  /** Legacy: saves today's profile estimate (never replaces a logged or metered day). */
  saveUsageRecord: () => Promise<void>;

  // Reminders
  addReminder: (reminder: Omit<Reminder, 'id'>) => Promise<void>;
  updateReminder: (id: string, updates: Partial<Reminder>) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;

  // Goals
  addGoal: (goal: Omit<UserGoal, 'id' | 'createdAt' | 'currentValue' | 'isAchieved'>) => Promise<void>;
  updateGoal: (id: string, updates: Partial<UserGoal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;

  // Rooms
  addRoom: (room: Room) => Promise<void>;
  updateRoom: (id: string, updates: Partial<Room>) => Promise<void>;
  deleteRoom: (id: string) => Promise<void>;
  assignApplianceToRoom: (applianceId: string, roomId: string) => Promise<void>;
  unassignAppliance: (applianceId: string) => Promise<void>;

  // Shared goals
  addCommunityGoal: (goal: Omit<CommunityGoal, 'id' | 'createdAt' | 'currentEnergy' | 'isAchieved'> & { id?: string; createdAt?: string }) => Promise<string>;
  updateCommunityGoal: (id: string, updates: Partial<CommunityGoal>) => Promise<void>;
  deleteCommunityGoal: (id: string) => Promise<void>;
  addContribution: (goalId: string, contribution: { participant: string; kWh: number; note?: string }) => Promise<void>;
  removeContribution: (goalId: string, contributionId: string) => Promise<void>;

  // Challenges
  addChallenge: (challenge: Omit<Challenge, 'id' | 'currentProgress' | 'isCompleted'>) => Promise<void>;
  updateChallenge: (id: string, updates: Partial<Challenge>) => Promise<void>;
  completeChallenge: (id: string) => Promise<void>;
  deleteChallenge: (id: string) => Promise<void>;
  checkInChallenge: (id: string) => Promise<void>;

  // Impact
  generateDailySnapshot: () => Promise<DailySnapshot>;
  saveDailySnapshot: (snapshot: DailySnapshot) => Promise<void>;
  issueSavingsCertificate: () => Promise<SavingsCertificate>;
  addCountdownTimer: (timer: Omit<CountdownTimer, 'id'>) => Promise<void>;
  updateTimer: (id: string) => Promise<void>;
  removeTimer: (id: string) => Promise<void>;

  // Insights (tips and recommendations)
  dismissInsight: (id: string) => Promise<void>;
  restoreInsight: (id: string) => Promise<void>;
  markInsightDone: (id: string, reason?: string) => Promise<void>;
  undoInsightDone: (id: string) => Promise<void>;
  toggleInsightSaved: (id: string) => Promise<void>;
  applyApplianceChange: (insightId: string, applianceId: string, changes: Partial<Appliance>, savingsKwh: number, reason: string) => Promise<void>;
  undoInsight: (insightId: string) => Promise<void>;

  // Social
  getScoreSummary: () => ScoreSummary;
  getScoreCode: () => string;
  getGoalInviteCode: (goalId: string) => string;
  getContributionCode: (goalId: string) => string;
  importShareCode: (text: string) => Promise<ImportResult>;
  removeFriend: (id: string) => Promise<void>;

  // Assistant & smart home
  appendChatMessages: (messages: ChatMessage[]) => Promise<void>;
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => Promise<void>;
  clearChat: () => Promise<void>;
  updateSmartHome: (updates: Partial<SmartHomeConfig>) => Promise<void>;

  // Settings, streaks, badges, points
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  refreshWeatherData: () => Promise<void>;
  updateStreak: () => Promise<void>;
  awardBadge: (badgeId: string) => Promise<void>;
  awardBadges: (badgeIds: string[]) => Promise<void>;
  checkPerformanceBadges: (records: UsageRecord[]) => Promise<void>;
  checkAchievements: () => Promise<void>;
  awardPoints: (key: string, points: number, reason: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  /** Shows the intro and setup again on next render (Settings → Replay intro). */
  resetOnboarding: () => Promise<void>;
}

export const useEnergyStore = create<EnergyStore>((set, get) => {
  const pendingMutations = new Set<Promise<unknown>>();
  let transitioning = false;
  let weatherRequest = 0;
  const storageKey = (key: string, id = get().activeHouseholdId) =>
    GLOBAL_KEY_SET.has(key) ? key : householdStorageKey(key, id);

  const writeHomeData = (key: string, value: string, id = get().activeHouseholdId) => {
    const operation = AsyncStorage.setItem(storageKey(key, id), value);
    pendingMutations.add(operation);
    return operation.finally(() => pendingMutations.delete(operation));
  };
  const writeJson = (key: string, value: unknown) => writeHomeData(key, JSON.stringify(value));
  /** Fire-and-forget write used by synchronous recalculations. */
  const persist = (key: string, value: unknown) => { writeJson(key, value).catch(console.error); };

  // Finish outstanding writes before changing homes. While loading the next home,
  // block writes; actions already running can finish their nested actions first.
  const transition = async <T,>(work: () => Promise<T>): Promise<T> => {
    if (transitioning) throw new Error('Please wait for the current home operation to finish.');
    transitioning = true;
    set({ isSwitchingHousehold: true });
    try {
      while (pendingMutations.size) await Promise.allSettled([...pendingMutations]);
      return await work();
    } finally {
      transitioning = false;
      set({ isSwitchingHousehold: false });
    }
  };

  // ── Internal helpers (not wrapped, safe to call from sync recalculations) ──

  /** Awards points once per key. */
  const grantPoints = (key: string, points: number, reason: string) => {
    const ledger = get().points;
    if (points <= 0 || ledger.events.some((event) => event.key === key)) return;
    const event = { id: uid('pts'), date: new Date().toISOString(), points, reason, key };
    const updated: PointsLedger = {
      total: ledger.total + points,
      events: [event, ...ledger.events].slice(0, MAX_POINT_EVENTS),
    };
    set({ points: updated });
    persist(STORAGE_KEYS.POINTS, updated);
  };

  const revokePoints = (key: string) => {
    const ledger = get().points;
    const event = ledger.events.find((item) => item.key === key);
    if (!event) return;
    const updated: PointsLedger = {
      total: Math.max(ledger.total - event.points, 0),
      events: ledger.events.filter((item) => item.key !== key),
    };
    set({ points: updated });
    persist(STORAGE_KEYS.POINTS, updated);
  };

  const saveInsights = (insightState: InsightState) => {
    set({ insightState });
    return writeJson(STORAGE_KEYS.INSIGHTS, insightState);
  };

  const myName = () => get().settings.displayName?.trim() || 'You';

  /** Rebuilds metered days from the readings, restoring logged days a removed reading covered. */
  const rebuildMeterRecords = async (): Promise<number> => {
    const { meterReadings, appliances, settings } = get();
    const usage = meterDailyUsage(meterReadings);
    const profile = profileDailyKwh(appliances);
    let records = get().usageRecords.flatMap((record): UsageRecord[] => {
      if (record.source !== 'meter' || usage.has(toDayKey(record.date))) return [record];
      if (record.applianceHours) {
        return [buildDayRecord({
          id: record.id, date: toDayKey(record.date), appliances: record.appliances, hours: record.applianceHours,
          settings, source: 'logged', note: record.note,
        })];
      }
      return [];
    });
    for (const [day, kWh] of usage) {
      const index = records.findIndex((r) => toDayKey(r.date) === day);
      const existing = index >= 0 ? records[index] : undefined;
      const meterRecord: UsageRecord = {
        id: existing?.id ?? `record-${day}-meter`,
        date: day,
        appliances: existing?.appliances ?? appliances.map((a) => ({ ...a })),
        totalConsumption: kWh,
        totalCost: round(kWh * settings.electricityRate, 4),
        totalCO2: round(kWh * settings.co2Factor, 4),
        source: 'meter',
        baselineKwh: existing?.baselineKwh ?? round(profile, 4),
        ...(existing?.applianceHours ? { applianceHours: existing.applianceHours } : {}),
        ...(existing?.note ? { note: existing.note } : {}),
      };
      if (index >= 0) records[index] = meterRecord;
      else records.push(meterRecord);
    }
    records = records.sort((a, b) => toDayKey(a.date).localeCompare(toDayKey(b.date)));
    set({ usageRecords: records });
    await writeJson(STORAGE_KEYS.USAGE_RECORDS, records);
    return usage.size;
  };

  const syncChallengesInternal = () => {
    const { challenges, usageRecords, settings } = get();
    if (challenges.length === 0) return;
    const now = new Date();
    const newlyCompleted: Challenge[] = [];
    let changed = false;
    const updated = challenges.map((challenge) => {
      const result = evaluateChallenge(challenge, usageRecords, settings.electricityRate, now);
      if (result.currentProgress === challenge.currentProgress && result.status === challenge.status &&
          result.isCompleted === challenge.isCompleted && result.completedAt === challenge.completedAt) {
        return challenge;
      }
      changed = true;
      if (result.isCompleted && !challenge.isCompleted) newlyCompleted.push(challenge);
      return { ...challenge, ...result };
    });
    if (!changed) return;
    set({ challenges: updated });
    persist(STORAGE_KEYS.CHALLENGES, updated);
    for (const challenge of newlyCompleted) {
      grantPoints(`challenge:${challenge.id}`, challenge.points ?? challengePoints(challenge), `Completed “${challenge.title}”`);
    }
  };

  const syncCommunityInternal = () => {
    const { communityGoals, usageRecords } = get();
    if (communityGoals.length === 0) return;
    const now = new Date();
    const todayKey = dayKey(now);
    let changed = false;
    const updated = communityGoals.map((goal) => {
      const me = goal.me || myName();
      const last = periodLastDay(goal.createdAt, goal.deadline);
      const to = last < todayKey ? last : todayKey;
      const auto = round(recordsInRange(normalizeRecords(usageRecords), toDayKey(goal.createdAt), to)
        .reduce((sum, r) => sum + Math.max(0, recordSavings(r)), 0), 3);
      const others = (goal.contributions ?? []).filter((c) => c.source !== 'auto');
      const contributions: CommunityContribution[] = auto > 0
        ? [{ id: `auto-${goal.id}`, participant: me, kWh: auto, date: now.toISOString(), source: 'auto' }, ...others]
        : others;
      const currentEnergy = round(contributions.reduce((sum, c) => sum + c.kWh, 0), 3);
      const participants = [...new Set([...goal.participants, ...contributions.map((c) => c.participant)])];
      const isAchieved = goal.targetEnergy > 0 && currentEnergy >= goal.targetEnergy;
      const previousAuto = goal.contributions?.find((c) => c.source === 'auto')?.kWh ?? 0;
      if (currentEnergy === goal.currentEnergy && isAchieved === goal.isAchieved && previousAuto === auto &&
          participants.length === goal.participants.length) {
        return goal;
      }
      changed = true;
      if (isAchieved && !goal.isAchieved) grantPoints(`community:${goal.id}`, POINTS.communityGoal, `Reached “${goal.title}” together`);
      return {
        ...goal, contributions, currentEnergy, participants, isAchieved,
        achievedAt: isAchieved ? goal.achievedAt ?? now.toISOString() : undefined,
      };
    });
    if (!changed) return;
    set({ communityGoals: updated });
    persist(STORAGE_KEYS.COMMUNITY_GOALS, updated);
  };

  const trackActions = (state: EnergyStore): EnergyStore => {
    const keys = [
      'loadDemoData', 'addAppliance', 'updateAppliance', 'deleteAppliance', 'toggleAppliance', 'setMeasuredWatts',
      'logDay', 'deleteUsageRecord', 'addMeterReading', 'deleteMeterReading', 'addBill', 'deleteBill',
      'addReminder', 'updateReminder', 'deleteReminder', 'addGoal', 'updateGoal', 'deleteGoal',
      'updateSettings', 'saveUsageRecord', 'updateStreak', 'awardBadge', 'awardBadges',
      'checkPerformanceBadges', 'checkAchievements', 'awardPoints', 'addRoom', 'updateRoom', 'deleteRoom',
      'assignApplianceToRoom', 'unassignAppliance', 'addCommunityGoal', 'updateCommunityGoal', 'deleteCommunityGoal',
      'addContribution', 'removeContribution', 'addChallenge', 'updateChallenge', 'completeChallenge',
      'deleteChallenge', 'checkInChallenge', 'saveDailySnapshot', 'issueSavingsCertificate', 'addCountdownTimer',
      'updateTimer', 'removeTimer', 'dismissInsight', 'restoreInsight', 'markInsightDone', 'undoInsightDone',
      'toggleInsightSaved', 'applyApplianceChange', 'undoInsight', 'importShareCode', 'removeFriend',
      'appendChatMessages', 'updateChatMessage', 'clearChat', 'updateSmartHome', 'resetHouseholdData',
      'resetOnboarding',
    ] as const;
    for (const key of keys) {
      const action = state[key] as (...args: unknown[]) => Promise<unknown>;
      Object.assign(state, { [key]: (...args: unknown[]) => {
        if (transitioning && pendingMutations.size === 0) {
          return Promise.reject(new Error('Please wait while your home is loading.'));
        }
        const operation = action(...args);
        pendingMutations.add(operation);
        return operation.finally(() => pendingMutations.delete(operation));
      } });
    }
    return state;
  };

  const HOME_DATA_KEYS = Object.values(STORAGE_KEYS).filter((key) => !GLOBAL_KEY_SET.has(key));

  return trackActions({
  households: [DEFAULT_HOUSEHOLD],
  activeHouseholdId: DEFAULT_HOUSEHOLD.id,
  isSwitchingHousehold: false,
  appliances: [],
  usageRecords: [],
  tips: [],
  reminders: [],
  goals: [],
  streak: EMPTY_STREAK,
  badges: INITIAL_BADGES,
  settings: DEFAULT_SETTINGS,
  weatherData: null,
  dashboardData: null,
  rooms: [],
  communityGoals: [],
  challenges: [],
  snapshots: [],
  activeTimers: [],
  meterReadings: [],
  points: EMPTY_LEDGER,
  insightState: EMPTY_INSIGHTS,
  certificates: [],
  bills: [],
  chatMessages: [],
  smartHome: DEFAULT_SMART_HOME,
  friends: [],
  profileId: '',
  hasSeenOnboarding: false,
  isLoading: true,
  isWeatherLoading: false,

  // ─── Homes ──────────────────────────────────────────────────────

  createHousehold: (name) => transition(async () => {
    const cleaned = validateHouseholdName(name, get().households);
    const id = `home-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const household: Household = { id, name: cleaned, createdAt: new Date().toISOString() };
    await AsyncStorage.setItem(storageKey(STORAGE_KEYS.SETTINGS, id), JSON.stringify(pickHomeSettings(get().settings)));
    const households = [...get().households, household];
    await AsyncStorage.setItem(HOUSEHOLDS_KEY, JSON.stringify(households));
    set({ households });
    return id;
  }),

  switchHousehold: (id) => transition(async () => {
    if (!get().households.some(home => home.id === id)) throw new Error('Home not found.');
    if (id === get().activeHouseholdId) return;
    const previousId = get().activeHouseholdId;
    ++weatherRequest;
    await AsyncStorage.setItem(ACTIVE_HOUSEHOLD_KEY, id);
    try {
      await get().loadAllData();
    } catch (error) {
      await AsyncStorage.setItem(ACTIVE_HOUSEHOLD_KEY, previousId);
      throw error;
    }
  }),

  renameHousehold: (id, name) => transition(async () => {
    if (!get().households.some(home => home.id === id)) throw new Error('Home not found.');
    const cleaned = validateHouseholdName(name, get().households, id);
    const households = get().households.map(home => home.id === id ? { ...home, name: cleaned } : home);
    await AsyncStorage.setItem(HOUSEHOLDS_KEY, JSON.stringify(households));
    set({ households });
  }),

  deleteHousehold: (id) => transition(async () => {
    if (id === get().activeHouseholdId) throw new Error('Switch to another home before deleting this one.');
    if (!get().households.some(home => home.id === id)) throw new Error('Home not found.');
    const households = get().households.filter(home => home.id !== id);
    if (!households.length) throw new Error('Keep at least one home.');
    await AsyncStorage.setItem(HOUSEHOLDS_KEY, JSON.stringify(households));
    set({ households });
    // Only this home's data is removed; device-wide keys are shared by all homes.
    await AsyncStorage.multiRemove(HOME_DATA_KEYS.map(key => storageKey(key, id)));
  }),

  updateHouseholdCloudLink: (id, ownerId, cloudId, revision) => transition(async () => {
    const households = get().households.map(home => home.id === id
      ? { ...home, cloudOwnerId: ownerId, cloudId, cloudRevision: revision } : home);
    await AsyncStorage.setItem(HOUSEHOLDS_KEY, JSON.stringify(households));
    set({ households });
  }),

  exportHouseholdData: () => {
    const state = get();
    const { electricityRate, currency, co2Factor, weatherLocation } = state.settings;
    return JSON.parse(JSON.stringify({
      appliances: state.appliances, usageRecords: state.usageRecords, reminders: state.reminders,
      goals: state.goals, streak: state.streak, badges: state.badges, rooms: state.rooms,
      communityGoals: state.communityGoals, challenges: state.challenges, snapshots: state.snapshots,
      activeTimers: state.activeTimers, settings: { electricityRate, currency, co2Factor, weatherLocation },
      meterReadings: state.meterReadings, points: state.points, insightState: state.insightState,
      certificates: state.certificates, bills: state.bills,
    })) as HouseholdData;
  },

  captureHouseholdData: () => transition(async () => ({
    household: { ...get().households.find(home => home.id === get().activeHouseholdId)! },
    data: get().exportHouseholdData(),
  })),

  restoreHousehold: (name, input, cloud) => transition(async () => {
    const data = validateHouseholdData(input);
    const cleaned = validateHouseholdName(name, get().households);
    const id = `home-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const household: Household = { id, name: cleaned, createdAt: new Date().toISOString(),
      ...(cloud ? { cloudId: cloud.id, cloudOwnerId: cloud.ownerId, cloudRevision: cloud.revision } : {}),
    };
    const values: [string, unknown][] = [
      [STORAGE_KEYS.APPLIANCES, data.appliances], [STORAGE_KEYS.USAGE_RECORDS, data.usageRecords],
      [STORAGE_KEYS.REMINDERS, data.reminders], [STORAGE_KEYS.GOALS, data.goals],
      [STORAGE_KEYS.STREAK, data.streak], [STORAGE_KEYS.BADGES, data.badges],
      [STORAGE_KEYS.ROOMS, data.rooms], [STORAGE_KEYS.COMMUNITY_GOALS, data.communityGoals],
      [STORAGE_KEYS.CHALLENGES, data.challenges], [STORAGE_KEYS.SNAPSHOTS, data.snapshots],
      [STORAGE_KEYS.TIMERS, data.activeTimers],
      [STORAGE_KEYS.SETTINGS, { ...pickHomeSettings(get().settings), ...data.settings }],
    ];
    if (data.meterReadings) values.push([STORAGE_KEYS.METER_READINGS, data.meterReadings]);
    if (data.points) values.push([STORAGE_KEYS.POINTS, data.points]);
    if (data.insightState) values.push([STORAGE_KEYS.INSIGHTS, data.insightState]);
    if (data.certificates) values.push([STORAGE_KEYS.CERTIFICATES, data.certificates]);
    if (data.bills) values.push([STORAGE_KEYS.BILLS, data.bills]);
    await AsyncStorage.multiSet(values.map(([key, value]) => [storageKey(key, id), JSON.stringify(value)]));
    const households = [...get().households, household];
    await AsyncStorage.setItem(HOUSEHOLDS_KEY, JSON.stringify(households));
    set({ households });
    return id;
  }),

  resetHouseholdData: async () => {
    const keys = HOME_DATA_KEYS.filter((key) => key !== STORAGE_KEYS.SETTINGS && key !== STORAGE_KEYS.SMART_HOME);
    await AsyncStorage.multiRemove(keys.map((key) => storageKey(key)));
    set({
      appliances: [], usageRecords: [], reminders: [], goals: [], streak: EMPTY_STREAK, badges: mergeBadges([]),
      rooms: [], communityGoals: [], challenges: [], snapshots: [], activeTimers: [], meterReadings: [],
      points: EMPTY_LEDGER, insightState: EMPTY_INSIGHTS, certificates: [], bills: [], chatMessages: [],
    });
    get().refreshDashboard();
  },

  // ─── Derived data ───────────────────────────────────────────────

  refreshDashboard: () => {
    const { appliances, settings, weatherData } = get();
    if (appliances.length === 0) {
      set({ dashboardData: null, tips: [] });
      get().syncProgress();
      return;
    }

    const consumptions = calculateEnergyConsumptions(
      appliances,
      settings.electricityRate,
      settings.co2Factor,
    );
    const categoryConsumptions = calculateConsumptionByCategory(appliances, settings.electricityRate);
    const topConsumers = getTopConsumers(consumptions, 3);
    const totalEnergyConsumed = consumptions.reduce((sum, consumption) => sum + consumption.monthlyConsumption, 0);
    const totalCost = calculateCost(totalEnergyConsumed, settings.electricityRate);
    const totalCO2 = calculateCO2Emissions(totalEnergyConsumed, settings.co2Factor);

    set({
      dashboardData: {
        totalEnergyConsumed,
        totalCost,
        totalCO2Saved: totalCO2,
        treesEquivalent: co2ToTrees(totalCO2),
        topConsumers,
        consumptionByCategory: categoryConsumptions,
      }
    });

    const energyTips = generateEnergyTips(appliances, consumptions);
    const weatherTips = weatherData
      ? getWeatherBasedTips(weatherData.temperature, weatherData.season, weatherData.humidity, appliances)
      : [];
    const predictiveTips = PredictionEngine.generatePredictiveTips(appliances, weatherData, settings.electricityRate, settings.co2Factor, settings.currency);
    // One tip per id: the first source wins
    const seen = new Set<string>();
    const tips = [...energyTips, ...weatherTips, ...predictiveTips].filter((tip) => {
      if (seen.has(tip.id)) return false;
      seen.add(tip.id);
      return true;
    });
    set({ tips });
    get().syncProgress();
  },

  syncGoals: () => {
    const { goals, usageRecords, appliances, settings } = get();
    if (goals.length === 0) return;
    const now = new Date();
    const updatedGoals = goals.map((goal) => {
      const result = evaluateGoal(goal, usageRecords, appliances, settings, now);
      return {
        ...goal,
        currentValue: result.currentValue,
        projectedValue: result.projectedValue,
        status: result.status,
        isAchieved: result.isAchieved,
        loggedDays: result.loggedDays,
      };
    });

    const hasChanged = updatedGoals.some((goal, index) => {
      const before = goals[index];
      return goal.currentValue !== before.currentValue || goal.isAchieved !== before.isAchieved ||
        goal.status !== before.status || goal.projectedValue !== before.projectedValue || goal.loggedDays !== before.loggedDays;
    });

    if (hasChanged) {
      set({ goals: updatedGoals });
      writeHomeData(STORAGE_KEYS.GOALS, JSON.stringify(updatedGoals)).catch(console.error);
    }
  },

  syncProgress: () => {
    get().syncGoals();
    syncChallengesInternal();
    syncCommunityInternal();
  },

  loadAllData: async () => {
    try {
      if (!get().isSwitchingHousehold) set({ isLoading: true });
      const [rawHomes, storedActive, rawDevice, rawFriends, storedProfileId] = await Promise.all([
        AsyncStorage.getItem(HOUSEHOLDS_KEY), AsyncStorage.getItem(ACTIVE_HOUSEHOLD_KEY),
        AsyncStorage.getItem(GLOBAL_KEYS.DEVICE_SETTINGS), AsyncStorage.getItem(GLOBAL_KEYS.FRIENDS),
        AsyncStorage.getItem(GLOBAL_KEYS.PROFILE_ID),
      ]);
      const parsedHomes = parseStored<unknown>(rawHomes, [DEFAULT_HOUSEHOLD]);
      const households = Array.isArray(parsedHomes) && parsedHomes.length > 0 && parsedHomes.every(isHousehold)
        ? parsedHomes : [DEFAULT_HOUSEHOLD];
      const activeHouseholdId = households.some(home => home.id === storedActive)
        ? storedActive! : households[0].id;
      const read = (key: string) => AsyncStorage.getItem(storageKey(key, activeHouseholdId));

      const [
        storedAppliances, storedRecords, storedReminders, storedGoals,
        storedStreak, storedBadges, storedSettings, storedRooms,
        storedCommunityGoals, storedChallenges, storedSnapshots, storedTimers,
        storedOnboarding, storedMeter, storedPoints, storedInsights, storedCertificates,
        storedBills, storedChat, storedSmartHome,
      ] = await Promise.all([
        read(STORAGE_KEYS.APPLIANCES),
        read(STORAGE_KEYS.USAGE_RECORDS),
        read(STORAGE_KEYS.REMINDERS),
        read(STORAGE_KEYS.GOALS),
        read(STORAGE_KEYS.STREAK),
        read(STORAGE_KEYS.BADGES),
        read(STORAGE_KEYS.SETTINGS),
        read(STORAGE_KEYS.ROOMS),
        read(STORAGE_KEYS.COMMUNITY_GOALS),
        read(STORAGE_KEYS.CHALLENGES),
        read(STORAGE_KEYS.SNAPSHOTS),
        read(STORAGE_KEYS.TIMERS),
        read(STORAGE_KEYS.ONBOARDING),
        read(STORAGE_KEYS.METER_READINGS),
        read(STORAGE_KEYS.POINTS),
        read(STORAGE_KEYS.INSIGHTS),
        read(STORAGE_KEYS.CERTIFICATES),
        read(STORAGE_KEYS.BILLS),
        read(STORAGE_KEYS.CHAT),
        read(STORAGE_KEYS.SMART_HOME),
      ]);

      const homeSettings = parseStored<Partial<AppSettings>>(storedSettings, {});
      // Device preferences used to live in each home's settings; the first load migrates them.
      const deviceSettings = rawDevice !== null
        ? parseStored<Partial<AppSettings>>(rawDevice, {})
        : pickDeviceSettings(homeSettings);
      const loadedSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...pickHomeSettings(homeSettings),
        ...pickDeviceSettings(deviceSettings),
      };
      if (rawDevice === null && Object.keys(deviceSettings).length > 0) {
        AsyncStorage.setItem(GLOBAL_KEYS.DEVICE_SETTINGS, JSON.stringify(deviceSettings)).catch(console.error);
      }
      let profileId = storedProfileId ?? '';
      if (!/^[a-zA-Z0-9_-]{6,60}$/.test(profileId)) {
        profileId = `sv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        AsyncStorage.setItem(GLOBAL_KEYS.PROFILE_ID, profileId).catch(console.error);
      }
      const ledger = parseStored<PointsLedger>(storedPoints, EMPTY_LEDGER);
      const insights = parseStored<InsightState>(storedInsights, EMPTY_INSIGHTS);
      const smartHome = parseStored<SmartHomeConfig>(storedSmartHome, DEFAULT_SMART_HOME);

      set({
        households, activeHouseholdId,
        weatherData: null,
        appliances: parseStored(storedAppliances, []),
        usageRecords: parseStored(storedRecords, []),
        reminders: parseStored(storedReminders, []),
        goals: parseStored(storedGoals, []),
        streak: parseStored(storedStreak, EMPTY_STREAK),
        badges: mergeBadges(parseStored(storedBadges, INITIAL_BADGES)),
        settings: loadedSettings,
        rooms: parseStored(storedRooms, []),
        communityGoals: parseStored(storedCommunityGoals, []),
        challenges: parseStored(storedChallenges, []),
        snapshots: parseStored(storedSnapshots, []),
        activeTimers: parseStored(storedTimers, []),
        meterReadings: parseStored(storedMeter, []),
        points: ledger && Array.isArray(ledger.events) ? ledger : EMPTY_LEDGER,
        insightState: { ...EMPTY_INSIGHTS, ...(insights && typeof insights === 'object' ? insights : {}) },
        certificates: parseStored(storedCertificates, []),
        bills: parseStored(storedBills, []),
        chatMessages: parseStored(storedChat, []),
        smartHome: { ...DEFAULT_SMART_HOME, ...(smartHome && typeof smartHome === 'object' ? smartHome : {}) },
        friends: parseStored(rawFriends, []),
        profileId,
        hasSeenOnboarding: storedOnboarding === 'true',
      });

      // After load, fetch weather in the background (never blocks startup)
      set({ isWeatherLoading: true });
      const request = ++weatherRequest;
      fetchWeatherData(loadedSettings.weatherLocation)
        .then(data => {
          if (request !== weatherRequest || get().activeHouseholdId !== activeHouseholdId) return;
          set({ weatherData: data });
          get().refreshDashboard();
        })
        .catch(error => console.warn('Weather refresh failed:', error))
        .finally(() => { if (request === weatherRequest) set({ isWeatherLoading: false }); });

      get().refreshDashboard();
    } catch (error) {
      console.error('Error loading data:', error);
      if (get().isSwitchingHousehold) throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  loadDemoData: async () => {
    const { appliances, usageRecords, rooms } = generateDemoData(get().settings);
    set({ appliances, usageRecords });
    await writeHomeData(STORAGE_KEYS.APPLIANCES, JSON.stringify(appliances));
    await writeHomeData(STORAGE_KEYS.USAGE_RECORDS, JSON.stringify(usageRecords));
    if (get().rooms.length === 0) {
      set({ rooms });
      await writeJson(STORAGE_KEYS.ROOMS, rooms);
    }
    get().refreshDashboard();
  },

  // ─── Appliances ─────────────────────────────────────────────────

  addAppliance: async (applianceData) => {
    const { appliances, awardBadge, updateStreak, refreshDashboard } = get();
    const newAppliance: Appliance = {
      ...applianceData,
      id: uid('appliance'),
      createdAt: new Date().toISOString(),
    };
    const updated = [...appliances, newAppliance];
    set({ appliances: updated });
    await writeHomeData(STORAGE_KEYS.APPLIANCES, JSON.stringify(updated));
    if (updated.length === 1) await awardBadge('badge-1');
    await updateStreak();
    refreshDashboard();
    return newAppliance.id;
  },

  updateAppliance: async (id, updates) => {
    const { appliances, refreshDashboard } = get();
    const updated = appliances.map((app) => (app.id === id ? { ...app, ...updates } : app));
    set({ appliances: updated });
    await writeHomeData(STORAGE_KEYS.APPLIANCES, JSON.stringify(updated));
    refreshDashboard();
    if (updates.hardwareLink) await get().checkAchievements();
  },

  deleteAppliance: async (id) => {
    const { appliances, rooms, reminders, refreshDashboard } = get();
    const updated = appliances.filter((app) => app.id !== id);
    set({ appliances: updated });
    await writeHomeData(STORAGE_KEYS.APPLIANCES, JSON.stringify(updated));

    // Drop references to the removed appliance so rooms and reminders stay consistent
    if (rooms.some((room) => room.appliances.includes(id))) {
      const updatedRooms = rooms.map((room) => ({
        ...room,
        appliances: room.appliances.filter((applianceId) => applianceId !== id),
      }));
      set({ rooms: updatedRooms });
      await writeHomeData(STORAGE_KEYS.ROOMS, JSON.stringify(updatedRooms));
    }
    if (reminders.some((reminder) => reminder.applianceId === id)) {
      const updatedReminders = reminders.map((reminder) =>
        reminder.applianceId === id ? { ...reminder, applianceId: undefined } : reminder,
      );
      set({ reminders: updatedReminders });
      await writeHomeData(STORAGE_KEYS.REMINDERS, JSON.stringify(updatedReminders));
    }
    refreshDashboard();
  },

  toggleAppliance: async (id) => {
    const app = get().appliances.find((a) => a.id === id);
    if (app) await get().updateAppliance(id, { isActive: !app.isActive });
  },

  setMeasuredWatts: async (id, watts) => {
    const updated = get().appliances.map((app) => {
      if (app.id !== id) return app;
      if (watts === null || !Number.isFinite(watts)) return omit(omit(app, 'measuredWatts'), 'measuredAt');
      return { ...app, measuredWatts: Math.max(round(watts, 1), 0), measuredAt: new Date().toISOString() };
    });
    set({ appliances: updated });
    await writeJson(STORAGE_KEYS.APPLIANCES, updated);
  },

  // ─── Usage ──────────────────────────────────────────────────────

  logDay: async (date, hours, note) => {
    const { appliances, settings, usageRecords } = get();
    if (appliances.length === 0) throw new Error('Add an appliance before logging a day.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Choose a valid day.');
    if (date > today()) throw new Error('You can only log today or earlier.');
    const existing = usageRecords.find((r) => toDayKey(r.date) === date);
    let record = buildDayRecord({
      id: existing?.id ?? `record-${date}`, date, appliances, hours, settings, source: 'logged', note: note?.trim() || undefined,
    });
    if (existing?.source === 'meter') {
      // The meter is ground truth for the total; keep the hours as the breakdown
      record = { ...record, source: 'meter', totalConsumption: existing.totalConsumption, totalCost: existing.totalCost, totalCO2: existing.totalCO2 };
    }
    const updated = [...usageRecords.filter((r) => toDayKey(r.date) !== date), record]
      .sort((a, b) => toDayKey(a.date).localeCompare(toDayKey(b.date)));
    set({ usageRecords: updated });
    await writeJson(STORAGE_KEYS.USAGE_RECORDS, updated);
    grantPoints(`log:${date}`, POINTS.dailyLog, `Logged ${date}`);
    await get().updateStreak();
    await get().checkPerformanceBadges(updated);
    get().syncProgress();
    await get().checkAchievements();
    return record;
  },

  deleteUsageRecord: async (id) => {
    const updated = get().usageRecords.filter((r) => r.id !== id);
    set({ usageRecords: updated });
    await writeJson(STORAGE_KEYS.USAGE_RECORDS, updated);
    get().syncProgress();
  },

  addMeterReading: async ({ value, takenAt, note }) => {
    const error = validateMeterReading(get().meterReadings, value, takenAt);
    if (error) throw new Error(error);
    const reading: MeterReading = { id: uid('meter'), takenAt, value, ...(note?.trim() ? { note: note.trim() } : {}) };
    const readings = [...get().meterReadings, reading].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
    set({ meterReadings: readings });
    await writeJson(STORAGE_KEYS.METER_READINGS, readings);
    const before = new Set(get().usageRecords.filter((r) => r.source === 'meter').map((r) => toDayKey(r.date)));
    await rebuildMeterRecords();
    const daysUpdated = get().usageRecords.filter((r) => r.source === 'meter' && !before.has(toDayKey(r.date))).length;
    grantPoints(`meter:${toDayKey(takenAt)}`, POINTS.meterReading, 'Meter reading');
    await get().updateStreak();
    get().syncProgress();
    await get().checkAchievements();
    return { daysUpdated };
  },

  deleteMeterReading: async (id) => {
    const readings = get().meterReadings.filter((r) => r.id !== id);
    set({ meterReadings: readings });
    await writeJson(STORAGE_KEYS.METER_READINGS, readings);
    await rebuildMeterRecords();
    get().syncProgress();
  },

  addBill: async ({ periodStart, periodEnd, kWh, amount }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodEnd < periodStart) {
      throw new Error('Choose a billing period that ends after it starts.');
    }
    if (!Number.isFinite(kWh) || kWh <= 0) throw new Error('Enter the kWh printed on your bill.');
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter the amount you were charged.');
    const bill: UtilityBill = { id: uid('bill'), periodStart, periodEnd, kWh, amount, createdAt: new Date().toISOString() };
    const updated = [...get().bills, bill].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
    set({ bills: updated });
    await writeJson(STORAGE_KEYS.BILLS, updated);
  },

  deleteBill: async (id) => {
    const updated = get().bills.filter((b) => b.id !== id);
    set({ bills: updated });
    await writeJson(STORAGE_KEYS.BILLS, updated);
  },

  saveUsageRecord: async () => {
    const { appliances, settings, usageRecords, updateStreak, checkPerformanceBadges } = get();
    if (appliances.length === 0) return;
    const date = today();
    const existing = usageRecords.find((item) => toDayKey(item.date) === date);
    if (existing && isMeasured(existing)) return;
    const consumptions = calculateEnergyConsumptions(appliances, settings.electricityRate, settings.co2Factor);
    const totalConsumption = consumptions.reduce((sum, c) => sum + c.dailyConsumption, 0);
    const totalCost = calculateCost(totalConsumption, settings.electricityRate);
    const totalCO2 = calculateCO2Emissions(totalConsumption, settings.co2Factor);

    const record: UsageRecord = {
      id: `record-${Date.now()}`,
      date,
      appliances: [...appliances],
      totalConsumption,
      totalCost,
      totalCO2,
      source: 'estimate',
      baselineKwh: totalConsumption,
    };

    const updated = [...usageRecords.filter((item) => toDayKey(item.date) !== record.date), record]
      .sort((a, b) => a.date.localeCompare(b.date));
    set({ usageRecords: updated });
    await writeHomeData(STORAGE_KEYS.USAGE_RECORDS, JSON.stringify(updated));
    await updateStreak();
    await checkPerformanceBadges(updated);
  },

  // ─── Reminders ──────────────────────────────────────────────────

  addReminder: async (reminderData) => {
    const newReminder = { ...reminderData, id: uid('reminder') };
    const updated = [...get().reminders, newReminder];
    set({ reminders: updated });
    await writeHomeData(STORAGE_KEYS.REMINDERS, JSON.stringify(updated));
  },

  updateReminder: async (id, updates) => {
    const updated = get().reminders.map((r) => (r.id === id ? { ...r, ...updates } : r));
    set({ reminders: updated });
    await writeHomeData(STORAGE_KEYS.REMINDERS, JSON.stringify(updated));
  },

  deleteReminder: async (id) => {
    const updated = get().reminders.filter((r) => r.id !== id);
    set({ reminders: updated });
    await writeHomeData(STORAGE_KEYS.REMINDERS, JSON.stringify(updated));
  },

  // ─── Goals ──────────────────────────────────────────────────────

  addGoal: async (goalData) => {
    if (!Number.isFinite(goalData.target) || goalData.target <= 0) throw new Error('Enter a limit greater than zero.');
    const newGoal: UserGoal = {
      ...goalData,
      id: uid('goal'),
      currentValue: 0,
      isAchieved: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [...get().goals, newGoal];
    set({ goals: updated });
    await writeHomeData(STORAGE_KEYS.GOALS, JSON.stringify(updated));
    get().syncGoals();
  },

  updateGoal: async (id, updates) => {
    const updated = get().goals.map((g) => (g.id === id ? { ...g, ...updates } : g));
    set({ goals: updated });
    await writeHomeData(STORAGE_KEYS.GOALS, JSON.stringify(updated));
    get().syncGoals();
  },

  deleteGoal: async (id) => {
    const updated = get().goals.filter((g) => g.id !== id);
    set({ goals: updated });
    await writeHomeData(STORAGE_KEYS.GOALS, JSON.stringify(updated));
    if (get().activeTimers.some((t) => t.goalId === id)) {
      const timers = get().activeTimers.filter((t) => t.goalId !== id);
      set({ activeTimers: timers });
      await writeJson(STORAGE_KEYS.TIMERS, timers);
    }
  },

  // ─── Settings ───────────────────────────────────────────────────

  updateSettings: async (updates) => {
    const { settings, refreshDashboard } = get();
    const updated = { ...settings, ...updates };
    set({ settings: updated });
    const deviceUpdates = pickDeviceSettings(updates);
    const homeUpdates = pickHomeSettings(updates);
    if (Object.keys(deviceUpdates).length > 0) {
      const operation = AsyncStorage.setItem(GLOBAL_KEYS.DEVICE_SETTINGS, JSON.stringify(pickDeviceSettings(updated)));
      pendingMutations.add(operation);
      await operation.finally(() => pendingMutations.delete(operation));
    }
    if (Object.keys(homeUpdates).length > 0 || Object.keys(deviceUpdates).length === 0) {
      await writeHomeData(STORAGE_KEYS.SETTINGS, JSON.stringify(pickHomeSettings(updated)));
    }
    if (updates.weatherLocation !== undefined && updates.weatherLocation !== settings.weatherLocation) {
      await get().refreshWeatherData();
      return;
    }
    refreshDashboard();
  },

  refreshWeatherData: async () => {
    const request = ++weatherRequest;
    const householdId = get().activeHouseholdId;
    const location = get().settings.weatherLocation;
    set({ isWeatherLoading: true });
    try {
      const data = await fetchWeatherData(location);
      if (request === weatherRequest && householdId === get().activeHouseholdId) set({ weatherData: data });
    } catch (error) {
      // fetchWeatherData falls back on its own; this only guards callers such as pull-to-refresh
      console.warn('Weather refresh failed:', error);
    } finally {
      if (request === weatherRequest) set({ isWeatherLoading: false });
    }
    if (request === weatherRequest && householdId === get().activeHouseholdId) get().refreshDashboard();
  },

  // ─── Streaks, badges and points ─────────────────────────────────

  updateStreak: async () => {
    const { streak, awardBadge } = get();
    const todayKey = today();
    if (streak.lastActivityDate === todayKey) return;

    const newStreak = { ...streak };
    if (streak.lastActivityDate === addDayKey(todayKey, -1)) {
      newStreak.currentStreak += 1;
      newStreak.longestStreak = Math.max(newStreak.longestStreak, newStreak.currentStreak);
    } else if (streak.lastActivityDate === '') {
      newStreak.currentStreak = 1;
      newStreak.longestStreak = 1;
    } else {
      newStreak.currentStreak = 1;
      newStreak.longestStreak = Math.max(newStreak.longestStreak, 1);
    }
    newStreak.lastActivityDate = todayKey;
    newStreak.totalDaysActive += 1;

    set({ streak: newStreak });
    await writeHomeData(STORAGE_KEYS.STREAK, JSON.stringify(newStreak));
    if (newStreak.currentStreak >= 7) await awardBadge('badge-2');
    if (newStreak.currentStreak >= 30) await awardBadge('badge-8');
  },

  awardBadges: async (badgeIds) => {
    const currentBadges = get().badges;
    const updated = currentBadges.map((badge) =>
      badgeIds.includes(badge.id) && !badge.isEarned
        ? { ...badge, isEarned: true, earnedAt: new Date().toISOString() }
        : badge
    );
    const newlyEarned = updated.filter((badge, i) => badge.isEarned !== currentBadges[i].isEarned);
    if (newlyEarned.length > 0) {
      set({ badges: updated });
      await writeHomeData(STORAGE_KEYS.BADGES, JSON.stringify(updated));
      for (const badge of newlyEarned) grantPoints(`badge:${badge.id}`, POINTS.badge, `Badge: ${badge.name}`);
    }
  },

  awardBadge: async (badgeId) => get().awardBadges([badgeId]),

  checkPerformanceBadges: async (records) => {
    const measured = normalizeRecords(records).filter(isMeasured);
    if (measured.length === 0) return;
    const { settings, awardBadges } = get();
    const latest = measured[measured.length - 1];
    const badgeIds: string[] = [];
    if (latest.baselineKwh && latest.baselineKwh > 0 && latest.totalConsumption <= latest.baselineKwh * 0.8) {
      badgeIds.push('badge-3');
    }
    const avoidedCO2 = measured.reduce((sum, record) => sum + Math.max(recordSavings(record), 0) * settings.co2Factor, 0);
    if (co2ToTrees(avoidedCO2) >= 10) badgeIds.push('badge-4');
    if (measured.length >= 30) badgeIds.push('badge-12');
    if (badgeIds.length > 0) await awardBadges(badgeIds);
  },

  checkAchievements: async () => {
    const { appliances, meterReadings, rooms, challenges, points, communityGoals, streak } = get();
    const ids: string[] = [];
    if (appliances.length > 0) ids.push('badge-1');
    if (streak.currentStreak >= 7) ids.push('badge-2');
    if (meterReadings.length > 0) ids.push('badge-5');
    if (rooms.filter((room) => room.appliances.length > 0).length >= 3) ids.push('badge-6');
    if (challenges.some((c) => c.isCompleted)) ids.push('badge-7');
    if (streak.currentStreak >= 30) ids.push('badge-8');
    if (points.events.filter((e) => e.key.startsWith('rec:')).length >= 3) ids.push('badge-9');
    if (communityGoals.some((g) => (g.contributions ?? []).some((c) => c.source === 'auto' ||
        (c.source === 'manual' && c.participant === (g.me || myName()))))) ids.push('badge-10');
    if (appliances.some((a) => a.hardwareLink)) ids.push('badge-11');
    const unearned = ids.filter((id) => !get().badges.find((b) => b.id === id)?.isEarned);
    if (unearned.length > 0) await get().awardBadges(unearned);
  },

  awardPoints: async (key, points, reason) => { grantPoints(key, points, reason); },

  // ─── Rooms ──────────────────────────────────────────────────────

  addRoom: async (room) => {
    const updated = [...get().rooms, room];
    set({ rooms: updated });
    await writeHomeData(STORAGE_KEYS.ROOMS, JSON.stringify(updated));
    await get().checkAchievements();
  },
  updateRoom: async (id, updates) => {
    const updated = get().rooms.map((r) => (r.id === id ? { ...r, ...updates } : r));
    set({ rooms: updated });
    await writeHomeData(STORAGE_KEYS.ROOMS, JSON.stringify(updated));
  },
  deleteRoom: async (id) => {
    const updated = get().rooms.filter((r) => r.id !== id);
    set({ rooms: updated });
    await writeHomeData(STORAGE_KEYS.ROOMS, JSON.stringify(updated));
  },
  assignApplianceToRoom: async (applianceId, roomId) => {
    const updated = get().rooms.map((room) => {
      const roomApplianceIds = room.appliances.filter(id => id !== applianceId);
      if (room.id === roomId) return { ...room, appliances: [...roomApplianceIds, applianceId] };
      return { ...room, appliances: roomApplianceIds };
    });
    set({ rooms: updated });
    await writeHomeData(STORAGE_KEYS.ROOMS, JSON.stringify(updated));
    await get().checkAchievements();
  },
  unassignAppliance: async (applianceId) => {
    const updated = get().rooms.map((room) => ({ ...room, appliances: room.appliances.filter((id) => id !== applianceId) }));
    set({ rooms: updated });
    await writeJson(STORAGE_KEYS.ROOMS, updated);
  },

  // ─── Shared goals ───────────────────────────────────────────────

  addCommunityGoal: async (goalData) => {
    if (!goalData.title?.trim()) throw new Error('Give the goal a name.');
    if (!Number.isFinite(goalData.targetEnergy) || goalData.targetEnergy <= 0) throw new Error('Enter a kWh target greater than zero.');
    if (!Number.isFinite(Date.parse(goalData.deadline))) throw new Error('Choose a deadline.');
    const id = goalData.id ?? uid('community-goal');
    if (get().communityGoals.some((g) => g.id === id)) throw new Error('You have already joined this goal.');
    const contributions = goalData.contributions ?? [];
    const newGoal: CommunityGoal = {
      ...goalData,
      id,
      title: goalData.title.trim(),
      participants: [...new Set(goalData.participants.map((p) => p.trim()).filter(Boolean))],
      contributions,
      currentEnergy: round(contributions.reduce((sum, c) => sum + c.kWh, 0), 3),
      isAchieved: false,
      createdAt: goalData.createdAt ?? new Date().toISOString(),
    };
    const updated = [...get().communityGoals, newGoal];
    set({ communityGoals: updated });
    await writeHomeData(STORAGE_KEYS.COMMUNITY_GOALS, JSON.stringify(updated));
    syncCommunityInternal();
    return id;
  },
  updateCommunityGoal: async (id, updates) => {
    const updated = get().communityGoals.map((g) => (g.id === id ? { ...g, ...updates } : g));
    set({ communityGoals: updated });
    await writeHomeData(STORAGE_KEYS.COMMUNITY_GOALS, JSON.stringify(updated));
    syncCommunityInternal();
  },
  deleteCommunityGoal: async (id) => {
    const updated = get().communityGoals.filter((g) => g.id !== id);
    set({ communityGoals: updated });
    await writeJson(STORAGE_KEYS.COMMUNITY_GOALS, updated);
  },
  addContribution: async (goalId, { participant, kWh, note }) => {
    const name = participant.trim();
    if (!name) throw new Error('Who saved this energy?');
    if (!Number.isFinite(kWh) || kWh <= 0) throw new Error('Enter the kWh saved (more than zero).');
    const goal = get().communityGoals.find((g) => g.id === goalId);
    if (!goal) throw new Error('This goal no longer exists.');
    const contribution: CommunityContribution = {
      id: uid('contribution'), participant: name, kWh: round(kWh, 3), date: new Date().toISOString(), source: 'manual',
      ...(note?.trim() ? { note: note.trim() } : {}),
    };
    await get().updateCommunityGoal(goalId, {
      contributions: [...(goal.contributions ?? []), contribution],
      participants: [...new Set([...goal.participants, name])],
    });
    if (name === (goal.me || myName())) grantPoints(`contrib:${goalId}:${today()}`, POINTS.contribution, `Contributed to “${goal.title}”`);
    await get().checkAchievements();
  },
  removeContribution: async (goalId, contributionId) => {
    const goal = get().communityGoals.find((g) => g.id === goalId);
    if (!goal) return;
    await get().updateCommunityGoal(goalId, {
      contributions: (goal.contributions ?? []).filter((c) => c.id !== contributionId),
    });
  },

  // ─── Challenges ─────────────────────────────────────────────────

  addChallenge: async (challengeData) => {
    if (!challengeData.title?.trim()) throw new Error('Give the challenge a name.');
    if (!Number.isFinite(challengeData.target) || challengeData.target <= 0) throw new Error('Enter a target greater than zero.');
    if (!Number.isFinite(challengeData.duration) || challengeData.duration < 1) throw new Error('A challenge lasts at least one day.');
    const { usageRecords, appliances } = get();
    const newChallenge: Challenge = {
      ...challengeData,
      title: challengeData.title.trim(),
      id: uid('challenge'),
      currentProgress: 0,
      isCompleted: false,
      status: 'active',
      checkIns: challengeData.checkIns ?? [],
      baselineDaily: challengeData.baselineDaily ?? round(typicalDailyKwh(usageRecords, appliances, toDayKey(challengeData.startDate)), 3),
      points: challengeData.points ?? challengePoints(challengeData),
    };
    const updated = [...get().challenges, newChallenge];
    set({ challenges: updated });
    await writeHomeData(STORAGE_KEYS.CHALLENGES, JSON.stringify(updated));
    syncChallengesInternal();
  },
  updateChallenge: async (id, updates) => {
    const updated = get().challenges.map((c) => (c.id === id ? { ...c, ...updates } : c));
    set({ challenges: updated });
    await writeHomeData(STORAGE_KEYS.CHALLENGES, JSON.stringify(updated));
  },
  completeChallenge: async (id) => {
    const challenge = get().challenges.find((c) => c.id === id);
    if (!challenge || challenge.isCompleted) return;
    await get().updateChallenge(id, { isCompleted: true, status: 'completed', completedAt: new Date().toISOString() });
    grantPoints(`challenge:${id}`, challenge.points ?? challengePoints(challenge), `Completed “${challenge.title}”`);
    await get().checkAchievements();
  },
  deleteChallenge: async (id) => {
    const updated = get().challenges.filter((c) => c.id !== id);
    set({ challenges: updated });
    await writeHomeData(STORAGE_KEYS.CHALLENGES, JSON.stringify(updated));
  },
  checkInChallenge: async (id) => {
    const challenge = get().challenges.find((c) => c.id === id);
    if (!challenge) throw new Error('This challenge no longer exists.');
    if (challenge.type !== 'custom') throw new Error('This challenge tracks itself from your logs.');
    if (challenge.isCompleted) return;
    const todayKey = today();
    if (todayKey < toDayKey(challenge.startDate) || todayKey > periodLastDay(challenge.startDate, challenge.endDate)) {
      throw new Error('This challenge is not running today.');
    }
    if ((challenge.checkIns ?? []).includes(todayKey)) throw new Error('Already checked in today. Come back tomorrow!');
    await get().updateChallenge(id, { checkIns: [...(challenge.checkIns ?? []), todayKey] });
    grantPoints(`checkin:${id}:${todayKey}`, POINTS.checkIn, `Checked in: ${challenge.title}`);
    await get().updateStreak();
    syncChallengesInternal();
    await get().checkAchievements();
  },

  // ─── Impact ─────────────────────────────────────────────────────

  generateDailySnapshot: async () => {
    const { appliances, settings, streak, usageRecords } = get();
    const date = today();
    const record = normalizeRecords(usageRecords).find((r) => toDayKey(r.date) === date);
    const profile = profileDailyKwh(appliances);
    const energy = record ? record.totalConsumption : profile;
    const saved = record ? recordSavings(record) : 0;
    const consumptions = calculateEnergyConsumptions(appliances, settings.electricityRate, settings.co2Factor);
    const top = [...consumptions].sort((a, b) => b.dailyConsumption - a.dailyConsumption)[0];
    // Name the biggest real cut today (logged hours below usual), else the biggest consumer to watch
    let action = top ? `Watch ${top.applianceName}: ${round(top.dailyConsumption, 1)} kWh a day` : 'Add appliances to get started';
    if (record?.applianceHours) {
      const cuts = appliances
        .map((a) => ({ a, kWh: ((a.isActive ? a.hoursPerDay : 0) - (record.applianceHours![a.id] ?? 0)) * a.powerRating * a.quantity / 1000 }))
        .filter((x) => x.kWh > 0.05)
        .sort((x, y) => y.kWh - x.kWh);
      if (cuts[0]) action = `Cut ${cuts[0].a.name} by ${round(cuts[0].kWh, 2)} kWh`;
    }
    return {
      id: `snapshot-${Date.now()}`,
      date,
      energyConsumed: round(energy, 3),
      moneySaved: round(Math.max(saved, 0) * settings.electricityRate, 3),
      co2Avoided: round(Math.max(saved, 0) * settings.co2Factor, 3),
      energySaved: round(saved, 3),
      topSavingAction: action,
      streakDays: streak.currentStreak,
      source: record?.source ?? 'estimate',
    };
  },
  saveDailySnapshot: async (snapshot) => {
    const updated = [...get().snapshots.filter((s) => s.date !== snapshot.date), snapshot];
    set({ snapshots: updated });
    await writeHomeData(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(updated));
  },

  issueSavingsCertificate: async () => {
    const { usageRecords, certificates, settings } = get();
    const draft = draftCertificate(usageRecords, certificates, settings, today());
    if (!draft) {
      throw new Error('There are no new measured savings to certify yet. Log a few days below your usual use (today is certified tomorrow).');
    }
    const certificate = issueCertificate(draft, certificates, new Date());
    const updated = [...certificates, certificate];
    set({ certificates: updated });
    await writeJson(STORAGE_KEYS.CERTIFICATES, updated);
    grantPoints(`cert:${certificate.id}`, POINTS.certificate, 'Savings certificate');
    return certificate;
  },

  addCountdownTimer: async (timerData) => {
    const newTimer: CountdownTimer = { ...timerData, id: uid('timer') };
    const updated = [...get().activeTimers.filter((t) => t.goalId !== timerData.goalId), newTimer];
    set({ activeTimers: updated });
    await writeHomeData(STORAGE_KEYS.TIMERS, JSON.stringify(updated));
  },
  updateTimer: async (id) => {
    const timer = get().activeTimers.find(t => t.id === id);
    if (!timer) return;
    const now = new Date();
    const target = new Date(timer.targetTime);
    const diff = target.getTime() - now.getTime();
    if (diff <= 0) {
      await get().removeTimer(id);
      return;
    }
    const remainingHours = Math.floor(diff / (1000 * 60 * 60));
    const remainingMinutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    // Progress follows the linked goal, whose value syncGoals keeps current
    const goal = get().goals.find((g) => g.id === timer.goalId);
    const currentValue = goal ? goal.currentValue : timer.currentValue;
    const updated = get().activeTimers.map((t) => t.id === id
      ? { ...t, remainingHours, remainingMinutes, currentValue, currentTime: now.toISOString() }
      : t);
    set({ activeTimers: updated });
    await writeHomeData(STORAGE_KEYS.TIMERS, JSON.stringify(updated));
  },
  removeTimer: async (id) => {
    const updated = get().activeTimers.filter(t => t.id !== id);
    set({ activeTimers: updated });
    await writeHomeData(STORAGE_KEYS.TIMERS, JSON.stringify(updated));
  },

  // ─── Insights ───────────────────────────────────────────────────

  dismissInsight: async (id) => {
    const s = get().insightState;
    await saveInsights({ ...s, dismissed: { ...s.dismissed, [id]: new Date().toISOString() } });
  },
  restoreInsight: async (id) => {
    const s = get().insightState;
    await saveInsights({ ...s, dismissed: omit(s.dismissed, id) });
  },
  markInsightDone: async (id, reason = 'Put a tip into practice') => {
    const s = get().insightState;
    if (s.done[id]) return;
    await saveInsights({ ...s, done: { ...s.done, [id]: new Date().toISOString() } });
    grantPoints(`tip:${id}`, POINTS.tipDone, reason);
  },
  undoInsightDone: async (id) => {
    const s = get().insightState;
    await saveInsights({ ...s, done: omit(s.done, id) });
    revokePoints(`tip:${id}`);
  },
  toggleInsightSaved: async (id) => {
    const s = get().insightState;
    if (s.saved[id]) {
      await saveInsights({ ...s, saved: omit(s.saved, id) });
    } else {
      await saveInsights({ ...s, saved: { ...s.saved, [id]: new Date().toISOString() } });
    }
  },
  applyApplianceChange: async (insightId, applianceId, changes, savingsKwh, reason) => {
    const appliance = get().appliances.find((a) => a.id === applianceId);
    if (!appliance) throw new Error('That appliance was removed.');
    const before = Object.fromEntries(
      Object.keys(changes).map((key) => [key, appliance[key as keyof Appliance]]),
    ) as Partial<Appliance>;
    await get().updateAppliance(applianceId, changes);
    const s = get().insightState;
    await saveInsights({
      ...s,
      done: { ...s.done, [insightId]: new Date().toISOString() },
      undo: { ...s.undo, [insightId]: { applianceId, before, appliedAt: new Date().toISOString(), savingsKwh: round(savingsKwh, 3) } },
    });
    grantPoints(`rec:${insightId}`, POINTS.recommendation, reason);
    await get().checkAchievements();
  },
  undoInsight: async (insightId) => {
    const s = get().insightState;
    const entry = s.undo[insightId];
    if (entry && get().appliances.some((a) => a.id === entry.applianceId)) {
      await get().updateAppliance(entry.applianceId, entry.before);
    }
    await saveInsights({ ...get().insightState, undo: omit(s.undo, insightId), done: omit(s.done, insightId) });
    revokePoints(`rec:${insightId}`);
  },

  // ─── Social ─────────────────────────────────────────────────────

  getScoreSummary: () => {
    const { usageRecords, settings, points, streak, badges } = get();
    const todayKey = today();
    const week = summarizeRange(usageRecords, addDayKey(todayKey, -6), todayKey, settings);
    const month = summarizeRange(usageRecords, addDayKey(todayKey, -29), todayKey, settings);
    const level = levelFor(points.total);
    return {
      name: myName(),
      points: points.total,
      level: level.level,
      levelName: level.name,
      weekSavedKwh: round(Math.max(week.netSavedKwh, 0), 2),
      savingsPercent: month.baselineKwh > 0 ? round((month.netSavedKwh / month.baselineKwh) * 100, 1) : 0,
      streak: streak.currentStreak,
      badges: badges.filter((b) => b.isEarned).length,
    };
  },
  getScoreCode: () => {
    const score = get().getScoreSummary();
    return encodeShareCode('S', {
      v: 1, id: get().profileId || 'sv-anonymous', name: score.name.slice(0, 40), points: score.points, level: score.level,
      weekSavedKwh: score.weekSavedKwh, savingsPercent: Math.max(Math.min(score.savingsPercent, 100), -100),
      streak: score.streak, badges: score.badges, at: new Date().toISOString(),
    });
  },
  getGoalInviteCode: (goalId) => {
    const goal = get().communityGoals.find((g) => g.id === goalId);
    if (!goal) throw new Error('This goal no longer exists.');
    return encodeShareCode('G', {
      v: 1, id: goal.id, title: goal.title.slice(0, 80), description: goal.description.slice(0, 500),
      targetEnergy: goal.targetEnergy, deadline: goal.deadline, createdBy: goal.createdBy.slice(0, 40), createdAt: goal.createdAt,
    });
  },
  getContributionCode: (goalId) => {
    const goal = get().communityGoals.find((g) => g.id === goalId);
    if (!goal) throw new Error('This goal no longer exists.');
    const me = goal.me || myName();
    const kWh = round((goal.contributions ?? []).filter((c) => c.participant === me && c.source !== 'import')
      .reduce((sum, c) => sum + c.kWh, 0), 3);
    return encodeShareCode('C', { v: 1, goalId: goal.id, participant: me.slice(0, 40), kWh, at: new Date().toISOString() });
  },
  importShareCode: async (text) => {
    const decoded = decodeShareCode(text);
    if (decoded.kind === 'S') {
      const p = decodeShareCode(text, 'S').payload;
      if (p.id === get().profileId) throw new Error('That is your own score card. Share it with friends instead.');
      const friend: FriendScore = {
        id: p.id, name: p.name.trim(), points: p.points, level: p.level, weekSavedKwh: p.weekSavedKwh,
        savingsPercent: p.savingsPercent, streak: p.streak, badges: p.badges, generatedAt: p.at,
        importedAt: new Date().toISOString(),
      };
      const existing = get().friends.find((f) => f.id === p.id);
      if (existing && existing.generatedAt > p.at) throw new Error(`You already have a newer score from ${existing.name}.`);
      const friends = [...get().friends.filter((f) => f.id !== p.id), friend];
      set({ friends });
      const operation = AsyncStorage.setItem(GLOBAL_KEYS.FRIENDS, JSON.stringify(friends));
      pendingMutations.add(operation);
      await operation.finally(() => pendingMutations.delete(operation));
      return { kind: 'score', title: friend.name, message: existing ? `Updated ${friend.name}'s score.` : `${friend.name} joined your leaderboard.` };
    }
    if (decoded.kind === 'G') {
      const p = decodeShareCode(text, 'G').payload;
      const me = myName();
      await get().addCommunityGoal({
        id: p.id, title: p.title, description: p.description, targetEnergy: p.targetEnergy, deadline: p.deadline,
        createdBy: p.createdBy, createdAt: p.createdAt, participants: [p.createdBy, me], contributions: [], me,
      });
      return { kind: 'goal', title: p.title, message: `You joined “${p.title}”. Your logged savings now count towards it.` };
    }
    const p = decodeShareCode(text, 'C').payload;
    const goal = get().communityGoals.find((g) => g.id === p.goalId);
    if (!goal) throw new Error('Join this goal first: ask for its invite code.');
    if (p.participant === (goal.me || myName())) throw new Error('That is your own contribution code. Send it to your teammates.');
    const contribution: CommunityContribution = {
      id: `import-${goal.id}-${slug(p.participant)}`, participant: p.participant, kWh: round(p.kWh, 3), date: p.at, source: 'import',
    };
    const previous = (goal.contributions ?? []).find((c) => c.id === contribution.id);
    if (previous && previous.date > p.at) throw new Error(`You already have a newer update from ${p.participant}.`);
    await get().updateCommunityGoal(goal.id, {
      contributions: [...(goal.contributions ?? []).filter((c) => c.id !== contribution.id), contribution],
      participants: [...new Set([...goal.participants, p.participant])],
    });
    return { kind: 'contribution', title: goal.title, message: `${p.participant} has saved ${round(p.kWh, 1)} kWh for “${goal.title}”.` };
  },
  removeFriend: async (id) => {
    const friends = get().friends.filter((f) => f.id !== id);
    set({ friends });
    await AsyncStorage.setItem(GLOBAL_KEYS.FRIENDS, JSON.stringify(friends));
  },

  // ─── Assistant & smart home ─────────────────────────────────────

  appendChatMessages: async (messages) => {
    const updated = [...get().chatMessages, ...messages].slice(-MAX_CHAT_MESSAGES);
    set({ chatMessages: updated });
    await writeJson(STORAGE_KEYS.CHAT, updated);
  },
  updateChatMessage: async (id, updates) => {
    const updated = get().chatMessages.map((m) => (m.id === id ? { ...m, ...updates } : m));
    set({ chatMessages: updated });
    await writeJson(STORAGE_KEYS.CHAT, updated);
  },
  clearChat: async () => {
    set({ chatMessages: [] });
    await writeJson(STORAGE_KEYS.CHAT, []);
  },
  updateSmartHome: async (updates) => {
    const updated = { ...get().smartHome, ...updates };
    set({ smartHome: updated });
    await writeJson(STORAGE_KEYS.SMART_HOME, updated);
  },

  completeOnboarding: async () => {
    set({ hasSeenOnboarding: true });
    await writeHomeData(STORAGE_KEYS.ONBOARDING, 'true');
  },
  resetOnboarding: async () => {
    await AsyncStorage.removeItem(GLOBAL_KEYS.ONBOARDING);
    set({ hasSeenOnboarding: false });
  },
  });
});

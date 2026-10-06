import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
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
  Challenge,
  DailySnapshot,
  CountdownTimer,
  Household,
  HouseholdData,
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
  ONBOARDING: '@energy_app_onboarding',
};

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

const INITIAL_BADGES: Badge[] = [
  { id: 'badge-1', name: 'First Steps', description: 'Added your first appliance', icon: '🌱', isEarned: false },
  { id: 'badge-2', name: 'Week Warrior', description: 'Maintained streak for 7 days', icon: '🔥', isEarned: false },
  { id: 'badge-3', name: 'Energy Saver', description: 'Reduced consumption by 20%', icon: '⚡', isEarned: false },
  { id: 'badge-4', name: 'Green Champion', description: 'Saved equivalent of 10 trees', icon: '🌳', isEarned: false },
];

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
  hasSeenOnboarding: boolean;
  isLoading: boolean;
  isWeatherLoading: boolean;

  // Actions
  createHousehold: (name: string) => Promise<string>;
  switchHousehold: (id: string) => Promise<void>;
  renameHousehold: (id: string, name: string) => Promise<void>;
  deleteHousehold: (id: string) => Promise<void>;
  updateHouseholdCloudLink: (id: string, ownerId: string, cloudId: string, revision: number) => Promise<void>;
  exportHouseholdData: () => HouseholdData;
  captureHouseholdData: () => Promise<{ household: Household; data: HouseholdData }>;
  restoreHousehold: (name: string, data: HouseholdData, cloud?: { ownerId: string; id: string; revision: number }) => Promise<string>;
  loadAllData: () => Promise<void>;
  loadDemoData: () => Promise<void>;
  refreshDashboard: () => void;
  syncGoals: () => void;
  
  addAppliance: (appliance: Omit<Appliance, 'id' | 'createdAt'>) => Promise<void>;
  updateAppliance: (id: string, updates: Partial<Appliance>) => Promise<void>;
  deleteAppliance: (id: string) => Promise<void>;
  toggleAppliance: (id: string) => Promise<void>;
  
  addReminder: (reminder: Omit<Reminder, 'id'>) => Promise<void>;
  updateReminder: (id: string, updates: Partial<Reminder>) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  
  addGoal: (goal: Omit<UserGoal, 'id' | 'createdAt' | 'currentValue' | 'isAchieved'>) => Promise<void>;
  updateGoal: (id: string, updates: Partial<UserGoal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  
  addRoom: (room: Room) => Promise<void>;
  updateRoom: (id: string, updates: Partial<Room>) => Promise<void>;
  deleteRoom: (id: string) => Promise<void>;
  assignApplianceToRoom: (applianceId: string, roomId: string) => Promise<void>;
  
  addCommunityGoal: (goal: Omit<CommunityGoal, 'id' | 'createdAt' | 'currentEnergy' | 'isAchieved'>) => Promise<void>;
  updateCommunityGoal: (id: string, updates: Partial<CommunityGoal>) => Promise<void>;
  
  addChallenge: (challenge: Omit<Challenge, 'id' | 'currentProgress' | 'isCompleted'>) => Promise<void>;
  updateChallenge: (id: string, updates: Partial<Challenge>) => Promise<void>;
  completeChallenge: (id: string) => Promise<void>;
  deleteChallenge: (id: string) => Promise<void>;
  
  generateDailySnapshot: () => Promise<DailySnapshot>;
  saveDailySnapshot: (snapshot: DailySnapshot) => Promise<void>;
  
  addCountdownTimer: (timer: Omit<CountdownTimer, 'id'>) => Promise<void>;
  updateTimer: (id: string) => Promise<void>;
  removeTimer: (id: string) => Promise<void>;
  
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  refreshWeatherData: () => Promise<void>;
  saveUsageRecord: () => Promise<void>;
  updateStreak: () => Promise<void>;
  
  awardBadge: (badgeId: string) => Promise<void>;
  awardBadges: (badgeIds: string[]) => Promise<void>;
  checkPerformanceBadges: (records: UsageRecord[]) => Promise<void>;
  completeOnboarding: () => Promise<void>;
}

export const useEnergyStore = create<EnergyStore>((set, get) => {
  const pendingMutations = new Set<Promise<unknown>>();
  let transitioning = false;
  let weatherRequest = 0;
  const storageKey = (key: string, id = get().activeHouseholdId) =>
    key === STORAGE_KEYS.ONBOARDING ? key : householdStorageKey(key, id);

  const writeHomeData = (key: string, value: string, id = get().activeHouseholdId) => {
    const operation = AsyncStorage.setItem(storageKey(key, id), value);
    pendingMutations.add(operation);
    return operation.finally(() => pendingMutations.delete(operation));
  };

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
  const trackActions = (state: EnergyStore): EnergyStore => {
    const keys = [
      'loadDemoData', 'addAppliance', 'updateAppliance', 'deleteAppliance', 'toggleAppliance',
      'addReminder', 'updateReminder', 'deleteReminder', 'addGoal', 'updateGoal', 'deleteGoal',
      'updateSettings', 'saveUsageRecord', 'updateStreak', 'awardBadge', 'awardBadges',
      'checkPerformanceBadges', 'addRoom', 'updateRoom', 'deleteRoom', 'assignApplianceToRoom',
      'addCommunityGoal', 'updateCommunityGoal', 'addChallenge', 'updateChallenge',
      'completeChallenge', 'deleteChallenge', 'saveDailySnapshot', 'addCountdownTimer',
      'updateTimer', 'removeTimer',
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
  return trackActions({
  households: [DEFAULT_HOUSEHOLD],
  activeHouseholdId: DEFAULT_HOUSEHOLD.id,
  isSwitchingHousehold: false,
  appliances: [],
  usageRecords: [],
  tips: [],
  reminders: [],
  goals: [],
  streak: { currentStreak: 0, longestStreak: 0, lastActivityDate: '', totalDaysActive: 0 },
  badges: INITIAL_BADGES,
  settings: DEFAULT_SETTINGS,
  weatherData: null,
  dashboardData: null,
  rooms: [],
  communityGoals: [],
  challenges: [],
  snapshots: [],
  activeTimers: [],
  hasSeenOnboarding: false,
  isLoading: true,
  isWeatherLoading: false,

  createHousehold: (name) => transition(async () => {
    const cleaned = validateHouseholdName(name, get().households);
    const id = `home-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const household: Household = { id, name: cleaned, createdAt: new Date().toISOString() };
    await AsyncStorage.setItem(storageKey(STORAGE_KEYS.SETTINGS, id), JSON.stringify(get().settings));
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
    // Only this home's data is removed; onboarding is shared by all homes.
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS)
      .filter(key => key !== STORAGE_KEYS.ONBOARDING).map(key => storageKey(key, id)));
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
      [STORAGE_KEYS.TIMERS, data.activeTimers], [STORAGE_KEYS.SETTINGS, { ...get().settings, ...data.settings }],
    ];
    await AsyncStorage.multiSet(values.map(([key, value]) => [storageKey(key, id), JSON.stringify(value)]));
    const households = [...get().households, household];
    await AsyncStorage.setItem(HOUSEHOLDS_KEY, JSON.stringify(households));
    set({ households });
    return id;
  }),

  refreshDashboard: () => {
    const { appliances, settings, weatherData } = get();
    if (appliances.length === 0) {
      set({ dashboardData: null, tips: [] });
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
      ? getWeatherBasedTips(weatherData.temperature, weatherData.season, weatherData.humidity)
      : [];
    const predictiveTips = PredictionEngine.generatePredictiveTips(appliances, weatherData, settings.electricityRate, settings.co2Factor);
    set({ tips: [...energyTips, ...weatherTips, ...predictiveTips] });
    get().syncGoals();
  },

  syncGoals: () => {
    const { dashboardData, goals } = get();
    if (!dashboardData || goals.length === 0) return;

    const updatedGoals = goals.map((goal) => {
      const currentValue = goal.type === 'consumption'
        ? dashboardData.totalEnergyConsumed
        : goal.type === 'cost'
          ? dashboardData.totalCost
          : dashboardData.totalCO2Saved;
      const isAchieved = currentValue <= goal.target;
      return { ...goal, currentValue, isAchieved };
    });

    const hasChanged = updatedGoals.some((goal, index) =>
      goal.currentValue !== goals[index].currentValue || goal.isAchieved !== goals[index].isAchieved
    );

    if (hasChanged) {
      set({ goals: updatedGoals });
      writeHomeData(STORAGE_KEYS.GOALS, JSON.stringify(updatedGoals)).catch(console.error);
    }
  },

  loadAllData: async () => {
    try {
      if (!get().isSwitchingHousehold) set({ isLoading: true });
      const [rawHomes, storedActive] = await Promise.all([
        AsyncStorage.getItem(HOUSEHOLDS_KEY), AsyncStorage.getItem(ACTIVE_HOUSEHOLD_KEY),
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
        storedOnboarding,
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
      ]);

      const loadedSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...parseStored<Partial<AppSettings>>(storedSettings, {}),
      };

      set({
        households, activeHouseholdId,
        weatherData: null,
        appliances: parseStored(storedAppliances, []),
        usageRecords: parseStored(storedRecords, []),
        reminders: parseStored(storedReminders, []),
        goals: parseStored(storedGoals, []),
        streak: parseStored(storedStreak, { currentStreak: 0, longestStreak: 0, lastActivityDate: '', totalDaysActive: 0 }),
        badges: parseStored(storedBadges, INITIAL_BADGES),
        settings: loadedSettings,
        rooms: parseStored(storedRooms, []),
        communityGoals: parseStored(storedCommunityGoals, []),
        challenges: parseStored(storedChallenges, []),
        snapshots: parseStored(storedSnapshots, []),
        activeTimers: parseStored(storedTimers, []),
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
    const { appliances, usageRecords } = generateDemoData();
    set({ appliances, usageRecords });
    await writeHomeData(STORAGE_KEYS.APPLIANCES, JSON.stringify(appliances));
    await writeHomeData(STORAGE_KEYS.USAGE_RECORDS, JSON.stringify(usageRecords));
    get().refreshDashboard();
  },

  addAppliance: async (applianceData) => {
    const { appliances, awardBadge, updateStreak, refreshDashboard } = get();
    const newAppliance: Appliance = {
      ...applianceData,
      id: `appliance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [...appliances, newAppliance];
    set({ appliances: updated });
    await writeHomeData(STORAGE_KEYS.APPLIANCES, JSON.stringify(updated));
    if (updated.length === 1) await awardBadge('badge-1');
    await updateStreak();
    refreshDashboard();
  },

  updateAppliance: async (id, updates) => {
    const { appliances, refreshDashboard } = get();
    const updated = appliances.map((app) => (app.id === id ? { ...app, ...updates } : app));
    set({ appliances: updated });
    await writeHomeData(STORAGE_KEYS.APPLIANCES, JSON.stringify(updated));
    refreshDashboard();
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

  addReminder: async (reminderData) => {
    const newReminder = { ...reminderData, id: `reminder-${Date.now()}` };
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

  addGoal: async (goalData) => {
    const newGoal: UserGoal = {
      ...goalData,
      id: `goal-${Date.now()}`,
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
  },

  updateSettings: async (updates) => {
    const { settings, refreshDashboard } = get();
    const updated = { ...settings, ...updates };
    set({ settings: updated });
    await writeHomeData(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
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

  saveUsageRecord: async () => {
    const { appliances, settings, usageRecords, updateStreak, checkPerformanceBadges } = get();
    if (appliances.length === 0) return;
    const consumptions = calculateEnergyConsumptions(appliances, settings.electricityRate, settings.co2Factor);
    const totalConsumption = consumptions.reduce((sum, c) => sum + c.dailyConsumption, 0);
    const totalCost = calculateCost(totalConsumption, settings.electricityRate);
    const totalCO2 = calculateCO2Emissions(totalConsumption, settings.co2Factor);

    const record: UsageRecord = {
      id: `record-${Date.now()}`,
      date: format(new Date(), 'yyyy-MM-dd'),
      appliances: [...appliances],
      totalConsumption,
      totalCost,
      totalCO2,
    };

    const updated = [...usageRecords.filter((item) => item.date !== record.date), record]
      .sort((a, b) => a.date.localeCompare(b.date));
    set({ usageRecords: updated });
    await writeHomeData(STORAGE_KEYS.USAGE_RECORDS, JSON.stringify(updated));
    await updateStreak();
    await checkPerformanceBadges(updated);
  },

  updateStreak: async () => {
    const { streak, awardBadge } = get();
    const today = format(new Date(), 'yyyy-MM-dd');
    if (streak.lastActivityDate === today) return;

    let newStreak = { ...streak };
    if (streak.lastActivityDate === format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')) {
      newStreak.currentStreak += 1;
      newStreak.longestStreak = Math.max(newStreak.longestStreak, newStreak.currentStreak);
    } else if (streak.lastActivityDate === '') {
      newStreak.currentStreak = 1;
      newStreak.longestStreak = 1;
    } else {
      newStreak.currentStreak = 1;
    }
    newStreak.lastActivityDate = today;
    newStreak.totalDaysActive += 1;

    set({ streak: newStreak });
    await writeHomeData(STORAGE_KEYS.STREAK, JSON.stringify(newStreak));
    if (newStreak.currentStreak >= 7) await awardBadge('badge-2');
  },

  awardBadges: async (badgeIds) => {
    const currentBadges = get().badges;
    const updated = currentBadges.map((badge) =>
      badgeIds.includes(badge.id) && !badge.isEarned
        ? { ...badge, isEarned: true, earnedAt: new Date().toISOString() }
        : badge
    );
    if (updated.some((badge, i) => badge.isEarned !== currentBadges[i].isEarned)) {
      set({ badges: updated });
      await writeHomeData(STORAGE_KEYS.BADGES, JSON.stringify(updated));
    }
  },

  awardBadge: async (badgeId) => get().awardBadges([badgeId]),

  checkPerformanceBadges: async (records) => {
    if (records.length < 2) return;
    const { settings, awardBadges } = get();
    const ordered = [...records].sort((a, b) => a.date.localeCompare(b.date));
    const latest = ordered[ordered.length - 1];
    const baselineRecords = ordered.slice(Math.max(0, ordered.length - 8), -1);
    const baseline = baselineRecords.reduce((sum, record) => sum + record.totalConsumption, 0) / baselineRecords.length;
    if (baseline <= 0) return;

    const badgeIds: string[] = [];
    if (latest.totalConsumption <= baseline * 0.8) badgeIds.push('badge-3');
    const avoidedCO2 = ordered.reduce(
      (sum, record) => sum + Math.max(baseline - record.totalConsumption, 0) * settings.co2Factor, 0
    );
    if (co2ToTrees(avoidedCO2) >= 10) badgeIds.push('badge-4');
    if (badgeIds.length > 0) await awardBadges(badgeIds);
  },

  addRoom: async (room) => {
    const updated = [...get().rooms, room];
    set({ rooms: updated });
    await writeHomeData(STORAGE_KEYS.ROOMS, JSON.stringify(updated));
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
  },

  addCommunityGoal: async (goalData) => {
    const newGoal: CommunityGoal = { ...goalData, id: `community-goal-${Date.now()}`, currentEnergy: 0, isAchieved: false, createdAt: new Date().toISOString() };
    const updated = [...get().communityGoals, newGoal];
    set({ communityGoals: updated });
    await writeHomeData(STORAGE_KEYS.COMMUNITY_GOALS, JSON.stringify(updated));
  },
  updateCommunityGoal: async (id, updates) => {
    const updated = get().communityGoals.map((g) => (g.id === id ? { ...g, ...updates } : g));
    set({ communityGoals: updated });
    await writeHomeData(STORAGE_KEYS.COMMUNITY_GOALS, JSON.stringify(updated));
  },

  addChallenge: async (challengeData) => {
    const newChallenge: Challenge = { ...challengeData, id: `challenge-${Date.now()}`, currentProgress: 0, isCompleted: false };
    const updated = [...get().challenges, newChallenge];
    set({ challenges: updated });
    await writeHomeData(STORAGE_KEYS.CHALLENGES, JSON.stringify(updated));
  },
  updateChallenge: async (id, updates) => {
    const updated = get().challenges.map((c) => (c.id === id ? { ...c, ...updates } : c));
    set({ challenges: updated });
    await writeHomeData(STORAGE_KEYS.CHALLENGES, JSON.stringify(updated));
  },
  completeChallenge: async (id) => get().updateChallenge(id, { isCompleted: true }),
  deleteChallenge: async (id) => {
    const updated = get().challenges.filter((c) => c.id !== id);
    set({ challenges: updated });
    await writeHomeData(STORAGE_KEYS.CHALLENGES, JSON.stringify(updated));
  },

  generateDailySnapshot: async () => {
    const { appliances, settings, streak } = get();
    const today = format(new Date(), 'yyyy-MM-dd');
    const consumptions = calculateEnergyConsumptions(appliances, settings.electricityRate, settings.co2Factor);
    const totalEnergy = consumptions.reduce((sum, c) => sum + c.dailyConsumption, 0);
    const totalCost = calculateCost(totalEnergy, settings.electricityRate);
    const totalCO2 = calculateCO2Emissions(totalEnergy, settings.co2Factor);
    const topSaver = consumptions.length > 0 
      ? [...consumptions].sort((a, b) => a.dailyConsumption - b.dailyConsumption)[0].applianceName
      : 'No appliances';

    return {
      id: `snapshot-${Date.now()}`,
      date: today,
      energyConsumed: totalEnergy,
      moneySaved: totalCost,
      co2Avoided: totalCO2,
      topSavingAction: `Optimized ${topSaver}`,
      streakDays: streak.currentStreak,
    };
  },
  saveDailySnapshot: async (snapshot) => {
    const updated = [...get().snapshots, snapshot];
    set({ snapshots: updated });
    await writeHomeData(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(updated));
  },

  addCountdownTimer: async (timerData) => {
    const newTimer: CountdownTimer = { ...timerData, id: `timer-${Date.now()}` };
    const updated = [...get().activeTimers, newTimer];
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

  completeOnboarding: async () => {
    set({ hasSeenOnboarding: true });
    await writeHomeData(STORAGE_KEYS.ONBOARDING, 'true');
  },
  });
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEnergyStore } from '../src/store/energyStore';
import { fetchWeatherData } from '../src/services/api/weatherApi';
import {
  Appliance,
  ApplianceCategory,
  CountdownTimer,
  Reminder,
  Room,
  UserGoal,
  WeatherData,
} from '../src/types';

jest.mock('../src/services/api/weatherApi', () => ({
  ...jest.requireActual('../src/services/api/weatherApi'),
  fetchWeatherData: jest.fn(),
}));

const mockFetchWeather = fetchWeatherData as jest.MockedFunction<typeof fetchWeatherData>;

const KEYS = {
  appliances: '@energy_app_appliances',
  usageRecords: '@energy_app_usage_records',
  reminders: '@energy_app_reminders',
  badges: '@energy_app_badges',
  settings: '@energy_app_settings',
  rooms: '@energy_app_rooms',
  onboarding: '@energy_app_onboarding',
};

const weather = (location: string, temperature = 21): WeatherData => ({
  temperature,
  condition: 'Clear',
  humidity: 50,
  season: 'spring',
  location,
  source: 'live',
});

const makeAppliance = (id: string, overrides: Partial<Appliance> = {}): Appliance => ({
  id,
  name: `Appliance ${id}`,
  powerRating: 200,
  hoursPerDay: 4,
  quantity: 1,
  category: ApplianceCategory.KITCHEN,
  createdAt: '2026-01-01T00:00:00.000Z',
  isActive: true,
  ...overrides,
});

const makeReminder = (id: string, applianceId?: string): Reminder => ({
  id,
  title: `Reminder ${id}`,
  message: 'Check usage',
  time: '20:00',
  days: [1],
  isActive: true,
  applianceId,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** Lets background promise chains (e.g. the weather fetch started by loadAllData) settle. */
const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));

const readStored = async <T,>(key: string): Promise<T | null> => {
  const raw = await AsyncStorage.getItem(key);
  return raw ? (JSON.parse(raw) as T) : null;
};

// Snapshot of the freshly created store (state + actions) used as a clean baseline
const baseline = useEnergyStore.getState();
const originalFetch = globalThis.fetch;

beforeEach(async () => {
  useEnergyStore.setState(baseline, true);
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockFetchWeather.mockImplementation(async (location: string) => weather(location));
  globalThis.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as typeof fetch;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('energyStore.addAppliance', () => {
  const input: Omit<Appliance, 'id' | 'createdAt'> = {
    name: 'Kettle',
    powerRating: 1500,
    hoursPerDay: 0.5,
    quantity: 1,
    category: ApplianceCategory.KITCHEN,
    isActive: true,
  };

  it('adds and persists the appliance', async () => {
    await useEnergyStore.getState().addAppliance(input);

    const { appliances } = useEnergyStore.getState();
    expect(appliances).toHaveLength(1);
    expect(appliances[0]).toMatchObject(input);
    expect(appliances[0].id).toMatch(/^appliance-/);
    expect(typeof appliances[0].createdAt).toBe('string');

    expect(await readStored<Appliance[]>(KEYS.appliances)).toEqual(appliances);
  });

  it('earns the First Steps badge for the first appliance and persists it', async () => {
    await useEnergyStore.getState().addAppliance(input);

    const badge = useEnergyStore.getState().badges.find((b) => b.id === 'badge-1');
    expect(badge?.isEarned).toBe(true);
    expect(badge?.earnedAt).toEqual(expect.any(String));

    const storedBadges = await readStored<{ id: string; isEarned: boolean }[]>(KEYS.badges);
    expect(storedBadges?.find((b) => b.id === 'badge-1')?.isEarned).toBe(true);
  });

  it('refreshes the dashboard and starts a streak', async () => {
    await useEnergyStore.getState().addAppliance(input);

    const { dashboardData, streak } = useEnergyStore.getState();
    expect(dashboardData?.totalEnergyConsumed).toBeGreaterThan(0);
    expect(streak.currentStreak).toBe(1);
  });

  it('does not re-award the badge for later appliances', async () => {
    await useEnergyStore.getState().addAppliance(input);
    const earnedAt = useEnergyStore.getState().badges.find((b) => b.id === 'badge-1')?.earnedAt;

    await useEnergyStore.getState().addAppliance({ ...input, name: 'Toaster' });

    expect(useEnergyStore.getState().appliances).toHaveLength(2);
    expect(useEnergyStore.getState().badges.find((b) => b.id === 'badge-1')?.earnedAt).toBe(earnedAt);
  });
});

describe('energyStore.deleteAppliance', () => {
  beforeEach(() => {
    const rooms: Room[] = [
      { id: 'kitchen', name: 'Kitchen', appliances: ['a1', 'a2'], position: { x: 0, y: 0 } },
      { id: 'living', name: 'Living room', appliances: ['a2'], position: { x: 1, y: 0 } },
    ];
    useEnergyStore.setState({
      appliances: [makeAppliance('a1'), makeAppliance('a2')],
      rooms,
      reminders: [makeReminder('r1', 'a1'), makeReminder('r2', 'a2'), makeReminder('r3')],
    });
  });

  it('removes the appliance and persists the list', async () => {
    await useEnergyStore.getState().deleteAppliance('a1');

    expect(useEnergyStore.getState().appliances.map((a) => a.id)).toEqual(['a2']);
    expect((await readStored<Appliance[]>(KEYS.appliances))?.map((a) => a.id)).toEqual(['a2']);
  });

  it('removes it from every room', async () => {
    await useEnergyStore.getState().deleteAppliance('a1');

    const { rooms } = useEnergyStore.getState();
    expect(rooms.map((room) => room.appliances)).toEqual([['a2'], ['a2']]);
    expect((await readStored<Room[]>(KEYS.rooms))?.map((room) => room.appliances)).toEqual([['a2'], ['a2']]);
  });

  it('clears reminder links to it and keeps other reminders untouched', async () => {
    await useEnergyStore.getState().deleteAppliance('a1');

    const { reminders } = useEnergyStore.getState();
    expect(reminders.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(reminders[0].applianceId).toBeUndefined();
    expect(reminders[1].applianceId).toBe('a2');
    expect(reminders[2].applianceId).toBeUndefined();

    const stored = await readStored<Reminder[]>(KEYS.reminders);
    expect(stored?.[0].applianceId).toBeUndefined();
    expect(stored?.[1].applianceId).toBe('a2');
  });

  it('leaves rooms and reminders alone when nothing references the appliance', async () => {
    const { rooms, reminders } = useEnergyStore.getState();
    useEnergyStore.setState({ appliances: [...useEnergyStore.getState().appliances, makeAppliance('a3')] });

    await useEnergyStore.getState().deleteAppliance('a3');

    expect(useEnergyStore.getState().rooms).toBe(rooms);
    expect(useEnergyStore.getState().reminders).toBe(reminders);
    expect(await AsyncStorage.getItem(KEYS.rooms)).toBeNull();
    expect(await AsyncStorage.getItem(KEYS.reminders)).toBeNull();
  });
});

describe('energyStore.loadAllData', () => {
  it('loads every readable key even when one stored value is corrupt', async () => {
    const appliances = [makeAppliance('a1')];
    await AsyncStorage.setItem(KEYS.appliances, JSON.stringify(appliances));
    await AsyncStorage.setItem(KEYS.usageRecords, '{not valid json');
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify({ currency: '€', weatherLocation: 'Berlin' }));
    await AsyncStorage.setItem(KEYS.onboarding, 'true');

    await useEnergyStore.getState().loadAllData();

    const state = useEnergyStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.appliances).toEqual(appliances);
    expect(state.usageRecords).toEqual([]);
    expect(state.settings.currency).toBe('€');
    expect(state.settings.weatherLocation).toBe('Berlin');
    // Missing settings fall back to the defaults
    expect(state.settings.electricityRate).toBe(baseline.settings.electricityRate);
    expect(state.hasSeenOnboarding).toBe(true);
    expect(state.dashboardData).not.toBeNull();
    expect(console.warn).toHaveBeenCalledWith('Ignoring unreadable stored value:', expect.any(SyntaxError));

    await flushPromises();
    expect(mockFetchWeather).toHaveBeenCalledWith('Berlin');
    expect(useEnergyStore.getState().weatherData).toEqual(weather('Berlin'));
    expect(useEnergyStore.getState().isWeatherLoading).toBe(false);
  });

  it('falls back to default settings when the settings value is corrupt', async () => {
    await AsyncStorage.setItem(KEYS.settings, '][');
    await AsyncStorage.setItem(KEYS.appliances, JSON.stringify([makeAppliance('a1')]));

    await useEnergyStore.getState().loadAllData();

    const state = useEnergyStore.getState();
    expect(state.settings).toEqual(baseline.settings);
    expect(state.appliances).toHaveLength(1);
    expect(state.isLoading).toBe(false);
    await flushPromises();
  });

  it('starts from empty data on a fresh install', async () => {
    await useEnergyStore.getState().loadAllData();

    const state = useEnergyStore.getState();
    expect(state.isLoading).toBe(false);
    expect(state.appliances).toEqual([]);
    expect(state.dashboardData).toBeNull();
    expect(state.hasSeenOnboarding).toBe(false);
    expect(state.badges).toEqual(baseline.badges);
    await flushPromises();
  });

  it('does not wait for the weather and survives a weather failure', async () => {
    const pending = deferred<WeatherData>();
    mockFetchWeather.mockReturnValueOnce(pending.promise);

    await useEnergyStore.getState().loadAllData();
    expect(useEnergyStore.getState().isLoading).toBe(false);
    expect(useEnergyStore.getState().isWeatherLoading).toBe(true);

    pending.reject(new Error('network down'));
    await flushPromises();
    expect(useEnergyStore.getState().isWeatherLoading).toBe(false);
    expect(useEnergyStore.getState().weatherData).toBeNull();
  });
});

describe('energyStore.refreshWeatherData', () => {
  it('sets isWeatherLoading while fetching and stores the result', async () => {
    useEnergyStore.setState({ settings: { ...baseline.settings, weatherLocation: 'Oslo' } });
    const pending = deferred<WeatherData>();
    mockFetchWeather.mockReturnValueOnce(pending.promise);

    const refresh = useEnergyStore.getState().refreshWeatherData();
    expect(useEnergyStore.getState().isWeatherLoading).toBe(true);
    expect(mockFetchWeather).toHaveBeenCalledWith('Oslo');

    pending.resolve(weather('Oslo', -3));
    await refresh;

    expect(useEnergyStore.getState().isWeatherLoading).toBe(false);
    expect(useEnergyStore.getState().weatherData).toEqual(weather('Oslo', -3));
  });

  it('keeps the previous weather and clears isWeatherLoading when the fetch fails', async () => {
    const previous = weather('Previous');
    useEnergyStore.setState({ weatherData: previous });
    mockFetchWeather.mockRejectedValueOnce(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(useEnergyStore.getState().refreshWeatherData()).resolves.toBeUndefined();
    expect(useEnergyStore.getState().isWeatherLoading).toBe(false);
    expect(useEnergyStore.getState().weatherData).toBe(previous);
    warn.mockRestore();
  });

  it('falls back to seasonal weather when the network is unavailable', async () => {
    const actual = jest.requireActual<typeof import('../src/services/api/weatherApi')>(
      '../src/services/api/weatherApi',
    );
    mockFetchWeather.mockImplementationOnce(actual.fetchWeatherData);
    useEnergyStore.setState({ settings: { ...baseline.settings, weatherLocation: 'Lima' } });

    await useEnergyStore.getState().refreshWeatherData();

    expect(globalThis.fetch).toHaveBeenCalled();
    expect(useEnergyStore.getState().weatherData).toMatchObject({ location: 'Lima', source: 'fallback' });
    expect(useEnergyStore.getState().isWeatherLoading).toBe(false);
  });
});

describe('energyStore.updateSettings', () => {
  it('refreshes the weather when the location changes', async () => {
    await useEnergyStore.getState().updateSettings({ weatherLocation: 'Paris' });

    expect(mockFetchWeather).toHaveBeenCalledTimes(1);
    expect(mockFetchWeather).toHaveBeenCalledWith('Paris');
    expect(useEnergyStore.getState().settings.weatherLocation).toBe('Paris');
    expect(useEnergyStore.getState().weatherData).toEqual(weather('Paris'));
    expect(useEnergyStore.getState().isWeatherLoading).toBe(false);
    expect((await readStored<{ weatherLocation: string }>(KEYS.settings))?.weatherLocation).toBe('Paris');
  });

  it('does not refetch the weather for an unchanged location or other settings', async () => {
    await useEnergyStore.getState().updateSettings({ weatherLocation: baseline.settings.weatherLocation });
    await useEnergyStore.getState().updateSettings({ currency: '£', darkMode: true });

    expect(mockFetchWeather).not.toHaveBeenCalled();
    expect(useEnergyStore.getState().settings).toMatchObject({ currency: '£', darkMode: true });
    // Home settings stay with the home; device preferences such as dark mode are shared by every home
    expect(await readStored<{ currency: string }>(KEYS.settings)).toMatchObject({ currency: '£' });
    expect(await readStored<{ currency: string }>(KEYS.settings)).not.toHaveProperty('darkMode');
    expect(await readStored<{ darkMode: boolean }>('@energy_app_device_settings')).toMatchObject({ darkMode: true });
  });
});

describe('energyStore.updateTimer', () => {
  it('refreshes countdown progress from the linked goal', async () => {
    const targetTime = new Date(Date.now() + 150 * 60 * 1000).toISOString();
    const goal: UserGoal = {
      id: 'goal-1',
      type: 'consumption',
      target: 100,
      currentValue: 40,
      deadline: targetTime,
      isAchieved: false,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const timer: CountdownTimer = {
      id: 'timer-1',
      goalId: 'goal-1',
      goalTitle: 'Monthly energy',
      targetTime,
      currentTime: '',
      remainingHours: 0,
      remainingMinutes: 0,
      targetValue: 100,
      currentValue: 10,
      unit: 'kWh',
      isActive: true,
    };
    useEnergyStore.setState({ goals: [goal], activeTimers: [timer] });

    await useEnergyStore.getState().updateTimer('timer-1');

    const [updated] = useEnergyStore.getState().activeTimers;
    expect(updated.currentValue).toBe(40);
    expect(updated.remainingHours).toBe(2);
  });
});

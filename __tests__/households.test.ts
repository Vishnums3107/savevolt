import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEnergyStore } from '../src/store/energyStore';
import { fetchWeatherData } from '../src/services/api/weatherApi';
import { ApplianceCategory, HouseholdData, WeatherData } from '../src/types';
import { ACTIVE_HOUSEHOLD_KEY, HOUSEHOLDS_KEY, householdStorageKey } from '../src/store/householdStorage';
import { validateHouseholdData } from '../src/services/sync/householdData';

jest.mock('../src/services/api/weatherApi', () => ({ fetchWeatherData: jest.fn() }));
const mockWeather = fetchWeatherData as jest.MockedFunction<typeof fetchWeatherData>;
const baseline = useEnergyStore.getState();
const weather = (location: string): WeatherData => ({ location, temperature: 20, humidity: 50, condition: 'Clear', season: 'spring', source: 'live' });
const appliance = { name: 'Lamp', powerRating: 10, hoursPerDay: 4, quantity: 1, category: ApplianceCategory.LIGHTING, isActive: true };
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

beforeEach(async () => {
  useEnergyStore.setState(baseline, true);
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockWeather.mockImplementation(async location => weather(location));
});

it('upgrades the original home without changing its legacy storage keys', async () => {
  await useEnergyStore.getState().addAppliance(appliance);
  const stored = await AsyncStorage.getItem('@energy_app_appliances');
  await useEnergyStore.getState().loadAllData();
  expect(useEnergyStore.getState().appliances).toEqual(JSON.parse(stored!));
  expect(useEnergyStore.getState().activeHouseholdId).toBe('default');
  expect(householdStorageKey('@energy_app_appliances', 'default')).toBe('@energy_app_appliances');
});

it('isolates appliances, rooms, reminders, history, goals, badges and rates between homes', async () => {
  const store = () => useEnergyStore.getState();
  await store().addAppliance(appliance);
  const originalApplianceId = store().appliances[0].id;
  await store().addRoom({ id: 'room-1', name: 'Kitchen', appliances: [originalApplianceId], position: { x: 0, y: 0 } });
  await store().addReminder({ title: 'Lights', message: 'Turn off', time: '20:00', days: [1], isActive: true, applianceId: originalApplianceId });
  await store().addGoal({ type: 'cost', target: 20, deadline: '2026-12-01' });
  await store().saveUsageRecord();
  await store().updateSettings({ electricityRate: 0.4 });
  const id = await store().createHousehold('Apartment');
  await store().switchHousehold(id);
  expect(store().appliances).toEqual([]);
  expect(store().rooms).toEqual([]);
  expect(store().reminders).toEqual([]);
  expect(store().goals).toEqual([]);
  expect(store().usageRecords).toEqual([]);
  expect(store().badges.every(badge => !badge.isEarned)).toBe(true);
  await store().addAppliance({ ...appliance, name: 'TV' });
  await store().updateSettings({ electricityRate: 0.2 });
  expect(await AsyncStorage.getItem(householdStorageKey('@energy_app_appliances', id))).toContain('TV');
  await store().switchHousehold('default');
  expect(store().appliances[0].id).toBe(originalApplianceId);
  expect(store().rooms).toHaveLength(1);
  expect(store().reminders).toHaveLength(1);
  expect(store().goals).toHaveLength(1);
  expect(store().usageRecords).toHaveLength(1);
  expect(store().settings.electricityRate).toBe(0.4);
  expect(store().dashboardData?.totalCost).toBeCloseTo(0.48);
});

it('remembers the selected home across a restart', async () => {
  const id = await useEnergyStore.getState().createHousehold('Office');
  await useEnergyStore.getState().switchHousehold(id);
  await useEnergyStore.getState().addAppliance({ ...appliance, name: 'Office lamp' });
  useEnergyStore.setState(baseline, true);
  await useEnergyStore.getState().loadAllData();
  expect(useEnergyStore.getState().activeHouseholdId).toBe(id);
  expect(useEnergyStore.getState().appliances[0].name).toBe('Office lamp');
});

it('finishes outstanding mutations and their nested writes before switching homes', async () => {
  const id = await useEnergyStore.getState().createHousehold('Office');
  const originalSet = AsyncStorage.setItem;
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(async (key, value) => { await delayed; return originalSet(key, value); });
  const adding = useEnergyStore.getState().addAppliance(appliance);
  const switching = useEnergyStore.getState().switchHousehold(id);
  await flush();
  expect(useEnergyStore.getState().activeHouseholdId).toBe('default');
  expect(useEnergyStore.getState().isSwitchingHousehold).toBe(true);
  release();
  await Promise.all([adding, switching]);
  expect(useEnergyStore.getState().appliances).toHaveLength(0);
  expect(useEnergyStore.getState().streak.currentStreak).toBe(0);
  await useEnergyStore.getState().switchHousehold('default');
  expect(useEnergyStore.getState().appliances).toHaveLength(1);
  expect(useEnergyStore.getState().streak.currentStreak).toBe(1);
  jest.restoreAllMocks();
});

it('rejects competing home transitions and invalid or duplicate names', async () => {
  const first = useEnergyStore.getState().createHousehold('Office');
  await expect(useEnergyStore.getState().createHousehold('Other')).rejects.toThrow('wait');
  await first;
  await expect(useEnergyStore.getState().createHousehold(' office ')).rejects.toThrow('already exists');
  await expect(useEnergyStore.getState().createHousehold(' ')).rejects.toThrow('name');
  await expect(useEnergyStore.getState().switchHousehold('missing')).rejects.toThrow('not found');
});

it('preserves device-wide onboarding when homes change', async () => {
  await useEnergyStore.getState().completeOnboarding();
  const id = await useEnergyStore.getState().createHousehold('Office');
  await useEnergyStore.getState().switchHousehold(id);
  expect(useEnergyStore.getState().hasSeenOnboarding).toBe(true);
});

it('renames and removes only a nonactive home', async () => {
  const id = await useEnergyStore.getState().createHousehold('Office');
  await useEnergyStore.getState().renameHousehold(id, 'Work');
  expect(useEnergyStore.getState().households[1].name).toBe('Work');
  await expect(useEnergyStore.getState().deleteHousehold('default')).rejects.toThrow('Switch');
  await useEnergyStore.getState().deleteHousehold(id);
  expect(useEnergyStore.getState().households).toHaveLength(1);
  expect(await AsyncStorage.getItem(householdStorageKey('@energy_app_settings', id))).toBeNull();
});

it('ignores old weather responses after a household switch', async () => {
  let release!: (value: WeatherData) => void;
  mockWeather.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
  await useEnergyStore.getState().loadAllData();
  const id = await useEnergyStore.getState().createHousehold('Office');
  await useEnergyStore.getState().switchHousehold(id);
  await flush();
  const current = useEnergyStore.getState().weatherData;
  release(weather('Wrong home'));
  await flush();
  expect(useEnergyStore.getState().weatherData).toEqual(current);
});

it('rolls back selection if reading the next home fails', async () => {
  const id = await useEnergyStore.getState().createHousehold('Office');
  await useEnergyStore.getState().addAppliance(appliance);
  jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage down'));
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(useEnergyStore.getState().switchHousehold(id)).rejects.toThrow('storage down');
  expect(useEnergyStore.getState().activeHouseholdId).toBe('default');
  expect(useEnergyStore.getState().appliances).toHaveLength(1);
  expect(await AsyncStorage.getItem(ACTIVE_HOUSEHOLD_KEY)).toBe('default');
  expect(useEnergyStore.getState().isSwitchingHousehold).toBe(false);
  jest.restoreAllMocks();
});

it('exports portable data without API keys or device preferences', async () => {
  await useEnergyStore.getState().updateSettings({ geminiApiKey: 'secret-key', darkMode: true });
  const backup = useEnergyStore.getState().exportHouseholdData();
  expect(JSON.stringify(backup)).not.toContain('secret-key');
  expect(backup.settings).not.toHaveProperty('darkMode');
  expect(backup.settings).not.toHaveProperty('notificationsEnabled');
});

it('restores a validated backup into a new home and leaves existing data intact', async () => {
  await useEnergyStore.getState().addAppliance(appliance);
  const backup = useEnergyStore.getState().exportHouseholdData();
  backup.appliances[0].name = 'Restored lamp';
  backup.settings.electricityRate = 0.6;
  const id = await useEnergyStore.getState().restoreHousehold('Restored', backup, { ownerId: 'user-1', id: 'cloud-1', revision: 3 });
  expect(useEnergyStore.getState().appliances[0].name).toBe('Lamp');
  await useEnergyStore.getState().switchHousehold(id);
  expect(useEnergyStore.getState().appliances[0].name).toBe('Restored lamp');
  expect(useEnergyStore.getState().settings.electricityRate).toBe(0.6);
  expect(useEnergyStore.getState().households[1].cloudRevision).toBe(3);
  expect(JSON.parse((await AsyncStorage.getItem(HOUSEHOLDS_KEY))!)[1].cloudOwnerId).toBe('user-1');
});

it('rejects corrupt backups before creating storage entries', async () => {
  const backup = useEnergyStore.getState().exportHouseholdData();
  backup.appliances = [{ ...appliance, id: 'bad', createdAt: '2026-01-01', hoursPerDay: 25 }];
  await expect(useEnergyStore.getState().restoreHousehold('Corrupt', backup)).rejects.toThrow('appliances');
  expect(useEnergyStore.getState().households).toHaveLength(1);
  expect(await AsyncStorage.getItem(HOUSEHOLDS_KEY)).toBeNull();
  expect(() => validateHouseholdData({ ...backup, settings: { ...backup.settings, electricityRate: -1 } })).toThrow('settings');
});

it('cleans dangling appliance references and drops imported credentials', () => {
  const backup = useEnergyStore.getState().exportHouseholdData();
  const input = { ...backup, settings: { ...backup.settings, geminiApiKey: 'remote-secret' },
    rooms: [{ id: 'room-1', name: 'Room', appliances: ['missing'], position: { x: 0, y: 0 } }],
    reminders: [{ id: 'reminder-1', title: 'Check', message: 'Check', time: '12:00', days: [1], isActive: true, applianceId: 'missing' }],
  };
  const result: HouseholdData = validateHouseholdData(input);
  expect(result.rooms[0].appliances).toEqual([]);
  expect(result.reminders[0].applianceId).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain('remote-secret');
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEnergyStore } from '../src/store/energyStore';
import { fetchWeatherData } from '../src/services/api/weatherApi';
import { ApplianceCategory } from '../src/types';
import { addDayKey, dayKey } from '../src/utils/analytics';
import { encodeShareCode } from '../src/utils/shareCodes';
import { verifyCertificateChain } from '../src/utils/certificates';

jest.mock('../src/services/api/weatherApi', () => ({ fetchWeatherData: jest.fn() }));
const mockWeather = fetchWeatherData as jest.MockedFunction<typeof fetchWeatherData>;
const baseline = useEnergyStore.getState();
const store = () => useEnergyStore.getState();
const todayKey = () => dayKey(new Date());

const ac = { name: 'AC', powerRating: 1000, hoursPerDay: 4, quantity: 1, category: ApplianceCategory.COOLING, isActive: true };
const tv = { name: 'TV', powerRating: 100, hoursPerDay: 10, quantity: 1, category: ApplianceCategory.ENTERTAINMENT, isActive: true };

const setup = async () => {
  const acId = await store().addAppliance(ac);
  const tvId = await store().addAppliance(tv);
  return { acId, tvId };
};

beforeEach(async () => {
  useEnergyStore.setState(baseline, true);
  await AsyncStorage.clear();
  jest.clearAllMocks();
  mockWeather.mockResolvedValue({ location: 'X', temperature: 20, humidity: 50, condition: 'Clear', season: 'spring', source: 'live' });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('day logs', () => {
  it('saves actual hours, awards points once and moves the streak', async () => {
    const { acId, tvId } = await setup();
    const record = await store().logDay(todayKey(), { [acId]: 2, [tvId]: 10 }, 'Hot day, fan instead');
    expect(record.totalConsumption).toBe(3);
    expect(record.baselineKwh).toBe(5);
    expect(record.note).toBe('Hot day, fan instead');
    expect(store().points.total).toBeGreaterThanOrEqual(10);
    const pointsAfterFirst = store().points.total;
    await store().logDay(todayKey(), { [acId]: 1, [tvId]: 10 });
    expect(store().usageRecords).toHaveLength(1);
    expect(store().usageRecords[0].totalConsumption).toBe(2);
    expect(store().points.total).toBe(pointsAfterFirst);
    expect(JSON.parse((await AsyncStorage.getItem('@energy_app_usage_records'))!)).toHaveLength(1);
  });

  it('refuses future days and empty homes', async () => {
    await expect(store().logDay(todayKey(), {})).rejects.toThrow('Add an appliance');
    await setup();
    await expect(store().logDay(addDayKey(todayKey(), 1), {})).rejects.toThrow('today or earlier');
  });

  it('awards Energy Saver for a day 20% below usual', async () => {
    const { acId, tvId } = await setup();
    await store().logDay(todayKey(), { [acId]: 1, [tvId]: 10 });
    expect(store().badges.find((b) => b.id === 'badge-3')?.isEarned).toBe(true);
  });
});

describe('meter readings', () => {
  it('turns readings into metered days and keeps logged hours as the breakdown', async () => {
    const { acId, tvId } = await setup();
    const yesterday = addDayKey(todayKey(), -1);
    await store().logDay(yesterday, { [acId]: 3, [tvId]: 10 });
    const start = new Date(); start.setDate(start.getDate() - 3); start.setHours(20, 0, 0, 0);
    const end = new Date(); end.setDate(end.getDate() - 1); end.setHours(20, 0, 0, 0);
    await store().addMeterReading({ value: 1000, takenAt: start.toISOString() });
    const result = await store().addMeterReading({ value: 1012, takenAt: end.toISOString() });
    expect(result.daysUpdated).toBe(2);
    const yRecord = store().usageRecords.find((r) => r.date === yesterday)!;
    expect(yRecord.source).toBe('meter');
    expect(yRecord.totalConsumption).toBe(6);
    expect(yRecord.applianceHours?.[acId]).toBe(3);
    expect(store().badges.find((b) => b.id === 'badge-5')?.isEarned).toBe(true);

    await expect(store().addMeterReading({ value: 900, takenAt: new Date().toISOString() })).rejects.toThrow('only count up');

    // Removing a reading turns the logged day back into a logged day and drops the pure meter day
    const second = store().meterReadings[1];
    await store().deleteMeterReading(second.id);
    expect(store().usageRecords.find((r) => r.date === yesterday)?.source).toBe('logged');
    expect(store().usageRecords.find((r) => r.date === addDayKey(todayKey(), -2))).toBeUndefined();
  });
});

describe('challenges track themselves', () => {
  it('completes an energy challenge from logs and pays out points once', async () => {
    const { acId, tvId } = await setup();
    await store().addChallenge({
      title: 'Save 3 kWh', description: '', type: 'energy', target: 3, duration: 7,
      startDate: new Date().toISOString(), endDate: new Date(Date.now() + 7 * 86400000).toISOString(), createdBy: 'self',
    });
    const challenge = store().challenges[0];
    expect(challenge.baselineDaily).toBe(5);
    expect(challenge.points).toBeGreaterThan(0);
    await store().logDay(todayKey(), { [acId]: 2, [tvId]: 10 });
    expect(store().challenges[0].currentProgress).toBe(2);
    expect(store().challenges[0].status).toBe('active');
    await store().logDay(todayKey(), { [acId]: 1, [tvId]: 10 });
    expect(store().challenges[0]).toMatchObject({ currentProgress: 3, status: 'completed', isCompleted: true });
    expect(store().points.events.filter((e) => e.key === `challenge:${challenge.id}`)).toHaveLength(1);
    expect(store().badges.find((b) => b.id === 'badge-7')?.isEarned).toBe(true);
  });

  it('counts one check-in per day for custom habits', async () => {
    await store().addChallenge({
      title: 'Cold showers', description: '', type: 'custom', target: 2, duration: 5,
      startDate: new Date().toISOString(), endDate: new Date(Date.now() + 5 * 86400000).toISOString(), createdBy: 'self',
    });
    const id = store().challenges[0].id;
    await store().checkInChallenge(id);
    expect(store().challenges[0].currentProgress).toBe(1);
    await expect(store().checkInChallenge(id)).rejects.toThrow('Already checked in');
  });

  it('validates new challenges', async () => {
    await expect(store().addChallenge({
      title: 'x', description: '', type: 'energy', target: 0, duration: 7,
      startDate: new Date().toISOString(), endDate: new Date().toISOString(), createdBy: 'self',
    })).rejects.toThrow('greater than zero');
  });
});

describe('shared goals and share codes', () => {
  it('counts my measured savings automatically and imports teammates', async () => {
    const { acId, tvId } = await setup();
    await store().updateSettings({ displayName: 'Asha' });
    const goalId = await store().addCommunityGoal({
      title: 'Street savings', description: 'Together', targetEnergy: 5,
      deadline: new Date(Date.now() + 10 * 86400000).toISOString(), createdBy: 'Asha', participants: ['Asha'],
    });
    await store().logDay(todayKey(), { [acId]: 2, [tvId]: 10 });
    let goal = store().communityGoals[0];
    expect(goal.contributions?.find((c) => c.source === 'auto')).toMatchObject({ participant: 'Asha', kWh: 2 });
    expect(goal.currentEnergy).toBe(2);

    const teammate = encodeShareCode('C', { v: 1, goalId, participant: 'Ravi', kWh: 3.5, at: new Date().toISOString() });
    const result = await store().importShareCode(`My update: ${teammate}`);
    expect(result.kind).toBe('contribution');
    goal = store().communityGoals[0];
    expect(goal.currentEnergy).toBe(5.5);
    expect(goal.isAchieved).toBe(true);
    expect(goal.participants).toEqual(expect.arrayContaining(['Asha', 'Ravi']));
    expect(store().points.events.some((e) => e.key === `community:${goalId}`)).toBe(true);

    // A newer code from the same teammate replaces, never double counts
    const update = encodeShareCode('C', { v: 1, goalId, participant: 'Ravi', kWh: 4, at: new Date(Date.now() + 1000).toISOString() });
    await store().importShareCode(update);
    expect(store().communityGoals[0].currentEnergy).toBe(6);

    // My own contribution code reflects my savings
    expect(store().getContributionCode(goalId)).toMatch(/^SV1C\./);
  });

  it('joins a goal from an invite and refuses duplicates', async () => {
    const invite = encodeShareCode('G', {
      v: 1, id: 'goal-shared-1', title: 'Office month', description: '', targetEnergy: 100,
      deadline: new Date(Date.now() + 20 * 86400000).toISOString(), createdBy: 'Lee', createdAt: new Date().toISOString(),
    });
    await store().importShareCode(invite);
    expect(store().communityGoals[0]).toMatchObject({ id: 'goal-shared-1', createdBy: 'Lee' });
    await expect(store().importShareCode(invite)).rejects.toThrow('already joined');
  });

  it('adds friends from score cards, keeps the newest, and ignores my own', async () => {
    await store().loadAllData();
    const card = (at: string, points: number) => encodeShareCode('S', {
      v: 1, id: 'sv-friend-1', name: 'Mo', points, level: 2, weekSavedKwh: 3, savingsPercent: 10, streak: 4, badges: 2, at,
    });
    await store().importShareCode(card('2026-01-02T00:00:00.000Z', 150));
    await store().importShareCode(card('2026-01-03T00:00:00.000Z', 200));
    expect(store().friends).toHaveLength(1);
    expect(store().friends[0].points).toBe(200);
    await expect(store().importShareCode(card('2026-01-01T00:00:00.000Z', 1))).rejects.toThrow('newer score');
    await expect(store().importShareCode(store().getScoreCode())).rejects.toThrow('your own');
    expect(JSON.parse((await AsyncStorage.getItem('@energy_app_friends'))!)).toHaveLength(1);
  });
});

describe('recommendations and tips', () => {
  it('applies an appliance change with undo and points', async () => {
    const { acId } = await setup();
    await store().applyApplianceChange('rec:reduce:ac', acId, { hoursPerDay: 3 }, 30, 'Cut AC by an hour');
    expect(store().appliances.find((a) => a.id === acId)?.hoursPerDay).toBe(3);
    expect(store().insightState.done['rec:reduce:ac']).toBeDefined();
    const points = store().points.total;
    await store().undoInsight('rec:reduce:ac');
    expect(store().appliances.find((a) => a.id === acId)?.hoursPerDay).toBe(4);
    expect(store().insightState.done['rec:reduce:ac']).toBeUndefined();
    expect(store().points.total).toBe(points - 20);
  });

  it('remembers dismissed, done and saved tips per home', async () => {
    await store().dismissInsight('tip:a');
    await store().markInsightDone('tip:b');
    await store().toggleInsightSaved('tip:c');
    expect(Object.keys(store().insightState.dismissed)).toEqual(['tip:a']);
    useEnergyStore.setState(baseline, true);
    await store().loadAllData();
    expect(store().insightState.done['tip:b']).toBeDefined();
    expect(store().insightState.saved['tip:c']).toBeDefined();
    await store().restoreInsight('tip:a');
    expect(store().insightState.dismissed).toEqual({});
  });
});

describe('certificates', () => {
  it('issues chained certificates only for new measured savings', async () => {
    const { acId, tvId } = await setup();
    await expect(store().issueSavingsCertificate()).rejects.toThrow('no new measured savings');
    await store().logDay(addDayKey(todayKey(), -2), { [acId]: 2, [tvId]: 10 });
    await store().logDay(addDayKey(todayKey(), -1), { [acId]: 3, [tvId]: 10 });
    const cert = await store().issueSavingsCertificate();
    expect(cert.kWhSaved).toBe(3);
    expect(verifyCertificateChain(store().certificates).valid).toBe(true);
    await expect(store().issueSavingsCertificate()).rejects.toThrow('no new measured savings');
  });
});

describe('device settings', () => {
  it('keeps dark mode and the assistant key across homes but rates per home', async () => {
    await store().updateSettings({ darkMode: true, geminiApiKey: 'k', electricityRate: 0.3 });
    const id = await store().createHousehold('Cabin');
    await store().switchHousehold(id);
    expect(store().settings.darkMode).toBe(true);
    expect(store().settings.geminiApiKey).toBe('k');
    await store().updateSettings({ electricityRate: 0.5 });
    await store().switchHousehold('default');
    expect(store().settings.electricityRate).toBe(0.3);
  });

  it('migrates device preferences out of an older home settings value', async () => {
    await AsyncStorage.setItem('@energy_app_settings', JSON.stringify({ darkMode: true, currency: '€' }));
    await store().loadAllData();
    expect(store().settings).toMatchObject({ darkMode: true, currency: '€' });
    expect(JSON.parse((await AsyncStorage.getItem('@energy_app_device_settings'))!)).toMatchObject({ darkMode: true });
  });
});

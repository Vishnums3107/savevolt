import { Appliance, ApplianceCategory, HouseholdData } from '../../types';

type Value = Record<string, unknown>;
const object = (value: unknown): value is Value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown) => typeof value === 'string' && value.length <= 2000;
const id = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(value);
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const bool = (value: unknown) => typeof value === 'boolean';
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const strings = (value: unknown) => Array.isArray(value) && value.every(text);
const identified = (value: unknown): value is Value => object(value) && id(value.id);
const appliance = (value: unknown): value is Appliance => identified(value) && text(value.name) &&
  number(value.powerRating) && number(value.hoursPerDay) && value.hoursPerDay <= 24 &&
  number(value.quantity) && Number.isInteger(value.quantity) && value.quantity >= 1 &&
  Object.values(ApplianceCategory).includes(value.category as ApplianceCategory) && date(value.createdAt) && bool(value.isActive);

const array = <T,>(value: unknown, check: (item: unknown) => boolean, label: string): T[] => {
  if (!Array.isArray(value) || value.length > 10000 || !value.every(check)) {
    throw new Error(`Invalid ${label} in the household backup.`);
  }
  const ids = value.map(item => (item as Value).id);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label} in the household backup.`);
  return value as T[];
};

/** Validate remote data before it reaches the store, and drop nonportable settings. */
export const validateHouseholdData = (value: unknown): HouseholdData => {
  if (!object(value) || !object(value.settings) || !object(value.streak)) {
    throw new Error('Invalid household backup.');
  }
  const settings = value.settings;
  if (!number(settings.electricityRate) || !number(settings.co2Factor) || !text(settings.currency) ||
      !(settings.currency as string).trim() || !text(settings.weatherLocation) || !(settings.weatherLocation as string).trim()) {
    throw new Error('Invalid energy settings in the household backup.');
  }
  const streak = value.streak;
  if (![streak.currentStreak, streak.longestStreak, streak.totalDaysActive].every(number) ||
      ![streak.currentStreak, streak.longestStreak, streak.totalDaysActive].every(Number.isInteger) ||
      !(streak.lastActivityDate === '' || date(streak.lastActivityDate))) {
    throw new Error('Invalid streak in the household backup.');
  }
  const appliances = array<HouseholdData['appliances'][number]>(value.appliances, appliance, 'appliances');
  const applianceIds = new Set(appliances.map(item => item.id));
  const reminders = array<HouseholdData['reminders'][number]>(value.reminders, item => identified(item) &&
    text(item.title) && text(item.message) && typeof item.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time) &&
    Array.isArray(item.days) && item.days.length > 0 && item.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6) &&
    bool(item.isActive) && (item.applianceId === undefined || id(item.applianceId)), 'reminders');
  const rooms = array<HouseholdData['rooms'][number]>(value.rooms, item => identified(item) && text(item.name) &&
    strings(item.appliances) && object(item.position) &&
    typeof item.position.x === 'number' && Number.isFinite(item.position.x) &&
    typeof item.position.y === 'number' && Number.isFinite(item.position.y), 'rooms');

  const result: HouseholdData = {
    appliances,
    usageRecords: array(value.usageRecords, item => identified(item) && date(item.date) &&
      Array.isArray(item.appliances) && item.appliances.every(appliance) &&
      [item.totalConsumption, item.totalCost, item.totalCO2].every(number), 'usage records'),
    reminders: reminders.map(item => applianceIds.has(item.applianceId ?? '') || !item.applianceId
      ? item : { ...item, applianceId: undefined }),
    goals: array(value.goals, item => identified(item) && ['consumption', 'cost', 'co2'].includes(item.type as string) &&
      number(item.target) && number(item.currentValue) && date(item.deadline) && date(item.createdAt) && bool(item.isAchieved), 'goals'),
    streak: { currentStreak: streak.currentStreak as number, longestStreak: streak.longestStreak as number,
      totalDaysActive: streak.totalDaysActive as number, lastActivityDate: streak.lastActivityDate as string },
    badges: array(value.badges, item => identified(item) && text(item.name) && text(item.description) && text(item.icon) &&
      bool(item.isEarned) && (item.earnedAt === undefined || date(item.earnedAt)), 'badges'),
    rooms: rooms.map(item => ({ ...item, appliances: item.appliances.filter(applianceId => applianceIds.has(applianceId)) })),
    communityGoals: array(value.communityGoals, item => identified(item) && text(item.title) && text(item.description) &&
      number(item.targetEnergy) && number(item.currentEnergy) && strings(item.participants) && date(item.deadline) &&
      date(item.createdAt) && text(item.createdBy) && bool(item.isAchieved), 'community goals'),
    challenges: array(value.challenges, item => identified(item) && text(item.title) && text(item.description) &&
      ['energy', 'cost', 'streak', 'custom'].includes(item.type as string) && number(item.target) && number(item.currentProgress) &&
      number(item.duration) && date(item.startDate) && date(item.endDate) && bool(item.isCompleted) && text(item.createdBy) &&
      (item.participants === undefined || strings(item.participants)), 'challenges'),
    snapshots: array(value.snapshots, item => identified(item) && date(item.date) &&
      [item.energyConsumed, item.moneySaved, item.co2Avoided, item.streakDays].every(number) && text(item.topSavingAction), 'snapshots'),
    activeTimers: array(value.activeTimers, item => identified(item) && id(item.goalId) && text(item.goalTitle) &&
      date(item.targetTime) && date(item.currentTime) &&
      [item.remainingHours, item.remainingMinutes, item.targetValue, item.currentValue].every(number) && text(item.unit) && bool(item.isActive), 'timers'),
    settings: { electricityRate: settings.electricityRate as number, co2Factor: settings.co2Factor as number,
      currency: settings.currency as string, weatherLocation: settings.weatherLocation as string },
  };
  // Return a detached copy so callers cannot mutate the validated backup later.
  return JSON.parse(JSON.stringify(result)) as HouseholdData;
};

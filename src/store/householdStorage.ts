import { Household } from '../types';

export const HOUSEHOLDS_KEY = '@energy_app_households';
export const ACTIVE_HOUSEHOLD_KEY = '@energy_app_active_household';
export const DEFAULT_HOUSEHOLD: Household = {
  id: 'default',
  name: 'My home',
  createdAt: '2026-01-01T00:00:00.000Z',
};

/** The original home keeps its original keys, so upgrading preserves existing data. */
export const householdStorageKey = (key: string, householdId: string) =>
  householdId === DEFAULT_HOUSEHOLD.id ? key : `${key}:${householdId}`;

export const isHousehold = (value: unknown): value is Household => {
  if (!value || typeof value !== 'object') return false;
  const home = value as Household;
  return typeof home.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(home.id) &&
    typeof home.name === 'string' && home.name.trim().length > 0 &&
    typeof home.createdAt === 'string' && Number.isFinite(Date.parse(home.createdAt));
};

export const validateHouseholdName = (name: string, households: Household[], exceptId?: string) => {
  const cleaned = name.trim();
  if (!cleaned || cleaned.length > 60) throw new Error('Enter a home name of 1 to 60 characters.');
  if (households.some(home => home.id !== exceptId && home.name.toLowerCase() === cleaned.toLowerCase())) {
    throw new Error('A home with that name already exists.');
  }
  return cleaned;
};

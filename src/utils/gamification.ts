import { Badge, Challenge, PointsLedger } from '../types';

/** Points for things the user actually does. Each award has a unique key so it is never doubled. */
export const POINTS = {
  dailyLog: 10,
  meterReading: 15,
  badge: 25,
  recommendation: 20,
  tipDone: 5,
  contribution: 10,
  communityGoal: 50,
  certificate: 30,
  checkIn: 5,
} as const;

export interface LevelInfo {
  level: number;
  name: string;
  min: number;
  /** Points needed for the next level (null at the top). */
  next: number | null;
  /** 0–1 progress through the current level. */
  progress: number;
  icon: string;
}

export const LEVELS: { level: number; name: string; min: number; icon: string }[] = [
  { level: 1, name: 'Spark', min: 0, icon: 'flash-outline' },
  { level: 2, name: 'Current', min: 100, icon: 'flash' },
  { level: 3, name: 'Charge', min: 250, icon: 'battery-charging-60' },
  { level: 4, name: 'Dynamo', min: 500, icon: 'engine-outline' },
  { level: 5, name: 'Turbine', min: 900, icon: 'wind-turbine' },
  { level: 6, name: 'Power Plant', min: 1500, icon: 'factory' },
  { level: 7, name: 'Grid Guardian', min: 2500, icon: 'shield-star-outline' },
  { level: 8, name: 'Volt Legend', min: 4000, icon: 'crown-outline' },
];

export const levelFor = (points: number): LevelInfo => {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i += 1) if (points >= LEVELS[i].min) index = i;
  const current = LEVELS[index];
  const nextLevel = LEVELS[index + 1];
  const next = nextLevel ? nextLevel.min : null;
  const progress = next === null ? 1 : (points - current.min) / (next - current.min);
  return { ...current, next, progress: Math.min(Math.max(progress, 0), 1) };
};

/** Points for finishing a challenge: longer and harder challenges are worth more. */
export const challengePoints = (challenge: Pick<Challenge, 'type' | 'duration' | 'target'>): number => {
  const base = 30 + challenge.duration * 4;
  const bonus = challenge.type === 'energy' ? Math.min(challenge.target * 2, 80)
    : challenge.type === 'cost' ? Math.min(challenge.target * 3, 80)
      : challenge.type === 'streak' ? challenge.target * 3 : 10;
  return Math.round(Math.min(base + bonus, 300));
};

export const EMPTY_LEDGER: PointsLedger = { total: 0, events: [] };

/**
 * Every badge and how it is earned. The first four ids match the original release so earned
 * badges survive the upgrade.
 */
export const BADGE_DEFINITIONS: Badge[] = [
  { id: 'badge-1', name: 'First Steps', description: 'Added your first appliance', icon: '🌱', isEarned: false },
  { id: 'badge-2', name: 'Week Warrior', description: 'Kept a 7-day streak', icon: '🔥', isEarned: false },
  { id: 'badge-3', name: 'Energy Saver', description: 'Logged a day 20% below your usual use', icon: '⚡', isEarned: false },
  { id: 'badge-4', name: 'Green Champion', description: 'Avoided the CO₂ ten trees absorb in a year', icon: '🌳', isEarned: false },
  { id: 'badge-5', name: 'Meter Reader', description: 'Recorded your first meter reading', icon: '📟', isEarned: false },
  { id: 'badge-6', name: 'Room Planner', description: 'Mapped devices into three rooms', icon: '🏠', isEarned: false },
  { id: 'badge-7', name: 'Challenger', description: 'Completed your first challenge', icon: '🏆', isEarned: false },
  { id: 'badge-8', name: 'Habit Hero', description: 'Kept a 30-day streak', icon: '💎', isEarned: false },
  { id: 'badge-9', name: 'Action Taker', description: 'Applied three recommendations', icon: '🛠️', isEarned: false },
  { id: 'badge-10', name: 'Team Player', description: 'Contributed to a shared goal', icon: '🤝', isEarned: false },
  { id: 'badge-11', name: 'Plugged In', description: 'Linked a device to a smart plug', icon: '🔌', isEarned: false },
  { id: 'badge-12', name: 'Data Pro', description: 'Logged 30 days of real usage', icon: '📊', isEarned: false },
];

/** Keeps earned state from storage and adds any badges introduced since. */
export const mergeBadges = (stored: unknown): Badge[] => {
  const list = Array.isArray(stored) ? (stored as Badge[]) : [];
  const byId = new Map(list.filter((b) => b && typeof b.id === 'string').map((b) => [b.id, b]));
  return BADGE_DEFINITIONS.map((definition) => {
    const saved = byId.get(definition.id);
    return saved?.isEarned
      ? { ...definition, isEarned: true, earnedAt: saved.earnedAt }
      : { ...definition };
  });
};

/**
 * Measured-energy analytics.
 *
 * The appliance profile (rated watts × usual hours) is the *baseline*: what a typical day costs.
 * Days the user logs (adjusted hours), meter readings and smart-plug data are *measurements*.
 * Savings are always measurement minus baseline, so nothing here is invented: with no logs there
 * are no savings, only estimates, and every screen can say which is which.
 */
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import {
  Appliance,
  AppSettings,
  Challenge,
  ChallengeStatus,
  GoalStatus,
  MeterReading,
  UsageRecord,
  UsageSource,
  UserGoal,
} from '../types';

export const MS_PER_DAY = 86400000;

// ─── Dates (local calendar days as yyyy-MM-dd) ───────────────────

export const dayKey = (date: Date): string => format(date, 'yyyy-MM-dd');

/** Parses yyyy-MM-dd as a *local* date (new Date('yyyy-MM-dd') would be UTC midnight). */
export const parseDayKey = (key: string): Date => {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

/** Day key of an ISO timestamp or a yyyy-MM-dd string, in local time. */
export const toDayKey = (value: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dayKey(new Date(value));

export const addDayKey = (key: string, days: number): string => dayKey(addDays(parseDayKey(key), days));

export const daysBetweenKeys = (from: string, to: string): number =>
  differenceInCalendarDays(parseDayKey(to), parseDayKey(from));

/** Every day key from `from` to `to`, inclusive. */
export const dayRange = (from: string, to: string): string[] => {
  const count = daysBetweenKeys(from, to);
  if (count < 0) return [];
  return Array.from({ length: count + 1 }, (_, i) => addDayKey(from, i));
};

// ─── Profile (baseline) ──────────────────────────────────────────

export const applianceDailyKwh = (appliance: Appliance, hours = appliance.hoursPerDay): number =>
  (appliance.powerRating * hours * appliance.quantity) / 1000;

/** Typical daily kWh of the current profile: active appliances at their usual hours. */
export const profileDailyKwh = (appliances: Appliance[]): number =>
  appliances.reduce((sum, a) => sum + (a.isActive ? applianceDailyKwh(a) : 0), 0);

/** Default hours to pre-fill a day log: usual hours for active devices, 0 for paused ones. */
export const defaultHours = (appliances: Appliance[]): Record<string, number> =>
  Object.fromEntries(appliances.map((a) => [a.id, a.isActive ? a.hoursPerDay : 0]));

// ─── Records ─────────────────────────────────────────────────────

const MEASURED: UsageSource[] = ['logged', 'meter', 'smart-plug'];

export const recordSource = (record: UsageRecord): UsageSource => record.source ?? 'estimate';

export const isMeasured = (record: UsageRecord): boolean => MEASURED.includes(recordSource(record));

/**
 * kWh saved that day versus the baseline (negative when more than usual was used).
 * Estimates are the baseline itself, so they never count as savings.
 */
export const recordSavings = (record: UsageRecord, fallbackBaseline = 0): number => {
  if (!isMeasured(record)) return 0;
  const baseline = record.baselineKwh ?? fallbackBaseline;
  if (baseline <= 0) return 0;
  return baseline - record.totalConsumption;
};

interface BuildRecordInput {
  date: string;
  appliances: Appliance[];
  hours: Record<string, number>;
  settings: Pick<AppSettings, 'electricityRate' | 'co2Factor'>;
  source?: UsageSource;
  note?: string;
  id?: string;
}

/** Builds a day record from the hours each appliance actually ran. */
export const buildDayRecord = ({
  date, appliances, hours, settings, source = 'logged', note, id,
}: BuildRecordInput): UsageRecord => {
  const applianceHours: Record<string, number> = {};
  let total = 0;
  for (const appliance of appliances) {
    const h = clamp(hours[appliance.id] ?? 0, 0, 24);
    applianceHours[appliance.id] = h;
    total += applianceDailyKwh(appliance, h);
  }
  return {
    id: id ?? `record-${date}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    appliances: appliances.map((a) => ({ ...a })),
    totalConsumption: round(total, 4),
    totalCost: round(total * settings.electricityRate, 4),
    totalCO2: round(total * settings.co2Factor, 4),
    source,
    baselineKwh: round(profileDailyKwh(appliances), 4),
    applianceHours,
    ...(note ? { note } : {}),
  };
};

/** Records sorted oldest → newest, one per day (the most trustworthy source wins). */
export const normalizeRecords = (records: UsageRecord[]): UsageRecord[] => {
  const rank: Record<UsageSource, number> = { estimate: 0, 'smart-plug': 1, logged: 2, meter: 3 };
  const byDay = new Map<string, UsageRecord>();
  for (const record of records) {
    const key = toDayKey(record.date);
    const existing = byDay.get(key);
    if (!existing || rank[recordSource(record)] >= rank[recordSource(existing)]) byDay.set(key, record);
  }
  return [...byDay.values()].sort((a, b) => toDayKey(a.date).localeCompare(toDayKey(b.date)));
};

export const recordsInRange = (records: UsageRecord[], from: string, to: string): UsageRecord[] =>
  records.filter((r) => {
    const key = toDayKey(r.date);
    return key >= from && key <= to;
  });

// ─── Meter readings ──────────────────────────────────────────────

/**
 * Turns cumulative meter readings into kWh per day. The usage between two readings is spread
 * evenly over the days after the first reading up to and including the day of the second
 * (readings are usually taken in the evening, so the interval belongs to the days it closes).
 * Two readings on the same day are merged into the next interval.
 */
export const meterDailyUsage = (readings: MeterReading[]): Map<string, number> => {
  const usage = new Map<string, number>();
  const sorted = [...readings].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  let anchor: MeterReading | null = null;
  for (const reading of sorted) {
    if (!anchor) {
      anchor = reading;
      continue;
    }
    const from = toDayKey(anchor.takenAt);
    const to = toDayKey(reading.takenAt);
    const days = daysBetweenKeys(from, to);
    if (days < 1) continue; // same day: keep the earlier anchor
    const kWh = reading.value - anchor.value;
    if (kWh >= 0) {
      const perDay = kWh / days;
      for (let i = 1; i <= days; i += 1) usage.set(addDayKey(from, i), round(perDay, 4));
    }
    anchor = reading;
  }
  return usage;
};

/** Error message when a reading would go backwards in time, or null when it fits. */
export const validateMeterReading = (
  readings: MeterReading[], value: number, takenAt: string, ignoreId?: string,
): string | null => {
  if (!Number.isFinite(value) || value < 0) return 'Enter the number shown on your meter (0 or more).';
  if (!Number.isFinite(Date.parse(takenAt))) return 'Choose when the reading was taken.';
  if (Date.parse(takenAt) > Date.now() + 60000) return 'Readings cannot be in the future.';
  const others = readings.filter((r) => r.id !== ignoreId);
  const before = others.filter((r) => r.takenAt <= takenAt).sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0];
  const after = others.filter((r) => r.takenAt > takenAt).sort((a, b) => a.takenAt.localeCompare(b.takenAt))[0];
  if (before && value < before.value) {
    return `Meters only count up. Your reading on ${format(new Date(before.takenAt), 'd MMM')} was ${before.value} kWh.`;
  }
  if (after && value > after.value) {
    return `This is higher than your later reading on ${format(new Date(after.takenAt), 'd MMM')} (${after.value} kWh).`;
  }
  return null;
};

// ─── Baselines and summaries ─────────────────────────────────────

/**
 * What a normal day looks like before `beforeDay`: the average of the last 14 measured days when
 * there are at least 3, otherwise the appliance profile.
 */
export const typicalDailyKwh = (records: UsageRecord[], appliances: Appliance[], beforeDay?: string): number => {
  const measured = normalizeRecords(records)
    .filter((r) => isMeasured(r) && (!beforeDay || toDayKey(r.date) < beforeDay))
    .slice(-14);
  if (measured.length >= 3) return measured.reduce((s, r) => s + r.totalConsumption, 0) / measured.length;
  return profileDailyKwh(appliances);
};

export interface PeriodSummary {
  from: string;
  to: string;
  days: number;
  /** Days with a logged, metered or plug record. */
  measuredDays: number;
  /** Days with any record (including estimate snapshots). */
  recordedDays: number;
  kWh: number;
  cost: number;
  co2: number;
  /** Average per recorded day (0 when nothing is recorded). */
  avgDaily: number;
  /** Net kWh saved vs baseline on measured days (negative = overuse). */
  netSavedKwh: number;
  /** Only the days below baseline. */
  savedKwh: number;
  baselineKwh: number;
}

export const summarizeRange = (
  records: UsageRecord[], from: string, to: string, settings: Pick<AppSettings, 'electricityRate' | 'co2Factor'>,
): PeriodSummary => {
  const inRange = recordsInRange(normalizeRecords(records), from, to);
  let kWh = 0; let cost = 0; let co2 = 0; let net = 0; let saved = 0; let baseline = 0; let measured = 0;
  for (const r of inRange) {
    kWh += r.totalConsumption;
    cost += r.totalCost > 0 || r.totalConsumption === 0 ? r.totalCost : r.totalConsumption * settings.electricityRate;
    co2 += r.totalCO2 > 0 || r.totalConsumption === 0 ? r.totalCO2 : r.totalConsumption * settings.co2Factor;
    if (isMeasured(r)) {
      measured += 1;
      const s = recordSavings(r);
      net += s;
      if (s > 0) saved += s;
      baseline += r.baselineKwh ?? 0;
    }
  }
  return {
    from, to,
    days: Math.max(daysBetweenKeys(from, to) + 1, 0),
    measuredDays: measured,
    recordedDays: inRange.length,
    kWh, cost, co2,
    avgDaily: inRange.length ? kWh / inRange.length : 0,
    netSavedKwh: net,
    savedKwh: saved,
    baselineKwh: baseline,
  };
};

export interface SeriesPoint {
  key: string;
  date: Date;
  kWh: number | null;
  baseline: number | null;
  source: UsageSource | null;
}

/** One point per day for the last `days` days ending `endKey` (null where nothing is recorded). */
export const dailySeries = (records: UsageRecord[], days: number, endKey: string): SeriesPoint[] => {
  const byDay = new Map(normalizeRecords(records).map((r) => [toDayKey(r.date), r]));
  return dayRange(addDayKey(endKey, -(days - 1)), endKey).map((key) => {
    const r = byDay.get(key);
    return {
      key,
      date: parseDayKey(key),
      kWh: r ? r.totalConsumption : null,
      baseline: r?.baselineKwh ?? null,
      source: r ? recordSource(r) : null,
    };
  });
};

/** Average kWh per weekday (0 = Sunday) over measured days, null for weekdays with no data. */
export const weekdayProfile = (records: UsageRecord[]): (number | null)[] => {
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  for (const r of normalizeRecords(records)) {
    const day = parseDayKey(toDayKey(r.date)).getDay();
    sums[day] += r.totalConsumption;
    counts[day] += 1;
  }
  return sums.map((s, i) => (counts[i] ? s / counts[i] : null));
};

// ─── Streaks ─────────────────────────────────────────────────────

export const measuredDayKeys = (records: UsageRecord[]): Set<string> =>
  new Set(records.filter(isMeasured).map((r) => toDayKey(r.date)));

/** Longest run of consecutive keys in `days` between from and to (inclusive). */
export const longestRun = (days: Set<string>, from: string, to: string): number => {
  let best = 0; let run = 0;
  for (const key of dayRange(from, to)) {
    run = days.has(key) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
};

// ─── Challenges ──────────────────────────────────────────────────

export interface ChallengeEvaluation {
  currentProgress: number;
  status: ChallengeStatus;
  isCompleted: boolean;
  completedAt?: string;
}

/**
 * Last day (inclusive) of a period that starts and ends at the same time of day, e.g. a 7-day
 * challenge from Monday 09:00 to the next Monday 09:00 covers Monday to Sunday.
 */
export const periodLastDay = (startIso: string, endIso: string): string => {
  const start = toDayKey(startIso);
  const days = Math.max(daysBetweenKeys(start, toDayKey(endIso)), 1);
  return addDayKey(start, days - 1);
};

/** Last day (inclusive) a challenge counts, as a day key. */
export const challengeLastDay = (challenge: Challenge): string => periodLastDay(challenge.startDate, challenge.endDate);

/**
 * Progress measured from data:
 *  energy → kWh below baseline on measured days in the window
 *  cost   → that saving priced at the current rate
 *  streak → longest run of consecutive measured days in the window
 *  custom → number of daily check-ins in the window
 */
export const challengeProgress = (
  challenge: Challenge, records: UsageRecord[], electricityRate: number, todayKey: string,
): number => {
  const from = toDayKey(challenge.startDate);
  const last = challengeLastDay(challenge);
  const to = last < todayKey ? last : todayKey;
  if (to < from) return 0;
  switch (challenge.type) {
    case 'energy':
    case 'cost': {
      const kWh = recordsInRange(normalizeRecords(records), from, to)
        .reduce((sum, r) => sum + Math.max(0, recordSavings(r, challenge.baselineDaily ?? 0)), 0);
      return round(challenge.type === 'cost' ? kWh * electricityRate : kWh, 3);
    }
    case 'streak':
      return longestRun(measuredDayKeys(records), from, to);
    default:
      return new Set((challenge.checkIns ?? []).filter((d) => d >= from && d <= to)).size;
  }
};

export const evaluateChallenge = (
  challenge: Challenge, records: UsageRecord[], electricityRate: number, now: Date,
): ChallengeEvaluation => {
  // Completed challenges keep their result even if old logs are edited later
  if (challenge.isCompleted || challenge.status === 'completed') {
    return {
      currentProgress: challenge.currentProgress,
      status: 'completed',
      isCompleted: true,
      completedAt: challenge.completedAt ?? challenge.endDate,
    };
  }
  const progress = challengeProgress(challenge, records, electricityRate, dayKey(now));
  if (challenge.target > 0 && progress >= challenge.target) {
    return { currentProgress: progress, status: 'completed', isCompleted: true, completedAt: now.toISOString() };
  }
  const ended = dayKey(now) > challengeLastDay(challenge);
  return { currentProgress: progress, status: ended ? 'failed' : 'active', isCompleted: false };
};

// ─── Goals ───────────────────────────────────────────────────────

export interface GoalEvaluation {
  currentValue: number;
  projectedValue: number;
  status: GoalStatus;
  isAchieved: boolean;
  loggedDays: number;
  periodDays: number;
  elapsedDays: number;
}

/**
 * A goal is a limit for its whole period. Used so far = recorded days in the period, plus the
 * profile estimate for past days nobody logged (so skipping logs does not look like saving).
 */
export const evaluateGoal = (
  goal: UserGoal,
  records: UsageRecord[],
  appliances: Appliance[],
  settings: Pick<AppSettings, 'electricityRate' | 'co2Factor'>,
  now: Date,
): GoalEvaluation => {
  const start = toDayKey(goal.createdAt);
  const end = periodLastDay(goal.createdAt, goal.deadline);
  const periodDays = daysBetweenKeys(start, end) + 1;
  const today = dayKey(now);
  const lastCounted = today < end ? today : end;
  const byDay = new Map(normalizeRecords(records).map((r) => [toDayKey(r.date), r]));
  const estimate = profileDailyKwh(appliances);
  const valueOf = (kWh: number) =>
    goal.type === 'consumption' ? kWh : goal.type === 'cost' ? kWh * settings.electricityRate : kWh * settings.co2Factor;

  let used = 0; let counted = 0; let logged = 0;
  for (const key of dayRange(start, lastCounted)) {
    const r = byDay.get(key);
    if (r) {
      used += goal.type === 'cost' && r.totalCost > 0 ? r.totalCost : valueOf(r.totalConsumption);
      counted += 1;
      if (isMeasured(r)) logged += 1;
    } else if (key < today) {
      used += valueOf(estimate);
      counted += 1;
    }
  }
  const elapsedDays = Math.min(Math.max(daysBetweenKeys(start, today) + 1, 0), periodDays);
  const remaining = Math.max(periodDays - counted, 0);
  const pace = counted > 0 ? used / counted : valueOf(estimate);
  const projected = used + pace * remaining;
  const ended = today > end;
  let status: GoalStatus;
  if (ended) status = used <= goal.target ? 'achieved' : 'missed';
  else if (used > goal.target) status = 'over';
  else if (projected > goal.target) status = 'at-risk';
  else status = 'on-track';
  return {
    currentValue: round(used, 3),
    projectedValue: round(projected, 3),
    status,
    isAchieved: status === 'achieved',
    loggedDays: logged,
    periodDays,
    elapsedDays,
  };
};

// ─── Equivalents ─────────────────────────────────────────────────

/** kg CO₂ one mature tree absorbs in a year. */
export const TREE_KG_PER_YEAR = 21.77;

export const equivalents = (kWh: number, co2Kg: number) => ({
  /** Trees absorbing CO₂ for a whole year */
  treeYears: co2Kg / TREE_KG_PER_YEAR,
  /** Full smartphone charges (~12 Wh each) */
  phoneCharges: (kWh * 1000) / 12,
  /** Hours of a 10 W LED bulb */
  ledHours: (kWh * 1000) / 10,
  /** Kilometres not driven in an average petrol car (~170 g CO₂/km) */
  carKm: co2Kg / 0.17,
  /** Laptop working days (~50 Wh each) */
  laptopDays: (kWh * 1000) / 50,
});

// ─── Helpers ─────────────────────────────────────────────────────

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Percent change from previous to current; null when there is nothing to compare. */
export const percentChange = (current: number, previous: number): number | null =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;

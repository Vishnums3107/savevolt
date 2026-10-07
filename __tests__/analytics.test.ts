import {
  buildDayRecord,
  challengeProgress,
  dailySeries,
  dayKey,
  evaluateChallenge,
  evaluateGoal,
  longestRun,
  meterDailyUsage,
  normalizeRecords,
  parseDayKey,
  profileDailyKwh,
  recordSavings,
  summarizeRange,
  typicalDailyKwh,
  validateMeterReading,
} from '../src/utils/analytics';
import { Appliance, ApplianceCategory, Challenge, MeterReading, UsageRecord, UserGoal } from '../src/types';
import { sha256 } from '../src/utils/sha256';
import { decodeShareCode, encodeShareCode, findShareCode } from '../src/utils/shareCodes';
import { draftCertificate, issueCertificate, verifyCertificateChain } from '../src/utils/certificates';
import { levelFor, mergeBadges } from '../src/utils/gamification';

const settings = { electricityRate: 0.2, co2Factor: 0.5 };

const appliance = (id: string, watts: number, hours: number, overrides: Partial<Appliance> = {}): Appliance => ({
  id, name: id, powerRating: watts, hoursPerDay: hours, quantity: 1, category: ApplianceCategory.OTHER,
  createdAt: '2026-01-01T00:00:00.000Z', isActive: true, ...overrides,
});

// 1000 W × 4 h = 4 kWh, 100 W × 10 h = 1 kWh → 5 kWh typical day
const home = [appliance('ac', 1000, 4), appliance('tv', 100, 10), appliance('off', 500, 2, { isActive: false })];

const logged = (date: string, acHours: number): UsageRecord =>
  buildDayRecord({ date, appliances: home, hours: { ac: acHours, tv: 10, off: 0 }, settings });

describe('day keys', () => {
  it('parses yyyy-MM-dd as a local date', () => {
    const date = parseDayKey('2026-03-09');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(2);
    expect(date.getDate()).toBe(9);
    expect(dayKey(date)).toBe('2026-03-09');
  });
});

describe('records and savings', () => {
  it('builds a logged record from actual hours with the profile as baseline', () => {
    const record = logged('2026-01-10', 2);
    expect(profileDailyKwh(home)).toBe(5);
    expect(record.totalConsumption).toBe(3);
    expect(record.baselineKwh).toBe(5);
    expect(record.totalCost).toBeCloseTo(0.6);
    expect(record.source).toBe('logged');
    expect(recordSavings(record)).toBe(2);
  });

  it('never counts estimate snapshots as savings', () => {
    const estimate: UsageRecord = { ...logged('2026-01-10', 0), source: 'estimate' };
    expect(recordSavings(estimate)).toBe(0);
    const legacy: UsageRecord = { id: 'x', date: '2026-01-10', appliances: [], totalConsumption: 1, totalCost: 0, totalCO2: 0 };
    expect(recordSavings(legacy, 10)).toBe(0);
  });

  it('keeps the most trustworthy record per day', () => {
    const estimate: UsageRecord = { ...logged('2026-01-10', 4), id: 'e', source: 'estimate' };
    const meter: UsageRecord = { ...logged('2026-01-10', 4), id: 'm', source: 'meter' };
    expect(normalizeRecords([meter, estimate]).map((r) => r.id)).toEqual(['m']);
  });

  it('summarizes a range over recorded days only', () => {
    const records = [logged('2026-01-10', 2), logged('2026-01-12', 6)];
    const summary = summarizeRange(records, '2026-01-10', '2026-01-12', settings);
    expect(summary.days).toBe(3);
    expect(summary.recordedDays).toBe(2);
    expect(summary.kWh).toBe(10);
    expect(summary.avgDaily).toBe(5);
    expect(summary.savedKwh).toBe(2);
    expect(summary.netSavedKwh).toBe(0);
  });

  it('marks unrecorded days as null in a series', () => {
    const series = dailySeries([logged('2026-01-10', 2)], 3, '2026-01-11');
    expect(series.map((p) => p.kWh)).toEqual([null, 3, null]);
    expect(series[1].source).toBe('logged');
  });

  it('uses measured history for the typical day once there are three logs', () => {
    expect(typicalDailyKwh([logged('2026-01-10', 2)], home)).toBe(5);
    const records = [logged('2026-01-10', 2), logged('2026-01-11', 2), logged('2026-01-12', 2)];
    expect(typicalDailyKwh(records, home)).toBe(3);
    expect(typicalDailyKwh(records, home, '2026-01-12')).toBe(5);
  });
});

describe('meter readings', () => {
  const reading = (id: string, takenAt: string, value: number): MeterReading => ({ id, takenAt, value });

  it('spreads usage evenly across the days an interval closes', () => {
    const usage = meterDailyUsage([
      reading('a', new Date(2026, 0, 10, 20).toISOString(), 1000),
      reading('b', new Date(2026, 0, 13, 20).toISOString(), 1030),
    ]);
    expect([...usage.entries()]).toEqual([['2026-01-11', 10], ['2026-01-12', 10], ['2026-01-13', 10]]);
  });

  it('holds same-day readings until the next day', () => {
    const usage = meterDailyUsage([
      reading('a', new Date(2026, 0, 10, 8).toISOString(), 1000),
      reading('b', new Date(2026, 0, 10, 20).toISOString(), 1005),
      reading('c', new Date(2026, 0, 11, 20).toISOString(), 1012),
    ]);
    expect([...usage.entries()]).toEqual([['2026-01-11', 12]]);
  });

  it('rejects readings that go backwards', () => {
    const readings = [reading('a', new Date(2026, 0, 10).toISOString(), 1000)];
    expect(validateMeterReading(readings, 990, new Date(2026, 0, 11).toISOString())).toMatch(/only count up/);
    expect(validateMeterReading(readings, 1010, new Date(2026, 0, 9).toISOString())).toMatch(/higher than your later/);
    expect(validateMeterReading(readings, 1001, new Date(2026, 0, 11).toISOString())).toBeNull();
    expect(validateMeterReading(readings, -1, new Date(2026, 0, 11).toISOString())).toMatch(/0 or more/);
  });
});

describe('challenges', () => {
  const base: Challenge = {
    id: 'c', title: 'Save', description: '', type: 'energy', target: 3, currentProgress: 0, duration: 7,
    startDate: new Date(2026, 0, 10).toISOString(), endDate: new Date(2026, 0, 17).toISOString(),
    isCompleted: false, createdBy: 'self', baselineDaily: 5,
  };
  const records = [logged('2026-01-09', 0), logged('2026-01-10', 2), logged('2026-01-11', 3), logged('2026-01-12', 5)];

  it('measures energy saved inside the window only', () => {
    expect(challengeProgress(base, records, 0.2, '2026-01-12')).toBe(3);
    expect(challengeProgress({ ...base, type: 'cost' }, records, 0.2, '2026-01-12')).toBeCloseTo(0.6);
  });

  it('counts the longest run of logged days for streak challenges', () => {
    expect(challengeProgress({ ...base, type: 'streak' }, records, 0.2, '2026-01-12')).toBe(3);
    expect(longestRun(new Set(['2026-01-01', '2026-01-03', '2026-01-04']), '2026-01-01', '2026-01-05')).toBe(2);
  });

  it('counts check-ins for custom habits', () => {
    const custom = { ...base, type: 'custom' as const, checkIns: ['2026-01-10', '2026-01-10', '2026-01-11', '2026-01-30'] };
    expect(challengeProgress(custom, [], 0.2, '2026-01-12')).toBe(2);
  });

  it('completes when the target is reached and fails after the end', () => {
    const done = evaluateChallenge(base, records, 0.2, new Date(2026, 0, 12, 12));
    expect(done.status).toBe('completed');
    expect(done.isCompleted).toBe(true);
    const failed = evaluateChallenge({ ...base, target: 50 }, records, 0.2, new Date(2026, 0, 18));
    expect(failed.status).toBe('failed');
    const active = evaluateChallenge({ ...base, target: 50 }, records, 0.2, new Date(2026, 0, 12));
    expect(active.status).toBe('active');
  });
});

describe('goals', () => {
  const goal: UserGoal = {
    id: 'g', type: 'consumption', target: 40, currentValue: 0, isAchieved: false,
    createdAt: new Date(2026, 0, 10, 9).toISOString(), deadline: new Date(2026, 0, 20, 9).toISOString(),
  };

  it('fills unlogged past days with the estimate and projects the period', () => {
    // Logged 3 kWh on the 10th, nothing on the 11th (estimate 5), today the 12th not logged yet
    const result = evaluateGoal(goal, [logged('2026-01-10', 2)], home, settings, new Date(2026, 0, 12, 12));
    expect(result.periodDays).toBe(10);
    expect(result.currentValue).toBe(8);
    expect(result.loggedDays).toBe(1);
    expect(result.projectedValue).toBe(40);
    expect(result.status).toBe('on-track');
  });

  it('flags a goal at risk or over, and settles it at the deadline', () => {
    expect(evaluateGoal({ ...goal, target: 30 }, [], home, settings, new Date(2026, 0, 12)).status).toBe('at-risk');
    expect(evaluateGoal({ ...goal, target: 4 }, [], home, settings, new Date(2026, 0, 12)).status).toBe('over');
    expect(evaluateGoal({ ...goal, target: 60 }, [], home, settings, new Date(2026, 0, 21)).status).toBe('achieved');
    expect(evaluateGoal({ ...goal, target: 10 }, [], home, settings, new Date(2026, 0, 21)).status).toBe('missed');
  });

  it('converts to cost and CO2', () => {
    const cost = evaluateGoal({ ...goal, type: 'cost' }, [], home, settings, new Date(2026, 0, 12));
    expect(cost.currentValue).toBeCloseTo(2); // two estimated days × 5 kWh × 0.2
    const co2 = evaluateGoal({ ...goal, type: 'co2' }, [], home, settings, new Date(2026, 0, 12));
    expect(co2.currentValue).toBeCloseTo(5);
  });
});

describe('sha256', () => {
  it('matches known vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('héllo ⚡')).toHaveLength(64);
  });
});

describe('share codes', () => {
  const score = {
    v: 1 as const, id: 'sv-friend-1', name: 'Priya ⚡', points: 320, level: 3, weekSavedKwh: 4.2,
    savingsPercent: 12.5, streak: 6, badges: 4, at: '2026-01-12T10:00:00.000Z',
  };

  it('round-trips a score card, even inside a pasted message', () => {
    const code = encodeShareCode('S', score);
    expect(code.startsWith('SV1S.')).toBe(true);
    const decoded = decodeShareCode(`Add me on SaveVolt! ${code} see you`);
    expect(decoded.kind).toBe('S');
    expect(decoded.payload).toEqual(score);
    expect(findShareCode(`x ${code} y`)).toBe(code);
  });

  it('rejects tampered, wrong-kind and garbage codes with readable errors', () => {
    const code = encodeShareCode('S', score);
    const tampered = code.replace(/\.([A-Za-z0-9_-])/, (m, c) => `.${c === 'A' ? 'B' : 'A'}`);
    expect(() => decodeShareCode(tampered)).toThrow(/incomplete or was changed/);
    expect(() => decodeShareCode(code, 'G')).toThrow(/score card, not a goal invite/);
    expect(() => decodeShareCode('hello')).toThrow(/does not look like/);
  });

  it('validates payload contents', () => {
    const bad = encodeShareCode('C', { v: 1, goalId: 'goal-1', participant: 'Sam', kWh: -5, at: '2026-01-01' });
    expect(() => decodeShareCode(bad)).toThrow(/invalid data/);
  });
});

describe('savings certificates', () => {
  const records = [logged('2026-01-10', 2), logged('2026-01-11', 4), logged('2026-01-12', 1)];

  it('certifies measured savings up to yesterday, then only new days', () => {
    const draft = draftCertificate(records, [], settings, '2026-01-12');
    expect(draft).toMatchObject({ periodStart: '2026-01-10', periodEnd: '2026-01-11', kWhSaved: 2, daysCounted: 2 });
    const first = issueCertificate(draft!, [], new Date(2026, 0, 12));
    expect(draftCertificate(records, [first], settings, '2026-01-12')).toBeNull();
    const next = draftCertificate(records, [first], settings, '2026-01-13');
    expect(next).toMatchObject({ periodStart: '2026-01-12', kWhSaved: 3 });
  });

  it('detects edits anywhere in the chain', () => {
    const a = issueCertificate(draftCertificate(records, [], settings, '2026-01-12')!, [], new Date(2026, 0, 12));
    const b = issueCertificate(draftCertificate(records, [a], settings, '2026-01-13')!, [a], new Date(2026, 0, 13));
    expect(verifyCertificateChain([a, b])).toEqual({ valid: true, brokenAt: -1 });
    expect(verifyCertificateChain([{ ...a, kWhSaved: 99 }, b]).brokenAt).toBe(0);
    expect(verifyCertificateChain([b]).valid).toBe(false);
  });
});

describe('gamification', () => {
  it('maps points to levels with progress', () => {
    expect(levelFor(0)).toMatchObject({ level: 1, name: 'Spark', next: 100, progress: 0 });
    expect(levelFor(175)).toMatchObject({ level: 2, progress: 0.5 });
    expect(levelFor(99999)).toMatchObject({ level: 8, next: null, progress: 1 });
  });

  it('keeps earned badges and adds new definitions', () => {
    const merged = mergeBadges([{ id: 'badge-1', isEarned: true, earnedAt: '2026-01-01', name: 'old', description: '', icon: '' }]);
    expect(merged).toHaveLength(12);
    expect(merged[0]).toMatchObject({ id: 'badge-1', isEarned: true, name: 'First Steps' });
    expect(merged.slice(1).every((b) => !b.isEarned)).toBe(true);
  });
});

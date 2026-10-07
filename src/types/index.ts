// TypeScript interfaces and types for the Energy Management App

export interface Appliance {
  id: string;
  name: string;
  powerRating: number; // in watts
  hoursPerDay: number;
  quantity: number;
  category: ApplianceCategory;
  createdAt: string;
  isActive: boolean;
  hardwareLink?: HardwareLink;
  /** Latest wattage measured by a linked smart plug (never overwrites powerRating). */
  measuredWatts?: number;
  measuredAt?: string;
}

export type HardwareProvider = 'home-assistant' | 'shelly' | 'virtual';

export interface HardwareLink {
  provider: HardwareProvider;
  deviceId: string;
  powerSensorId?: string;
}

export enum ApplianceCategory {
  LIGHTING = 'Lighting',
  COOLING = 'Cooling',
  HEATING = 'Heating',
  KITCHEN = 'Kitchen',
  ENTERTAINMENT = 'Entertainment',
  LAUNDRY = 'Laundry',
  OFFICE = 'Office',
  OTHER = 'Other',
}

export interface EnergyConsumption {
  applianceId: string;
  applianceName: string;
  dailyConsumption: number; // kWh
  monthlyConsumption: number; // kWh
  dailyCost: number;
  monthlyCost: number;
  co2Emissions: number; // kg CO2
  percentage: number; // percentage of total consumption
}

/**
 * Where a day's numbers came from:
 *  - estimate:   snapshot of the appliance profile (rated watts x usual hours)
 *  - logged:     the user confirmed or adjusted each appliance's hours for that day
 *  - meter:      derived from two utility-meter readings (ground truth)
 *  - smart-plug: accumulated from live plug readings
 * Legacy records without a source are treated as estimates.
 */
export type UsageSource = 'estimate' | 'logged' | 'meter' | 'smart-plug';

export interface UsageRecord {
  id: string;
  date: string; // yyyy-MM-dd
  appliances: Appliance[];
  totalConsumption: number; // kWh
  totalCost: number;
  totalCO2: number;
  source?: UsageSource;
  /** What a typical day would have used with the profile at that time (kWh); savings are measured against it. */
  baselineKwh?: number;
  /** Hours each appliance actually ran that day (logged records). */
  applianceHours?: Record<string, number>;
  note?: string;
}

/** A cumulative reading from the utility meter (kWh). */
export interface MeterReading {
  id: string;
  takenAt: string; // ISO date-time
  value: number; // cumulative kWh shown on the meter
  note?: string;
}

export interface DashboardData {
  totalEnergyConsumed: number; // kWh
  totalCost: number;
  totalCO2Saved: number; // kg
  treesEquivalent: number;
  topConsumers: EnergyConsumption[];
  consumptionByCategory: CategoryConsumption[];
}

export interface CategoryConsumption {
  category: ApplianceCategory;
  consumption: number; // kWh
  cost: number;
  percentage: number;
}

export interface TrendData {
  date: string;
  consumption: number;
  cost: number;
  co2: number;
}

export interface ComparisonData {
  current: number;
  previous: number;
  percentageChange: number;
  isImprovement: boolean;
}

export interface EnergyTip {
  id: string;
  title: string;
  description: string;
  category: ApplianceCategory | 'General';
  potentialSavings: number; // kWh per month
  priority: 'high' | 'medium' | 'low';
  isPersonalized: boolean;
}

export interface Reminder {
  id: string;
  title: string;
  message: string;
  time: string; // HH:MM format
  days: number[]; // 0-6, where 0 is Sunday
  isActive: boolean;
  applianceId?: string;
}

export interface MonthlyReport {
  month: string;
  year: number;
  totalConsumption: number;
  totalCost: number;
  totalCO2: number;
  treesEquivalent: number;
  topAppliances: EnergyConsumption[];
  dailyAverage: number;
  comparisonWithLastMonth: ComparisonData;
  tips: EnergyTip[];
  achievedGoals: number;
}

export type GoalStatus = 'on-track' | 'at-risk' | 'over' | 'achieved' | 'missed';

export interface UserGoal {
  id: string;
  type: 'consumption' | 'cost' | 'co2';
  /** Limit for the whole goal period (createdAt to deadline). */
  target: number;
  /** Used so far in the period (logged days, plus estimates for unlogged past days). */
  currentValue: number;
  deadline: string; // ISO date string
  isAchieved: boolean;
  createdAt: string;
  /** End-of-period forecast at the current pace. */
  projectedValue?: number;
  status?: GoalStatus;
  /** Days in the period that have a logged or metered record. */
  loggedDays?: number;
  title?: string;
}

// Alias for compatibility with services
export type Goal = UserGoal;

export interface Achievement extends Badge {
  // Achievement is an alias for Badge
}

export interface Streak {
  currentStreak: number; // days
  longestStreak: number; // days
  lastActivityDate: string;
  totalDaysActive: number;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt?: string;
  isEarned: boolean;
}

export interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  season: 'spring' | 'summer' | 'fall' | 'winter';
  location: string;
  source: 'live' | 'fallback';
}

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
  suggestions?: string[];
  source?: 'gemini' | 'local' | 'system';
  /** An action the assistant offered or performed (e.g. switching an appliance off). */
  action?: { type: string; label: string; done?: boolean; payload?: Record<string, unknown> };
  /** Model that produced a Gemini reply. */
  model?: string;
}

export interface AppSettings {
  electricityRate: number; // per kWh
  currency: string;
  co2Factor: number; // kg CO2 per kWh
  notificationsEnabled: boolean;
  weatherLocation: string;
  darkMode: boolean;
  voiceEnabled: boolean;
  geminiApiKey?: string;
  geminiModel?: string;
  /** Name shown on share codes, the leaderboard and shared goals. Device-level. */
  displayName?: string;
}

/** Settings that belong to the device/person rather than to one home. */
export const DEVICE_SETTING_KEYS = [
  'darkMode', 'notificationsEnabled', 'voiceEnabled', 'geminiApiKey', 'geminiModel', 'displayName',
] as const;
export type DeviceSettingKey = typeof DEVICE_SETTING_KEYS[number];

export interface Household {
  id: string;
  name: string;
  createdAt: string;
  cloudId?: string;
  cloudOwnerId?: string;
  cloudRevision?: number;
}

/** Portable household data. Device preferences and credentials stay on the device. */
export interface HouseholdData {
  appliances: Appliance[];
  usageRecords: UsageRecord[];
  reminders: Reminder[];
  goals: UserGoal[];
  streak: Streak;
  badges: Badge[];
  rooms: Room[];
  communityGoals: CommunityGoal[];
  challenges: Challenge[];
  snapshots: DailySnapshot[];
  activeTimers: CountdownTimer[];
  settings: Pick<AppSettings, 'electricityRate' | 'currency' | 'co2Factor' | 'weatherLocation'>;
  meterReadings?: MeterReading[];
  points?: PointsLedger;
  insightState?: InsightState;
  certificates?: SavingsCertificate[];
  bills?: UtilityBill[];
}

// New types for additional features

export interface Room {
  id: string;
  name: string;
  appliances: string[]; // appliance IDs
  position: { x: number; y: number }; // for map visualization
}

export interface EnergyHotspot {
  roomId: string;
  roomName: string;
  totalConsumption: number; // kWh
  totalCost: number;
  percentage: number;
  color: string; // heat map color
}

export interface CommunityContribution {
  id: string;
  participant: string;
  kWh: number;
  date: string; // ISO date-time it was recorded
  /** auto: your measured savings, manual: typed in, import: from a teammate's share code */
  source: 'auto' | 'manual' | 'import';
  note?: string;
}

export interface CommunityGoal {
  id: string;
  title: string;
  description: string;
  targetEnergy: number; // kWh to save
  currentEnergy: number; // kWh saved so far (sum of contributions)
  participants: string[]; // display names
  deadline: string; // ISO date string
  isAchieved: boolean;
  createdAt: string;
  createdBy: string;
  contributions?: CommunityContribution[];
  /** Name you appear as in this goal (defaults to your profile name). */
  me?: string;
  achievedAt?: string;
}

export type ChallengeStatus = 'active' | 'completed' | 'failed';

export interface Challenge {
  id: string;
  title: string;
  description: string;
  /**
   * energy: kWh saved vs your baseline (measured from logs)
   * cost:   money saved vs your baseline (measured from logs)
   * streak: consecutive days with a log
   * custom: daily check-ins for a habit you define
   */
  type: 'energy' | 'cost' | 'streak' | 'custom';
  target: number;
  currentProgress: number;
  duration: number; // days
  startDate: string;
  endDate: string;
  isCompleted: boolean;
  reward?: string;
  createdBy: string; // 'self' or user ID
  participants?: string[];
  /** Typical daily kWh when the challenge started; used when a log has no baseline. */
  baselineDaily?: number;
  /** yyyy-MM-dd dates checked in (custom challenges). */
  checkIns?: string[];
  status?: ChallengeStatus;
  completedAt?: string;
  /** Points awarded on completion. */
  points?: number;
}

export interface DailySnapshot {
  id: string;
  date: string;
  energyConsumed: number; // kWh
  moneySaved: number;
  co2Avoided: number; // kg
  topSavingAction: string;
  streakDays: number;
  imageUri?: string; // for sharing
  /** kWh saved against the baseline that day (negative = used more than usual). */
  energySaved?: number;
  source?: UsageSource;
}

export interface CountdownTimer {
  id: string;
  goalId: string;
  goalTitle: string;
  targetTime: string; // ISO date-time
  currentTime: string;
  remainingHours: number;
  remainingMinutes: number;
  targetValue: number;
  currentValue: number;
  unit: string; // 'kWh', '$', 'kg CO2'
  isActive: boolean;
}

// --- v2: engagement, insights and ledger ---------------------------------

export interface PointsEvent {
  id: string;
  date: string; // ISO date-time
  points: number;
  reason: string;
  /** Prevents awarding the same thing twice (e.g. 'log:2026-01-14'). */
  key: string;
}

export interface PointsLedger {
  total: number;
  events: PointsEvent[];
}

/** Remembers what the user did with tips and recommendations, keyed by stable ids. */
export interface InsightState {
  dismissed: Record<string, string>; // id -> ISO date
  done: Record<string, string>; // id -> ISO date
  saved: Record<string, string>; // id -> ISO date (tips bookmarked for later)
  /** Undo data for applied recommendations: id -> appliance fields before the change. */
  undo: Record<string, { applianceId: string; before: Partial<Appliance>; appliedAt: string; savingsKwh: number }>;
}

/** A locally verifiable record of savings: each entry hashes the previous one. */
export interface SavingsCertificate {
  id: string;
  issuedAt: string;
  periodStart: string; // yyyy-MM-dd
  periodEnd: string; // yyyy-MM-dd
  kWhSaved: number;
  co2AvoidedKg: number;
  moneySaved: number;
  daysCounted: number;
  previousHash: string;
  hash: string;
}

export interface UtilityBill {
  id: string;
  periodStart: string; // yyyy-MM-dd
  periodEnd: string; // yyyy-MM-dd
  kWh: number;
  amount: number;
  createdAt: string;
}

/** A friend's stats, imported from their share code. Stored per device. */
export interface FriendScore {
  id: string; // stable per friend (from their code)
  name: string;
  points: number;
  level: number;
  weekSavedKwh: number;
  savingsPercent: number;
  streak: number;
  badges: number;
  generatedAt: string;
  importedAt: string;
}

export interface ShellyDevice {
  id: string;
  name: string;
  host: string; // IP or hostname on the local network
  generation: 1 | 2;
}

export interface SmartHomeConfig {
  provider: HardwareProvider;
  /** Home Assistant base URL (the token is never stored). */
  haUrl?: string;
  shellyDevices: ShellyDevice[];
}

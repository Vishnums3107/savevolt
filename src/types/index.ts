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
  hardwareLink?: { provider: 'home-assistant'; deviceId: string; powerSensorId?: string };
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

export interface UsageRecord {
  id: string;
  date: string; // ISO date string
  appliances: Appliance[];
  totalConsumption: number; // kWh
  totalCost: number;
  totalCO2: number;
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

export interface UserGoal {
  id: string;
  type: 'consumption' | 'cost' | 'co2';
  target: number;
  currentValue: number;
  deadline: string; // ISO date string
  isAchieved: boolean;
  createdAt: string;
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
}

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

export interface CommunityGoal {
  id: string;
  title: string;
  description: string;
  targetEnergy: number; // kWh to save
  currentEnergy: number; // kWh saved so far
  participants: string[]; // user IDs or names
  deadline: string; // ISO date string
  isAchieved: boolean;
  createdAt: string;
  createdBy: string;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
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

import { Appliance, ApplianceCategory, AppSettings, Room, UsageRecord } from '../../types';
import { subDays } from 'date-fns';
import { buildDayRecord, dayKey } from '../../utils/analytics';

const DEMO_APPLIANCES: Omit<Appliance, 'createdAt'>[] = [
  { id: 'appliance-demo-1', name: 'Smart TV (Living Room)', category: ApplianceCategory.ENTERTAINMENT, powerRating: 150, hoursPerDay: 4, quantity: 1, isActive: true },
  { id: 'appliance-demo-2', name: 'Refrigerator', category: ApplianceCategory.KITCHEN, powerRating: 120, hoursPerDay: 24, quantity: 1, isActive: true },
  { id: 'appliance-demo-3', name: 'Air Conditioner (Bedroom)', category: ApplianceCategory.COOLING, powerRating: 1200, hoursPerDay: 6, quantity: 1, isActive: true },
  { id: 'appliance-demo-4', name: 'Washing Machine', category: ApplianceCategory.LAUNDRY, powerRating: 500, hoursPerDay: 1, quantity: 1, isActive: false },
  { id: 'appliance-demo-5', name: 'LED Ceiling Lights', category: ApplianceCategory.LIGHTING, powerRating: 9, hoursPerDay: 5, quantity: 8, isActive: true },
  { id: 'appliance-demo-6', name: 'Work Laptop', category: ApplianceCategory.OFFICE, powerRating: 65, hoursPerDay: 7, quantity: 1, isActive: true },
  { id: 'appliance-demo-7', name: 'Water Heater', category: ApplianceCategory.HEATING, powerRating: 2000, hoursPerDay: 1, quantity: 1, isActive: true },
  { id: 'appliance-demo-8', name: 'Microwave', category: ApplianceCategory.KITCHEN, powerRating: 1100, hoursPerDay: 0.3, quantity: 1, isActive: true },
];

/** How much each day type tends to differ from the usual hours (weekends: more TV and AC). */
const dayFactor = (category: ApplianceCategory, weekday: number) => {
  const weekend = weekday === 0 || weekday === 6;
  if (!weekend) return category === ApplianceCategory.OFFICE ? 1 : 0.95;
  if (category === ApplianceCategory.OFFICE) return 0.2;
  if (category === ApplianceCategory.ENTERTAINMENT || category === ApplianceCategory.COOLING) return 1.25;
  return 1.05;
};

/**
 * Sample home for exploring the app: eight appliances and three weeks of day logs with natural
 * day-to-day variation (each appliance's hours move independently, weekends differ). Everything
 * is labelled as demo data in the UI and can be edited or removed like real data.
 */
export const generateDemoData = (
  settings: Pick<AppSettings, 'electricityRate' | 'co2Factor'> = { electricityRate: 0.12, co2Factor: 0.92 },
): { appliances: Appliance[]; usageRecords: UsageRecord[]; rooms: Room[] } => {
  const createdAt = subDays(new Date(), 22).toISOString();
  const appliances: Appliance[] = DEMO_APPLIANCES.map((a) => ({ ...a, createdAt }));

  const usageRecords: UsageRecord[] = [];
  for (let i = 21; i >= 1; i--) {
    const date = subDays(new Date(), i);
    const weekday = date.getDay();
    // The household gets a little better over the three weeks
    const learning = 1 - (21 - i) * 0.008;
    const hours: Record<string, number> = {};
    for (const appliance of appliances) {
      if (appliance.hoursPerDay >= 24) { hours[appliance.id] = 24; continue; }
      const usual = appliance.isActive ? appliance.hoursPerDay : (weekday === 6 ? 1.5 : 0);
      const noise = 1 + (Math.random() * 0.5 - 0.25); // ±25 %
      hours[appliance.id] = Math.round(Math.min(usual * dayFactor(appliance.category, weekday) * noise * learning, 24) * 4) / 4;
    }
    usageRecords.push(buildDayRecord({
      id: `record-demo-${i}`,
      date: dayKey(date),
      appliances,
      hours,
      settings,
      source: 'logged',
    }));
  }

  const rooms: Room[] = [
    { id: 'room-demo-living', name: 'Living Room', appliances: ['appliance-demo-1', 'appliance-demo-5'], position: { x: 0, y: 0 } },
    { id: 'room-demo-bedroom', name: 'Bedroom', appliances: ['appliance-demo-3'], position: { x: 1, y: 0 } },
    { id: 'room-demo-kitchen', name: 'Kitchen', appliances: ['appliance-demo-2', 'appliance-demo-8'], position: { x: 0, y: 1 } },
    { id: 'room-demo-utility', name: 'Utility', appliances: ['appliance-demo-4', 'appliance-demo-7'], position: { x: 1, y: 1 } },
    { id: 'room-demo-office', name: 'Office', appliances: ['appliance-demo-6'], position: { x: 0, y: 2 } },
  ];

  return { appliances, usageRecords, rooms };
};

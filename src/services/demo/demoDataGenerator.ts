import { Appliance, UsageRecord, ApplianceCategory } from '../../types';
import { format, subDays } from 'date-fns';

/**
 * Generates mock data to solve the "Cold Start" problem
 * so new users immediately see value in the dashboard.
 */
export const generateDemoData = (): { appliances: Appliance[]; usageRecords: UsageRecord[] } => {
  const appliances: Appliance[] = [
    {
      id: `appliance-demo-1`,
      name: 'Smart TV (Living Room)',
      category: ApplianceCategory.ENTERTAINMENT,
      powerRating: 150,
      hoursPerDay: 4,
      quantity: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: `appliance-demo-2`,
      name: 'Refrigerator',
      category: ApplianceCategory.KITCHEN,
      powerRating: 200,
      hoursPerDay: 24,
      quantity: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: `appliance-demo-3`,
      name: 'Air Conditioner (Bedroom)',
      category: ApplianceCategory.COOLING,
      powerRating: 1200,
      hoursPerDay: 6,
      quantity: 1,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: `appliance-demo-4`,
      name: 'Washing Machine',
      category: ApplianceCategory.OTHER,
      powerRating: 500,
      hoursPerDay: 1.5,
      quantity: 1,
      isActive: false,
      createdAt: new Date().toISOString(),
    }
  ];

  const usageRecords: UsageRecord[] = [];
  
  // Generate past 7 days of usage history
  for (let i = 6; i >= 0; i--) {
    const date = subDays(new Date(), i);
    // Add some random variation
    const variation = 1 + (Math.random() * 0.4 - 0.2); // +/- 20%
    const totalConsumption = 12.5 * variation; 
    
    usageRecords.push({
      id: `record-demo-${i}`,
      date: format(date, 'yyyy-MM-dd'),
      appliances: [...appliances],
      totalConsumption,
      totalCost: totalConsumption * 0.12, 
      totalCO2: totalConsumption * 0.92, 
    });
  }

  return { appliances, usageRecords };
};

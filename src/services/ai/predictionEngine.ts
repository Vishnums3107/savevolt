import { Appliance, ApplianceCategory, EnergyTip, WeatherData } from '../../types';
import { calculateEnergyConsumptions } from '../../utils/energy';

/**
 * Load-pattern rules on top of the per-appliance tips: the single biggest cost, simultaneous
 * peak load, and always-on devices. Ids are stable so user actions on them persist.
 */
export class PredictionEngine {
  public static generatePredictiveTips(
    appliances: Appliance[],
    _weather: WeatherData | null,
    electricityRate: number,
    co2Factor: number,
    currency = '$',
  ): EnergyTip[] {
    const tips: EnergyTip[] = [];
    const consumptions = calculateEnergyConsumptions(appliances, electricityRate, co2Factor);
    const total = consumptions.reduce((sum, c) => sum + c.monthlyConsumption, 0);

    // The single biggest cost when it dominates the bill
    const worst = [...consumptions].sort((a, b) => b.monthlyConsumption - a.monthlyConsumption)[0];
    if (worst && worst.dailyConsumption > 3 && total > 0 && worst.monthlyConsumption / total >= 0.3) {
      tips.push({
        id: `pred:dominant:${worst.applianceId}`,
        title: `${worst.applianceName} is ${Math.round((worst.monthlyConsumption / total) * 100)}% of your bill`,
        description: `It costs about ${currency}${(worst.monthlyConsumption * electricityRate).toFixed(2)} a month. Using it 20% less would save ${currency}${(worst.monthlyConsumption * electricityRate * 0.2).toFixed(2)}, more than any other single change.`,
        category: 'General',
        priority: 'high',
        potentialSavings: worst.monthlyConsumption * 0.2,
        isPersonalized: true,
      });
    }

    // Many heavy devices switched on together
    const heavy = appliances.filter((a) => a.isActive && a.powerRating * a.quantity >= 1000);
    const peakWatts = heavy.reduce((sum, a) => sum + a.powerRating * a.quantity, 0);
    if (heavy.length >= 2 && peakWatts > 3500) {
      tips.push({
        id: 'pred:peak-stagger',
        title: `Stagger heavy loads (${(peakWatts / 1000).toFixed(1)} kW together)`,
        description: `${heavy.map((a) => a.name).join(', ')} can all run at once. Spreading them out avoids demand peaks and, on time-of-use tariffs, lets you move them to cheaper hours.`,
        category: 'General',
        priority: 'medium',
        potentialSavings: heavy.reduce((sum, a) => sum + (a.powerRating * a.quantity * Math.min(a.hoursPerDay, 1) * 30) / 1000, 0) * 0.1,
        isPersonalized: true,
      });
    }

    // Electronics left on most of the day
    const alwaysOn = appliances.filter((a) =>
      a.isActive && a.hoursPerDay >= 16 && a.hoursPerDay < 24 &&
      [ApplianceCategory.ENTERTAINMENT, ApplianceCategory.OFFICE, ApplianceCategory.OTHER].includes(a.category));
    if (alwaysOn.length > 0) {
      const idleKwh = alwaysOn.reduce((sum, a) => sum + (a.powerRating * a.quantity * (a.hoursPerDay - 8) * 30) / 1000, 0);
      if (idleKwh > 5) {
        tips.push({
          id: 'pred:always-on',
          title: `${alwaysOn.length} device${alwaysOn.length > 1 ? 's' : ''} on 16+ hours a day`,
          description: `${alwaysOn.map((a) => a.name).join(', ')} probably sit idle for much of that time, about ${idleKwh.toFixed(1)} kWh a month. A smart plug schedule could switch them off overnight.`,
          category: ApplianceCategory.OTHER,
          priority: 'medium',
          potentialSavings: idleKwh * 0.6,
          isPersonalized: true,
        });
      }
    }

    return tips;
  }
}

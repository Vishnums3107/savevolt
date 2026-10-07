import { Appliance, ApplianceCategory, EnergyTip, WeatherData } from '../../types';
import { calculateEnergyConsumptions } from '../../utils/energy';

/**
 * PredictionEngine handles generating smart, predictive recommendations
 * by combining historical usage data, appliance types, and contextual
 * factors like weather and simultaneous peak load.
 */
export class PredictionEngine {
  /**
   * Generates proactive recommendations based on current context.
   */
  public static generatePredictiveTips(
    appliances: Appliance[],
    weather: WeatherData | null,
    electricityRate: number,
    co2Factor: number
  ): EnergyTip[] {
    const tips: EnergyTip[] = [];
    const consumptions = calculateEnergyConsumptions(appliances, electricityRate, co2Factor);

    // Context: Weather
    if (weather) {
      if (weather.temperature < 15) {
        tips.push({
          id: `pred-weather-cold-${Date.now()}`,
          title: 'Predictive Heating Advice',
          description: `Temperatures are dropping to ${weather.temperature}°C. Consider setting a smart schedule for your heater to turn on only before you arrive home, rather than leaving it on all day.`,
          category: 'General',
          priority: 'high',
          potentialSavings: 50,
          isPersonalized: true,
        });
      } else if (weather.temperature > 28) {
        tips.push({
          id: `pred-weather-hot-${Date.now()}`,
          title: 'Predictive Cooling Advice',
          description: `It's going to be hot (${weather.temperature}°C). Pre-cool your home during off-peak hours and close blinds during peak afternoon sun to reduce AC workload.`,
          category: 'General',
          priority: 'high',
          potentialSavings: 60,
          isPersonalized: true,
        });
      } else if (weather.temperature >= 18 && weather.temperature <= 25 && weather.humidity < 65) {
        tips.push({
          id: `pred-weather-mild-${Date.now()}`,
          title: 'Optimal Natural Ventilation',
          description: `Mild outdoor weather (${weather.temperature}°C, ${weather.humidity}% humidity) means you can open windows for cross-breeze and turn off both AC and heating to save 100% on climate control today.`,
          category: ApplianceCategory.COOLING,
          priority: 'medium',
          potentialSavings: 45,
          isPersonalized: true,
        });
      }

      // High humidity load strain
      if (weather.humidity > 75 && weather.temperature >= 24) {
        tips.push({
          id: `pred-weather-humid-${Date.now()}`,
          title: 'Humidity Dehumidification Mode',
          description: `High outdoor humidity (${weather.humidity}%) makes air feel hotter and forces compressors to work harder. Run your AC on Dry/Dehumidifier mode to maintain comfort with ~30% less power.`,
          category: ApplianceCategory.COOLING,
          priority: 'medium',
          potentialSavings: 35,
          isPersonalized: true,
        });
      }
    }

    // Context: High energy consumers
    const highConsumers = consumptions.filter((c) => c.dailyConsumption > 5);
    if (highConsumers.length > 0) {
      const worstOffender = highConsumers.sort((a, b) => b.dailyConsumption - a.dailyConsumption)[0];
      tips.push({
        id: `pred-appliance-${Date.now()}`,
        title: `Optimize ${worstOffender.applianceName}`,
        description: `Based on your usage, ${worstOffender.applianceName} is costing you ~$${(worstOffender.monthlyConsumption * electricityRate).toFixed(2)}/month. Consider upgrading to a more efficient model or reducing its active hours by 20%.`,
        category: 'General',
        priority: 'high',
        potentialSavings: worstOffender.monthlyConsumption * 0.2,
        isPersonalized: true,
      });
    }

    // Context: Peak Simultaneous Wattage Surge
    const totalActiveWatts = appliances
      .filter((a) => a.isActive)
      .reduce((sum, a) => sum + a.powerRating * (a.quantity || 1), 0);

    if (totalActiveWatts > 3500) {
      tips.push({
        id: `pred-peak-surge-${Date.now()}`,
        title: 'High Simultaneous Load Detected',
        description: `Your active appliances are drawing a combined ${(totalActiveWatts / 1000).toFixed(1)} kW. Running heavy appliances concurrently may push your household into higher tariff tiers. Stagger usage across the day.`,
        category: 'General',
        priority: 'high',
        potentialSavings: 40,
        isPersonalized: true,
      });
    }

    // Context: Phantom / Standby Load
    const standbyCandidates = appliances.filter(
      (a) =>
        a.isActive &&
        a.hoursPerDay >= 16 &&
        [ApplianceCategory.ENTERTAINMENT, ApplianceCategory.OFFICE, ApplianceCategory.OTHER].includes(
          a.category
        )
    );

    if (standbyCandidates.length > 0) {
      const phantomKwh = standbyCandidates.reduce(
        (sum, a) => sum + (a.powerRating * (a.hoursPerDay - 6) * 30) / 1000,
        0
      );
      if (phantomKwh > 10) {
        tips.push({
          id: `pred-phantom-${Date.now()}`,
          title: 'Phantom Standby Drain Alert',
          description: `${standbyCandidates.length} connected media/office devices run continuously, generating an estimated ${phantomKwh.toFixed(1)} kWh/mo in idle standby. Using smart power strips can eliminate this cost.`,
          category: ApplianceCategory.OTHER,
          priority: 'medium',
          potentialSavings: phantomKwh * 0.7,
          isPersonalized: true,
        });
      }
    }

    // Context: Empty state prediction
    if (appliances.length === 0) {
      tips.push({
        id: `pred-empty-${Date.now()}`,
        title: 'Start Tracking',
        description: 'Add your first appliance or load Demo Data to start receiving personalized predictive recommendations.',
        category: 'General',
        priority: 'low',
        potentialSavings: 0,
        isPersonalized: false,
      });
    }

    return tips;
  }
}

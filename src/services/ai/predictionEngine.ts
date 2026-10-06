import { Appliance, EnergyTip, WeatherData } from '../../types';
import { calculateEnergyConsumptions } from '../../utils/energy';

/**
 * PredictionEngine handles generating smart, predictive recommendations
 * by combining historical usage data, appliance types, and contextual
 * factors like weather.
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
      }
    }

    // Context: High energy consumers
    const highConsumers = consumptions.filter((c) => c.dailyConsumption > 5); // arbitrarily high threshold for demo
    if (highConsumers.length > 0) {
      const worstOffender = highConsumers.sort((a, b) => b.dailyConsumption - a.dailyConsumption)[0];
      tips.push({
        id: `pred-appliance-${Date.now()}`,
        title: `Optimize ${worstOffender.applianceName}`,
        description: `Based on your usage, ${worstOffender.applianceName} is costing you ~$${(worstOffender.monthlyConsumption * electricityRate).toFixed(2)}/month. Consider upgrading to a more efficient model or reducing its active hours by 20%.`,
        category: 'General',
        priority: 'medium',
        potentialSavings: worstOffender.monthlyConsumption * 0.2,
        isPersonalized: true,
      });
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

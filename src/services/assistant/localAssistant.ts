import { Appliance, EnergyTip } from '../../types';

// TEMPORARY: legacy keyword bot, to be replaced by the data-driven local assistant.

/**
 * Generate chatbot responses based on user queries
 */
export const generateChatbotResponse = (
  query: string,
  appliances: Appliance[],
  tips: EnergyTip[]
): { response: string; suggestions: string[] } => {
  const lowerQuery = query.toLowerCase();

  // Energy saving tips
  if (lowerQuery.includes('save') || lowerQuery.includes('reduce')) {
    const topTips = tips.slice(0, 3);
    return {
      response: `Here are my top 3 energy-saving tips for you:\n\n${topTips
        .map((tip, i) => `${i + 1}. ${tip.title}: ${tip.description}`)
        .join('\n\n')}`,
      suggestions: ['Show more tips', 'Calculate savings', 'View dashboard'],
    };
  }

  // Appliance-specific queries
  if (lowerQuery.includes('consumption') || lowerQuery.includes('usage')) {
    const totalConsumption = appliances.reduce((sum, app) => {
      return sum + (app.powerRating * app.hoursPerDay * app.quantity) / 1000;
    }, 0);

    return {
      response: `Your current daily energy consumption is ${totalConsumption.toFixed(
        2
      )} kWh. The top consumers are your ${appliances
        .slice(0, 3)
        .map((a) => a.name)
        .join(', ')}.`,
      suggestions: ['View detailed report', 'Get optimization tips', 'Set goals'],
    };
  }

  // Cost queries
  if (lowerQuery.includes('cost') || lowerQuery.includes('bill')) {
    const totalConsumption = appliances.reduce((sum, app) => {
      return sum + (app.powerRating * app.hoursPerDay * app.quantity) / 1000;
    }, 0);
    const monthlyCost = totalConsumption * 30 * 0.12;

    return {
      response: `Your estimated monthly electricity cost is $${monthlyCost.toFixed(
        2
      )}. You can reduce this by following our energy-saving tips!`,
      suggestions: ['See breakdown', 'Reduce cost', 'Compare with last month'],
    };
  }

  // CO2/Environment queries
  if (
    lowerQuery.includes('co2') ||
    lowerQuery.includes('carbon') ||
    lowerQuery.includes('environment')
  ) {
    return {
      response:
        'Great question! Your energy consumption contributes to CO₂ emissions. On average, every kWh you save prevents 0.92 kg of CO₂ from entering the atmosphere. Check your dashboard to see your carbon footprint!',
      suggestions: ['View CO₂ dashboard', 'Get green tips', 'Calculate impact'],
    };
  }

  // Goals
  if (lowerQuery.includes('goal') || lowerQuery.includes('target')) {
    return {
      response:
        'Setting goals is a great way to track progress! I recommend starting with a 10-15% reduction in your current consumption. Would you like me to help you set up a personalized goal?',
      suggestions: ['Set goal', 'View progress', 'Get recommendations'],
    };
  }

  // Default response
  return {
    response:
      "I'm your Energy Assistant! I can help you with energy-saving tips, usage analysis, cost calculations, and more. What would you like to know?",
    suggestions: [
      'How can I save energy?',
      'Show my consumption',
      'Calculate my bill',
      'Environmental impact',
    ],
  };
};

/**
 * AI-Powered Recommendation Engine
 * Provides personalized energy-saving recommendations using pattern analysis
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appliance, UsageRecord } from '../types';

export interface AIRecommendation {
  id: string;
  title: string;
  description: string;
  category: 'savings' | 'efficiency' | 'behavior' | 'upgrade' | 'schedule';
  priority: 'high' | 'medium' | 'low';
  potentialSavings: number; // kWh per month
  potentialCostSavings: number; // $ per month
  confidence: number; // 0-1
  actionable: boolean;
  action?: string;
  targetApplianceId?: string;
  actionType?: 'reduce_hours' | 'pause_appliance' | 'create_goal' | 'create_reminder' | 'custom';
  actionPayload?: { hours?: number; goalKwh?: number; reminderTime?: string };
  createdAt: Date;
}

export interface UsagePattern {
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: string;
  averageConsumption: number;
  peakHours: number[];
  trends: 'increasing' | 'decreasing' | 'stable';
}

class AIRecommendationEngine {
  private static instance: AIRecommendationEngine;
  private recommendations: AIRecommendation[] = [];
  private usageHistory: UsageRecord[] = [];
  private patterns: UsagePattern[] = [];
  private electricityRate = 0.12;
  private currency = '$';

  private constructor() {}

  public static getInstance(): AIRecommendationEngine {
    if (!AIRecommendationEngine.instance) {
      AIRecommendationEngine.instance = new AIRecommendationEngine();
    }
    return AIRecommendationEngine.instance;
  }

  /**
   * Initialize AI engine with historical data
   */
  public async initialize(
    appliances: Appliance[],
    usageRecords: UsageRecord[],
    electricityRate: number = 0.12,
    currency: string = '$',
  ): Promise<void> {
    try {
      this.usageHistory = usageRecords;
      this.electricityRate = Math.max(0, electricityRate);
      this.currency = currency || '$';
      await this.analyzeUsagePatterns(appliances, usageRecords);
      await this.generateRecommendations(appliances);
      console.log('AI Recommendation Engine initialized');
    } catch (error) {
      console.error('Failed to initialize AI engine:', error);
    }
  }

  /**
   * Analyze usage patterns
   */
  private async analyzeUsagePatterns(
    appliances: Appliance[],
    usageRecords: UsageRecord[]
  ): Promise<void> {
    // Analyze time-of-day patterns
    const morningUsage = this.analyzeTimePattern(usageRecords, 6, 12);
    const afternoonUsage = this.analyzeTimePattern(usageRecords, 12, 17);
    const eveningUsage = this.analyzeTimePattern(usageRecords, 17, 22);
    const nightUsage = this.analyzeTimePattern(usageRecords, 22, 6);

    this.patterns = [
      {
        timeOfDay: 'morning',
        dayOfWeek: 'all',
        averageConsumption: morningUsage.average,
        peakHours: morningUsage.peakHours,
        trends: morningUsage.trend,
      },
      {
        timeOfDay: 'afternoon',
        dayOfWeek: 'all',
        averageConsumption: afternoonUsage.average,
        peakHours: afternoonUsage.peakHours,
        trends: afternoonUsage.trend,
      },
      {
        timeOfDay: 'evening',
        dayOfWeek: 'all',
        averageConsumption: eveningUsage.average,
        peakHours: eveningUsage.peakHours,
        trends: eveningUsage.trend,
      },
      {
        timeOfDay: 'night',
        dayOfWeek: 'all',
        averageConsumption: nightUsage.average,
        peakHours: nightUsage.peakHours,
        trends: nightUsage.trend,
      },
    ];
  }

  /**
   * Analyze time pattern
   */
  private analyzeTimePattern(
    records: UsageRecord[],
    startHour: number,
    endHour: number
  ): { average: number; peakHours: number[]; trend: 'increasing' | 'decreasing' | 'stable' } {
    if (records.length === 0) {
      return { average: 0, peakHours: [], trend: 'stable' };
    }

    const consumptions = records.map((r) => r.totalConsumption);
    const average = consumptions.reduce((sum, val) => sum + val, 0) / consumptions.length;

    // Simple trend analysis (last 7 days vs previous 7 days)
    const recentAvg = consumptions.slice(-7).reduce((sum, val) => sum + val, 0) / 7;
    const previousAvg = consumptions.slice(-14, -7).reduce((sum, val) => sum + val, 0) / 7;

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentAvg > previousAvg * 1.1) trend = 'increasing';
    else if (recentAvg < previousAvg * 0.9) trend = 'decreasing';

    // Peak hours (simplified)
    const peakHours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

    return { average, peakHours, trend };
  }

  /**
   * Generate AI recommendations
   */
  private async generateRecommendations(appliances: Appliance[]): Promise<void> {
    this.recommendations = [];

    // Analyze each appliance
    for (const appliance of appliances) {
      // High consumption recommendations
      if (appliance.powerRating * appliance.hoursPerDay * 30 / 1000 > 100) {
        this.recommendations.push({
          id: `rec-${Date.now()}-${appliance.id}`,
          title: `High Energy Consumer: ${appliance.name}`,
          description: `Your ${appliance.name} consumes ${((appliance.powerRating * appliance.hoursPerDay * 30) / 1000).toFixed(1)} kWh/month. Consider reducing usage by 2 hours/day to save up to ${this.formatCost((appliance.powerRating * 2 * 30 / 1000) * this.electricityRate)}/month.`,
          category: 'savings',
          priority: 'high',
          potentialSavings: (appliance.powerRating * 2 * 30) / 1000,
          potentialCostSavings: ((appliance.powerRating * 2 * 30) / 1000) * this.electricityRate,
          confidence: 0.9,
          actionable: true,
          action: `Reduce ${appliance.name} usage by 2 hours per day`,
          targetApplianceId: appliance.id,
          actionType: 'reduce_hours',
          actionPayload: { hours: 2 },
          createdAt: new Date(),
        });
      }

      // Efficiency upgrade recommendations
      if (appliance.category === 'Cooling' && appliance.powerRating > 1500) {
        this.recommendations.push({
          id: `rec-upgrade-${Date.now()}-${appliance.id}`,
          title: `Upgrade to Energy-Efficient ${appliance.name}`,
          description: `Upgrading to an energy-efficient model could reduce consumption by 30-40%, saving approximately ${this.formatCost(((appliance.powerRating * appliance.hoursPerDay * 30) / 1000) * 0.35 * this.electricityRate)}/month.`,
          category: 'upgrade',
          priority: 'medium',
          potentialSavings: ((appliance.powerRating * appliance.hoursPerDay * 30) / 1000) * 0.35,
          potentialCostSavings: ((appliance.powerRating * appliance.hoursPerDay * 30) / 1000) * 0.35 * this.electricityRate,
          confidence: 0.75,
          actionable: true,
          action: `Research Energy Star certified ${appliance.category} appliances`,
          createdAt: new Date(),
        });
      }

      // Schedule optimization
      if (appliance.hoursPerDay > 8) {
        this.recommendations.push({
          id: `rec-schedule-${Date.now()}-${appliance.id}`,
          title: `Optimize ${appliance.name} Schedule`,
          description: `Your ${appliance.name} runs ${appliance.hoursPerDay} hours/day. Running during off-peak hours (10 PM - 6 AM) could save on electricity costs with time-of-use rates.`,
          category: 'schedule',
          priority: 'medium',
          potentialSavings: 0,
          potentialCostSavings: ((appliance.powerRating * appliance.hoursPerDay * 30) / 1000) * 0.03 * this.electricityRate,
          confidence: 0.65,
          actionable: true,
          action: `Shift ${appliance.name} usage to off-peak hours`,
          targetApplianceId: appliance.id,
          actionType: 'create_reminder',
          actionPayload: { reminderTime: '22:00' },
          createdAt: new Date(),
        });
      }
    }

    // Pattern-based recommendations
    await this.generatePatternRecommendations();

    // Behavioral recommendations
    await this.generateBehavioralRecommendations();

    // Sort by priority and potential savings
    this.recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.potentialSavings - a.potentialSavings;
    });

    // Keep top 10 recommendations
    this.recommendations = this.recommendations.slice(0, 10);

    // Save to storage
    await AsyncStorage.setItem('ai_recommendations', JSON.stringify(this.recommendations));
  }

  /**
   * Generate pattern-based recommendations
   */
  private async generatePatternRecommendations(): Promise<void> {
    // Peak usage pattern
    const eveningPattern = this.patterns.find((p) => p.timeOfDay === 'evening');
    if (eveningPattern && eveningPattern.averageConsumption > 5) {
      this.recommendations.push({
        id: `rec-pattern-evening-${Date.now()}`,
        title: 'Peak Evening Usage Detected',
        description: `Your evening energy usage is high (${eveningPattern.averageConsumption.toFixed(1)} kWh). Consider spreading some tasks to off-peak hours or using energy-saving modes.`,
        category: 'behavior',
        priority: 'high',
        potentialSavings: eveningPattern.averageConsumption * 0.2 * 30,
        potentialCostSavings: eveningPattern.averageConsumption * 0.2 * 30 * this.electricityRate,
        confidence: 0.8,
        actionable: true,
        action: 'Move high-energy tasks to off-peak hours',
        createdAt: new Date(),
      });
    }

    // Night usage (phantom load)
    const nightPattern = this.patterns.find((p) => p.timeOfDay === 'night');
    if (nightPattern && nightPattern.averageConsumption > 1) {
      this.recommendations.push({
        id: `rec-pattern-night-${Date.now()}`,
        title: 'Phantom Load Detected',
        description: `You're consuming ${nightPattern.averageConsumption.toFixed(1)} kWh at night. Unplug devices or use smart power strips to eliminate phantom loads.`,
        category: 'efficiency',
        priority: 'medium',
        potentialSavings: nightPattern.averageConsumption * 0.5 * 30,
        potentialCostSavings: nightPattern.averageConsumption * 0.5 * 30 * this.electricityRate,
        confidence: 0.85,
        actionable: true,
        action: 'Use smart power strips or unplug devices at night',
        createdAt: new Date(),
      });
    }
  }

  /**
   * Generate behavioral recommendations
   */
  private async generateBehavioralRecommendations(): Promise<void> {
    // Weekend vs weekday analysis
    this.recommendations.push({
      id: `rec-behavior-general-${Date.now()}`,
      title: 'Smart Energy Habits',
      description: 'Small changes can make a big difference: Turn off lights when leaving a room, use natural light during daytime, and set thermostats 2°F higher in summer / 2°F lower in winter.',
      category: 'behavior',
      priority: 'low',
      potentialSavings: 50,
      potentialCostSavings: 50 * this.electricityRate,
      confidence: 0.9,
      actionable: true,
      action: 'Implement smart energy habits',
      actionType: 'create_goal',
      actionPayload: { goalKwh: 50 },
      createdAt: new Date(),
    });
  }

  /**
   * Get recommendations
   */
  public getRecommendations(): AIRecommendation[] {
    return [...this.recommendations];
  }

  /**
   * Get recommendations by category
   */
  public getRecommendationsByCategory(
    category: AIRecommendation['category']
  ): AIRecommendation[] {
    return this.recommendations.filter((rec) => rec.category === category);
  }

  /**
   * Get high-priority recommendations
   */
  public getHighPriorityRecommendations(): AIRecommendation[] {
    return this.recommendations.filter((rec) => rec.priority === 'high');
  }

  /**
   * Mark recommendation as actioned
   */  /**
   * Apply recommendation directly into the app state
   */
  public async applyRecommendation(
    rec: AIRecommendation
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { useEnergyStore } = await import('../store/energyStore');
      const store = useEnergyStore.getState();

      if (rec.actionType === 'reduce_hours' && rec.targetApplianceId) {
        const app = store.appliances.find((a) => a.id === rec.targetApplianceId);
        if (app) {
          const reduction = rec.actionPayload?.hours ?? 2;
          const newHours = Math.max(0.5, app.hoursPerDay - reduction);
          await store.updateAppliance(app.id, { hoursPerDay: newHours });
          await this.markAsActioned(rec.id);
          return { success: true, message: `Reduced ${app.name} usage to ${newHours}h/day.` };
        }
      }

      if (rec.actionType === 'pause_appliance' && rec.targetApplianceId) {
        const app = store.appliances.find((a) => a.id === rec.targetApplianceId);
        if (app) {
          await store.updateAppliance(app.id, { isActive: false });
          await this.markAsActioned(rec.id);
          return { success: true, message: `Paused ${app.name} to eliminate phantom load.` };
        }
      }

      if (rec.actionType === 'create_goal') {
        const goalKwh = rec.actionPayload?.goalKwh ?? Math.round(rec.potentialSavings || 50);
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 30);
        await store.addGoal({
          type: 'consumption',
          target: goalKwh,
          deadline: deadline.toISOString(),
        });
        await this.markAsActioned(rec.id);
        return { success: true, message: `Created new monthly goal to save ${goalKwh} kWh.` };
      }

      if (rec.actionType === 'create_reminder') {
        const time = rec.actionPayload?.reminderTime ?? '22:00';
        await store.addReminder({
          title: 'Off-Peak Energy Reminder',
          message: rec.action || 'Shift heavy appliances to off-peak hours now to save money.',
          time,
          days: [1, 2, 3, 4, 5],
          isActive: true,
        });
        await this.markAsActioned(rec.id);
        return { success: true, message: `Created off-peak reminder for ${time}.` };
      }

      await this.markAsActioned(rec.id);
      return { success: true, message: `Action completed for "${rec.title}".` };
    } catch (error) {
      console.error('Failed to apply recommendation:', error);
      return { success: false, message: error instanceof Error ? error.message : 'Action failed.' };
    }
  }


  public async markAsActioned(recommendationId: string): Promise<void> {
    const index = this.recommendations.findIndex((rec) => rec.id === recommendationId);
    if (index >= 0) {
      this.recommendations.splice(index, 1);
      await AsyncStorage.setItem('ai_recommendations', JSON.stringify(this.recommendations));
    }
  }

  /**
   * Get total potential savings
   */
  public getTotalPotentialSavings(): { energy: number; cost: number } {
    const energy = this.recommendations.reduce((sum, rec) => sum + rec.potentialSavings, 0);
    const cost = this.recommendations.reduce((sum, rec) => sum + rec.potentialCostSavings, 0);
    return { energy, cost };
  }

  /**
   * Refresh recommendations
   */
  public async refreshRecommendations(
    appliances: Appliance[],
    usageRecords: UsageRecord[],
    electricityRate: number = 0.12,
    currency: string = '$',
  ): Promise<void> {
    await this.initialize(appliances, usageRecords, electricityRate, currency);
  }

  private formatCost(value: number): string {
    return `${this.currency}${value.toFixed(2)}`;
  }

  /**
   * Get usage patterns
   */
  public getUsagePatterns(): UsagePattern[] {
    return [...this.patterns];
  }
}

export default AIRecommendationEngine.getInstance();

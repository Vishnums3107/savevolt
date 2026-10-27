import { Appliance, EnergyTip, UsageRecord, UserGoal, Reminder, UtilityBill } from '../../types';

export interface AssistantSmartPlug {
  id: string;
  name: string;
  watts?: number;
  isActive?: boolean;
}

export interface LocalAssistantOptions {
  appliances?: Appliance[];
  usageRecords?: UsageRecord[];
  tips?: EnergyTip[];
  electricityRate?: number;
  currency?: string;
  co2Factor?: number;
  weatherLocation?: string;
  weatherData?: { temperature?: number; condition?: string; season?: string };
  goals?: UserGoal[];
  reminders?: Reminder[];
  bills?: UtilityBill[];
  smartPlugs?: AssistantSmartPlug[];
}

export interface AssistantAction {
  type: 'toggle_appliance' | 'update_hours' | 'create_goal' | 'create_reminder' | 'navigate';
  label: string;
  description: string;
  payload: Record<string, any>;
  done?: boolean;
}

export interface LocalAssistantResult {
  response: string;
  suggestions: string[];
  action?: AssistantAction;
}

/**
 * Normalizes query string for robust intent matching
 */
const clean = (q: string) => q.toLowerCase().trim();

/**
 * Offline, data-driven Energy Assistant engine.
 * Computes exact metrics from user data and detects actionable control intents.
 */
export const generateChatbotResponse = (
  query: string,
  appliancesOrOptions: Appliance[] | LocalAssistantOptions = [],
  tips: EnergyTip[] = [],
  extraOptions?: LocalAssistantOptions
): LocalAssistantResult => {
  let opts: LocalAssistantOptions;

  if (Array.isArray(appliancesOrOptions)) {
    opts = {
      appliances: appliancesOrOptions,
      tips,
      ...(extraOptions || {}),
    };
  } else {
    opts = appliancesOrOptions;
  }

  const appliances = opts.appliances || [];
  const allTips = opts.tips || tips || [];
  const rate = typeof opts.electricityRate === 'number' && opts.electricityRate > 0 ? opts.electricityRate : 0.12;
  const currency = opts.currency || '$';
  const co2Factor = typeof opts.co2Factor === 'number' && opts.co2Factor > 0 ? opts.co2Factor : 0.85;
  const bills = opts.bills || [];
  const goals = opts.goals || [];
  const reminders = opts.reminders || [];
  const smartPlugs = opts.smartPlugs || [];

  const lower = clean(query);

  // 1. Calculate Core Household Baseline Metrics
  const activeApps = appliances.filter((a) => a.isActive !== false);
  const totalWatts = appliances.reduce((sum, a) => sum + a.powerRating * (a.quantity || 1), 0);
  const activeWatts = activeApps.reduce((sum, a) => sum + a.powerRating * (a.quantity || 1), 0);
  const dailyKwh = appliances.reduce((sum, a) => sum + (a.powerRating * a.hoursPerDay * (a.quantity || 1)) / 1000, 0);
  const monthlyKwh = dailyKwh * 30;
  const monthlyCost = monthlyKwh * rate;
  const currentCostPerHour = (activeWatts / 1000) * rate;

  // Sorted appliances by monthly consumption
  const sortedByConsumption = [...appliances].sort(
    (a, b) => (b.powerRating * b.hoursPerDay * (b.quantity || 1)) - (a.powerRating * a.hoursPerDay * (a.quantity || 1))
  );

  // ─────────────────────────────────────────────────────────────────
  // INTENT 1: Actionable Appliance Control (Turn off / Pause / Turn on)
  // ─────────────────────────────────────────────────────────────────
  const turnOffMatch = lower.match(/(?:turn\s*off|switch\s*off|shut\s*off|pause|deactivate)\s+([a-z0-9\s]+)/i);
  if (turnOffMatch) {
    const targetName = turnOffMatch[1].trim();
    const app = appliances.find((a) => a.name.toLowerCase().includes(targetName) || targetName.includes(a.name.toLowerCase()));
    if (app) {
      if (app.isActive === false) {
        return {
          response: `**${app.name}** is already switched off (0W active draw).`,
          suggestions: ['Check live load', 'Show top consumers', 'Calculate bill'],
        };
      }
      return {
        response: `I found **${app.name}** (drawing ${app.powerRating}W, running ~${app.hoursPerDay}h/day). I can turn it off to save power immediately.\n\nPlease confirm below:`,
        suggestions: ['Cancel', 'Check other appliances', 'View active load'],
        action: {
          type: 'toggle_appliance',
          label: `Turn off ${app.name}`,
          description: `Switch off ${app.name} to eliminate its ${app.powerRating}W load`,
          payload: { applianceId: app.id, isActive: false, applianceName: app.name },
        },
      };
    }
  }

  const turnOnMatch = lower.match(/(?:turn\s*on|switch\s*on|start|activate|enable)\s+([a-z0-9\s]+)/i);
  if (turnOnMatch) {
    const targetName = turnOnMatch[1].trim();
    const app = appliances.find((a) => a.name.toLowerCase().includes(targetName) || targetName.includes(a.name.toLowerCase()));
    if (app) {
      if (app.isActive !== false) {
        return {
          response: `**${app.name}** is already active and drawing ${app.powerRating}W.`,
          suggestions: ['Calculate cost', 'Check live load', 'Top consumers'],
        };
      }
      return {
        response: `I can turn on **${app.name}** (${app.powerRating}W). Would you like to activate it now?`,
        suggestions: ['Cancel', 'Check daily cost', 'View appliances'],
        action: {
          type: 'toggle_appliance',
          label: `Turn on ${app.name}`,
          description: `Activate ${app.name} (${app.powerRating}W, ${app.hoursPerDay}h/day)`,
          payload: { applianceId: app.id, isActive: true, applianceName: app.name },
        },
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // INTENT 2: Actionable Runtime Adjustment (e.g. Set AC to 4 hours)
  // ─────────────────────────────────────────────────────────────────
  const hoursMatch = lower.match(/(?:reduce|set|change|limit|cut)\s+([a-z0-9\s]+?)\s+(?:to|by)\s+(\d+(?:\.\d+)?)\s*(?:h|hrs|hours)/i);
  if (hoursMatch) {
    const targetName = hoursMatch[1].trim();
    const targetHours = parseFloat(hoursMatch[2]);
    const app = appliances.find((a) => a.name.toLowerCase().includes(targetName) || targetName.includes(a.name.toLowerCase()));
    if (app && targetHours >= 0 && targetHours <= 24) {
      const diffHours = app.hoursPerDay - targetHours;
      const savedKwhMonth = Math.max(0, (app.powerRating * diffHours * 30) / 1000);
      const savedCostMonth = savedKwhMonth * rate;

      return {
        response: `Adjusting **${app.name}** from ${app.hoursPerDay}h to ${targetHours}h/day will save approx **${savedKwhMonth.toFixed(1)} kWh/month** (${currency}${savedCostMonth.toFixed(2)}/mo at ${currency}${rate.toFixed(2)}/kWh).\n\nTap **Confirm Action** to apply this adjustment:`,
        suggestions: ['Cancel', 'Calculate bill', 'Show top consumers'],
        action: {
          type: 'update_hours',
          label: `Set ${app.name} to ${targetHours}h/day`,
          description: `Change daily runtime from ${app.hoursPerDay}h to ${targetHours}h`,
          payload: { applianceId: app.id, hours: targetHours, applianceName: app.name },
        },
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // INTENT 3: Actionable Goal Creation (e.g. Set goal, Save 15%)
  // ─────────────────────────────────────────────────────────────────
  if (lower.includes('set goal') || lower.includes('create goal') || lower.includes('15%') || lower.includes('saving plan')) {
    const recommendedTarget = Math.round(monthlyKwh > 0 ? monthlyKwh * 0.85 : 120);
    const savingsAmount = Math.round(monthlyKwh > 0 ? monthlyKwh * 0.15 : 20);
    const costSavings = savingsAmount * rate;

    return {
      response: `Based on your household baseline (${monthlyKwh.toFixed(0)} kWh/mo), a 15% reduction goal would be **${recommendedTarget} kWh/month**.\n\nThis will save **${savingsAmount} kWh** (${currency}${costSavings.toFixed(2)}/mo). Would you like me to create this 30-day goal?`,
      suggestions: ['Cancel', 'Show my current goals', 'Tips to reach goal'],
      action: {
        type: 'create_goal',
        label: `Create ${recommendedTarget} kWh Monthly Goal`,
        description: `Set target to ${recommendedTarget} kWh (saving ${savingsAmount} kWh)`,
        payload: { target: recommendedTarget, type: 'consumption' },
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // INTENT 4: Actionable Reminder Creation (e.g. Remind at 10 PM)
  // ─────────────────────────────────────────────────────────────────
  if (lower.includes('remind') || lower.includes('reminder') || lower.includes('alarm')) {
    let reminderTime = '22:00';
    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2] || '00';
      const ampm = timeMatch[3]?.toLowerCase();
      if (ampm === 'pm' && h < 12) h += 12;
      if (ampm === 'am' && h === 12) h = 0;
      reminderTime = `${h.toString().padStart(2, '0')}:${m}`;
    }

    return {
      response: `I can schedule a daily energy reminder for **${reminderTime}** to help you inspect high-draw appliances and eliminate phantom loads before bed.`,
      suggestions: ['Cancel', 'Show active reminders', 'Vampire power tips'],
      action: {
        type: 'create_reminder',
        label: `Schedule Reminder for ${reminderTime}`,
        description: `Daily notification at ${reminderTime} for energy check`,
        payload: { time: reminderTime, title: 'Evening Energy Sweep' },
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // INTENT 5: Specific Appliance Inquiries (e.g. "how much does AC use")
  // ─────────────────────────────────────────────────────────────────
  const matchingAppliance = appliances.find((a) => lower.includes(a.name.toLowerCase()));
  if (matchingAppliance) {
    const dailyAppKwh = (matchingAppliance.powerRating * matchingAppliance.hoursPerDay * (matchingAppliance.quantity || 1)) / 1000;
    const monthlyAppKwh = dailyAppKwh * 30;
    const monthlyAppCost = monthlyAppKwh * rate;
    const percent = monthlyKwh > 0 ? ((monthlyAppKwh / monthlyKwh) * 100).toFixed(1) : '0';

    return {
      response: `Here is the breakdown for your **${matchingAppliance.name}**:\n\n• **Power Rating:** ${matchingAppliance.powerRating}W (Qty: ${matchingAppliance.quantity || 1})\n• **Daily Usage:** ${matchingAppliance.hoursPerDay} hours/day\n• **Energy Consumed:** ${dailyAppKwh.toFixed(2)} kWh/day (${monthlyAppKwh.toFixed(1)} kWh/month)\n• **Monthly Cost:** ${currency}${monthlyAppCost.toFixed(2)} (${percent}% of your total household electricity bill)\n• **Current Status:** ${matchingAppliance.isActive !== false ? '🟢 Active' : '⚪ Switched Off'}`,
      suggestions: [
        `Turn off ${matchingAppliance.name}`,
        `Set ${matchingAppliance.name} to ${(Math.max(1, matchingAppliance.hoursPerDay - 2))}h`,
        'Top energy consumers',
      ],
      action: matchingAppliance.isActive !== false ? {
        type: 'toggle_appliance',
        label: `Turn off ${matchingAppliance.name}`,
        description: `Pause ${matchingAppliance.name} (${matchingAppliance.powerRating}W)`,
        payload: { applianceId: matchingAppliance.id, isActive: false, applianceName: matchingAppliance.name },
      } : undefined,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // INTENT 8: Vampire / Standby Power Detection
  // ─────────────────────────────────────────────────────────────────
  if (lower.includes('vampire') || lower.includes('phantom') || lower.includes('standby') || lower.includes('idle') || lower.includes('night')) {
    const standbyCandidates = appliances.filter((a) => {
      const n = a.name.toLowerCase();
      const c = (a.category || '').toLowerCase();
      return n.includes('tv') || n.includes('television') || n.includes('computer') || n.includes('pc') || n.includes('console') || n.includes('microwave') || n.includes('charger') || c.includes('entertainment') || c.includes('office');
    });

    const estimatedStandbyWatts = standbyCandidates.length * 15;
    const standbyMonthlyKwh = (estimatedStandbyWatts * 24 * 30) / 1000;
    const standbyCost = standbyMonthlyKwh * rate;

    const candidateList = standbyCandidates.length > 0
      ? standbyCandidates.map((a) => `• ${a.name} (${a.powerRating}W)`).join('\n')
      : '• Televisions, monitors, gaming consoles, microwaves, and power strips';

    return {
      response: `🌙 **Vampire / Standby Power Analysis:**\n\nDevices in standby draw power 24/7 even when turned "off".\n\n• **Estimated Standby Draw:** ~${estimatedStandbyWatts} Watts continuous\n• **Wasted Energy:** ~${standbyMonthlyKwh.toFixed(1)} kWh/month\n• **Avoidable Cost:** **${currency}${standbyCost.toFixed(2)} / month**\n\n**Suspect Devices Detected:**\n${candidateList}\n\nUnplugging these or using a smart power strip eliminates this phantom drain completely.`,
      suggestions: [
        'Schedule evening reminder',
        standbyCandidates[0] ? `Turn off ${standbyCandidates[0].name}` : 'Check smart plugs',
        'Audit power load',
      ],
    };
  }

  // ─────────────────────────────────────────────────────────────────

  // INTENT 6: Live Power & Connected Load Audit
  // ─────────────────────────────────────────────────────────────────
  if (
    lower.includes('audit') ||
    lower.includes('power') ||
    lower.includes('watt') ||
    lower.includes('load') ||
    lower.includes('draw') ||
    lower.includes('using') ||
    lower.includes('live')
  ) {
    if (appliances.length === 0) {
      return {
        response: `You haven't added any appliances yet! Register your appliances in the Track tab to see your live power load and savings breakdown.`,
        suggestions: ['Add appliance', 'How to save energy', 'Set utility rate'],
      };
    }

    const top3 = sortedByConsumption.slice(0, 3);
    const topSummary = top3
      .map((a, i) => `${i + 1}. **${a.name}**: ${((a.powerRating * a.hoursPerDay * (a.quantity || 1) * 30) / 1000).toFixed(1)} kWh/mo (${currency}${(((a.powerRating * a.hoursPerDay * (a.quantity || 1) * 30) / 1000) * rate).toFixed(2)})`)
      .join('\n');

    return {
      response: `⚡ **Live Household Energy Audit:**\n\n• **Registered Appliances:** ${appliances.length} (${activeApps.length} currently active)\n• **Active Power Load:** **${activeWatts.toLocaleString()} Watts** (${(activeWatts / 1000).toFixed(2)} kW)\n• **Running Cost:** ${currency}${currentCostPerHour.toFixed(3)}/hour\n• **Average Daily Consumption:** ${dailyKwh.toFixed(2)} kWh/day\n\n**Highest Energy Consumers:**\n${topSummary}`,
      suggestions: [
        'Calculate my bill',
        'Eliminate vampire power',
        'Set 15% saving plan',
        'Top consumers',
      ],
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // INTENT 7: Electricity Bill Projections & Reconciliation
  // ─────────────────────────────────────────────────────────────────
  if (lower.includes('bill') || lower.includes('cost') || lower.includes('spend') || lower.includes('rate') || lower.includes('expense')) {
    let billNote = '';
    if (bills.length > 0) {
      const latestBill = bills[0];
      const variance = monthlyCost - latestBill.amount;
      billNote = `\n\n📄 **Latest Utility Bill Logged:**\n• Amount: ${currency}${latestBill.amount.toFixed(2)} (${latestBill.kWh.toFixed(0)} kWh)\n• Tracked Variance: ${variance >= 0 ? '+' : ''}${currency}${variance.toFixed(2)} vs current estimate.`;
    }

    const topApp = sortedByConsumption[0];
    const topCost = topApp ? (((topApp.powerRating * topApp.hoursPerDay * (topApp.quantity || 1) * 30) / 1000) * rate).toFixed(2) : '0';

    return {
      response: `💰 **Electricity Bill Analysis:**\n\n• **Projected Monthly Bill:** **${currency}${monthlyCost.toFixed(2)}** (~${monthlyKwh.toFixed(0)} kWh)\n• **Configured Electricity Rate:** ${currency}${rate.toFixed(2)} / kWh\n• **Daily Cost Average:** ${currency}${(dailyKwh * rate).toFixed(2)} / day${billNote}\n\n💡 *Tip: Your ${topApp ? topApp.name : 'appliances'} accounts for ${currency}${topCost}/mo of your bill.*`,
      suggestions: [
        'Set 15% saving plan',
        'Top consumers',
        'Audit power load',
        'Reduce top appliance',
      ],
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // INTENT 9: Top Energy Consumers
  // ─────────────────────────────────────────────────────────────────
  if (lower.includes('top') || lower.includes('highest') || lower.includes('most') || lower.includes('consumer')) {
    if (appliances.length === 0) {
      return {
        response: 'Add appliances in the Track tab to see your top energy consumers ranked by consumption and monthly cost.',
        suggestions: ['Add appliance', 'How to save energy'],
      };
    }

    const top5 = sortedByConsumption.slice(0, 5);
    const breakdown = top5
      .map((a, i) => {
        const kwh = ((a.powerRating * a.hoursPerDay * (a.quantity || 1) * 30) / 1000);
        const cost = kwh * rate;
        const pct = monthlyKwh > 0 ? ((kwh / monthlyKwh) * 100).toFixed(0) : '0';
        return `${i + 1}. **${a.name}**: ${kwh.toFixed(1)} kWh/mo (${currency}${cost.toFixed(2)}) — **${pct}%**`;
      })
      .join('\n');

    return {
      response: `🔌 **Top Energy Consumers:**\n\n${breakdown}\n\nFocusing reductions on your top 2 devices has the highest impact on your monthly utility bill.`,
      suggestions: [
        top5[0] ? `Turn off ${top5[0].name}` : 'Set goal',
        top5[0] ? `Set ${top5[0].name} to ${(Math.max(1, top5[0].hoursPerDay - 2))}h` : 'Calculate bill',
        'Live energy audit',
      ],
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // INTENT 10: Environmental & Carbon Impact
  // ─────────────────────────────────────────────────────────────────
  if (lower.includes('co2') || lower.includes('carbon') || lower.includes('environment') || lower.includes('tree') || lower.includes('green') || lower.includes('planet')) {
    const monthlyCo2 = monthlyKwh * co2Factor;
    const treesNeeded = Math.ceil(monthlyCo2 / 21.77);

    return {
      response: `🌱 **Carbon Footprint & Environmental Impact:**\n\n• **Monthly Carbon Emissions:** **${monthlyCo2.toFixed(1)} kg CO₂**\n• **Carbon Intensity Factor:** ${co2Factor.toFixed(2)} kg CO₂/kWh\n• **Offset Requirement:** Takes **${treesNeeded} mature trees** an entire month to absorb your current household emissions.\n\nCutting just 15% of your electricity consumption eliminates ${(monthlyCo2 * 0.15).toFixed(1)} kg of greenhouse gas every month!`,
      suggestions: ['Set 15% saving plan', 'Top consumers', 'Audit power load'],
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // INTENT 11: General Energy Saving Tips & Advice
  // ─────────────────────────────────────────────────────────────────
  if (lower.includes('save') || lower.includes('reduce') || lower.includes('tip') || lower.includes('how')) {
    const selectedTips = allTips.slice(0, 3);
    const tipsList = selectedTips.length > 0
      ? selectedTips.map((t, i) => `${i + 1}. **${t.title}**: ${t.description} *(Saves up to ${t.potentialSavings} kWh/mo)*`).join('\n\n')
      : `1. **Adjust Thermostat**: Keep AC at 24°C (75°F) or higher. Each degree saves 6-8% cooling energy.\n\n2. **Eliminate Standby Draw**: Switch off entertainment centers and computer chargers when not in use.\n\n3. **Full Loads Only**: Run dishwashers and washing machines only with full loads on eco-cycle.`;

    return {
      response: `💡 **Top Recommended Energy Savings:**\n\n${tipsList}`,
      suggestions: [
        'Set 15% saving plan',
        'Eliminate vampire power',
        'Top consumers',
        'Calculate my bill',
      ],
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // DEFAULT: Intelligent Assistant Overview & Quick Prompts
  // ─────────────────────────────────────────────────────────────────
  return {
    response: `👋 Hi! I'm your **SaveVolt Energy Assistant**.\n\nI monitor your **${appliances.length} appliances**, calculate live load (${activeWatts}W active), and can perform actions directly on your household setup after you confirm.\n\n**Things you can ask me:**\n• *"Run an energy audit"*\n• *"What is my projected bill?"*\n• *"Turn off Air Conditioner"*\n• *"Reduce Living Room AC to 4 hours"*\n• *"Eliminate vampire power"*\n• *"Create a 15% saving plan"*`,
    suggestions: [
      '⚡ Live Energy Audit',
      '💰 Calculate my bill',
      '🔌 Top energy consumers',
      '🌙 Eliminate vampire power',
    ],
  };
};

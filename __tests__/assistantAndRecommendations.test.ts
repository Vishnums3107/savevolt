import AIRecommendationEngine, { AIRecommendation } from '../src/services/AIRecommendationEngine';
import { generateChatbotResponse } from '../src/services/assistant/localAssistant';
import { Appliance, ApplianceCategory, UsageRecord, UtilityBill } from '../src/types';
import { useEnergyStore } from '../src/store/energyStore';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiRemove: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

describe('AIRecommendationEngine and Undo Stack', () => {
  const sampleAppliances: Appliance[] = [
    {
      id: 'app-ac-1',
      name: 'Master AC',
      powerRating: 2000,
      hoursPerDay: 8,
      quantity: 1,
      category: ApplianceCategory.COOLING,
      createdAt: '2026-01-01',
      isActive: true,
    },
    {
      id: 'app-tv-1',
      name: 'Living Room TV',
      powerRating: 150,
      hoursPerDay: 5,
      quantity: 1,
      category: ApplianceCategory.ENTERTAINMENT,
      createdAt: '2026-01-01',
      isActive: true,
    },
  ];

  const sampleUsage: UsageRecord[] = [
    {
      id: 'u-1',
      date: '2026-10-01',
      appliances: sampleAppliances,
      totalConsumption: 16.75,
      totalCost: 2.01,
      totalCO2: 14.2,
    },
  ];

  beforeEach(() => {
    useEnergyStore.setState({
      appliances: [...sampleAppliances],
      goals: [],
      reminders: [],
    });
  });

  it('initializes and generates actionable recommendations', async () => {
    await AIRecommendationEngine.initialize(sampleAppliances, sampleUsage, 0.15, '$');
    const recs = AIRecommendationEngine.getRecommendations();
    expect(recs.length).toBeGreaterThan(0);
    const highRec = recs.find((r) => r.targetApplianceId === 'app-ac-1');
    expect(highRec).toBeDefined();
    expect(highRec?.actionType).toBe('reduce_hours');
  });

  it('applies a reduce_hours recommendation and records it in undo history', async () => {
    await AIRecommendationEngine.initialize(sampleAppliances, sampleUsage, 0.15, '$');
    const rec: AIRecommendation = {
      id: 'rec-test-reduce',
      title: 'Reduce AC runtime',
      description: 'Cut AC usage by 2 hours',
      category: 'savings',
      priority: 'high',
      potentialSavings: 120,
      potentialCostSavings: 18,
      confidence: 0.9,
      actionable: true,
      targetApplianceId: 'app-ac-1',
      actionType: 'reduce_hours',
      actionPayload: { hours: 2 },
      createdAt: new Date(),
    };

    const applyResult = await AIRecommendationEngine.applyRecommendation(rec);
    expect(applyResult.success).toBe(true);
    expect(applyResult.actionId).toBeDefined();

    // Verify appliance was updated in store
    const updatedApp = useEnergyStore.getState().appliances.find((a) => a.id === 'app-ac-1');
    expect(updatedApp?.hoursPerDay).toBe(6); // 8 - 2 = 6

    // Verify undo history contains the action
    const history = AIRecommendationEngine.getAppliedHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].previousState.hoursPerDay).toBe(8);
    expect(history[0].newState.hoursPerDay).toBe(6);

    // Now undo the action!
    const undoResult = await AIRecommendationEngine.undoAction(applyResult.actionId!);
    expect(undoResult.success).toBe(true);

    // Verify appliance runtime is restored to 8 hours
    const restoredApp = useEnergyStore.getState().appliances.find((a) => a.id === 'app-ac-1');
    expect(restoredApp?.hoursPerDay).toBe(8);
  });

  it('applies a pause_appliance recommendation and undoes it properly', async () => {
    const rec: AIRecommendation = {
      id: 'rec-test-pause',
      title: 'Pause standby TV',
      description: 'Switch off TV',
      category: 'efficiency',
      priority: 'medium',
      potentialSavings: 10,
      potentialCostSavings: 1.5,
      confidence: 0.85,
      actionable: true,
      targetApplianceId: 'app-tv-1',
      actionType: 'pause_appliance',
      createdAt: new Date(),
    };

    const applyResult = await AIRecommendationEngine.applyRecommendation(rec);
    expect(applyResult.success).toBe(true);

    const pausedApp = useEnergyStore.getState().appliances.find((a) => a.id === 'app-tv-1');
    expect(pausedApp?.isActive).toBe(false);

    // Undo action
    const undoResult = await AIRecommendationEngine.undoAction(applyResult.actionId!);
    expect(undoResult.success).toBe(true);

    const restoredApp = useEnergyStore.getState().appliances.find((a) => a.id === 'app-tv-1');
    expect(restoredApp?.isActive).toBe(true);
  });

  it('applies a create_goal recommendation and undoes it by deleting the goal', async () => {
    const rec: AIRecommendation = {
      id: 'rec-test-goal',
      title: 'Save 50 kWh',
      description: 'Monthly target',
      category: 'behavior',
      priority: 'low',
      potentialSavings: 50,
      potentialCostSavings: 7.5,
      confidence: 0.9,
      actionable: true,
      actionType: 'create_goal',
      actionPayload: { goalKwh: 50 },
      createdAt: new Date(),
    };

    const initialGoalsCount = useEnergyStore.getState().goals.length;
    const applyResult = await AIRecommendationEngine.applyRecommendation(rec);
    expect(applyResult.success).toBe(true);
    expect(useEnergyStore.getState().goals.length).toBe(initialGoalsCount + 1);

    // Undo
    const undoResult = await AIRecommendationEngine.undoAction(applyResult.actionId!);
    expect(undoResult.success).toBe(true);
    expect(useEnergyStore.getState().goals.length).toBe(initialGoalsCount);
  });
});

describe('localAssistant (Offline Data-Driven Intelligence & Action Confirmation)', () => {
  const appliances: Appliance[] = [
    {
      id: 'a-ac',
      name: 'Air Conditioner',
      powerRating: 1500,
      hoursPerDay: 6,
      quantity: 1,
      category: ApplianceCategory.COOLING,
      createdAt: '2026-01-01',
      isActive: true,
    },
    {
      id: 'a-fridge',
      name: 'Refrigerator',
      powerRating: 200,
      hoursPerDay: 24,
      quantity: 1,
      category: ApplianceCategory.KITCHEN,
      createdAt: '2026-01-01',
      isActive: true,
    },
    {
      id: 'a-tv',
      name: 'Living Room TV',
      powerRating: 120,
      hoursPerDay: 4,
      quantity: 1,
      category: ApplianceCategory.ENTERTAINMENT,
      createdAt: '2026-01-01',
      isActive: true,
    },
  ];

  const bills: UtilityBill[] = [
    {
      id: 'b-1',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
      kWh: 420,
      amount: 63.0,
      createdAt: '2026-10-01',
    },
  ];

  const baseOptions = {
    appliances,
    electricityRate: 0.15,
    currency: '$',
    bills,
  };

  it('runs energy audit and computes exact active load in watts and cost per hour', () => {
    const result = generateChatbotResponse('live power audit and watt load', baseOptions);
    expect(result.response).toContain('1,820 Watts'); // 1500 + 200 + 120
    expect(result.response).toContain('Air Conditioner');
    expect(result.response).toContain('$0.273/hour'); // (1.82 kW * 0.15)
  });

  it('calculates monthly bill using configured rate and references logged utility bills', () => {
    const result = generateChatbotResponse('calculate my projected bill and costs', baseOptions);
    expect(result.response).toContain('Electricity Bill Analysis');
    expect(result.response).toContain('$0.15 / kWh');
    expect(result.response).toContain('Latest Utility Bill Logged');
    expect(result.response).toContain('$63.00');
    expect(result.response).toContain('420 kWh');
  });

  it('proposes toggle_appliance action when user requests turning off an appliance', () => {
    const result = generateChatbotResponse('turn off Air Conditioner', baseOptions);
    expect(result.response).toContain('Air Conditioner');
    expect(result.action).toBeDefined();
    expect(result.action?.type).toBe('toggle_appliance');
    expect(result.action?.payload.applianceId).toBe('a-ac');
    expect(result.action?.payload.isActive).toBe(false);
  });

  it('proposes update_hours action when user requests reducing runtime', () => {
    const result = generateChatbotResponse('reduce Air Conditioner to 4 hours', baseOptions);
    expect(result.response).toContain('Air Conditioner');
    expect(result.action).toBeDefined();
    expect(result.action?.type).toBe('update_hours');
    expect(result.action?.payload.applianceId).toBe('a-ac');
    expect(result.action?.payload.hours).toBe(4);
  });

  it('proposes create_goal action for 15% saving plan', () => {
    const result = generateChatbotResponse('create 15% saving plan', baseOptions);
    expect(result.action).toBeDefined();
    expect(result.action?.type).toBe('create_goal');
    expect(result.action?.payload.type).toBe('consumption');
    expect(result.action?.payload.target).toBeGreaterThan(0);
  });

  it('proposes create_reminder action when user asks for a reminder', () => {
    const result = generateChatbotResponse('set reminder at 10 PM to save electricity', baseOptions);
    expect(result.action).toBeDefined();
    expect(result.action?.type).toBe('create_reminder');
    expect(result.action?.payload.time).toBe('22:00');
  });

  it('detects standby vampire power and highlights suspect devices', () => {
    const result = generateChatbotResponse('how to eliminate vampire power', baseOptions);
    expect(result.response).toContain('Vampire / Standby Power Analysis');
    expect(result.response).toContain('Living Room TV');
    expect(result.response).toContain('Standby Draw');
  });
});

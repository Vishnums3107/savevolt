import {
  buildEnergyInsightPrompt,
  extractGeminiText,
  buildChatPrompt,
  parseSuggestionsFromText,
  stripSuggestionBlock,
  normalizeGeminiContents,
  validateGeminiKey,
  testGeminiConnection,
} from '../src/services/GeminiService';
import { ChatMessage } from '../src/types';

describe('gemini service', () => {
  it('builds a clear energy insight prompt from app data', () => {
    const prompt = buildEnergyInsightPrompt(
      [{ id: 'a1', name: 'AC', powerRating: 1200, hoursPerDay: 8, quantity: 1, category: 'Cooling' as any, createdAt: '2026-01-01', isActive: true }],
      [{ id: 'r1', date: '2026-01-01', appliances: [], totalConsumption: 12, totalCost: 1.44, totalCO2: 11.04 }],
      0.12,
      '$',
      'New York',
    );

    expect(prompt).toContain('Gemini');
    expect(prompt).toContain('AC');
    expect(prompt).toContain('New York');
    expect(prompt).toContain('0.12');
  });

  it('extracts assistant text from a Gemini response payload', () => {
    const response = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Turn off AC at night and use fans.' }],
          },
        },
      ],
    };

    expect(extractGeminiText(response)).toBe('Turn off AC at night and use fans.');
  });

  it('builds rich contextual chat prompt with energy telemetry', () => {
    const prompt = buildChatPrompt(
      'How can I lower my electricity bill?',
      [
        { id: 'a1', name: 'Air Conditioner', powerRating: 1500, hoursPerDay: 6, quantity: 1, category: 'Cooling' as any, createdAt: '2026-01-01', isActive: true },
        { id: 'a2', name: 'Refrigerator', powerRating: 200, hoursPerDay: 24, quantity: 1, category: 'Kitchen' as any, createdAt: '2026-01-01', isActive: true },
      ],
      [{ id: 't1', title: 'Thermostat', description: 'Set to 24C', category: 'General', potentialSavings: 15, priority: 'high', isPersonalized: true }],
      {
        electricityRate: 0.15,
        currency: '$',
        location: 'San Francisco',
        weather: { temperature: 22, condition: 'Sunny', season: 'Summer' },
      },
    );

    expect(prompt).toContain('SaveVolt AI');
    expect(prompt).toContain('Air Conditioner');
    expect(prompt).toContain('Refrigerator');
    expect(prompt).toContain('$0.15');
    expect(prompt).toContain('San Francisco');
    expect(prompt).toContain('SUGGESTIONS:');
  });

  it('parses suggestions and strips suggestion block accurately', () => {
    const rawResponse = 'Here is how you can cut your bill.\n1. Raise thermostat.\n2. Use ceiling fan.\n\nSUGGESTIONS: Raise AC temp; Check seals; Compare rates';
    const suggestions = parseSuggestionsFromText(rawResponse);
    const cleaned = stripSuggestionBlock(rawResponse);

    expect(suggestions).toEqual(['Raise AC temp', 'Check seals', 'Compare rates']);
    expect(cleaned).not.toContain('SUGGESTIONS:');
    expect(cleaned).toContain('Here is how you can cut your bill.');
  });

  it('normalizes chat history turns into alternating Gemini structure', () => {
    const history: ChatMessage[] = [
      { id: 'greeting', text: 'Hi', isUser: false, timestamp: '2026-01-01' },
      { id: 'm1', text: 'How much energy does my fridge use?', isUser: true, timestamp: '2026-01-01' },
      { id: 'm2', text: 'Around 1.2 kWh daily.', isUser: false, timestamp: '2026-01-01' },
    ];

    const turns = normalizeGeminiContents(history, 'Can I reduce that further?');
    expect(turns.length).toBeGreaterThanOrEqual(2);
    expect(turns[0].role).toBe('user');
    expect(turns[0].parts[0].text).toContain('fridge');
    expect(turns[turns.length - 1].role).toBe('user');
    expect(turns[turns.length - 1].parts[0].text).toContain('reduce that further');
  });

  it('rejects empty API keys gracefully', async () => {
    const result = await validateGeminiKey('   ');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Please enter a Gemini API key');

    const isValid = await testGeminiConnection('');
    expect(isValid).toBe(false);
  });
});

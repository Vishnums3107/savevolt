import { buildEnergyInsightPrompt, extractGeminiText } from '../src/services/GeminiService';

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
});

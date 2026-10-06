import { Appliance, EnergyTip, UsageRecord } from '../types';

export interface GeminiReply {
  text: string;
  suggestions: string[];
  source: 'gemini' | 'fallback';
}

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

export const extractGeminiText = (payload: unknown): string => {
  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const visit = (value: unknown): string => {
    if (!value || typeof value !== 'object') {
      return '';
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const text = visit(item);
        if (text) return text;
      }
      return '';
    }

    if ('thought' in value && value.thought === true) return '';
    if ('text' in value && typeof value.text === 'string' && value.text.trim()) {
      return value.text.trim();
    }

    if ('parts' in value && Array.isArray(value.parts)) {
      return value.parts.map(visit).filter(Boolean).join('\n');
    }

    if ('content' in value) {
      const text = visit((value as { content?: unknown }).content);
      if (text) return text;
    }

    if ('candidates' in value) {
      const text = visit((value as { candidates?: unknown }).candidates);
      if (text) return text;
    }

    if ('candidate' in value) {
      const text = visit((value as { candidate?: unknown }).candidate);
      if (text) return text;
    }

    return '';
  };

  return visit(payload);
};

const parseSuggestionsFromText = (text: string): string[] => {
  const match = text.match(/SUGGESTIONS\s*:\s*(.*)/is);
  if (!match) return [];

  return match[1]
    .split(/[;\n|]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
};

const stripSuggestionBlock = (text: string): string => {
  const match = text.match(/^(.*?)(?:\n\s*SUGGESTIONS\s*:\s*.*)$/is);
  if (match && match[1]) {
    return match[1].trim();
  }
  return text.trim();
};

const makeGeminiRequest = async (apiKey: string, prompt: string): Promise<string | null> => {
  if (!apiKey.trim()) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey.trim(),
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.6,
            topP: 0.9,
            maxOutputTokens: 500,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini request failed (${response.status})`);
    }

    const data = await response.json();
    const text = extractGeminiText(data);
    return text || null;
  } catch {
    console.warn('Gemini API request failed, using local fallback.');
    return null;
  } finally { clearTimeout(timeout); }
};

export const testGeminiConnection = async (apiKey: string): Promise<boolean> =>
  Boolean(await makeGeminiRequest(apiKey, 'Reply with: OK'));

export const buildEnergyInsightPrompt = (
  appliances: Appliance[],
  usageRecords: UsageRecord[],
  electricityRate: number,
  currency: string,
  location: string,
): string => {
  const activeAppliances = appliances.filter((appliance) => appliance.isActive);
  const monthlyUsage = activeAppliances.reduce((sum, appliance) => {
    return sum + (appliance.powerRating * appliance.hoursPerDay * appliance.quantity * 30) / 1000;
  }, 0);

  const topAppliances = [...activeAppliances]
    .sort((a, b) => (b.powerRating * b.hoursPerDay * b.quantity) - (a.powerRating * a.hoursPerDay * a.quantity))
    .slice(0, 3)
    .map((appliance) => `${appliance.name} (${appliance.category})`);

  const latestUsage = usageRecords.at(-1);
  const totalCost = latestUsage ? latestUsage.totalCost : (monthlyUsage * electricityRate);

  return [
    'You are SaveVolt AI powered by Gemini, a helpful energy advisor for a home energy app.',
    'Give concise, actionable advice based on the current household profile.',
    'Context:',
    `- Location: ${location}`,
    `- Electricity rate: ${currency}${electricityRate.toFixed(2)} per kWh`,
    `- Active appliances: ${activeAppliances.length || 0}`,
    `- Estimated monthly usage: ${monthlyUsage.toFixed(2)} kWh`,
    `- Estimated monthly cost: ${currency}${totalCost.toFixed(2)}`,
    `- Top appliances: ${topAppliances.length ? topAppliances.join(', ') : 'No data yet'}`,
    latestUsage
      ? `- Latest recorded usage: ${latestUsage.totalConsumption.toFixed(2)} kWh on ${latestUsage.date}`
      : '- Latest recorded usage: no recent record',
    'Provide 3 short, useful recommendations in plain language, not markdown, and end with a final line that starts with "SUGGESTIONS:" followed by 3 short suggestions separated by semicolons.',
  ].join('\n');
};

export const buildChatPrompt = (
  query: string,
  appliances: Appliance[],
  tips: EnergyTip[],
): string => {
  const activeAppliances = appliances.filter((appliance) => appliance.isActive);
  const totalDailyUsage = activeAppliances.reduce((sum, appliance) => {
    return sum + (appliance.powerRating * appliance.hoursPerDay * appliance.quantity) / 1000;
  }, 0);

  const tipSummary = tips.slice(0, 3).map((tip) => `${tip.title}: ${tip.description}`).join(' | ');

  return [
    'You are SaveVolt AI powered by Gemini. Answer as a friendly energy-saving assistant for a home user.',
    'Use the context below to personalize the answer.',
    `User question: ${query}`,
    `Current active appliances: ${activeAppliances.map((appliance) => `${appliance.name} (${appliance.category})`).join(', ') || 'None added yet'}`,
    `Estimated daily usage: ${totalDailyUsage.toFixed(2)} kWh`,
    `Suggested tips context: ${tipSummary || 'No tips available yet'}`,
    'Keep the answer helpful, practical, and short. End with a final line beginning with "SUGGESTIONS:" followed by 3 short suggestions separated by semicolons.',
  ].join('\n');
};

export const getGeminiChatReply = async (
  apiKey: string,
  query: string,
  appliances: Appliance[],
  tips: EnergyTip[],
): Promise<GeminiReply | null> => {
  const cleanedKey = apiKey.trim();
  if (!cleanedKey) {
    return null;
  }

  const prompt = buildChatPrompt(query, appliances, tips);
  const text = await makeGeminiRequest(cleanedKey, prompt);

  if (!text) {
    return null;
  }

  const responseText = stripSuggestionBlock(text);
  const suggestions = parseSuggestionsFromText(text);

  return {
    text: responseText || 'I am not able to answer that right now. Please try a different question.',
    suggestions: suggestions.length > 0 ? suggestions : ['View dashboard', 'Get recommendations', 'Set a goal'],
    source: 'gemini',
  };
};

export const getGeminiRecommendationSummary = async (
  apiKey: string,
  appliances: Appliance[],
  usageRecords: UsageRecord[],
  electricityRate: number,
  currency: string,
  location: string,
): Promise<string | null> => {
  const cleanedKey = apiKey.trim();
  if (!cleanedKey) {
    return null;
  }

  const prompt = buildEnergyInsightPrompt(appliances, usageRecords, electricityRate, currency, location);
  const text = await makeGeminiRequest(cleanedKey, prompt);

  if (!text) {
    return null;
  }

  return stripSuggestionBlock(text);
};

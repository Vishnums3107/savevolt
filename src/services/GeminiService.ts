import { Appliance, ChatMessage, EnergyTip, UsageRecord, UserGoal } from '../types';

export interface GeminiReply {
  text: string;
  suggestions: string[];
  source: 'gemini' | 'fallback';
  modelUsed?: string;
}

export interface EnergyContextData {
  appliances?: Appliance[];
  usageRecords?: UsageRecord[];
  electricityRate?: number;
  currency?: string;
  co2Factor?: number;
  location?: string;
  weather?: { temperature?: number; condition?: string; season?: string };
  goals?: UserGoal[];
  tips?: EnergyTip[];
}

export interface GeminiValidationResult {
  success: boolean;
  model?: string;
  error?: string;
}

// Production Google Gemini models in order of capability and speed
export const GEMINI_MODEL = 'gemini-2.5-flash';
export const GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

let cachedWorkingModel: string | null = null;

export const getActiveGeminiModel = (): string => cachedWorkingModel || GEMINI_MODEL;

export const resetCachedModel = () => {
  cachedWorkingModel = null;
};

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

    if ('thought' in value && (value as { thought?: unknown }).thought === true) return '';
    if ('text' in value && typeof (value as { text?: unknown }).text === 'string' && (value as { text: string }).text.trim()) {
      return (value as { text: string }).text.trim();
    }

    if ('parts' in value && Array.isArray((value as { parts?: unknown }).parts)) {
      return ((value as { parts: unknown[] }).parts).map(visit).filter(Boolean).join('\n');
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

export const parseSuggestionsFromText = (text: string): string[] => {
  const match = text.match(/SUGGESTIONS\s*:\s*(.*)/is);
  if (!match) return [];

  return match[1]
    .split(/[;\n|]/)
    .map((item) => item.replace(/^[-•*0-9.]+\s*/, '').trim())
    .filter((item) => Boolean(item) && item.length < 50)
    .slice(0, 5);
};

export const stripSuggestionBlock = (text: string): string => {
  const match = text.match(/^(.*?)(?:\n\s*SUGGESTIONS\s*:\s*.*)$/is);
  if (match && match[1]) {
    return match[1].trim();
  }
  return text.trim();
};

export interface GeminiContentTurn {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

/**
 * Normalizes multi-turn message history into the strict alternating format required by Gemini.
 */
export const normalizeGeminiContents = (
  history: ChatMessage[] = [],
  currentPrompt: string,
): GeminiContentTurn[] => {
  const turns: GeminiContentTurn[] = [];

  // Filter out the initial static greeting and take up to the last 8 messages
  const relevantHistory = history
    .filter((m) => m.id !== 'greeting' && m.text.trim().length > 0)
    .slice(-8);

  for (const msg of relevantHistory) {
    const role: 'user' | 'model' = msg.isUser ? 'user' : 'model';
    const text = msg.text.trim();

    // If consecutive messages have the same role, merge them
    const lastTurn = turns.at(-1);
    if (lastTurn && lastTurn.role === role) {
      lastTurn.parts[0].text = `${lastTurn.parts[0].text}\n${text}`;
    } else {
      turns.push({
        role,
        parts: [{ text }],
      });
    }
  }

  // Ensure conversation starts with a 'user' turn
  if (turns.length > 0 && turns[0].role === 'model') {
    turns.shift();
  }

  // Append current prompt as final user turn
  const lastTurn = turns.at(-1);
  if (lastTurn && lastTurn.role === 'user') {
    // If the last turn was also user, append prompt with context
    lastTurn.parts[0].text = `${lastTurn.parts[0].text}\n\n${currentPrompt}`;
  } else {
    turns.push({
      role: 'user',
      parts: [{ text: currentPrompt }],
    });
  }

  return turns;
};

/**
 * Executes a Gemini API request with model fallback cascades.
 */
const makeGeminiRequest = async (
  apiKey: string,
  contents: GeminiContentTurn[] | string,
): Promise<{ text: string | null; modelUsed?: string; error?: string }> => {
  const cleanedKey = apiKey.trim();
  if (!cleanedKey) {
    return { text: null, error: 'API key is empty' };
  }

  const turns: GeminiContentTurn[] = typeof contents === 'string'
    ? [{ role: 'user', parts: [{ text: contents }] }]
    : contents;

  // Determine models sequence to try (preferred or cached model first)
  const modelsToTry = cachedWorkingModel
    ? [cachedWorkingModel, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== cachedWorkingModel)]
    : GEMINI_FALLBACK_MODELS;

  let lastError = 'Request failed';

  for (const model of modelsToTry) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': cleanedKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            contents: turns,
            generationConfig: {
              temperature: 0.65,
              topP: 0.9,
              maxOutputTokens: 650,
            },
          }),
        },
      );

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        const extracted = extractGeminiText(data);
        if (extracted) {
          cachedWorkingModel = model;
          return { text: extracted, modelUsed: model };
        }
      }

      const status = response.status;
      if (status === 400 || status === 403) {
        let errorBody = '';
        try {
          const errJson = await response.json();
          errorBody = errJson?.error?.message || '';
        } catch {}

        if (errorBody.toLowerCase().includes('api_key_invalid') || errorBody.toLowerCase().includes('api key not valid')) {
          return { text: null, error: 'Invalid Google Gemini API key. Please check your key in Google AI Studio.' };
        }
        if (status === 403) {
          return { text: null, error: 'Access forbidden. Please check that your Gemini API key has proper permissions.' };
        }
      }

      if (status === 429) {
        return { text: null, error: 'Gemini rate limit exceeded. Please wait a moment and try again.' };
      }

      // If 404 or unsupported model, try next model in fallback array
      lastError = `Model ${model} returned HTTP ${status}`;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === 'AbortError') {
        lastError = 'Request timed out after 12 seconds';
      } else {
        lastError = err?.message || 'Network request failed';
      }
    }
  }

  console.warn('All Gemini models attempted failed, falling back to local engine:', lastError);
  return { text: null, error: lastError };
};

/**
 * Validates a Gemini API key with detailed feedback on model and status.
 */
export const validateGeminiKey = async (apiKey: string): Promise<GeminiValidationResult> => {
  const cleanedKey = apiKey.trim();
  if (!cleanedKey) {
    return { success: false, error: 'Please enter a Gemini API key.' };
  }

  const result = await makeGeminiRequest(cleanedKey, 'Respond with: OK');
  if (result.text) {
    return {
      success: true,
      model: result.modelUsed || GEMINI_MODEL,
    };
  }

  return {
    success: false,
    error: result.error || 'Could not connect to Google Gemini. Please check your key and network connection.',
  };
};

/**
 * Backward-compatible boolean test connection function.
 */
export const testGeminiConnection = async (apiKey: string): Promise<boolean> => {
  const res = await validateGeminiKey(apiKey);
  return res.success;
};

/**
 * Builds standard energy insight prompt used by recommendations and reports.
 */
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

/**
 * Builds a comprehensive, contextual prompt for SaveVolt AI chat with deep energy telemetry.
 */
export const buildChatPrompt = (
  query: string,
  appliances: Appliance[],
  tips: EnergyTip[],
  extraContext?: EnergyContextData,
): string => {
  const activeAppliances = appliances.filter((appliance) => appliance.isActive);
  const totalDailyUsageKWh = activeAppliances.reduce((sum, appliance) => {
    return sum + (appliance.powerRating * appliance.hoursPerDay * appliance.quantity) / 1000;
  }, 0);
  const monthlyUsageKWh = totalDailyUsageKWh * 30;

  const rate = extraContext?.electricityRate ?? 0.12;
  const currency = extraContext?.currency ?? '$';
  const monthlyCost = monthlyUsageKWh * rate;

  const sortedAppliances = [...activeAppliances].sort(
    (a, b) => (b.powerRating * b.hoursPerDay * b.quantity) - (a.powerRating * a.hoursPerDay * a.quantity),
  );

  const topConsumers = sortedAppliances.slice(0, 3).map((a) => {
    const kwh = (a.powerRating * a.hoursPerDay * a.quantity * 30) / 1000;
    const cost = kwh * rate;
    const pct = monthlyUsageKWh > 0 ? ((kwh / monthlyUsageKWh) * 100).toFixed(0) : '0';
    return `${a.name} (${a.category}, ${a.powerRating}W, ${a.hoursPerDay}h/day → ${currency}${cost.toFixed(1)}/mo, ${pct}% of total)`;
  });

  const weatherInfo = extraContext?.weather?.temperature !== undefined
    ? `${extraContext.weather.temperature}°C, ${extraContext.weather.condition || 'Clear'} (${extraContext.weather.season || 'Current Season'}) in ${extraContext.location || 'Home'}`
    : extraContext?.location ? `Location: ${extraContext.location}` : '';

  const activeGoals = extraContext?.goals?.filter((g) => !g.isAchieved).slice(0, 2);
  const goalsSummary = activeGoals && activeGoals.length > 0
    ? activeGoals.map((g) => `${g.type} goal target: ${g.target} (currently ${g.currentValue})`).join(', ')
    : '';

  const tipSummary = tips.slice(0, 3).map((tip) => `${tip.title}: ${tip.description}`).join(' | ');

  const contextLines = [
    'You are SaveVolt AI, an intelligent, friendly, and practical energy-saving consultant inside the SaveVolt smart energy app.',
    'Your goal is to help the user reduce their electricity bills, avoid vampire/standby power drain, and optimize device usage.',
    'Household Telemetry Context:',
    `- Active appliances count: ${activeAppliances.length}`,
    `- Estimated daily consumption: ${totalDailyUsageKWh.toFixed(2)} kWh/day (~${monthlyUsageKWh.toFixed(1)} kWh/month)`,
    `- Estimated monthly bill: ${currency}${monthlyCost.toFixed(2)} (at ${currency}${rate.toFixed(2)}/kWh)`,
    `- Top energy consumers: ${topConsumers.length > 0 ? topConsumers.join('; ') : 'None added yet'}`,
  ];

  if (weatherInfo) {
    contextLines.push(`- Weather & Climate: ${weatherInfo}`);
  }
  if (goalsSummary) {
    contextLines.push(`- Active user goals: ${goalsSummary}`);
  }
  if (tipSummary) {
    contextLines.push(`- Relevant tips: ${tipSummary}`);
  }

  contextLines.push(
    '',
    `User Question: "${query}"`,
    '',
    'Guidelines for response:',
    '1. Answer clearly, accurately, and conversationally.',
    '2. Use the user\'s real appliances and currency figures whenever relevant to make the advice actionable.',
    '3. Keep formatting clean with brief paragraphs or bullet points.',
    '4. Do NOT use overly long theoretical essays.',
    '5. Crucial: End your response with a final line starting with "SUGGESTIONS:" followed by exactly 3 short follow-up prompts separated by semicolons (e.g. SUGGESTIONS: How to cut AC bill; Audit kitchen appliances; Set 15% saving goal).',
  );

  return contextLines.join('\n');
};

/**
 * Gets a rich AI reply from Gemini with multi-turn support and energy intelligence.
 */
export const getGeminiChatReply = async (
  apiKey: string,
  query: string,
  appliances: Appliance[],
  tips: EnergyTip[],
  history?: ChatMessage[],
  extraContext?: EnergyContextData,
): Promise<GeminiReply | null> => {
  const cleanedKey = apiKey.trim();
  if (!cleanedKey) {
    return null;
  }

  const prompt = buildChatPrompt(query, appliances, tips, extraContext);
  const contents = normalizeGeminiContents(history, prompt);

  const result = await makeGeminiRequest(cleanedKey, contents);
  if (!result.text) {
    return null;
  }

  const responseText = stripSuggestionBlock(result.text);
  const suggestions = parseSuggestionsFromText(result.text);

  return {
    text: responseText || 'I am not able to answer that right now. Please try a different question.',
    suggestions: suggestions.length > 0 ? suggestions : ['⚡ Quick Energy Audit', '💰 Calculate Bill', '🔌 Top Consumers'],
    source: 'gemini',
    modelUsed: result.modelUsed,
  };
};

/**
 * Summarizes recommendations for the Recommendations Screen.
 */
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
  const result = await makeGeminiRequest(cleanedKey, prompt);

  if (!result.text) {
    return null;
  }

  return stripSuggestionBlock(result.text);
};

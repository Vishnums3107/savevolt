import Tts from 'react-native-tts';

// Updated by the TTS event listeners registered in initializeTts
let isSpeaking = false;
let ttsListenersRegistered = false;

const registerTtsListeners = () => {
  if (ttsListenersRegistered) return;
  Tts.addEventListener('tts-start', () => { isSpeaking = true; });
  Tts.addEventListener('tts-finish', () => { isSpeaking = false; });
  Tts.addEventListener('tts-cancel', () => { isSpeaking = false; });
  ttsListenersRegistered = true;
};

/**
 * Initialize Text-to-Speech engine. Safe to call more than once.
 */
export const initializeTts = async () => {
  try {
    registerTtsListeners();

    // Set default language
    await Tts.setDefaultLanguage('en-US');

    // Set default rate (speed of speech)
    await Tts.setDefaultRate(0.5);

    // Set default pitch
    await Tts.setDefaultPitch(1.0);

    // Get available voices
    const voices = await Tts.voices();
    const englishVoice = voices.find(v => v.language === 'en-US');

    if (englishVoice) {
      await Tts.setDefaultVoice(englishVoice.id);
    }
  } catch (error) {
    console.error('Error initializing TTS:', error);
  }
};

/**
 * Speak text aloud
 */
export const speak = async (text: string) => {
  try {
    await Tts.stop(); // Stop any ongoing speech
    await Tts.speak(text);
  } catch (error) {
    console.error('Error speaking:', error);
  }
};

/**
 * Speak text aloud (alias for compatibility)
 */
export const speakText = speak;

/**
 * Stop speaking
 */
export const stopSpeaking = async () => {
  try {
    await Tts.stop();
  } catch (error) {
    console.error('Error stopping speech:', error);
  }
};

/**
 * Speak energy tip with proper formatting
 */
export const speakEnergyTip = async (title: string, description: string, savings: number) => {
  const text = `Energy saving tip: ${title}. ${description}. This could save you up to ${savings.toFixed(1)} kilowatt hours per month.`;
  await speak(text);
};

/**
 * Speak reminder alert
 */
export const speakReminder = async (message: string) => {
  const text = `Reminder: ${message}`;
  await speak(text);
};

/**
 * Speak dashboard summary
 * @param currencyLabel spoken name of the currency, e.g. "rupees" (defaults to "dollars")
 */
export const speakDashboardSummary = async (
  energy: number,
  cost: number,
  co2: number,
  trees: number,
  currencyLabel = 'dollars',
) => {
  const text = `Your monthly energy usage is ${energy.toFixed(1)} kilowatt hours, costing ${cost.toFixed(2)} ${currencyLabel}. You've generated ${co2.toFixed(1)} kilograms of C O 2, equivalent to ${trees.toFixed(1)} trees needed for offset.`;
  await speak(text);
};

/**
 * Speak energy audit results
 */
export const speakAuditResults = async (topConsumer: string, consumption: number) => {
  const text = `Your top energy consumer is ${topConsumer}, using ${consumption.toFixed(1)} kilowatt hours per day.`;
  await speak(text);
};

/**
 * Speak achievement
 */
export const speakAchievement = async (achievement: string) => {
  const text = `Congratulations! You've earned a new achievement: ${achievement}`;
  await speak(text);
};

/**
 * Speak goal progress
 */
export const speakGoalProgress = async (goalName: string, progress: number, target: number) => {
  const percentage = ((progress / target) * 100).toFixed(0);
  const text = `Your goal ${goalName} is ${percentage} percent complete. You've achieved ${progress.toFixed(1)} out of ${target.toFixed(1)}.`;
  await speak(text);
};

/**
 * Check if TTS is available
 */
export const isTtsAvailable = async (): Promise<boolean> => {
  try {
    const engines = await Tts.engines();
    return engines.length > 0;
  } catch {
    return false;
  }
};

/**
 * Get TTS status (whether speech is currently active)
 */
export const getTtsStatus = (): boolean => {
  return isSpeaking;
};

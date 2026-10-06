/**
 * Voice Command Service
 * Speech recognition with per-session listener callbacks, plus matching of spoken app commands.
 */

import { PermissionsAndroid, Platform } from 'react-native';
import Voice from '@react-native-voice/voice';
import type { SpeechErrorEvent, SpeechResultsEvent } from '@react-native-voice/voice';
import { speakText } from '../utils/voice';

export interface VoiceCommand {
  command: string;
  action: string;
  parameters?: RegExpMatchArray;
  confidence: number;
}

export interface VoiceCommandHandler {
  pattern: RegExp;
  action: (params: RegExpMatchArray) => Promise<void>;
  description: string;
}

export interface VoiceCommandMatch {
  id: string;
  params: RegExpMatchArray;
}

export interface VoiceNavigationTarget {
  tab: string;
  screen?: string;
}

/**
 * Callbacks for one listening session. `onEnd` always fires last, exactly once per session,
 * after `onResult` or `onError`. A session ended with `cancel()` or `destroy()` gets no callbacks.
 */
export interface VoiceListeningHandlers {
  onResult(text: string): void;
  onPartial?(text: string): void;
  onError?(message: string): void;
  onEnd?(): void;
}

const LOCALE = 'en-US';

// Android reports end-of-speech before the final transcript, and stop() resolves before it arrives.
// If neither a result nor an error follows within this window, the session is closed anyway.
const SETTLE_TIMEOUT_MS = 4000;

// Order matters: the first matching pattern wins.
const DEFAULT_COMMANDS: ReadonlyArray<[string, VoiceCommandHandler]> = [
  ['show-dashboard', {
    pattern: /\bshow (the |my )?(dashboard|home|main screen)\b/i,
    action: async () => {
      await speakText('Showing dashboard');
    },
    description: 'Navigate to dashboard',
  }],
  // Only at the start of the utterance, so questions that merely contain "add" stay chat messages
  ['add-appliance', {
    pattern: /^(?:please )?add (an? )?(\w+)( with )?(\d+)?( watts)?/i,
    action: async (params) => {
      const applianceName = params[2];
      const wattage = params[4] || 100;
      await speakText(`Adding ${applianceName} with ${wattage} watts`);
    },
    description: 'Add new appliance',
  }],
  ['show-usage', {
    pattern: /\bshow (my )?(energy )?usage\b|\bwhat(['’]s| is) (my )?(energy )?usage\b/i,
    action: async () => {
      await speakText('Showing energy usage');
    },
    description: 'Show current energy usage',
  }],
  ['set-goal', {
    pattern: /\bset( a)? goal( of)?( to save)?( energy)? (\d+)/i,
    action: async (params) => {
      const amount = params[5];
      await speakText(`Setting energy savings goal of ${amount} kilowatt hours`);
    },
    description: 'Set energy savings goal',
  }],
  ['show-tips', {
    pattern: /\bshow (energy )?tips\b|\bgive me (some )?tips\b/i,
    action: async () => {
      await speakText('Showing energy saving tips');
    },
    description: 'Show energy tips',
  }],
  ['toggle-appliance', {
    pattern: /\bturn (on|off) (the )?(\w+)/i,
    action: async (params) => {
      const action = params[1];
      const appliance = params[3];
      await speakText(`Turning ${action} ${appliance}`);
    },
    description: 'Control appliance',
  }],
  ['check-savings', {
    pattern: /\bhow much (have I |did I )?save(d)?\b|\bwhat(['’]s| is) my savings\b/i,
    action: async () => {
      await speakText('Checking your energy savings');
    },
    description: 'Check total savings',
  }],
  ['show-community', {
    pattern: /\bshow community\b|\bcommunity goals?\b/i,
    action: async () => {
      await speakText('Showing community goals');
    },
    description: 'Show community goals',
  }],
  ['show-challenges', {
    pattern: /\bshow challenges\b|\bmy challenges\b/i,
    action: async () => {
      await speakText('Showing your challenges');
    },
    description: 'Show active challenges',
  }],
  ['show-map', {
    pattern: /\bshow (the )?(energy )?map\b|\benergy hotspots?\b/i,
    action: async () => {
      await speakText('Showing energy map');
    },
    description: 'Show energy map',
  }],
  ['create-challenge', {
    pattern: /\bcreate( a)? challenge( to)?( save)?( energy)? (\d+)/i,
    action: async (params) => {
      const amount = params[5];
      await speakText(`Creating challenge to save ${amount} kilowatt hours`);
    },
    description: 'Create new challenge',
  }],
  ['show-progress', {
    pattern: /\bshow (my )?progress\b|\bhow am I doing\b/i,
    action: async () => {
      await speakText('Showing your progress');
    },
    description: 'Show progress',
  }],
  ['weather-tips', {
    pattern: /\bweather tips\b|\benergy tips for (today|weather)\b/i,
    action: async () => {
      await speakText('Getting weather-based energy tips');
    },
    description: 'Get weather tips',
  }],
  ['show-leaderboard', {
    pattern: /\bshow (the )?leader ?board\b|\bmy rank(ing)?\b/i,
    action: async () => {
      await speakText('Showing leaderboard');
    },
    description: 'Show leaderboard',
  }],
  ['start-ar', {
    pattern: /\bstart (A R|AR|augmented reality)\b|\bshow (A R|AR|augmented reality) map\b/i,
    action: async () => {
      await speakText('Starting augmented reality mode');
    },
    description: 'Start AR energy map',
  }],
  ['carbon-footprint', {
    pattern: /\bwhat(['’]s| is) my carbon footprint\b|\bshow (my )?carbon\b/i,
    action: async () => {
      await speakText('Showing your carbon footprint');
    },
    description: 'Show carbon footprint',
  }],
  // Word boundaries keep "helpful" or "helpless" from triggering it
  ['help', {
    pattern: /\bhelp\b|\bwhat can (I say|you do)\b/i,
    action: async () => {
      await speakText('You can say things like: show dashboard, add appliance, show usage, set goal, show tips, or ask for help');
    },
    description: 'Show available commands',
  }],
];

const NAVIGATION_TARGETS: ReadonlyMap<string, VoiceNavigationTarget> = new Map([
  ['show-dashboard', { tab: 'Home' }],
  ['show-usage', { tab: 'Insights', screen: 'Trends' }],
  ['show-tips', { tab: 'Insights', screen: 'Tips' }],
  ['weather-tips', { tab: 'Insights', screen: 'Tips' }],
  ['show-community', { tab: 'Goals', screen: 'Community' }],
  ['show-challenges', { tab: 'Goals', screen: 'Challenges' }],
  ['show-map', { tab: 'Track', screen: 'Map' }],
  ['show-progress', { tab: 'Goals', screen: 'Progress' }],
  ['show-leaderboard', { tab: 'Goals', screen: 'Leaderboard' }],
  ['carbon-footprint', { tab: 'Goals', screen: 'Impact' }],
  ['add-appliance', { tab: 'Track', screen: 'AddAppliance' }],
]);

const normalizeUtterance = (text: string): string => text.trim().replace(/\s+/g, ' ');

const findCommand = (
  text: string,
  commands: Iterable<[string, VoiceCommandHandler]>,
): (VoiceCommandMatch & { handler: VoiceCommandHandler }) | null => {
  const utterance = normalizeUtterance(text);
  if (!utterance) return null;
  for (const [id, handler] of commands) {
    const params = utterance.match(handler.pattern);
    if (params) return { id, params, handler };
  }
  return null;
};

/** Matches an utterance against the default commands. Pure: no speech, no callbacks. */
export const matchVoiceCommand = (text: string): VoiceCommandMatch | null => {
  const match = findCommand(text, DEFAULT_COMMANDS);
  return match ? { id: match.id, params: match.params } : null;
};

/** Where a navigation command leads in the app's tab/stack routes; null for non-navigation commands. */
export const getNavigationTarget = (commandId: string): VoiceNavigationTarget | null => {
  const target = NAVIGATION_TARGETS.get(commandId);
  return target ? { ...target } : null;
};

/**
 * True when recognition ended because nothing intelligible was heard (silence or no match),
 * as opposed to a microphone, permission or engine failure.
 * Android reports e.g. "7/No match" and "6/No speech input"; iOS "No speech detected".
 */
export const isNoSpeechError = (message: string): boolean =>
  /^(6|7)\/|no match|no speech|speech timeout|didn['’]t understand/i.test(message);

const firstTranscript = (event: SpeechResultsEvent): string => event.value?.[0]?.trim() ?? '';

class VoiceCommandService {
  private static instance: VoiceCommandService;
  private isListening = false;
  private handlers: VoiceListeningHandlers | null = null;
  private lastTranscript = '';
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  // Bumped by every start/stop/cancel so a start still awaiting availability or permission
  // can tell it has been superseded and must not open the microphone.
  private attempt = 0;
  private commandHandlers: Map<string, VoiceCommandHandler> = new Map();
  private onCommandCallback?: (command: VoiceCommand) => void;

  private constructor() {
    this.registerDefaultCommands();
  }

  public static getInstance(): VoiceCommandService {
    if (!VoiceCommandService.instance) {
      VoiceCommandService.instance = new VoiceCommandService();
    }
    return VoiceCommandService.instance;
  }

  /**
   * Whether speech recognition can be used on this device.
   * On iOS this also asks for Speech Recognition authorization the first time.
   */
  public async isAvailable(): Promise<boolean> {
    try {
      return Boolean(await Voice.isAvailable());
    } catch {
      return false;
    }
  }

  /** Android: checks, then requests, RECORD_AUDIO. iOS prompts by itself when recognition starts. */
  public async requestMicrophonePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
      if (await PermissionsAndroid.check(permission)) return true;
      const result = await PermissionsAndroid.request(permission, {
        title: 'Allow microphone access',
        message: 'SaveVolt uses the microphone so you can ask the Energy Assistant questions by voice.',
        buttonPositive: 'OK',
      });
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch (error) {
      console.warn('Microphone permission request failed:', error);
      return false;
    }
  }

  /**
   * Starts a listening session that reports to `handlers`, replacing any active session.
   * Resolves false when recognition is unavailable, the microphone is denied, starting fails,
   * or the session ended (or was cancelled) before it was up.
   */
  public async startListening(handlers: VoiceListeningHandlers): Promise<boolean> {
    if (this.handlers) {
      await this.cancel();
    }
    const attempt = ++this.attempt;

    if (!(await this.isAvailable()) || attempt !== this.attempt) return false;
    if (!(await this.requestMicrophonePermission()) || attempt !== this.attempt) return false;
    if (!this.bindVoiceEvents()) return false;

    this.handlers = handlers;
    this.isListening = true;
    this.lastTranscript = '';
    try {
      await Voice.start(LOCALE);
    } catch (error) {
      console.warn('Voice recognition failed to start:', error);
      if (this.handlers === handlers) this.endSession();
      return false;
    }
    return this.handlers === handlers;
  }

  /** Stops listening; the transcript of what was already said is still delivered to onResult. */
  public async stopListening(): Promise<void> {
    this.attempt++;
    const handlers = this.handlers;
    if (!handlers) return;

    this.armSettleTimer();
    try {
      await Voice.stop();
    } catch (error) {
      console.warn('Failed to stop voice recognition:', error);
      if (this.handlers === handlers) this.finish(this.lastTranscript);
    }
  }

  /** Aborts the active session without delivering a result or calling its handlers. */
  public async cancel(): Promise<void> {
    this.attempt++;
    if (!this.endSession()) return;
    try {
      await Voice.cancel();
    } catch (error) {
      console.warn('Failed to cancel voice recognition:', error);
    }
  }

  public isCurrentlyListening(): boolean {
    return this.isListening;
  }

  /** Releases the native recognizer. A later startListening() sets it up again. */
  public async destroy(): Promise<void> {
    this.attempt++;
    this.endSession();
    try {
      await Voice.destroy();
    } catch (error) {
      console.warn('Failed to destroy voice recognition:', error);
    }
  }

  /** Register custom command handler */
  public registerCommand(id: string, handler: VoiceCommandHandler): void {
    this.commandHandlers.set(id, handler);
  }

  /** Unregister command handler */
  public unregisterCommand(id: string): void {
    this.commandHandlers.delete(id);
  }

  /** Set callback for recognized commands (see processCommand) */
  public onCommand(callback: (command: VoiceCommand) => void): void {
    this.onCommandCallback = callback;
  }

  /**
   * Runs the first registered command matching `text` (including custom ones): notifies the
   * onCommand callback, then performs the command's spoken action. Resolves null if none matched.
   */
  public async processCommand(text: string): Promise<VoiceCommand | null> {
    const match = findCommand(text, this.commandHandlers);
    if (!match) return null;

    const command: VoiceCommand = {
      command: text,
      action: match.id,
      parameters: match.params,
      confidence: 1.0,
    };
    this.onCommandCallback?.(command);
    await match.handler.action(match.params);
    return command;
  }

  public getAvailableCommands(): Array<{ id: string; description: string }> {
    return Array.from(this.commandHandlers.entries()).map(([id, handler]) => ({
      id,
      description: handler.description,
    }));
  }

  private registerDefaultCommands(): void {
    for (const [id, handler] of DEFAULT_COMMANDS) {
      this.registerCommand(id, handler);
    }
  }

  /**
   * The Voice module captures these callbacks when its native listeners are first attached,
   * so they are stable dispatchers that forward to whichever session is active.
   */
  private bindVoiceEvents(): boolean {
    try {
      Voice.onSpeechResults = this.handleSpeechResults;
      Voice.onSpeechPartialResults = this.handleSpeechPartialResults;
      Voice.onSpeechError = this.handleSpeechError;
      Voice.onSpeechEnd = this.handleSpeechEnd;
      return true;
    } catch (error) {
      console.warn('Voice recognition is unavailable:', error);
      return false;
    }
  }

  private readonly handleSpeechResults = (event: SpeechResultsEvent): void => {
    if (!this.handlers) return;
    const text = firstTranscript(event);
    if (Platform.OS === 'ios') {
      // iOS streams the best transcription so far through this event; onSpeechEnd marks it final
      this.updatePartial(text);
      return;
    }
    this.finish(text || this.lastTranscript);
  };

  private readonly handleSpeechPartialResults = (event: SpeechResultsEvent): void => {
    // iOS partials already arrive through onSpeechResults
    if (!this.handlers || Platform.OS === 'ios') return;
    this.updatePartial(firstTranscript(event));
  };

  private readonly handleSpeechEnd = (): void => {
    if (!this.handlers) return;
    if (Platform.OS === 'ios') {
      this.finish(this.lastTranscript);
      return;
    }
    this.armSettleTimer();
  };

  private readonly handleSpeechError = (event: SpeechErrorEvent): void => {
    if (!this.handlers) return;
    const handlers = this.endSession();
    const message = event.error?.message || event.error?.code || 'Speech recognition failed';
    try {
      handlers?.onError?.(message);
    } finally {
      handlers?.onEnd?.();
    }
  };

  private updatePartial(text: string): void {
    if (!text) return;
    this.lastTranscript = text;
    this.handlers?.onPartial?.(text);
  }

  private finish(text: string): void {
    const handlers = this.endSession();
    if (!handlers) return;
    try {
      if (text) handlers.onResult(text);
    } finally {
      handlers.onEnd?.();
    }
  }

  /** Resets session state and returns the handlers of the session that was active, if any. */
  private endSession(): VoiceListeningHandlers | null {
    const handlers = this.handlers;
    this.handlers = null;
    this.isListening = false;
    this.lastTranscript = '';
    this.clearSettleTimer();
    return handlers;
  }

  private armSettleTimer(): void {
    this.clearSettleTimer();
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.finish(this.lastTranscript);
      // The native recognizer never reported back; make sure it is not still holding the microphone
      Promise.resolve()
        .then(() => Voice.cancel())
        .catch((error) => console.warn('Failed to cancel voice recognition:', error));
    }, SETTLE_TIMEOUT_MS);
  }

  private clearSettleTimer(): void {
    if (this.settleTimer) {
      clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
  }
}

export default VoiceCommandService.getInstance();

import { PermissionsAndroid, Platform } from 'react-native';
import Voice from '@react-native-voice/voice';
import type { SpeechErrorEvent, SpeechResultsEvent } from '@react-native-voice/voice';
import VoiceCommandService, {
  getNavigationTarget,
  isNoSpeechError,
  matchVoiceCommand,
  VoiceListeningHandlers,
} from '../src/services/VoiceCommandService';

// The jest.setup.js mock is a plain object; the service assigns its event callbacks onto it.
const voiceMock = Voice as unknown as {
  start: jest.Mock;
  stop: jest.Mock;
  cancel: jest.Mock;
  isAvailable: jest.Mock;
  onSpeechResults?: (event: SpeechResultsEvent) => void;
  onSpeechPartialResults?: (event: SpeechResultsEvent) => void;
  onSpeechError?: (event: SpeechErrorEvent) => void;
  onSpeechEnd?: () => void;
};

const createHandlers = () => ({
  onResult: jest.fn(),
  onPartial: jest.fn(),
  onError: jest.fn(),
  onEnd: jest.fn(),
}) satisfies VoiceListeningHandlers;

describe('matchVoiceCommand', () => {
  it('matches dashboard navigation', () => {
    expect(matchVoiceCommand('Show dashboard')?.id).toBe('show-dashboard');
    expect(matchVoiceCommand('please show the home screen')?.id).toBe('show-dashboard');
    expect(matchVoiceCommand('  SHOW   MAIN SCREEN ')?.id).toBe('show-dashboard');
  });

  it('matches tips requests', () => {
    expect(matchVoiceCommand('show energy tips')?.id).toBe('show-tips');
    expect(matchVoiceCommand('Give me some tips')?.id).toBe('show-tips');
    expect(matchVoiceCommand('any weather tips')?.id).toBe('weather-tips');
  });

  it('matches help only as a whole word', () => {
    expect(matchVoiceCommand('help')?.id).toBe('help');
    expect(matchVoiceCommand('What can I say?')?.id).toBe('help');
    expect(matchVoiceCommand('That was really helpful')).toBeNull();
    expect(matchVoiceCommand('I feel helpless about my bill')).toBeNull();
  });

  it('matches add-appliance only at the start of the utterance', () => {
    const match = matchVoiceCommand('Add a fridge with 150 watts');
    expect(match?.id).toBe('add-appliance');
    expect(match?.params[2]).toBe('fridge');
    expect(match?.params[4]).toBe('150');
    expect(matchVoiceCommand('please add an oven')?.id).toBe('add-appliance');

    expect(matchVoiceCommand('How do I add a heater?')).toBeNull();
    expect(matchVoiceCommand('Can you add up my monthly cost')).toBeNull();
    expect(matchVoiceCommand('address my high bill')).toBeNull();
  });

  it('keeps capture groups used by command actions', () => {
    expect(matchVoiceCommand('set a goal of 50')?.params[5]).toBe('50');
    expect(matchVoiceCommand('create a challenge to save 20')?.params[5]).toBe('20');
    const toggle = matchVoiceCommand('turn off the heater');
    expect(toggle?.id).toBe('toggle-appliance');
    expect(toggle?.params[1]).toBe('off');
    expect(toggle?.params[3]).toBe('heater');
  });

  it('accepts typographic apostrophes from speech recognition', () => {
    expect(matchVoiceCommand('What’s my usage')?.id).toBe('show-usage');
    expect(matchVoiceCommand("what's my carbon footprint")?.id).toBe('carbon-footprint');
  });

  it('returns null for unknown or empty input', () => {
    expect(matchVoiceCommand('What is the weather like?')).toBeNull();
    expect(matchVoiceCommand('How can I save energy?')).toBeNull();
    expect(matchVoiceCommand('')).toBeNull();
    expect(matchVoiceCommand('   ')).toBeNull();
  });
});

describe('getNavigationTarget', () => {
  it.each([
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
  ])('maps %s', (commandId, target) => {
    expect(getNavigationTarget(commandId)).toEqual(target);
  });

  it.each(['help', 'set-goal', 'toggle-appliance', 'check-savings', 'start-ar', 'unknown', 'constructor'])(
    'returns null for %s',
    (commandId) => {
      expect(getNavigationTarget(commandId)).toBeNull();
    },
  );

  it('resolves a spoken command end to end', () => {
    const match = matchVoiceCommand('what is my usage');
    expect(match && getNavigationTarget(match.id)).toEqual({ tab: 'Insights', screen: 'Trends' });
  });

  it('only maps registered commands', () => {
    const ids = VoiceCommandService.getAvailableCommands().map((command) => command.id);
    ['show-dashboard', 'show-usage', 'show-tips', 'weather-tips', 'show-community', 'show-challenges',
      'show-map', 'show-progress', 'show-leaderboard', 'carbon-footprint', 'add-appliance']
      .forEach((id) => expect(ids).toContain(id));
  });
});

describe('isNoSpeechError', () => {
  it('recognises silence and no-match errors', () => {
    expect(isNoSpeechError('7/No match')).toBe(true);
    expect(isNoSpeechError('6/No speech input')).toBe(true);
    expect(isNoSpeechError('No speech detected')).toBe(true);
  });

  it('treats permission and engine failures as real errors', () => {
    expect(isNoSpeechError('9/Insufficient permissions')).toBe(false);
    expect(isNoSpeechError('User denied access to speech recognition')).toBe(false);
    expect(isNoSpeechError('2/Network error')).toBe(false);
  });
});

// Jest runs with Platform.OS === 'ios': results stream as partials and onSpeechEnd finalizes them.
describe('VoiceCommandService listening', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(async () => {
    await VoiceCommandService.cancel();
    warnSpy.mockRestore();
    jest.useRealTimers();
  });

  it('streams partials and delivers the final transcript once', async () => {
    const handlers = createHandlers();
    await expect(VoiceCommandService.startListening(handlers)).resolves.toBe(true);
    expect(voiceMock.start).toHaveBeenCalledWith('en-US');
    expect(VoiceCommandService.isCurrentlyListening()).toBe(true);

    voiceMock.onSpeechResults?.({ value: ['show'] });
    voiceMock.onSpeechResults?.({ value: ['show energy tips'] });
    expect(handlers.onPartial).toHaveBeenLastCalledWith('show energy tips');
    expect(handlers.onResult).not.toHaveBeenCalled();

    voiceMock.onSpeechEnd?.();
    expect(handlers.onResult).toHaveBeenCalledTimes(1);
    expect(handlers.onResult).toHaveBeenCalledWith('show energy tips');
    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
    expect(VoiceCommandService.isCurrentlyListening()).toBe(false);

    // Late events after the session ended are ignored
    voiceMock.onSpeechEnd?.();
    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
  });

  it('reports errors and resets state', async () => {
    const handlers = createHandlers();
    await VoiceCommandService.startListening(handlers);

    voiceMock.onSpeechError?.({ error: { message: 'No speech detected' } });
    expect(handlers.onError).toHaveBeenCalledWith('No speech detected');
    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
    expect(handlers.onResult).not.toHaveBeenCalled();
    expect(VoiceCommandService.isCurrentlyListening()).toBe(false);
  });

  it('returns false without starting when recognition is unavailable', async () => {
    voiceMock.isAvailable.mockResolvedValueOnce(false);
    const handlers = createHandlers();
    await expect(VoiceCommandService.startListening(handlers)).resolves.toBe(false);
    expect(voiceMock.start).not.toHaveBeenCalled();
    expect(VoiceCommandService.isCurrentlyListening()).toBe(false);
  });

  it('returns false and resets when the recognizer fails to start', async () => {
    voiceMock.start.mockRejectedValueOnce(new Error('busy'));
    const handlers = createHandlers();
    await expect(VoiceCommandService.startListening(handlers)).resolves.toBe(false);
    expect(VoiceCommandService.isCurrentlyListening()).toBe(false);
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it('treats a missing native module as unavailable', async () => {
    voiceMock.isAvailable.mockRejectedValueOnce(new TypeError('Voice is null'));
    await expect(VoiceCommandService.isAvailable()).resolves.toBe(false);
  });

  it('cancel drops the session silently', async () => {
    const handlers = createHandlers();
    await VoiceCommandService.startListening(handlers);
    await VoiceCommandService.cancel();

    expect(voiceMock.cancel).toHaveBeenCalled();
    expect(VoiceCommandService.isCurrentlyListening()).toBe(false);
    voiceMock.onSpeechResults?.({ value: ['show tips'] });
    voiceMock.onSpeechEnd?.();
    expect(handlers.onPartial).not.toHaveBeenCalled();
    expect(handlers.onResult).not.toHaveBeenCalled();
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it('a cancel during start-up keeps the microphone closed', async () => {
    const handlers = createHandlers();
    const starting = VoiceCommandService.startListening(handlers);
    await VoiceCommandService.cancel();
    await expect(starting).resolves.toBe(false);
    expect(voiceMock.start).not.toHaveBeenCalled();
  });

  it('stopListening closes the session even if no final result arrives', async () => {
    jest.useFakeTimers();
    const handlers = createHandlers();
    await VoiceCommandService.startListening(handlers);
    voiceMock.onSpeechResults?.({ value: ['how am I doing'] });

    await VoiceCommandService.stopListening();
    expect(voiceMock.stop).toHaveBeenCalled();
    expect(handlers.onEnd).not.toHaveBeenCalled();

    jest.advanceTimersByTime(4000);
    expect(handlers.onResult).toHaveBeenCalledWith('how am I doing');
    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
    expect(VoiceCommandService.isCurrentlyListening()).toBe(false);
  });

  describe('on Android', () => {
    let restorePlatform: () => void;
    const permissionSpies: jest.SpyInstance[] = [];
    const mockPermission = (granted: boolean) => {
      permissionSpies.push(
        jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(granted),
        jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(
          granted ? PermissionsAndroid.RESULTS.GRANTED : PermissionsAndroid.RESULTS.DENIED,
        ),
      );
    };

    beforeEach(() => {
      restorePlatform = jest.replaceProperty(Platform, 'OS', 'android').restore;
    });

    afterEach(() => {
      permissionSpies.splice(0).forEach((spy) => spy.mockRestore());
      restorePlatform();
    });

    it('does not start when the microphone permission is denied', async () => {
      mockPermission(false);

      await expect(VoiceCommandService.requestMicrophonePermission()).resolves.toBe(false);
      await expect(VoiceCommandService.startListening(createHandlers())).resolves.toBe(false);
      expect(voiceMock.start).not.toHaveBeenCalled();
    });

    it('waits past end-of-speech for the final result', async () => {
      mockPermission(true);
      const handlers = createHandlers();
      await expect(VoiceCommandService.startListening(handlers)).resolves.toBe(true);

      voiceMock.onSpeechPartialResults?.({ value: ['show my'] });
      expect(handlers.onPartial).toHaveBeenCalledWith('show my');
      voiceMock.onSpeechEnd?.();
      expect(handlers.onEnd).not.toHaveBeenCalled();

      voiceMock.onSpeechResults?.({ value: ['show my progress', 'show me progress'] });
      expect(handlers.onResult).toHaveBeenCalledWith('show my progress');
      expect(handlers.onEnd).toHaveBeenCalledTimes(1);
      expect(VoiceCommandService.isCurrentlyListening()).toBe(false);
    });

    it('closes the session if no result follows end-of-speech', async () => {
      jest.useFakeTimers();
      mockPermission(true);
      const handlers = createHandlers();
      await VoiceCommandService.startListening(handlers);

      voiceMock.onSpeechPartialResults?.({ value: ['show the map'] });
      voiceMock.onSpeechEnd?.();
      jest.advanceTimersByTime(4000);
      expect(handlers.onResult).toHaveBeenCalledWith('show the map');
      expect(handlers.onEnd).toHaveBeenCalledTimes(1);
      expect(VoiceCommandService.isCurrentlyListening()).toBe(false);
    });
  });

  it('a new session replaces the previous one', async () => {
    const first = createHandlers();
    const second = createHandlers();
    await VoiceCommandService.startListening(first);
    await expect(VoiceCommandService.startListening(second)).resolves.toBe(true);

    voiceMock.onSpeechResults?.({ value: ['help'] });
    voiceMock.onSpeechEnd?.();
    expect(first.onResult).not.toHaveBeenCalled();
    expect(second.onResult).toHaveBeenCalledWith('help');
  });
});

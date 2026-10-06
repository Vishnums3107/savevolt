import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AccessibleTouchable from '../components/AccessibleTouchable';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { useEnergy } from '../context/EnergyContext';
import { ThemeColors, useTheme, useThemedStyles } from '../context/ThemeContext';
import { GeminiReply, getGeminiChatReply } from '../services/GeminiService';
import VoiceCommandService, {
  getNavigationTarget,
  isNoSpeechError,
  matchVoiceCommand,
  VoiceNavigationTarget,
} from '../services/VoiceCommandService';
import { Radius, Shadows, Spacing, Typography } from '../theme';
import { ChatMessage } from '../types';
import { generateChatbotResponse } from '../utils/tips';
import { speak, stopSpeaking } from '../utils/voice';

interface ChatScreenProps {
  navigation: {
    navigate: (route: string, params?: { screen: string; initial: boolean }) => void;
  };
}

type VoiceState = 'idle' | 'starting' | 'listening';

// Short pause before the assistant's reply appears
const REPLY_DELAY_MS = 300;

const MIC_SETTINGS_STEPS = Platform.OS === 'ios'
  ? 'open Settings › SaveVolt and turn on Microphone and Speech Recognition'
  : 'open Settings › Apps › SaveVolt › Permissions and allow Microphone';
const MIC_DENIED_MESSAGE =
  `I need microphone access to hear you. Tap the mic and choose Allow, or ${MIC_SETTINGS_STEPS}.`;
const MIC_FAILED_MESSAGE =
  `Voice input isn't working right now. To use it, ${MIC_SETTINGS_STEPS}, then tap the mic again. You can also type your question.`;
const NO_SPEECH_MESSAGE = "I didn't catch that. Tap the mic and try again, or type your question.";

const SUGGESTION_HIT_SLOP = { top: 4, bottom: 4, left: 0, right: 0 };

let messageSeq = 0;
const createMessageId = () => `msg-${Date.now()}-${messageSeq++}`;

const createGreeting = (): ChatMessage => ({
  id: 'greeting',
  isUser: false,
  timestamp: new Date().toISOString(),
  text: "Hi! I'm your Energy Assistant. I can help you save energy, analyze consumption, and answer questions. How can I help?",
  suggestions: ['How can I save energy?', 'Show my consumption', 'Calculate my bill', 'Environmental impact'],
});

/** Human-readable destination for "Opening …" replies, e.g. AddAppliance → "Add Appliance". */
const describeTarget = ({ tab, screen }: VoiceNavigationTarget): string => {
  if (!screen) return tab === 'Home' ? 'your dashboard' : tab;
  return screen.replace(/([a-z])([A-Z])/g, '$1 $2');
};

type Styles = ReturnType<typeof createStyles>;

interface MessageItemProps {
  message: ChatMessage;
  s: Styles;
  onSuggestion: (text: string) => void;
}

const MessageItem = memo(function MessageItem({ message, s, onSuggestion }: MessageItemProps) {
  return (
    <View>
      <View
        style={[s.bubble, message.isUser ? s.userBubble : s.botBubble]}
        accessible
        accessibilityLabel={`${message.isUser ? 'You said' : 'Assistant'}: ${message.text}`}
      >
        <Text style={[s.bubbleTxt, message.isUser ? s.userTxt : s.botTxt]}>{message.text}</Text>
      </View>
      {message.suggestions && message.suggestions.length > 0 && (
        <View style={s.sugWrap}>
          {message.suggestions.map((sug, i) => (
            <TouchableOpacity
              key={`${i}-${sug}`}
              style={s.sugChip}
              onPress={() => onSuggestion(sug)}
              activeOpacity={0.7}
              hitSlop={SUGGESTION_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={sug}
              accessibilityHint="Asks the assistant this question"
            >
              <Text style={s.sugTxt}>{sug}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
});

const TYPING_DOTS = [0, 1, 2];

/** Assistant bubble with three pulsing dots; the dots stay still when reduce motion is on. */
const TypingIndicator = ({ s }: { s: Styles }) => {
  const opacities = useRef(TYPING_DOTS.map(() => new Animated.Value(0.5))).current;

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled || reduceMotion) return;
        animation = Animated.loop(
          Animated.stagger(
            160,
            opacities.map((opacity) =>
              Animated.sequence([
                Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 0.35, duration: 320, useNativeDriver: true }),
              ]),
            ),
          ),
        );
        animation.start();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [opacities]);

  return (
    <View
      style={[s.bubble, s.botBubble, s.typingBubble]}
      accessible
      accessibilityLabel="Assistant is typing"
      accessibilityState={{ busy: true }}
    >
      {opacities.map((opacity, i) => (
        <Animated.View key={TYPING_DOTS[i]} style={[s.typingDot, { opacity }]} />
      ))}
    </View>
  );
};

const ChatScreen = ({ navigation }: ChatScreenProps) => {
  const { appliances, tips, settings } = useEnergy('appliances', 'tips', 'settings');
  const { colors, isDark } = useTheme();
  const s = useThemedStyles(createStyles);
  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const replyTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [messages, setMessages] = useState<ChatMessage[]>(() => [createGreeting()]);
  const [input, setInput] = useState('');
  const [pendingReplies, setPendingReplies] = useState(0);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');

  const { voiceEnabled, geminiApiKey } = settings;
  const listening = voiceState === 'listening';
  const canSend = input.trim().length > 0 && voiceState === 'idle';

  // Unmount: drop pending replies, release the microphone and silence the assistant
  useEffect(() => {
    mountedRef.current = true;
    const timers = replyTimers.current;
    return () => {
      mountedRef.current = false;
      timers.forEach(clearTimeout);
      timers.clear();
      VoiceCommandService.cancel();
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    let active = true;
    VoiceCommandService.isAvailable().then((available) => {
      if (active) setVoiceAvailable(available);
    });
    return () => {
      active = false;
    };
  }, []);

  const addUserMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: createMessageId(), text, isUser: true, timestamp: new Date().toISOString() },
    ]);
  }, []);

  const addBotMessage = useCallback((text: string, suggestions?: string[]) => {
    setMessages((prev) => [
      ...prev,
      { id: createMessageId(), text, isUser: false, timestamp: new Date().toISOString(), suggestions },
    ]);
    if (voiceEnabled) speak(text);
  }, [voiceEnabled]);

  const sendMessage = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    addUserMessage(text);
    setInput('');
    setPendingReplies((count) => count + 1);

    let geminiReply: GeminiReply | null = null;
    if (geminiApiKey) {
      try {
        geminiReply = await getGeminiChatReply(geminiApiKey, text, appliances, tips);
      } catch (error) {
        console.warn('Gemini chat reply failed:', error);
      }
    }
    if (!mountedRef.current) return;

    const fallback = generateChatbotResponse(text, appliances, tips);
    const response = geminiReply?.text || fallback.response;
    const suggestions = geminiReply?.suggestions?.length ? geminiReply.suggestions : fallback.suggestions;

    const timer = setTimeout(() => {
      replyTimers.current.delete(timer);
      setPendingReplies((count) => Math.max(0, count - 1));
      addBotMessage(response, suggestions);
    }, REPLY_DELAY_MS);
    replyTimers.current.add(timer);
  }, [addBotMessage, addUserMessage, appliances, geminiApiKey, tips]);

  // Spoken navigation commands open their screen; anything else is asked as a chat question
  const handleVoiceResult = useCallback((spoken: string) => {
    const command = matchVoiceCommand(spoken);
    const target = command ? getNavigationTarget(command.id) : null;
    if (!target) {
      sendMessage(spoken);
      return;
    }
    setInput('');
    addUserMessage(spoken);
    addBotMessage(`Opening ${describeTarget(target)}…`);
    navigation.navigate(target.tab, target.screen ? { screen: target.screen, initial: false } : undefined);
  }, [addBotMessage, addUserMessage, navigation, sendMessage]);

  const toggleListening = useCallback(async () => {
    if (voiceState === 'listening') {
      VoiceCommandService.stopListening();
      return;
    }
    if (voiceState !== 'idle') return;

    setVoiceState('starting');
    stopSpeaking(); // keep the assistant's own voice out of the microphone
    const draft = input;
    let delivered = false;
    let ended = false;

    const granted = await VoiceCommandService.requestMicrophonePermission();
    if (!mountedRef.current) return;
    if (!granted) {
      setVoiceState('idle');
      addBotMessage(MIC_DENIED_MESSAGE);
      return;
    }

    const started = await VoiceCommandService.startListening({
      onPartial: (text) => setInput(text),
      onResult: (text) => {
        delivered = true;
        handleVoiceResult(text);
      },
      onError: (message) => {
        addBotMessage(isNoSpeechError(message) ? NO_SPEECH_MESSAGE : MIC_FAILED_MESSAGE);
      },
      onEnd: () => {
        ended = true;
        if (!delivered) setInput(draft);
        setVoiceState('idle');
      },
    });
    if (!mountedRef.current) return;

    if (started) {
      setVoiceState((current) => (current === 'starting' ? 'listening' : current));
    } else if (!ended) {
      // Failed before the session came up, so no handler has reported it yet
      setInput(draft);
      setVoiceState('idle');
      addBotMessage(MIC_FAILED_MESSAGE);
    }
  }, [addBotMessage, handleVoiceResult, input, voiceState]);

  const handleSend = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>ENERGY ASSISTANT</Text>
        <Text style={s.headerTitle} accessibilityRole="header">Energy Chat</Text>
      </LinearGradient>

      <ScrollView
        ref={scrollRef}
        style={s.msgList}
        contentContainerStyle={s.msgContent}
        onContentSizeChange={scrollToEnd}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((m) => (
          <MessageItem key={m.id} message={m} s={s} onSuggestion={sendMessage} />
        ))}
        {pendingReplies > 0 && <TypingIndicator s={s} />}
      </ScrollView>

      {listening && (
        <View style={s.listeningBar}>
          <View style={s.listeningDot} accessible={false} importantForAccessibility="no" />
          <Text style={s.listeningTxt}>Listening… speak now</Text>
        </View>
      )}

      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          placeholder={listening ? 'Listening…' : 'Type a question...'}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleSend}
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          editable={voiceState === 'idle'}
          accessibilityLabel="Type a question"
          multiline
        />
        {voiceAvailable && (
          <AccessibleTouchable
            label={listening ? 'Stop listening' : 'Ask by voice'}
            hint={listening
              ? 'Stops the microphone and uses what you said'
              : 'Speak a question, or a command such as "show my usage"'}
            onPress={toggleListening}
            disabled={voiceState === 'starting'}
            accessibilityState={{ busy: voiceState !== 'idle', disabled: voiceState === 'starting' }}
            style={s.actionTarget}
          >
            <View style={[s.micBtn, listening && s.micBtnActive, voiceState === 'starting' && s.micBtnStarting]}>
              <Icon
                name="microphone"
                size={22}
                color={listening ? colors.onPrimary : colors.textSecondary}
                accessible={false}
                importantForAccessibility="no"
              />
            </View>
          </AccessibleTouchable>
        )}
        <AccessibleTouchable
          label="Send message"
          onPress={handleSend}
          disabled={!canSend}
          accessibilityState={{ disabled: !canSend }}
          style={s.actionTarget}
        >
          <LinearGradient
            colors={canSend ? [colors.primary, colors.primaryDark] : [colors.border, colors.border]}
            style={s.sendBtn}
          >
            <Text
              style={[s.sendTxt, !canSend && s.sendTxtDisabled]}
              accessible={false}
              importantForAccessibility="no"
            >
              ↑
            </Text>
          </LinearGradient>
        </AccessibleTouchable>
      </View>
    </KeyboardAvoidingView>
  );
};

const createStyles = (c: ThemeColors, isDark: boolean) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  header: { paddingTop: 54, paddingBottom: 20, paddingHorizontal: Spacing.page, alignItems: 'center' },
  headerLabel: { ...Typography.overline, color: c.primary, marginBottom: 4 },
  headerTitle: { ...Typography.displaySmall, color: c.textOnDark },
  msgList: { flex: 1 },
  msgContent: { padding: Spacing.page, paddingBottom: 20 },
  bubble: { maxWidth: '82%', padding: 14, borderRadius: Radius.lg, marginBottom: 10 },
  // Light mode keeps the navy user bubble; in dark mode navy would vanish into the background
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: isDark ? c.primaryLight : c.dark,
    borderBottomRightRadius: 4,
  },
  botBubble: { alignSelf: 'flex-start', backgroundColor: c.card, ...Shadows.sm, borderBottomLeftRadius: 4 },
  bubbleTxt: { ...Typography.bodyMedium, lineHeight: 21 },
  userTxt: { color: isDark ? c.text : c.textOnDark },
  botTxt: { color: c.text },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 18 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.textSecondary },
  sugWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14, marginLeft: 4 },
  sugChip: {
    minHeight: 36,
    justifyContent: 'center',
    backgroundColor: c.primarySoft,
    borderWidth: 1,
    borderColor: c.primaryLight,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sugTxt: { ...Typography.labelSmall, color: c.text },
  listeningBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: c.primarySoft,
    borderTopWidth: 1,
    borderTopColor: c.divider,
  },
  listeningDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.primaryDark },
  listeningTxt: { ...Typography.label, color: c.text },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    backgroundColor: c.card,
    borderTopWidth: 1,
    borderTopColor: c.divider,
  },
  input: {
    flex: 1,
    backgroundColor: c.inputBg,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: Radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    ...Typography.bodyMedium,
    color: c.text,
  },
  actionTarget: { alignItems: 'center' },
  micBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: c.inputBg,
    borderWidth: 1,
    borderColor: c.border,
  },
  micBtnActive: { backgroundColor: c.primary, borderColor: c.primaryDark, ...Shadows.glow },
  micBtnStarting: { opacity: 0.5 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center' },
  sendTxt: { fontSize: 20, color: c.onPrimary, fontWeight: '800' },
  sendTxtDisabled: { color: c.textMuted },
});

export default ChatScreen;

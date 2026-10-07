import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
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
import {
  EnergyContextData,
  GeminiReply,
  getActiveGeminiModel,
  getGeminiChatReply,
  validateGeminiKey,
} from '../services/GeminiService';
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
    navigate: (route: string, params?: { screen: string; initial: boolean } | Record<string, unknown>) => void;
  };
}

type VoiceState = 'idle' | 'starting' | 'listening';

const REPLY_DELAY_MS = 250;

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

const createGreeting = (hasGemini: boolean): ChatMessage => ({
  id: 'greeting',
  isUser: false,
  timestamp: new Date().toISOString(),
  source: hasGemini ? 'gemini' : 'local',
  text: hasGemini
    ? "Hi! I'm SaveVolt AI, powered by Google Gemini. I can perform in-depth energy audits, analyze your appliances, estimate electricity bills, and optimize your power usage. How can I help you today?"
    : "Hi! I'm your Energy Assistant. I can help you save electricity, calculate costs, and monitor appliance usage. Connect a Google Gemini API key to unlock full conversational AI!",
  suggestions: [
    '⚡ Quick Energy Audit',
    '💰 Calculate my bill',
    '🔌 Top energy consumers',
    '🌙 Eliminate vampire power',
  ],
});

const QUICK_PROMPTS = [
  { id: 'audit', label: '⚡ Energy Audit', prompt: 'Perform a comprehensive energy audit of my active appliances and suggest top savings.' },
  { id: 'bill', label: '💰 Bill Projection', prompt: 'Calculate my projected monthly electricity bill and highlight the highest costs.' },
  { id: 'top', label: '🔌 Top Consumers', prompt: 'Which appliances consume the most electricity in my household?' },
  { id: 'vampire', label: '🌙 Vampire Power', prompt: 'How do I detect and eliminate standby vampire power draw?' },
  { id: 'weather', label: '🌡️ Weather Advice', prompt: 'Give me smart energy-saving advice tailored to current weather conditions.' },
  { id: 'goal', label: '🎯 15% Saving Plan', prompt: 'Create a step-by-step plan to reduce my electricity consumption by 15%.' },
];

/** Human-readable destination for "Opening …" replies */
const describeTarget = ({ tab, screen }: VoiceNavigationTarget): string => {
  if (!screen) return tab === 'Home' ? 'your dashboard' : tab;
  return screen.replace(/([a-z])([A-Z])/g, '$1 $2');
};

type Styles = ReturnType<typeof createStyles>;

interface MessageItemProps {
  message: ChatMessage;
  s: Styles;
  onSuggestion: (text: string) => void;
  onSpeak: (text: string) => void;
}

const MessageItem = memo(function MessageItem({ message, s, onSuggestion, onSpeak }: MessageItemProps) {
  const isUser = message.isUser;
  const isGemini = message.source === 'gemini';
  const isSystem = message.source === 'system';

  return (
    <View style={s.msgWrapper}>
      <View
        style={[s.bubble, isUser ? s.userBubble : s.botBubble, isSystem && s.systemBubble]}
        accessible
        accessibilityLabel={`${isUser ? 'You said' : isGemini ? 'Gemini AI' : 'Assistant'}: ${message.text}`}
      >
        {!isUser && (
          <View style={s.sourceBadgeRow}>
            <View style={[s.sourceBadge, isGemini ? s.geminiBadge : isSystem ? s.sysBadge : s.localBadge]}>
              <Icon
                name={isGemini ? 'creation' : isSystem ? 'cog' : 'lightning-bolt'}
                size={12}
                color={isGemini ? '#7c3aed' : isSystem ? '#2563eb' : '#059669'}
              />
              <Text style={[s.sourceBadgeText, isGemini ? s.geminiBadgeText : isSystem ? s.sysBadgeText : s.localBadgeText]}>
                {isGemini ? 'Gemini AI' : isSystem ? 'System' : 'Local Engine'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => onSpeak(message.text)}
              style={s.speakerBtn}
              accessibilityLabel="Read message aloud"
              accessibilityRole="button"
            >
              <Icon name="volume-high" size={14} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        )}

        <Text style={[s.bubbleTxt, isUser ? s.userTxt : s.botTxt, isSystem && s.systemTxt]}>
          {message.text}
        </Text>
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

/** Assistant bubble with pulsing dots */
const TypingIndicator = ({ s, isGemini }: { s: Styles; isGemini: boolean }) => {
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
      accessibilityLabel={isGemini ? 'Gemini AI is analyzing...' : 'Assistant is typing...'}
      accessibilityState={{ busy: true }}
    >
      <View style={s.typingLabelRow}>
        <Icon name={isGemini ? 'creation' : 'lightning-bolt'} size={14} color={isGemini ? '#7c3aed' : '#059669'} />
        <Text style={s.typingStatusText}>{isGemini ? 'Gemini AI is thinking…' : 'Generating response…'}</Text>
      </View>
      <View style={s.dotsContainer}>
        {opacities.map((opacity, i) => (
          <Animated.View key={TYPING_DOTS[i]} style={[s.typingDot, isGemini && s.geminiDot, { opacity }]} />
        ))}
      </View>
    </View>
  );
};

const ChatScreen = ({ navigation }: ChatScreenProps) => {
  const {
    appliances,
    tips,
    settings,
    updateSettings,
    usageRecords,
    weatherData,
    goals,
  } = useEnergy('appliances', 'tips', 'settings', 'updateSettings', 'usageRecords', 'weatherData', 'goals');

  const { colors, isDark } = useTheme();
  const s = useThemedStyles(createStyles);
  const scrollRef = useRef<ScrollView>(null);
  const mountedRef = useRef(true);
  const replyTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const hasGeminiKey = Boolean(settings.geminiApiKey?.trim());

  const [messages, setMessages] = useState<ChatMessage[]>(() => [createGreeting(hasGeminiKey)]);
  const [input, setInput] = useState('');
  const [pendingReplies, setPendingReplies] = useState(0);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');

  // Quick API Key Modal states
  const [keyModalVisible, setKeyModalVisible] = useState(false);
  const [modalKey, setModalKey] = useState(settings.geminiApiKey ?? '');
  const [modalShowKey, setModalShowKey] = useState(false);
  const [modalTesting, setModalTesting] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const { voiceEnabled, geminiApiKey } = settings;
  const listening = voiceState === 'listening';
  const canSend = input.trim().length > 0 && voiceState === 'idle';

  // Synchronize modal key state whenever settings.geminiApiKey changes
  useEffect(() => {
    setModalKey(settings.geminiApiKey ?? '');
  }, [settings.geminiApiKey]);

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

  const addBotMessage = useCallback((text: string, suggestions?: string[], source: 'gemini' | 'local' | 'system' = 'local') => {
    setMessages((prev) => [
      ...prev,
      { id: createMessageId(), text, isUser: false, timestamp: new Date().toISOString(), suggestions, source },
    ]);
    if (voiceEnabled) speak(text);
  }, [voiceEnabled]);

  const handleSpeakText = useCallback((text: string) => {
    speak(text);
  }, []);

  const handleClearHistory = useCallback(() => {
    Alert.alert(
      'Reset Chat Conversation',
      'Are you sure you want to clear your chat history?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            stopSpeaking();
            setMessages([createGreeting(Boolean(geminiApiKey?.trim()))]);
          },
        },
      ],
    );
  }, [geminiApiKey]);

  const sendMessage = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text) return;

    // Check if the query is a direct navigation command
    const matched = matchVoiceCommand(text);
    if (matched) {
      const target = getNavigationTarget(matched.id);
      if (target) {
        addUserMessage(text);
        addBotMessage(`Opening ${describeTarget(target)}…`, undefined, 'system');
        navigation.navigate(target.tab, target.screen ? { screen: target.screen, initial: false } : undefined);
        return;
      }
    }

    addUserMessage(text);
    setInput('');
    setPendingReplies((count) => count + 1);

    const activeKey = geminiApiKey?.trim();
    let geminiReply: GeminiReply | null = null;

    if (activeKey) {
      try {
        const extraContext: EnergyContextData = {
          appliances,
          usageRecords,
          electricityRate: settings.electricityRate,
          currency: settings.currency,
          co2Factor: settings.co2Factor,
          location: settings.weatherLocation,
          weather: weatherData ? {
            temperature: weatherData.temperature,
            condition: weatherData.condition,
            season: weatherData.season,
          } : undefined,
          goals,
          tips,
        };

        geminiReply = await getGeminiChatReply(
          activeKey,
          text,
          appliances,
          tips,
          messages,
          extraContext,
        );
      } catch (error) {
        console.warn('Gemini chat reply failed:', error);
      }
    }

    if (!mountedRef.current) return;

    const fallback = generateChatbotResponse(text, appliances, tips);
    const response = geminiReply?.text || fallback.response;
    const suggestions = geminiReply?.suggestions?.length ? geminiReply.suggestions : fallback.suggestions;
    const source: 'gemini' | 'local' = geminiReply ? 'gemini' : 'local';

    const timer = setTimeout(() => {
      replyTimers.current.delete(timer);
      setPendingReplies((count) => Math.max(0, count - 1));
      addBotMessage(response, suggestions, source);
    }, REPLY_DELAY_MS);
    replyTimers.current.add(timer);
  }, [addBotMessage, addUserMessage, appliances, geminiApiKey, goals, messages, navigation, settings.co2Factor, settings.currency, settings.electricityRate, settings.weatherLocation, tips, usageRecords, weatherData]);

  const handleVoiceResult = useCallback((spoken: string) => {
    const command = matchVoiceCommand(spoken);
    const target = command ? getNavigationTarget(command.id) : null;
    if (!target) {
      sendMessage(spoken);
      return;
    }
    setInput('');
    addUserMessage(spoken);
    addBotMessage(`Opening ${describeTarget(target)}…`, undefined, 'system');
    navigation.navigate(target.tab, target.screen ? { screen: target.screen, initial: false } : undefined);
  }, [addBotMessage, addUserMessage, navigation, sendMessage]);

  const toggleListening = useCallback(async () => {
    if (voiceState === 'listening') {
      VoiceCommandService.stopListening();
      return;
    }
    if (voiceState !== 'idle') return;

    setVoiceState('starting');
    stopSpeaking();
    const draft = input;
    let delivered = false;
    let ended = false;

    const granted = await VoiceCommandService.requestMicrophonePermission();
    if (!mountedRef.current) return;
    if (!granted) {
      setVoiceState('idle');
      addBotMessage(MIC_DENIED_MESSAGE, undefined, 'system');
      return;
    }

    const started = await VoiceCommandService.startListening({
      onPartial: (text) => setInput(text),
      onResult: (text) => {
        delivered = true;
        handleVoiceResult(text);
      },
      onError: (message) => {
        addBotMessage(isNoSpeechError(message) ? NO_SPEECH_MESSAGE : MIC_FAILED_MESSAGE, undefined, 'system');
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
      setInput(draft);
      setVoiceState('idle');
      addBotMessage(MIC_FAILED_MESSAGE, undefined, 'system');
    }
  }, [addBotMessage, handleVoiceResult, input, voiceState]);

  const handleSend = useCallback(() => {
    sendMessage(input);
  }, [input, sendMessage]);

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Quick Modal Actions
  const handleTestModalKey = async () => {
    const cleaned = modalKey.trim();
    if (!cleaned) {
      setModalFeedback({ success: false, message: 'Please enter a Gemini API key first.' });
      return;
    }
    setModalTesting(true);
    setModalFeedback(null);
    try {
      const res = await validateGeminiKey(cleaned);
      if (res.success) {
        const model = res.model || getActiveGeminiModel();
        setModalFeedback({ success: true, message: `Connected! Verified with Google Gemini (${model}).` });
      } else {
        setModalFeedback({ success: false, message: res.error || 'Failed to validate API key.' });
      }
    } catch {
      setModalFeedback({ success: false, message: 'Connection test failed. Check your network.' });
    } finally {
      setModalTesting(false);
    }
  };

  const handleSaveModalKey = async () => {
    const cleaned = modalKey.trim();
    try {
      await updateSettings({ geminiApiKey: cleaned });
      setKeyModalVisible(false);
      setModalFeedback(null);
      if (cleaned) {
        addBotMessage(
          '✨ Google Gemini AI is now active! All replies will now be generated with deep energy telemetry and multi-turn intelligence.',
          ['⚡ Run complete energy audit', '💰 Projected monthly bill', '🔌 Top appliance consumers'],
          'gemini',
        );
      } else {
        addBotMessage(
          'Gemini API key cleared. Switched to SaveVolt built-in local rule engine.',
          undefined,
          'system',
        );
      }
    } catch {
      Alert.alert('Error', 'Failed to save Gemini API key.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FocusAwareStatusBar variant="hero" />

      {/* Header */}
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <View style={s.headerTopRow}>
          <Text style={s.headerLabel}>ENERGY ASSISTANT</Text>
          <View style={s.headerActions}>
            <TouchableOpacity
              onPress={handleClearHistory}
              style={s.headerIconBtn}
              accessibilityLabel="Clear conversation history"
              accessibilityRole="button"
            >
              <Icon name="broom" size={20} color={colors.textOnDark} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setKeyModalVisible(true)}
              style={s.headerIconBtn}
              accessibilityLabel="Configure Gemini API key"
              accessibilityRole="button"
            >
              <Icon name="key-variant" size={20} color={colors.textOnDark} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={s.headerTitle} accessibilityRole="header">Energy Chat</Text>

        {/* AI Status Badge */}
        <TouchableOpacity
          style={[s.aiStatusBanner, hasGeminiKey ? s.aiStatusBannerActive : s.aiStatusBannerInactive]}
          onPress={() => setKeyModalVisible(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={hasGeminiKey ? 'Gemini AI Online. Tap to manage key.' : 'Local Assistant. Tap to add Gemini API key.'}
        >
          <View style={[s.aiStatusDot, hasGeminiKey ? s.aiStatusDotActive : s.aiStatusDotInactive]} />
          <Text style={[s.aiStatusBannerText, hasGeminiKey ? s.aiStatusBannerTextActive : s.aiStatusBannerTextInactive]}>
            {hasGeminiKey ? '✨ Gemini AI Active (2.5 Flash) • Tap to manage' : '⚡ Local Engine • Tap to connect Gemini API key'}
          </Text>
          <Icon name="chevron-right" size={16} color={hasGeminiKey ? '#a78bfa' : colors.textMuted} />
        </TouchableOpacity>
      </LinearGradient>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={s.msgList}
        contentContainerStyle={s.msgContent}
        onContentSizeChange={scrollToEnd}
        keyboardShouldPersistTaps="handled"
      >
        {messages.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            s={s}
            onSuggestion={sendMessage}
            onSpeak={handleSpeakText}
          />
        ))}
        {pendingReplies > 0 && <TypingIndicator s={s} isGemini={hasGeminiKey} />}
      </ScrollView>

      {listening && (
        <View style={s.listeningBar}>
          <View style={s.listeningDot} accessible={false} importantForAccessibility="no" />
          <Text style={s.listeningTxt}>Listening… speak now</Text>
        </View>
      )}

      {/* Quick Prompts Carousel */}
      <View style={s.quickPromptsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickPromptsScroll}>
          {QUICK_PROMPTS.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={s.quickPromptChip}
              onPress={() => sendMessage(item.prompt)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <Text style={s.quickPromptText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Input Bar */}
      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          placeholder={listening ? 'Listening…' : hasGeminiKey ? 'Ask SaveVolt Gemini AI...' : 'Ask Energy Assistant...'}
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
            hint={listening ? 'Stops microphone' : 'Speak a question'}
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
            colors={canSend ? (hasGeminiKey ? ['#7c3aed', '#6d28d9'] : [colors.primary, colors.primaryDark]) : [colors.border, colors.border]}
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

      {/* Quick Gemini API Key Setup Modal */}
      <Modal
        visible={keyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setKeyModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={s.modalTitleWrap}>
                <Icon name="creation" size={24} color="#7c3aed" />
                <Text style={s.modalTitle}>Gemini AI Setup</Text>
              </View>
              <TouchableOpacity
                onPress={() => setKeyModalVisible(false)}
                style={s.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Icon name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={s.modalDesc}>
              Enter your Google AI Studio API key to power SaveVolt with conversational intelligence, live energy auditing, and bill optimization.
            </Text>

            <View style={s.modalInputRow}>
              <TextInput
                style={[s.input, s.modalKeyInput]}
                value={modalKey}
                onChangeText={(v) => {
                  setModalKey(v);
                  setModalFeedback(null);
                }}
                placeholder="AIzaSy..."
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!modalShowKey}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Google Gemini API Key"
              />
              <TouchableOpacity
                onPress={() => setModalShowKey((v) => !v)}
                style={s.modalEyeBtn}
                accessibilityRole="button"
                accessibilityLabel={modalShowKey ? 'Hide key' : 'Show key'}
              >
                <Icon name={modalShowKey ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {modalFeedback && (
              <View style={[s.modalFeedback, modalFeedback.success ? s.modalFeedbackOk : s.modalFeedbackErr]}>
                <Icon
                  name={modalFeedback.success ? 'check-circle' : 'alert-circle'}
                  size={16}
                  color={modalFeedback.success ? '#10b981' : '#ef4444'}
                />
                <Text style={[s.modalFeedbackTxt, modalFeedback.success ? s.modalFeedbackTxtOk : s.modalFeedbackTxtErr]}>
                  {modalFeedback.message}
                </Text>
              </View>
            )}

            <View style={s.modalButtonRow}>
              <TouchableOpacity
                style={[s.modalTestBtn, modalTesting && s.modalBtnDisabled]}
                onPress={handleTestModalKey}
                disabled={modalTesting}
              >
                <Text style={s.modalTestBtnTxt}>{modalTesting ? 'Testing...' : 'Test Key'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.modalSaveBtn} onPress={handleSaveModalKey}>
                <LinearGradient colors={['#7c3aed', '#6d28d9']} style={s.modalSaveGrad}>
                  <Text style={s.modalSaveBtnTxt}>Save & Connect</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={s.modalFooterLinks}>
              <TouchableOpacity
                onPress={() => {
                  setKeyModalVisible(false);
                  navigation.navigate('Settings');
                }}
                style={s.modalLink}
              >
                <Icon name="cog-outline" size={14} color="#7c3aed" />
                <Text style={s.modalLinkText}>Open Full Settings</Text>
              </TouchableOpacity>

              <Text style={s.modalKeyHint}>Free keys at aistudio.google.com</Text>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const createStyles = (c: ThemeColors, isDark: boolean) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: Spacing.page,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerLabel: { ...Typography.overline, color: c.primary },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconBtn: {
    padding: 6,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  headerTitle: { ...Typography.displaySmall, color: c.textOnDark, marginBottom: 8 },

  aiStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    marginTop: 4,
  },
  aiStatusBannerActive: {
    backgroundColor: 'rgba(124, 58, 237, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.4)',
  },
  aiStatusBannerInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  aiStatusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  aiStatusDotActive: { backgroundColor: '#10b981' },
  aiStatusDotInactive: { backgroundColor: '#f59e0b' },
  aiStatusBannerText: { flex: 1, fontSize: 12, fontWeight: '700' },
  aiStatusBannerTextActive: { color: '#ffffff' },
  aiStatusBannerTextInactive: { color: 'rgba(255, 255, 255, 0.9)' },

  msgList: { flex: 1 },
  msgContent: { padding: Spacing.page, paddingBottom: 16 },
  msgWrapper: { marginBottom: 12 },
  bubble: { maxWidth: '85%', padding: 14, borderRadius: Radius.lg },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: isDark ? c.primaryLight : c.dark,
    borderBottomRightRadius: 4,
  },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: c.card,
    ...Shadows.sm,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: c.border,
  },
  systemBubble: {
    backgroundColor: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(241, 245, 249, 0.9)',
    borderColor: 'rgba(148, 163, 184, 0.3)',
  },
  sourceBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  geminiBadge: {
    backgroundColor: 'rgba(124, 58, 237, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(124, 58, 237, 0.25)',
  },
  localBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  sysBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.25)',
  },
  sourceBadgeText: { fontSize: 10, fontWeight: '800' },
  geminiBadgeText: { color: '#7c3aed' },
  localBadgeText: { color: '#059669' },
  sysBadgeText: { color: '#2563eb' },
  speakerBtn: { padding: 4 },

  bubbleTxt: { ...Typography.bodyMedium, lineHeight: 22 },
  userTxt: { color: isDark ? c.text : c.textOnDark },
  botTxt: { color: c.text },
  systemTxt: { color: c.textSecondary, fontStyle: 'italic' },

  typingBubble: { paddingVertical: 12, paddingHorizontal: 16 },
  typingLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  typingStatusText: { fontSize: 12, color: c.textSecondary, fontWeight: '600' },
  dotsContainer: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#059669' },
  geminiDot: { backgroundColor: '#7c3aed' },

  sugWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginLeft: 4 },
  sugChip: {
    minHeight: 34,
    justifyContent: 'center',
    backgroundColor: c.primarySoft,
    borderWidth: 1,
    borderColor: c.primaryLight,
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sugTxt: { ...Typography.labelSmall, color: c.text },

  quickPromptsContainer: {
    borderTopWidth: 1,
    borderTopColor: c.divider,
    backgroundColor: c.background,
    paddingVertical: 6,
  },
  quickPromptsScroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  quickPromptChip: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9',
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: c.border,
  },
  quickPromptText: {
    fontSize: 12,
    fontWeight: '600',
    color: c.text,
  },

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
  sendTxt: { fontSize: 20, color: '#ffffff', fontWeight: '800' },
  sendTxtDisabled: { color: c.textMuted },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: c.card,
    borderRadius: Radius.card,
    padding: 20,
    ...Shadows.md,
    borderWidth: 1,
    borderColor: c.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    ...Typography.h2,
    color: c.text,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalDesc: {
    ...Typography.bodySmall,
    color: c.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.inputBg,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: c.border,
    paddingRight: 6,
    marginBottom: 10,
  },
  modalKeyInput: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingVertical: 12,
  },
  modalEyeBtn: {
    padding: 8,
  },
  modalFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: Radius.sm,
    marginBottom: 12,
  },
  modalFeedbackOk: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  modalFeedbackErr: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  modalFeedbackTxt: {
    fontSize: 12,
    flex: 1,
  },
  modalFeedbackTxtOk: { color: '#059669' },
  modalFeedbackTxtErr: { color: '#dc2626' },

  modalButtonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    marginBottom: 14,
  },
  modalTestBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: c.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.inputBg,
  },
  modalBtnDisabled: { opacity: 0.5 },
  modalTestBtnTxt: {
    ...Typography.label,
    color: c.text,
  },
  modalSaveBtn: {
    flex: 2,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  modalSaveGrad: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveBtnTxt: {
    ...Typography.label,
    color: '#ffffff',
    fontWeight: '700',
  },
  modalFooterLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: c.divider,
    paddingTop: 12,
  },
  modalLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7c3aed',
  },
  modalKeyHint: {
    fontSize: 11,
    color: c.textMuted,
  },
});

export default ChatScreen;

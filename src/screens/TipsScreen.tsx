import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { SkeletonCard } from '../components/Skeleton';
import WeatherWidget from '../components/WeatherWidget';
import { EnergyTip } from '../types';
import { formatEnergy } from '../utils/energy';
import { speakEnergyTip, stopSpeaking } from '../utils/voice';
import { Typography, Spacing, Radius, Shadows } from '../theme';

type Priority = EnergyTip['priority'];

const PRIORITY_GROUPS: { priority: Priority; title: string }[] = [
  { priority: 'high', title: 'High Priority' },
  { priority: 'medium', title: 'Medium Priority' },
  { priority: 'low', title: 'Low Priority' },
];

const describeTip = (tip: EnergyTip, priorityTitle: string) =>
  [
    tip.title,
    priorityTitle,
    tip.isPersonalized ? 'Personalized for you' : null,
    tip.description,
    `Category: ${tip.category}`,
    `Saves up to ${formatEnergy(tip.potentialSavings)} per month`,
  ]
    .filter(Boolean)
    .join('. ');

const TipsScreen = ({ navigation }: any) => {
  const { tips, weatherData, isWeatherLoading, refreshWeatherData, settings } = useEnergy(
    'tips',
    'weatherData',
    'isWeatherLoading',
    'refreshWeatherData',
    'settings',
  );
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const groups = useMemo(
    () =>
      PRIORITY_GROUPS.map((group) => ({
        ...group,
        items: tips.filter((tip) => tip.priority === group.priority),
      })).filter((group) => group.items.length > 0),
    [tips],
  );
  const totalSavings = useMemo(() => tips.reduce((sum, tip) => sum + tip.potentialSavings, 0), [tips]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshWeatherData();
    } catch (error) {
      // Keep showing the last reading; the store already logs fetch failures
      console.warn('Weather refresh failed:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshWeatherData]);

  const handleSpeak = async (tip: EnergyTip) => {
    if (!settings.voiceEnabled) { Alert.alert('Voice Disabled', 'Enable voice in Settings'); return; }
    if (speakingId === tip.id) { await stopSpeaking(); setSpeakingId(null); }
    else { setSpeakingId(tip.id); await speakEnergyTip(tip.title, tip.description, tip.potentialSavings); setSpeakingId(null); }
  };

  const dotStyles = { high: s.dotHigh, medium: s.dotMedium, low: s.dotLow };

  return (
    <ScrollView
      style={s.screen}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.card}
        />
      }
    >
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>ENERGY TIPS</Text>
        <Text style={s.headerTitle} accessibilityRole="header">Smart Savings</Text>
      </LinearGradient>

      <View style={s.body}>
        {/* Weather — pull down to refresh; the widget reads as one summary for screen readers */}
        {weatherData ? (
          <View style={s.weather}>
            <WeatherWidget weather={weatherData} />
          </View>
        ) : isWeatherLoading ? (
          <SkeletonCard lines={2} label="Loading weather" style={s.weather} />
        ) : null}

        {tips.length > 0 ? (
          <>
            {/* Summary */}
            <View
              style={s.summaryCard}
              accessible
              accessibilityLabel={`${tips.length} ${tips.length === 1 ? 'tip' : 'tips'} available. Save up to ${formatEnergy(totalSavings)} per month`}
            >
              <Text style={s.summaryVal}>{tips.length}</Text>
              <Text style={s.summaryLbl}>tips available</Text>
              <Text style={s.summaryPot}>Save up to {formatEnergy(totalSavings)}/mo</Text>
            </View>

            {/* Tips */}
            {groups.map(({ priority, title, items }) => (
              <View key={priority} style={s.section}>
                <View
                  style={s.secHeader}
                  accessible
                  accessibilityRole="header"
                  accessibilityLabel={`${title}, ${items.length} ${items.length === 1 ? 'tip' : 'tips'}`}
                >
                  <View style={[s.priorityDot, dotStyles[priority]]} />
                  <Text style={s.secTitle}>{title}</Text>
                  <View style={s.countBadge}>
                    <Text style={s.countTxt}>{items.length}</Text>
                  </View>
                </View>
                {items.map((tip) => {
                  const isSpeaking = speakingId === tip.id;
                  return (
                    <View key={tip.id} style={s.tipCard}>
                      <View style={s.tipTop}>
                        {/* The title carries the whole card's text so the card reads as one item plus its button */}
                        <Text style={s.tipTitle} accessibilityLabel={describeTip(tip, title)}>{tip.title}</Text>
                        <View style={s.tipActions}>
                          {tip.isPersonalized && (
                            <View style={s.forYou} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                              <Text style={s.forYouTxt}>For You</Text>
                            </View>
                          )}
                          <AccessibleTouchable
                            label={isSpeaking ? `Stop reading ${tip.title}` : `Read ${tip.title} aloud`}
                            hint={settings.voiceEnabled ? undefined : 'Voice is turned off. Enable it in Settings.'}
                            onPress={() => handleSpeak(tip)}
                            style={s.voiceBtn}
                          >
                            <Text style={s.voiceIcon}>{isSpeaking ? '🔊' : '🔈'}</Text>
                          </AccessibleTouchable>
                        </View>
                      </View>
                      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                        <Text style={s.tipDesc}>{tip.description}</Text>
                        <View style={s.tipFooter}>
                          <View style={s.catTag}><Text style={s.catTxt}>{tip.category}</Text></View>
                          <Text style={s.saveTxt}>Save {formatEnergy(tip.potentialSavings)}/mo</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </>
        ) : (
          <EmptyState
            variant="inline"
            icon="💡"
            title="No tips yet"
            body="Add the appliances you use and SaveVolt will suggest personalized ways to save, ranked by impact."
            primaryAction={{
              label: 'Add an appliance',
              hint: 'Opens the add appliance form',
              onPress: () => navigation.navigate('Track', { screen: 'AddAppliance', initial: false }),
            }}
          />
        )}
      </View>
    </ScrollView>
  );
};

const createStyles = (c: ThemeColors) => {
  // Neon green is too light for text on light surfaces; the deeper shade keeps the accent readable
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    header: { paddingTop: 54, paddingBottom: 28, paddingHorizontal: Spacing.page, alignItems: 'center' },
    headerLabel: { ...Typography.overline, color: c.primary, marginBottom: 4 },
    headerTitle: { ...Typography.displaySmall, color: c.textOnDark },
    body: { padding: Spacing.page },
    weather: { marginBottom: 14 },
    summaryCard: { backgroundColor: c.card, borderRadius: Radius.card, padding: 20, alignItems: 'center', ...Shadows.md, marginBottom: 20 },
    summaryVal: { ...Typography.displayMedium, color: c.primaryText },
    summaryLbl: { ...Typography.label, color: c.textSecondary, marginTop: 2 },
    summaryPot: { ...Typography.bodySmall, color: c.textMuted, marginTop: 8 },
    section: { marginBottom: 10 },
    secHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    priorityDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
    dotHigh: { backgroundColor: c.danger },
    dotMedium: { backgroundColor: c.warning },
    dotLow: { backgroundColor: c.success },
    secTitle: { ...Typography.h3, color: c.text, flex: 1 },
    countBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.background, justifyContent: 'center', alignItems: 'center' },
    countTxt: { ...Typography.labelSmall, color: c.textSecondary },
    tipCard: { backgroundColor: c.card, borderRadius: Radius.card, padding: 16, marginBottom: 10, ...Shadows.sm },
    tipTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    tipTitle: { ...Typography.h3, color: c.text, flex: 1, marginRight: 8 },
    tipActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    forYou: { backgroundColor: c.warningSoft, borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
    forYouTxt: { ...Typography.labelSmall, color: c.text },
    // 44pt target; the negative margins keep the row as compact as the old 26pt button
    voiceBtn: { alignItems: 'center', marginVertical: -11, marginRight: -8 },
    voiceIcon: { fontSize: 18 },
    tipDesc: { ...Typography.bodyMedium, color: c.textSecondary, lineHeight: 20, marginBottom: 10 },
    tipFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    catTag: { backgroundColor: c.background, borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 4 },
    catTxt: { ...Typography.labelSmall, color: c.textSecondary },
    saveTxt: { ...Typography.labelSmall, color: c.primaryText },
  });
};

export default TipsScreen;

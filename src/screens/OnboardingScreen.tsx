import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useEnergy } from '../context/EnergyContext';
import { Radius, Spacing, Typography, themed } from '../theme';
import { ApplianceCategory } from '../types';

const { width: W, height: H } = Dimensions.get('window');

// Onboarding is intentionally always dark in both themes
const palette = themed(true);
const BACKDROP = '#0B1120';
const SURFACE = '#131D31';
const BORDER = 'rgba(255,255,255,0.12)';

interface SlideData {
  key: string;
  emoji: string;
  title: string;
  subtitle: string;
  gradient: [string, string, string];
}

const SLIDES: SlideData[] = [
  {
    key: '1',
    emoji: '⚡',
    title: 'Welcome to\nSaveVolt',
    subtitle: 'Track, analyze, and dramatically\nreduce your household energy use.',
    gradient: [BACKDROP, '#162032', '#1A2E40'],
  },
  {
    key: '2',
    emoji: '📊',
    title: 'Instant Energy\nAudit',
    subtitle: 'Add your appliances and get\na real-time consumption breakdown.',
    gradient: [BACKDROP, '#0D2244', '#133366'],
  },
  {
    key: '3',
    emoji: '🤖',
    title: 'AI-Powered\nInsights',
    subtitle: 'Receive predictive tips based on\nweather, usage, and your profile.',
    gradient: [BACKDROP, '#1A1040', '#2A1660'],
  },
  {
    key: '4',
    emoji: '🌍',
    title: 'Make an\nImpact',
    subtitle: 'See your CO₂ savings in trees,\nset goals, and join challenges.',
    gradient: [BACKDROP, '#082820', '#0A3A28'],
  },
];

const LAST_INDEX = SLIDES.length - 1;

interface PresetAppliance {
  id: string;
  name: string;
  powerRating: number;
  hoursPerDay: number;
  category: ApplianceCategory;
  emoji: string;
  defaultSelected: boolean;
}

const PRESET_APPLIANCES: PresetAppliance[] = [
  { id: 'ac', name: 'Air Conditioner', powerRating: 1500, hoursPerDay: 6, category: ApplianceCategory.COOLING, emoji: '❄️', defaultSelected: true },
  { id: 'fridge', name: 'Refrigerator', powerRating: 180, hoursPerDay: 24, category: ApplianceCategory.KITCHEN, emoji: '🧊', defaultSelected: true },
  { id: 'washer', name: 'Washing Machine', powerRating: 500, hoursPerDay: 1, category: ApplianceCategory.LAUNDRY, emoji: '🧺', defaultSelected: true },
  { id: 'tv', name: 'Smart TV & Media', powerRating: 120, hoursPerDay: 4, category: ApplianceCategory.ENTERTAINMENT, emoji: '📺', defaultSelected: true },
  { id: 'lighting', name: 'LED Lighting', powerRating: 60, hoursPerDay: 6, category: ApplianceCategory.LIGHTING, emoji: '💡', defaultSelected: true },
  { id: 'heater', name: 'Water Heater / Geyser', powerRating: 2000, hoursPerDay: 1.5, category: ApplianceCategory.HEATING, emoji: '♨️', defaultSelected: false },
  { id: 'workstation', name: 'Computer / Laptop', powerRating: 200, hoursPerDay: 8, category: ApplianceCategory.OFFICE, emoji: '💻', defaultSelected: false },
  { id: 'microwave', name: 'Microwave Oven', powerRating: 1200, hoursPerDay: 0.5, category: ApplianceCategory.KITCHEN, emoji: '🍳', defaultSelected: false },
  { id: 'ev', name: 'EV Charger', powerRating: 7200, hoursPerDay: 3, category: ApplianceCategory.OTHER, emoji: '🚗', defaultSelected: false },
];

const CURRENCIES = ['$', '€', '£', '₹', 'A$', 'C$'];
const RATE_PRESETS = [0.12, 0.15, 0.20, 0.28, 0.35];

interface OnboardingScreenProps {
  onComplete: () => void;
}

const oneLine = (text: string) => text.replace(/\n/g, ' ');

const getItemLayout = (_: ArrayLike<SlideData> | null | undefined, index: number) => ({
  length: W,
  offset: W * index,
  index,
});

const OnboardingScreen = ({ onComplete }: OnboardingScreenProps) => {
  const { updateSettings, addAppliance, loadDemoData, awardPoints, settings } = useEnergy(
    'updateSettings',
    'addAppliance',
    'loadDemoData',
    'awardPoints',
    'settings',
  );

  const flatListRef = useRef<FlatList<SlideData>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);

  // Flow mode: 'slides' or 'wizard'
  const [mode, setMode] = useState<'slides' | 'wizard'>('slides');
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);

  // Wizard state
  const [homeName, setHomeName] = useState('My Home');
  const [currency, setCurrency] = useState(settings?.currency || '$');
  const [rate, setRate] = useState(settings?.electricityRate ? String(settings.electricityRate) : '0.15');
  const [homeType, setHomeType] = useState<'Apartment' | 'House' | 'Studio'>('Apartment');
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    PRESET_APPLIANCES.forEach((p) => {
      init[p.id] = p.defaultSelected;
    });
    return init;
  });
  const [submitting, setSubmitting] = useState(false);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / W);
    setActiveIndex(Math.min(Math.max(index, 0), LAST_INDEX));
  };

  const isLast = activeIndex === LAST_INDEX;

  const handleNextSlide = () => {
    if (isLast) {
      setMode('wizard');
    } else {
      const next = activeIndex + 1;
      setActiveIndex(next);
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
    }
  };

  const toggleAppliance = (id: string) => {
    setSelectedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Live calculations for wizard
  const selectedAppliances = useMemo(
    () => PRESET_APPLIANCES.filter((p) => selectedIds[p.id]),
    [selectedIds],
  );

  const dailyEstimatedKwh = useMemo(() => {
    return selectedAppliances.reduce(
      (sum, a) => sum + (a.powerRating * a.hoursPerDay) / 1000,
      0,
    );
  }, [selectedAppliances]);

  const numRate = parseFloat(rate) || 0.15;
  const estimatedDailyCost = dailyEstimatedKwh * numRate;
  const estimatedMonthlyKwh = dailyEstimatedKwh * 30;
  const estimatedMonthlyCost = estimatedDailyCost * 30;

  const handleFinishWizard = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (updateSettings) {
        await updateSettings({
          currency,
          electricityRate: numRate,
        });
      }

      if (addAppliance) {
        for (const app of selectedAppliances) {
          await addAppliance({
            name: app.name,
            powerRating: app.powerRating,
            hoursPerDay: app.hoursPerDay,
            quantity: 1,
            category: app.category,
            isActive: true,
          });
        }
      }

      if (awardPoints) {
        await awardPoints('first-step', 50, 'Completed SaveVolt setup');
      }

      onComplete();
    } catch (err) {
      console.warn('Error saving setup:', err);
      onComplete();
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadDemo = async () => {
    try {
      if (loadDemoData) {
        await loadDemoData();
      }
      onComplete();
    } catch {
      onComplete();
    }
  };

  // ── Render Interactive Wizard Mode ──
  if (mode === 'wizard') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={BACKDROP} />
        <LinearGradient colors={[BACKDROP, '#121A2C', '#17243C']} style={styles.wizardHeader}>
          <View style={styles.wizardTopRow}>
            <TouchableOpacity
              onPress={() => (wizardStep === 1 ? setMode('slides') : setWizardStep((s) => (s - 1) as any))}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Text style={styles.backButtonText}>←</Text>
            </TouchableOpacity>
            <Text style={styles.wizardStepIndicator}>Step {wizardStep} of 3</Text>
            <TouchableOpacity
              onPress={onComplete}
              style={styles.skipButton}
              accessibilityRole="button"
              accessibilityLabel="Skip setup"
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.wizardTitle} accessibilityRole="header">
            {wizardStep === 1 && 'Set Up Your Home'}
            {wizardStep === 2 && 'Select Your Devices'}
            {wizardStep === 3 && 'Ready to Save'}
          </Text>
          <Text style={styles.wizardSubtitle}>
            {wizardStep === 1 && 'Configure your currency and local electricity tariff.'}
            {wizardStep === 2 && 'Choose the common appliances running in your household.'}
            {wizardStep === 3 && 'Here is your projected baseline. You can adjust anytime.'}
          </Text>
        </LinearGradient>

        <ScrollView contentContainerStyle={styles.wizardContent} showsVerticalScrollIndicator={false}>
          {/* STEP 1: Home & Tariff */}
          {wizardStep === 1 && (
            <View style={styles.stepContainer}>
              <View style={styles.inputCard}>
                <Text style={styles.fieldLabel}>Home Name</Text>
                <TextInput
                  value={homeName}
                  onChangeText={setHomeName}
                  style={styles.textInput}
                  placeholder="e.g. My Apartment"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  accessibilityLabel="Home Name"
                />

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Home Type</Text>
                <View style={styles.pillsRow}>
                  {(['Apartment', 'House', 'Studio'] as const).map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setHomeType(t)}
                      style={[styles.typePill, homeType === t && styles.typePillActive]}
                      accessibilityRole="button"
                      accessibilityLabel={t}
                    >
                      <Text style={[styles.typePillText, homeType === t && styles.typePillTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Currency</Text>
                <View style={styles.pillsRow}>
                  {CURRENCIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setCurrency(c)}
                      style={[styles.currencyPill, currency === c && styles.currencyPillActive]}
                      accessibilityRole="button"
                      accessibilityLabel={`Currency ${c}`}
                    >
                      <Text style={[styles.currencyPillText, currency === c && styles.currencyPillTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Electricity Tariff ({currency}/kWh)</Text>
                <View style={styles.pillsRow}>
                  {RATE_PRESETS.map((p) => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setRate(String(p))}
                      style={[styles.ratePill, Number(rate) === p && styles.ratePillActive]}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate ${p}`}
                    >
                      <Text style={[styles.ratePillText, Number(rate) === p && styles.ratePillTextActive]}>
                        {currency}{p}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  value={rate}
                  onChangeText={setRate}
                  keyboardType="numeric"
                  style={[styles.textInput, { marginTop: 10 }]}
                  placeholder="Custom rate, e.g. 0.18"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  accessibilityLabel="Custom tariff rate"
                />
              </View>

              <TouchableOpacity
                onPress={() => setWizardStep(2)}
                style={styles.nextButton}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Next step"
              >
                <LinearGradient colors={[palette.primary, palette.primaryDark]} style={styles.buttonGradient}>
                  <Text style={styles.buttonGradientText}>Choose Appliances →</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 2: Appliances Grid */}
          {wizardStep === 2 && (
            <View style={styles.stepContainer}>
              <View style={styles.summaryBar}>
                <Text style={styles.summaryBarText}>
                  Selected: <Text style={styles.summaryBarHighlight}>{selectedAppliances.length} devices</Text> · ~
                  <Text style={styles.summaryBarHighlight}>{dailyEstimatedKwh.toFixed(1)} kWh/day</Text> ({currency}
                  {estimatedDailyCost.toFixed(2)}/day)
                </Text>
              </View>

              <View style={styles.appliancesGrid}>
                {PRESET_APPLIANCES.map((item) => {
                  const isSelected = !!selectedIds[item.id];
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => toggleAppliance(item.id)}
                      activeOpacity={0.8}
                      style={[styles.applianceCard, isSelected && styles.applianceCardActive]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={`${item.name}, ${item.powerRating} watts, ${item.hoursPerDay} hours per day`}
                    >
                      <View style={styles.applianceTop}>
                        <Text style={styles.applianceEmoji}>{item.emoji}</Text>
                        <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                          {isSelected && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                      </View>
                      <Text style={styles.applianceName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.applianceDetails}>
                        {item.powerRating}W · {item.hoursPerDay}h/day
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                onPress={() => setWizardStep(3)}
                style={styles.nextButton}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Review baseline"
              >
                <LinearGradient colors={[palette.primary, palette.primaryDark]} style={styles.buttonGradient}>
                  <Text style={styles.buttonGradientText}>Review Baseline →</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {/* STEP 3: Review & Launch */}
          {wizardStep === 3 && (
            <View style={styles.stepContainer}>
              <View style={styles.baselineCard}>
                <Text style={styles.baselineEyebrow}>ESTIMATED HOUSEHOLD BASELINE</Text>
                <Text style={styles.baselineMainKwh}>{estimatedMonthlyKwh.toFixed(1)} kWh</Text>
                <Text style={styles.baselineCost}>
                  {currency}{estimatedMonthlyCost.toFixed(2)} estimated per month
                </Text>

                <View style={styles.baselineMetricsRow}>
                  <View style={styles.baselineMetric}>
                    <Text style={styles.baselineMetricVal}>{selectedAppliances.length}</Text>
                    <Text style={styles.baselineMetricLbl}>Devices</Text>
                  </View>
                  <View style={styles.baselineDivider} />
                  <View style={styles.baselineMetric}>
                    <Text style={styles.baselineMetricVal}>{dailyEstimatedKwh.toFixed(1)}</Text>
                    <Text style={styles.baselineMetricLbl}>kWh / day</Text>
                  </View>
                  <View style={styles.baselineDivider} />
                  <View style={styles.baselineMetric}>
                    <Text style={styles.baselineMetricVal}>+50</Text>
                    <Text style={styles.baselineMetricLbl}>Start Pts</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleFinishWizard}
                style={styles.launchButton}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Launch SaveVolt"
              >
                <LinearGradient colors={[palette.primary, palette.primaryDark]} style={styles.buttonGradient}>
                  <Text style={styles.buttonGradientText}>
                    {submitting ? 'Setting up...' : '⚡ Launch SaveVolt'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleLoadDemo}
                style={styles.demoButton}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Load full demo data instead"
              >
                <Text style={styles.demoButtonText}>Or load full sample demo home</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Render Presentation Slides Mode ──
  const Slide = ({ item }: { item: SlideData }) => (
    <LinearGradient
      colors={item.gradient}
      style={styles.slide}
      accessible
      accessibilityLabel={`${oneLine(item.title)}. ${oneLine(item.subtitle)}`}
    >
      <View style={styles.emojiGlow}>
        <Text style={styles.emoji}>{item.emoji}</Text>
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.subtitle}>{item.subtitle}</Text>
    </LinearGradient>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={BACKDROP} />
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={({ item }) => <Slide item={item} />}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        keyExtractor={(item) => item.key}
        getItemLayout={getItemLayout}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />

      {/* Bottom controls */}
      <View style={styles.footer}>
        {/* Dots */}
        <View
          style={styles.dots}
          accessible
          accessibilityLabel={`Step ${activeIndex + 1} of ${SLIDES.length}`}
        >
          {SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * W, i * W, (i + 1) * W];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[
                  styles.dot,
                  { width: dotWidth, opacity: dotOpacity },
                ]}
              />
            );
          })}
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => setMode('wizard')}
            activeOpacity={0.7}
            style={styles.wizardLauncherBtn}
            accessibilityRole="button"
            accessibilityLabel="Interactive Setup"
            accessibilityHint="Opens the guided setup wizard"
          >
            <Text style={styles.wizardLauncherText}>Quick Setup</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleNextSlide}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Get Started' : 'Next'}
            accessibilityHint={isLast ? 'Finishes the introduction and opens SaveVolt' : 'Shows the next introduction screen'}
          >
            <LinearGradient
              colors={[palette.primary, palette.primaryDark]}
              style={styles.nextBtn}
            >
              <Text style={styles.nextText}>
                {isLast ? 'Get Started' : 'Next'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BACKDROP },
  slide: {
    width: W,
    height: H,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emojiGlow: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,230,118,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  emoji: { fontSize: 64 },
  title: {
    ...Typography.displayMedium,
    color: palette.textOnDark,
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    ...Typography.bodyLarge,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 50,
    paddingHorizontal: Spacing.page,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  dot: {
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.primary,
    marginHorizontal: 4,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wizardLauncherBtn: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  wizardLauncherText: {
    ...Typography.label,
    color: palette.textOnDark,
  },
  nextBtn: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: Radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  nextText: {
    ...Typography.h3,
    color: palette.onPrimary,
  },

  /* Wizard Styles */
  wizardHeader: {
    paddingTop: 54,
    paddingBottom: 22,
    paddingHorizontal: Spacing.page,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  wizardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: palette.textOnDark,
  },
  wizardStepIndicator: {
    ...Typography.overline,
    color: palette.primary,
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipText: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.5)',
  },
  wizardTitle: {
    ...Typography.h1,
    color: palette.textOnDark,
    marginBottom: 6,
  },
  wizardSubtitle: {
    ...Typography.bodyMedium,
    color: palette.textOnDarkSub,
    lineHeight: 20,
  },
  wizardContent: {
    padding: Spacing.page,
    paddingBottom: 40,
  },
  stepContainer: {
    gap: 16,
  },
  inputCard: {
    backgroundColor: SURFACE,
    borderRadius: Radius.card,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
  },
  fieldLabel: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: Radius.md,
    color: palette.textOnDark,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  typePillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  typePillText: {
    ...Typography.bodySmall,
    color: palette.textOnDarkSub,
  },
  typePillTextActive: {
    color: palette.onPrimary,
    fontWeight: '700',
  },
  currencyPill: {
    minWidth: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
  },
  currencyPillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  currencyPillText: {
    ...Typography.label,
    color: palette.textOnDark,
  },
  currencyPillTextActive: {
    color: palette.onPrimary,
    fontWeight: '700',
  },
  ratePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  ratePillActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  ratePillText: {
    ...Typography.bodySmall,
    color: palette.textOnDarkSub,
  },
  ratePillTextActive: {
    color: palette.onPrimary,
    fontWeight: '700',
  },
  nextButton: {
    marginTop: 8,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGradientText: {
    ...Typography.h3,
    color: palette.onPrimary,
  },

  /* Appliances Step */
  summaryBar: {
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.25)',
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  summaryBarText: {
    ...Typography.bodyMedium,
    color: palette.textOnDarkSub,
  },
  summaryBarHighlight: {
    color: palette.primary,
    fontWeight: '700',
  },
  appliancesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  applianceCard: {
    width: '48%',
    backgroundColor: SURFACE,
    borderRadius: Radius.card,
    padding: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  applianceCardActive: {
    borderColor: palette.primary,
    backgroundColor: '#16283C',
  },
  applianceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  applianceEmoji: {
    fontSize: 26,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  checkmark: {
    color: palette.onPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  applianceName: {
    ...Typography.label,
    color: palette.textOnDark,
    marginBottom: 2,
  },
  applianceDetails: {
    ...Typography.labelSmall,
    color: 'rgba(255,255,255,0.45)',
  },

  /* Baseline Review Step */
  baselineCard: {
    backgroundColor: SURFACE,
    borderRadius: Radius.card,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  baselineEyebrow: {
    ...Typography.overline,
    color: palette.primary,
    marginBottom: 10,
  },
  baselineMainKwh: {
    ...Typography.displayMedium,
    color: palette.textOnDark,
    marginBottom: 4,
  },
  baselineCost: {
    ...Typography.bodyMedium,
    color: palette.textOnDarkSub,
    marginBottom: 20,
  },
  baselineMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
  },
  baselineMetric: {
    flex: 1,
    alignItems: 'center',
  },
  baselineMetricVal: {
    ...Typography.statSmall,
    color: palette.primary,
  },
  baselineMetricLbl: {
    ...Typography.labelSmall,
    color: palette.textOnDarkSub,
    marginTop: 2,
  },
  baselineDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  launchButton: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    marginTop: 8,
  },
  demoButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  demoButtonText: {
    ...Typography.bodySmall,
    color: 'rgba(255,255,255,0.5)',
  },
});

export default OnboardingScreen;

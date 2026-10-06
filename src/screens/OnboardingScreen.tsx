import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Radius, Spacing, Typography, themed } from '../theme';

const { width: W, height: H } = Dimensions.get('window');

// Onboarding is intentionally always dark, whatever the app theme
const palette = themed(true);
const BACKDROP = '#0B1120';

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

const oneLine = (text: string) => text.replace(/\n/g, ' ');

// Every slide is exactly one screen wide, so scrollToIndex never has to measure
const getItemLayout = (_: ArrayLike<SlideData> | null | undefined, index: number) => ({
  length: W,
  offset: W * index,
  index,
});

interface OnboardingScreenProps {
  onComplete: () => void;
}

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

const OnboardingScreen = ({ onComplete }: OnboardingScreenProps) => {
  const flatListRef = useRef<FlatList<SlideData>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [activeIndex, setActiveIndex] = useState(0);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  // Viewability callbacks can be skipped on fast swipes; the settled offset is authoritative
  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / W);
    setActiveIndex(Math.min(Math.max(index, 0), LAST_INDEX));
  };

  const isLast = activeIndex === LAST_INDEX;

  const handleNext = () => {
    if (isLast) {
      onComplete();
    } else {
      const next = activeIndex + 1;
      setActiveIndex(next);
      flatListRef.current?.scrollToIndex({ index: next, animated: true });
    }
  };

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
        {/* Dots: announced once as the current step */}
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
          {!isLast && (
            <TouchableOpacity
              onPress={onComplete}
              activeOpacity={0.7}
              style={styles.skipButton}
              accessibilityRole="button"
              accessibilityLabel="Skip"
              accessibilityHint="Skips the introduction and opens SaveVolt"
            >
              <Text style={styles.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleNext}
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
  skipButton: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipText: {
    ...Typography.label,
    color: 'rgba(255,255,255,0.5)',
    paddingVertical: 12,
    paddingHorizontal: 8,
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
});

export default OnboardingScreen;

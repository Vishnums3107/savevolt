import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { WeatherData } from '../types';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import { Radius, Spacing, Typography, Shadows } from '../theme';
import AccessibleTouchable from './AccessibleTouchable';

const CONDITION_ICONS: Record<string, string> = {
  Clear: '☀️',
  'Partly Cloudy': '⛅',
  Cloudy: '☁️',
  Foggy: '🌫️',
  Drizzle: '🌦️',
  Rain: '🌧️',
  Snow: '❄️',
  Thunderstorm: '⛈️',
  Unknown: '🌤️',
};

// Bright seasonal accents; the card is dark in both themes, so they keep their contrast
const SEASON_COLORS: Record<string, [string, string]> = {
  spring: ['#A8E063', '#56AB2F'],
  summer: ['#FF8008', '#FFC837'],
  fall: ['#F7971E', '#FFD200'],
  winter: ['#4FACFE', '#00F2FE'],
};

const getWeatherTip = (temperature: number, humidity: number) => {
  if (temperature > 30) return 'Hot today — pre-cool during off-peak hours to save on AC costs.';
  if (temperature < 15) return 'Cold weather — layer up and use localized heating instead of whole-house systems.';
  if (humidity > 70) return 'High humidity — use dehumidifier mode instead of full AC cooling.';
  return 'Mild weather — consider using natural ventilation instead of AC.';
};

interface WeatherWidgetProps {
  weather: WeatherData;
  onPress?: () => void;
}

const WeatherWidget = ({ weather, onPress }: WeatherWidgetProps) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const icon = CONDITION_ICONS[weather.condition] || CONDITION_ICONS.Unknown;
  const seasonGradient = SEASON_COLORS[weather.season] || SEASON_COLORS.spring;
  const isEstimate = weather.source === 'fallback';

  const tip = useMemo(
    () => getWeatherTip(weather.temperature, weather.humidity),
    [weather.temperature, weather.humidity],
  );

  // The card is read as a single element, so everything visible is folded into one label
  const accessibilityLabel =
    `Weather in ${weather.location}: ${weather.temperature} degrees Celsius, ${weather.condition}, ` +
    `humidity ${weather.humidity} percent, ${weather.season}.` +
    `${isEstimate ? ' Estimated.' : ''} Tip: ${tip}`;

  const card = (
    <LinearGradient colors={colors.heroGradient} style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.locationRow}>
          <Text style={styles.locationIcon} accessible={false} importantForAccessibility="no">📍</Text>
          <Text style={styles.location} numberOfLines={1}>{weather.location}</Text>
          {isEstimate && (
            <View style={styles.fallbackBadge}>
              <Text style={styles.fallbackText}>EST</Text>
            </View>
          )}
        </View>
        <View style={[styles.seasonBadge, { backgroundColor: seasonGradient[0] + '30' }]}>
          <Text style={[styles.seasonText, { color: seasonGradient[0] }]}>
            {weather.season.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.mainRow}>
        <Text style={styles.icon} accessible={false} importantForAccessibility="no">{icon}</Text>
        <View style={styles.tempBlock}>
          <Text style={styles.temp}>{weather.temperature}°C</Text>
          <Text style={styles.condition}>{weather.condition}</Text>
        </View>
        <View style={styles.humidityBlock}>
          <Text style={styles.humidityIcon} accessible={false} importantForAccessibility="no">💧</Text>
          <Text style={styles.humidityValue}>{weather.humidity}%</Text>
          <Text style={styles.humidityLabel}>Humidity</Text>
        </View>
      </View>

      {/* Energy tip banner based on weather */}
      <View style={styles.tipRow}>
        <Text style={styles.tipBullet} accessible={false} importantForAccessibility="no">💡</Text>
        <Text style={styles.tipText}>{tip}</Text>
      </View>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <AccessibleTouchable
        label={accessibilityLabel}
        hint="Opens weather-based energy tips"
        activeOpacity={0.85}
        onPress={onPress}
      >
        {card}
      </AccessibleTouchable>
    );
  }

  return (
    <View accessible accessibilityRole="summary" accessibilityLabel={accessibilityLabel}>
      {card}
    </View>
  );
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
  container: {
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    ...Shadows.md,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  locationIcon: { fontSize: 14, marginRight: 4 },
  location: {
    ...Typography.label,
    color: c.textOnDarkSub,
    maxWidth: 160,
  },
  fallbackBadge: {
    backgroundColor: 'rgba(245,158,11,0.2)',
    borderRadius: Radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  fallbackText: {
    ...Typography.labelSmall,
    fontSize: 8,
    color: c.warning,
  },
  seasonBadge: {
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  seasonText: {
    ...Typography.overline,
    fontSize: 9,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  icon: { fontSize: 42, marginRight: 14 },
  tempBlock: { flex: 1 },
  temp: {
    ...Typography.displaySmall,
    color: c.textOnDark,
  },
  condition: {
    ...Typography.bodySmall,
    color: c.textOnDarkSub,
    marginTop: 2,
  },
  humidityBlock: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  humidityIcon: { fontSize: 16, marginBottom: 2 },
  humidityValue: {
    ...Typography.statSmall,
    color: c.info,
  },
  humidityLabel: {
    ...Typography.labelSmall,
    color: c.textOnDarkSub,
    marginTop: 1,
  },
  tipRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,230,118,0.08)',
    borderRadius: Radius.md,
    padding: 10,
    alignItems: 'flex-start',
  },
  tipBullet: { fontSize: 14, marginRight: 8, marginTop: 1 },
  // primaryLight is a dark tint in the dark palette, so the always-dark card uses primary
  tipText: {
    ...Typography.bodySmall,
    color: c.primary,
    flex: 1,
    lineHeight: 17,
  },
});

export default WeatherWidget;

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, Switch, Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useEnergy } from '../context/EnergyContext';
import { ThemeColors, useTheme, useThemedStyles } from '../context/ThemeContext';
import AccessibleTouchable from '../components/AccessibleTouchable';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { testGeminiConnection } from '../services/GeminiService';
import { Typography, Spacing, Radius, Shadows } from '../theme';

const TOGGLES = [
  { label: 'Dark Mode', desc: 'Switch to dark theme', hint: 'Switches the app between the light and dark theme', key: 'darkMode' as const, icon: '🌙' },
  { label: 'Notifications', desc: 'Reminders & alerts', hint: 'Turns reminder notifications and energy alerts on or off', key: 'notificationsEnabled' as const, icon: '🔔' },
  { label: 'Voice Tips', desc: 'Text-to-speech', hint: 'Reads energy tips aloud with text-to-speech', key: 'voiceEnabled' as const, icon: '🔊' },
];

// Fixed purple (dark enough for white text in both themes) so the AI action stands apart from the green save button.
const GEMINI_GRADIENT = ['#7c3aed', '#6d28d9'];
const GEMINI_BUSY_GRADIENT = ['#4a4a4a', '#3a3a3a'];

const SettingsScreen = () => {
  const { settings, updateSettings } = useEnergy('settings', 'updateSettings');
  const { colors, isDark } = useTheme();
  const s = useThemedStyles(createStyles);
  const [rate, setRate] = useState(settings.electricityRate.toString());
  const [currency, setCurrency] = useState(settings.currency);
  const [location, setLocation] = useState(settings.weatherLocation);
  const [co2Factor, setCo2Factor] = useState(settings.co2Factor.toString());
  const [geminiKey, setGeminiKey] = useState(settings.geminiApiKey ?? '');
  const [testingGemini, setTestingGemini] = useState(false);
  const keyboardAppearance = isDark ? 'dark' : 'light';

  useEffect(() => {
    setRate(settings.electricityRate.toString());
    setCurrency(settings.currency);
    setLocation(settings.weatherLocation);
    setCo2Factor(settings.co2Factor.toString());
    setGeminiKey(settings.geminiApiKey ?? '');
  }, [settings.electricityRate, settings.currency, settings.weatherLocation, settings.co2Factor, settings.geminiApiKey]);

  const handleSave = async () => {
    const parsedRate = Number.parseFloat(rate);
    const parsedCo2Factor = Number.parseFloat(co2Factor);
    if (!Number.isFinite(parsedRate) || parsedRate < 0) {
      Alert.alert('Check electricity rate', 'Enter a valid rate of zero or more per kWh.');
      return;
    }
    if (!Number.isFinite(parsedCo2Factor) || parsedCo2Factor < 0) {
      Alert.alert('Check CO2 factor', 'Enter a valid emission factor of zero or more.');
      return;
    }
    try {
      await updateSettings({
        electricityRate: parsedRate,
        currency: currency.trim() || '$',
        weatherLocation: location.trim() || 'New York',
        co2Factor: parsedCo2Factor,
        geminiApiKey: geminiKey.trim(),
      });
      Alert.alert('Saved', 'Settings updated successfully');
    } catch { Alert.alert('Error', 'Failed to save'); }
  };

  const handleTestGemini = async () => {
    const cleanedKey = geminiKey.trim();
    if (!cleanedKey) {
      Alert.alert('No API key', 'Enter a Gemini API key before testing the connection.');
      return;
    }

    setTestingGemini(true);
    try {
      const isValid = await testGeminiConnection(cleanedKey);
      Alert.alert(
        isValid ? 'Connection successful' : 'Connection failed',
        isValid
          ? 'Your Gemini API key is valid and responding.'
          : 'The key could not be validated. Please check the key and try again.',
      );
    } catch {
      Alert.alert('Connection failed', 'Unable to validate the Gemini API key right now.');
    } finally {
      setTestingGemini(false);
    }
  };

  return (
    <ScrollView style={s.screen} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>SETTINGS</Text>
        <Text style={s.headerTitle} accessibilityRole="header">Preferences</Text>
      </LinearGradient>

      <View style={s.body}>
        {/* Energy */}
        <Text style={s.secTitle} accessibilityRole="header">Energy</Text>
        <View style={s.card}>
          <Text style={s.label}>Electricity Rate (per kWh)</Text>
          <TextInput
            style={s.input}
            value={rate}
            onChangeText={setRate}
            keyboardType="decimal-pad"
            placeholder="0.12"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            accessibilityLabel="Electricity rate per kWh"
            accessibilityHint="Your local rate for cost calculations"
          />
          <Text style={s.hint}>Your local rate for cost calculations</Text>
          <View style={s.divider} />
          <Text style={s.label}>Currency Symbol</Text>
          <TextInput
            style={s.input}
            value={currency}
            onChangeText={setCurrency}
            placeholder="$"
            maxLength={3}
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            accessibilityLabel="Currency symbol"
          />
        </View>

        {/* Location */}
        <Text style={s.secTitle} accessibilityRole="header">Location</Text>
        <View style={s.card}>
          <Text style={s.label}>Weather Location</Text>
          <TextInput
            style={s.input}
            value={location}
            onChangeText={setLocation}
            placeholder="New York"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            accessibilityLabel="Weather location"
            accessibilityHint="City name for weather-based tips"
          />
          <Text style={s.hint}>City name for weather-based tips</Text>
        </View>

        {/* Toggles */}
        <Text style={s.secTitle} accessibilityRole="header">Preferences</Text>
        <View style={s.card}>
          {TOGGLES.map((t, i) => (
            <View key={t.key}>
              {i > 0 && <View style={s.divider} />}
              <View style={s.switchRow}>
                <Text style={s.switchIcon} accessible={false} importantForAccessibility="no">{t.icon}</Text>
                <View style={s.switchCopy}>
                  <Text style={s.switchLabel}>{t.label}</Text>
                  <Text style={s.switchDesc}>{t.desc}</Text>
                </View>
                <Switch
                  value={settings[t.key]}
                  onValueChange={(v) => updateSettings({ [t.key]: v })}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={settings[t.key] ? colors.primary : colors.switchThumbOff}
                  accessibilityLabel={t.label}
                  accessibilityHint={t.hint}
                />
              </View>
            </View>
          ))}
        </View>

        {/* AI */}
        <Text style={s.secTitle} accessibilityRole="header">AI Assistant</Text>
        <View style={s.card}>
          <Text style={s.label}>Gemini API Key</Text>
          <TextInput
            style={[s.input, s.keyInput]}
            value={geminiKey}
            onChangeText={setGeminiKey}
            placeholder="Enter your Gemini API key"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            keyboardAppearance={keyboardAppearance}
            accessibilityLabel="Gemini API key"
            accessibilityHint="Optional. Leave blank to keep the built-in local assistant"
          />
          <Text style={s.hint}>Leave blank to keep the built-in local assistant. Add a key to enable Gemini-powered recommendations and chat.</Text>

          <AccessibleTouchable
            label={testingGemini ? 'Validating Gemini API key' : 'Test Gemini connection'}
            hint="Verifies that your Google Gemini API key works correctly"
            style={s.testGeminiButton}
            onPress={handleTestGemini}
            disabled={testingGemini}
            accessibilityState={{ disabled: testingGemini, busy: testingGemini }}
          >
            <LinearGradient
              colors={testingGemini ? GEMINI_BUSY_GRADIENT : GEMINI_GRADIENT}
              style={s.testGeminiButtonGradient}
            >
              <Text style={s.testGeminiButtonText}>{testingGemini ? 'Testing...' : 'Test Gemini Connection'}</Text>
            </LinearGradient>
          </AccessibleTouchable>
        </View>

        {/* CO2 */}
        <Text style={s.secTitle} accessibilityRole="header">Environmental</Text>
        <View style={s.card}>
          <Text style={s.label}>CO₂ Emission Factor (kg/kWh)</Text>
          <TextInput
            style={s.input}
            value={co2Factor}
            onChangeText={setCo2Factor}
            keyboardType="decimal-pad"
            placeholder="0.92"
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={keyboardAppearance}
            accessibilityLabel="CO2 emission factor in kg per kWh"
            accessibilityHint="Used in every impact and CO2 calculation"
          />
          <Text style={s.hint}>Used in every impact and CO₂ calculation</Text>
        </View>

        {/* Save */}
        <AccessibleTouchable
          label="Save Settings"
          hint="Persists all energy rates, environmental factors, and feature preferences"
          onPress={handleSave}
        >
          <LinearGradient colors={[colors.primary, colors.primaryDark]} style={s.saveBtn}>
            <Text style={s.saveTxt}>Save Settings</Text>
          </LinearGradient>
        </AccessibleTouchable>

        {/* About */}
        <View style={[s.card, s.aboutSection]} accessible>
          <Text style={s.aboutTitle}>SaveVolt</Text>
          <Text style={s.aboutBody}>Version 1.0.0{'\n'}Track, analyze, and reduce your energy.</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  header: { paddingTop: 54, paddingBottom: 28, paddingHorizontal: Spacing.page, alignItems: 'center' },
  headerLabel: { ...Typography.overline, color: c.primary, marginBottom: 4 },
  headerTitle: { ...Typography.displaySmall, color: c.textOnDark },
  body: { padding: Spacing.page },
  secTitle: { ...Typography.label, color: c.textSecondary, marginTop: 20, marginBottom: 10, letterSpacing: 0.5 },
  card: { backgroundColor: c.card, borderRadius: Radius.card, padding: Spacing.lg, ...Shadows.sm },
  aboutSection: { alignItems: 'center', marginTop: 24, marginBottom: 40 },
  label: { ...Typography.label, color: c.textSecondary, marginBottom: 6 },
  input: { backgroundColor: c.inputBg, borderRadius: Radius.sm, padding: 14, ...Typography.bodyLarge, color: c.text, borderWidth: 1, borderColor: c.border },
  keyInput: { marginBottom: 4 },
  hint: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 4 },
  testGeminiButton: { marginTop: 14 },
  testGeminiButtonGradient: { borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center' },
  testGeminiButtonText: { ...Typography.label, color: c.textOnDark },
  divider: { height: 1, backgroundColor: c.divider, marginVertical: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  switchIcon: { fontSize: 20, marginRight: 12 },
  switchCopy: { flex: 1 },
  switchLabel: { ...Typography.h3, color: c.text },
  switchDesc: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 1 },
  saveBtn: { borderRadius: Radius.md, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  saveTxt: { ...Typography.h3, color: c.onPrimary },
  aboutTitle: { ...Typography.h2, color: c.text, marginBottom: 8 },
  aboutBody: { ...Typography.bodySmall, color: c.textSecondary, textAlign: 'center', lineHeight: 18 },
});

export default SettingsScreen;

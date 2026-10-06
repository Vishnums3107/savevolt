/**
 * SaveVolt — Smart Energy Management
 * Track, analyze, and reduce your energy consumption
 *
 * @format
 */

import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { EnergyProvider, useEnergy } from './src/context/EnergyContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { initializeTts } from './src/utils/voice';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { useNotificationSync } from './src/services/notifications/useNotificationSync';

function AppContent() {
  const { isLoading, hasSeenOnboarding, completeOnboarding } = useEnergy(
    'isLoading',
    'hasSeenOnboarding',
    'completeOnboarding',
  );
  const { colors } = useTheme();
  const [startupTimedOut, setStartupTimedOut] = useState(false);

  // Keeps reminders, alerts, and badge notifications in step with app data
  useNotificationSync();

  useEffect(() => {
    initializeTts();
  }, []);

  useEffect(() => {
    // SaveVolt is local-first. Never trap the user on a launch spinner if a
    // device service such as storage or networking is slow to respond.
    const timeout = setTimeout(() => setStartupTimedOut(true), 6000);
    return () => clearTimeout(timeout);
  }, []);

  if (isLoading && !startupTimedOut) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: colors.background }]}
        accessibilityLabel="Loading SaveVolt"
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!hasSeenOnboarding) {
    return <OnboardingScreen onComplete={completeOnboarding} />;
  }

  return <AppNavigator />;
}

function App() {
  return (
    <GestureHandlerRootView style={styles.appRoot}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <EnergyProvider>
            <ThemeProvider>
              <ThemedStatusBar />
              <AppContent />
            </ThemeProvider>
          </EnergyProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** Default status bar for the active theme; screens with dark hero headers override it. */
function ThemedStatusBar() {
  const { isDark, colors } = useTheme();
  return (
    <StatusBar
      barStyle={isDark ? 'light-content' : 'dark-content'}
      backgroundColor={colors.background}
    />
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;

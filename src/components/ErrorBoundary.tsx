import React, { Component, ErrorInfo, ReactNode, useMemo } from 'react';
import { StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useEnergyStore } from '../store/energyStore';
import { Radius, Spacing, ThemeColors, Typography, themed } from '../theme';
import { logError } from '../utils/errorHandler';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.xl,
      backgroundColor: c.background,
    },
    title: {
      ...Typography.h1,
      fontSize: 22,
      marginBottom: 10,
      color: c.text,
      textAlign: 'center',
    },
    message: {
      ...Typography.bodyLarge,
      textAlign: 'center',
      marginBottom: 30,
      color: c.text,
      maxWidth: 340,
    },
    button: {
      minHeight: 44,
      justifyContent: 'center',
      backgroundColor: c.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: Radius.sm,
    },
    buttonText: {
      ...Typography.h3,
      fontSize: 16,
      color: c.onPrimary,
    },
  });

/**
 * Renders outside ThemeProvider (the provider sits inside the boundary), so it reads the
 * dark-mode setting from the store directly.
 */
const ErrorFallback = ({ onReset }: { onReset: () => void }) => {
  // Optional chaining guards against a half-loaded store; this screen must never throw itself
  const isDark = useEnergyStore((s) => s.settings?.darkMode === true);
  const colors = themed(isDark);
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <Text style={styles.title} accessibilityRole="header">
        Oops, something went wrong!
      </Text>
      <Text style={styles.message}>
        SaveVolt hit an unexpected problem. Your data is stored safely on this device.
      </Text>
      <TouchableOpacity
        style={styles.button}
        onPress={onReset}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        accessibilityHint="Reloads the screen that failed"
      >
        <Text style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
};

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError(error, { componentStack: errorInfo.componentStack });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return <ErrorFallback onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

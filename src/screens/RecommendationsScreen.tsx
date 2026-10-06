import React, { memo, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { NavigationProp, ParamListBase, useNavigation } from '@react-navigation/native';
import { Typography, Spacing, Radius, Shadows } from '../theme';
import { useEnergy } from '../context/EnergyContext';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { SkeletonCard } from '../components/Skeleton';
import AIRecommendationEngine, { AIRecommendation } from '../services/AIRecommendationEngine';
import { formatEnergy, formatCost } from '../utils/energy';
import { getGeminiRecommendationSummary } from '../services/GeminiService';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High Priority' },
  { key: 'savings', label: 'Savings' },
  { key: 'behavior', label: 'Behavior' },
] as const;

type Filter = (typeof FILTERS)[number]['key'];

const getPriorityColor = (c: ThemeColors, priority: AIRecommendation['priority']) => {
  switch (priority) {
    case 'high': return c.danger;
    case 'medium': return c.warning;
    default: return c.success;
  }
};

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'savings': return '💰';
    case 'efficiency': return '⚡';
    case 'behavior': return '🧠';
    case 'upgrade': return '🔧';
    case 'schedule': return '🕐';
    default: return '💡';
  }
};

type Styles = ReturnType<typeof createStyles>;

interface RecommendationCardProps {
  rec: AIRecommendation;
  currency: string;
  s: Styles;
  colors: ThemeColors;
  onDismiss: (rec: AIRecommendation) => void;
}

function RecommendationCard({ rec, currency, s, colors, onDismiss }: RecommendationCardProps) {
  const energySaved = `${formatEnergy(rec.potentialSavings)}/mo`;
  const costSaved = `${formatCost(rec.potentialCostSavings, currency)}/mo`;
  const confidence = `${(rec.confidence * 100).toFixed(0)}%`;

  return (
    <View style={s.recCard}>
      <View style={s.recHeader}>
        <Text style={s.recIcon} accessible={false} importantForAccessibility="no">
          {getCategoryIcon(rec.category)}
        </Text>
        <View style={s.recHeaderInfo}>
          <Text style={s.recTitle} accessibilityRole="header">{rec.title}</Text>
          <View
            style={[s.priorityBadge, { backgroundColor: getPriorityColor(colors, rec.priority) }]}
            accessible
            accessibilityLabel={`${rec.priority} priority`}
          >
            <Text style={s.priorityText}>{rec.priority.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      <Text style={s.recDescription}>{rec.description}</Text>

      <View style={s.recStats}>
        <View style={s.recStat} accessible accessibilityLabel={`Save up to ${formatEnergy(rec.potentialSavings)} per month`}>
          <Text style={s.recStatLabel}>Save up to</Text>
          <Text style={s.recStatValue}>{energySaved}</Text>
        </View>
        <View style={s.recStat} accessible accessibilityLabel={`Cost saved: ${formatCost(rec.potentialCostSavings, currency)} per month`}>
          <Text style={s.recStatLabel}>Cost saved</Text>
          <Text style={s.recStatValue}>{costSaved}</Text>
        </View>
        <View style={s.recStat} accessible accessibilityLabel={`Confidence: ${confidence}`}>
          <Text style={s.recStatLabel}>Confidence</Text>
          <Text style={s.recStatValue}>{confidence}</Text>
        </View>
      </View>

      {rec.action ? (
        <View style={s.actionBox} accessible accessibilityLabel={`Suggested action: ${rec.action}`}>
          <Text style={s.actionLabel}>Suggested Action:</Text>
          <Text style={s.actionText}>{rec.action}</Text>
        </View>
      ) : null}

      <AccessibleTouchable
        label={`Mark ${rec.title} as done`}
        hint="Asks for confirmation, then removes this recommendation"
        style={s.dismissBtn}
        onPress={() => onDismiss(rec)}
      >
        <Text style={s.dismissBtnText}>Mark as Done</Text>
      </AccessibleTouchable>
    </View>
  );
}

// Filtering reuses the same recommendation objects, so unchanged cards skip re-rendering
const MemoRecommendationCard = memo(RecommendationCard);

const RecommendationsScreen = () => {
  const { appliances, usageRecords, settings } = useEnergy('appliances', 'usageRecords', 'settings');
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const { electricityRate, currency, geminiApiKey, weatherLocation } = settings;

  // refreshCount re-runs the analysis when the user taps Refresh
  useEffect(() => {
    // Set on cleanup so a superseded or unmounted run never updates state
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      await AIRecommendationEngine.refreshRecommendations(
        appliances,
        usageRecords,
        electricityRate,
        currency,
      );
      if (cancelled) return;
      setRecommendations(AIRecommendationEngine.getRecommendations());
      setLoading(false);

      // The Gemini summary is optional; recommendations stay visible while it loads
      if (!geminiApiKey) {
        setAiSummary(null);
        setAiLoading(false);
        return;
      }

      setAiLoading(true);
      try {
        const summary = await getGeminiRecommendationSummary(
          geminiApiKey,
          appliances,
          usageRecords,
          electricityRate,
          currency,
          weatherLocation,
        );
        if (!cancelled) setAiSummary(summary);
      } catch (error: unknown) {
        console.warn('AI recommendation summary unavailable:', error);
        if (!cancelled) setAiSummary(null);
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    };

    load().catch((error: unknown) => {
      console.error('Failed to load recommendations:', error);
      if (!cancelled) {
        setLoading(false);
        setAiLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [appliances, usageRecords, electricityRate, currency, geminiApiKey, weatherLocation, refreshCount]);

  const filteredRecommendations = useMemo(() => {
    if (filter === 'all') return recommendations;
    if (filter === 'high') return recommendations.filter((rec) => rec.priority === 'high');
    return recommendations.filter((rec) => rec.category === filter);
  }, [recommendations, filter]);

  const savings = useMemo(
    () => recommendations.reduce(
      (total, rec) => ({
        energy: total.energy + rec.potentialSavings,
        cost: total.cost + rec.potentialCostSavings,
      }),
      { energy: 0, cost: 0 },
    ),
    [recommendations],
  );

  const handleRefresh = useCallback(() => setRefreshCount((count) => count + 1), []);

  const handleDismiss = useCallback((rec: AIRecommendation) => {
    Alert.alert('Dismiss', 'Mark this recommendation as done?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Done',
        onPress: () => {
          setRecommendations((current) => current.filter((item) => item.id !== rec.id));
          AIRecommendationEngine.markAsActioned(rec.id).catch((error: unknown) => {
            console.error('Failed to save dismissed recommendation:', error);
          });
        },
      },
    ]);
  }, []);

  const openAddAppliance = useCallback(() => {
    navigation.navigate('Track', { screen: 'AddAppliance', initial: false });
  }, [navigation]);

  const showAllRecommendations = useCallback(() => setFilter('all'), []);

  const renderEmptyState = () => {
    if (appliances.length === 0) {
      return (
        <EmptyState
          variant="inline"
          icon="🔌"
          title="Add Appliances First"
          body="Add your appliances to get personalized recommendations."
          primaryAction={{
            label: 'Add an appliance',
            hint: 'Opens the Track tab to register a new appliance',
            onPress: openAddAppliance,
          }}
          style={s.emptyCard}
        />
      );
    }

    if (filter !== 'all' && recommendations.length > 0) {
      const filterLabel = FILTERS.find((item) => item.key === filter)?.label ?? '';
      return (
        <EmptyState
          variant="inline"
          icon="🔍"
          title={`No ${filterLabel} Recommendations`}
          body="Nothing matches this filter right now. Switch back to All to see every recommendation."
          primaryAction={{ label: 'Show all recommendations', onPress: showAllRecommendations }}
          style={s.emptyCard}
        />
      );
    }

    return (
      <EmptyState
        variant="inline"
        icon="🎉"
        title="No Recommendations"
        body="You're already doing great! Check back after more usage data."
        style={s.emptyCard}
      />
    );
  };

  return (
    <ScrollView style={s.container}>
      <FocusAwareStatusBar variant="hero" />
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>SMART INSIGHTS</Text>
        <Text style={s.headerTitle} accessibilityRole="header">Recommendations</Text>
      </LinearGradient>

      {loading ? (
        <View style={s.content}>
          <SkeletonCard lines={2} label="Analyzing your energy usage" style={s.skeleton} />
          <SkeletonCard lines={3} label="Loading recommendations" style={s.skeleton} />
        </View>
      ) : (
        <View style={s.content}>
          {aiLoading ? (
            <SkeletonCard lines={3} label="Generating AI summary" style={s.skeleton} />
          ) : aiSummary ? (
            <View style={s.aiSummaryCard}>
              <Text style={s.aiSummaryTitle} accessibilityRole="header">AI Recommendation Summary</Text>
              <Text style={s.aiSummaryText}>{aiSummary}</Text>
            </View>
          ) : null}

          {/* Savings Summary */}
          <View style={s.savingsCard}>
            <Text style={s.savingsTitle} accessibilityRole="header">Potential Monthly Savings</Text>
            <View style={s.savingsRow}>
              <View style={s.savingItem} accessible accessibilityLabel={`Energy: ${formatEnergy(savings.energy)}`}>
                <Text style={s.savingValue}>{formatEnergy(savings.energy)}</Text>
                <Text style={s.savingLabel}>Energy</Text>
              </View>
              <View style={s.savingItem} accessible accessibilityLabel={`Cost: ${formatCost(savings.cost, currency)}`}>
                <Text style={s.savingValue}>{formatCost(savings.cost, currency)}</Text>
                <Text style={s.savingLabel}>Cost</Text>
              </View>
            </View>
          </View>

          {/* Filter */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.filterRow}
            accessibilityRole="tablist"
            accessibilityLabel="Filter recommendations"
          >
            {FILTERS.map((f) => {
              const selected = filter === f.key;
              return (
                <AccessibleTouchable
                  key={f.key}
                  role="tab"
                  label={f.label}
                  accessibilityState={{ selected }}
                  style={[s.filterChip, selected && s.filterChipActive]}
                  onPress={() => setFilter(f.key)}
                >
                  <Text style={[s.filterText, selected && s.filterTextActive]}>{f.label}</Text>
                </AccessibleTouchable>
              );
            })}
          </ScrollView>

          {filteredRecommendations.length === 0
            ? renderEmptyState()
            : filteredRecommendations.map((rec) => (
              <MemoRecommendationCard
                key={rec.id}
                rec={rec}
                currency={currency}
                s={s}
                colors={colors}
                onDismiss={handleDismiss}
              />
            ))}

          {/* Refresh */}
          <AccessibleTouchable
            label="Refresh recommendations"
            hint="Re-analyzes your appliances and usage"
            style={s.refreshBtn}
            onPress={handleRefresh}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              style={s.refreshBtnGradient}
            >
              <Text style={s.refreshBtnText}>Refresh Recommendations</Text>
            </LinearGradient>
          </AccessibleTouchable>
        </View>
      )}
    </ScrollView>
  );
};

const createStyles = (c: ThemeColors) => {
  // Neon primary is too faint as text on light surfaces; use the deeper green there

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    header: {
      paddingTop: 54,
      paddingBottom: 28,
      paddingHorizontal: Spacing.page,
      alignItems: 'center',
    },
    headerLabel: {
      ...Typography.overline,
      color: c.primary,
      marginBottom: 4,
    },
    headerTitle: {
      ...Typography.displaySmall,
      color: c.textOnDark,
    },
    content: {
      padding: Spacing.lg,
    },
    skeleton: {
      marginBottom: Spacing.lg,
    },
    aiSummaryCard: {
      backgroundColor: c.card,
      borderRadius: Radius.card,
      padding: Spacing.page,
      marginBottom: Spacing.lg,
      borderWidth: 1,
      borderColor: c.primaryLight,
    },
    aiSummaryTitle: {
      ...Typography.h3,
      color: c.text,
      marginBottom: Spacing.sm,
    },
    aiSummaryText: {
      ...Typography.bodyMedium,
      color: c.textSecondary,
      lineHeight: 22,
    },
    savingsCard: {
      backgroundColor: c.card,
      borderRadius: Radius.card,
      padding: Spacing.page,
      marginBottom: Spacing.lg,
      ...Shadows.md,
    },
    savingsTitle: {
      ...Typography.h3,
      color: c.text,
      marginBottom: Spacing.md,
      textAlign: 'center',
    },
    savingsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    savingItem: {
      alignItems: 'center',
    },
    savingValue: {
      ...Typography.stat,
      color: c.primaryText,
    },
    savingLabel: {
      ...Typography.bodySmall,
      color: c.textSecondary,
      marginTop: Spacing.xs,
    },
    filterRow: {
      marginBottom: Spacing.lg,
    },
    filterChip: {
      backgroundColor: c.card,
      borderRadius: Radius.pill,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      marginRight: Spacing.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    filterChipActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    filterText: {
      ...Typography.label,
      color: c.textSecondary,
    },
    filterTextActive: {
      color: c.onPrimary,
    },
    emptyCard: {
      backgroundColor: c.card,
      borderRadius: Radius.card,
      marginBottom: Spacing.md,
      ...Shadows.sm,
    },
    recCard: {
      backgroundColor: c.card,
      borderRadius: Radius.card,
      padding: Spacing.lg,
      marginBottom: Spacing.md,
      ...Shadows.md,
    },
    recHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    recIcon: {
      fontSize: 32,
      marginRight: Spacing.md,
    },
    recHeaderInfo: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    recTitle: {
      ...Typography.h3,
      color: c.text,
      flex: 1,
      marginRight: Spacing.sm,
    },
    priorityBadge: {
      paddingHorizontal: Spacing.sm,
      paddingVertical: 3,
      borderRadius: Radius.pill,
    },
    priorityText: {
      ...Typography.overline,
      // Dark ink stays legible on the danger/warning/success fills in both themes
      color: c.onPrimary,
      letterSpacing: 0.8,
    },
    recDescription: {
      ...Typography.bodyMedium,
      color: c.textSecondary,
      marginBottom: Spacing.md,
    },
    recStats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: c.background,
      borderRadius: Radius.sm,
      padding: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    recStat: {
      alignItems: 'center',
    },
    recStatLabel: {
      ...Typography.overline,
      color: c.textMuted,
      marginBottom: 3,
    },
    recStatValue: {
      ...Typography.label,
      color: c.primaryText,
    },
    actionBox: {
      backgroundColor: c.primarySoft,
      borderRadius: Radius.sm,
      padding: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    actionLabel: {
      ...Typography.labelSmall,
      color: c.primaryText,
      marginBottom: 3,
    },
    actionText: {
      ...Typography.bodyMedium,
      color: c.text,
    },
    dismissBtn: {
      backgroundColor: c.background,
      borderRadius: Radius.sm,
      padding: Spacing.sm,
      alignItems: 'center',
    },
    dismissBtnText: {
      ...Typography.label,
      color: c.textSecondary,
    },
    refreshBtn: {
      borderRadius: Radius.card,
      overflow: 'hidden',
      marginTop: Spacing.sm,
      marginBottom: Spacing.xxxl,
    },
    refreshBtnGradient: {
      borderRadius: Radius.card,
      padding: Spacing.lg,
      alignItems: 'center',
    },
    refreshBtnText: {
      ...Typography.h3,
      color: c.onPrimary,
    },
  });
};

export default RecommendationsScreen;

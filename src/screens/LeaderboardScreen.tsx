/**
 * Social Leaderboard Screen
 * Shows global and friends rankings with achievements
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Typography, Spacing, Radius, Shadows } from '../theme';
import { useTheme, useThemedStyles, ThemeColors } from '../context/ThemeContext';
import AccessibleTouchable from '../components/AccessibleTouchable';
import EmptyState from '../components/EmptyState';
import FocusAwareStatusBar from '../components/FocusAwareStatusBar';
import { SkeletonCard } from '../components/Skeleton';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LeaderboardEntry {
  id: string;
  userId: string;
  username: string;
  avatar: string;
  totalSavings: number; // kWh
  co2Offset: number; // kg
  rank: number;
  weeklyRank: number;
  monthlyRank: number;
  streak: number;
  achievements: number;
  joinedDate: string;
  isFriend: boolean;
}

type LeaderboardTab = 'all' | 'friends' | 'weekly' | 'monthly';

const TABS: { key: LeaderboardTab; icon: string; label: string; hint: string }[] = [
  { key: 'all', icon: '🌍', label: 'Global', hint: 'Shows all-time rankings for everyone' },
  { key: 'friends', icon: '👥', label: 'Friends', hint: 'Shows rankings for your friends only' },
  { key: 'weekly', icon: '📅', label: 'Weekly', hint: 'Shows this week\'s rankings' },
  { key: 'monthly', icon: '📆', label: 'Monthly', hint: 'Shows this month\'s rankings' },
];

const STORAGE_KEY = 'leaderboard_data';
const CURRENT_USER_ID = 'current_user';

const generateSampleLeaderboard = (): LeaderboardEntry[] => {
  const names = [
    'You', 'Sarah Chen', 'Mike Johnson', 'Emma Davis', 'Alex Brown',
    'Lisa Wang', 'Tom Wilson', 'Anna Lee', 'Chris Martin', 'Maya Patel',
    'John Smith', 'Kate Taylor', 'Ryan Clark', 'Sophie Moore', 'Dan White',
  ];

  return names.map((name, index) => ({
    id: `user-${index}`,
    userId: index === 0 ? CURRENT_USER_ID : `user-${index}`,
    username: name,
    avatar: `https://api.dicebear.com/7.x/avataaars/png?seed=${name}`,
    totalSavings: Math.max(100, 2000 - index * 100 - Math.random() * 50),
    co2Offset: Math.max(50, 1000 - index * 50 - Math.random() * 25),
    rank: index + 1,
    weeklyRank: Math.floor(Math.random() * 50) + 1,
    monthlyRank: Math.floor(Math.random() * 100) + 1,
    streak: Math.floor(Math.random() * 90) + 1,
    achievements: Math.floor(Math.random() * 20) + 1,
    joinedDate: new Date(new Date().getFullYear(), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1).toISOString(),
    isFriend: index > 0 && Math.random() > 0.6,
  }));
};

const rankFor = (entry: LeaderboardEntry, tab: LeaderboardTab): number => {
  if (tab === 'weekly') return entry.weeklyRank;
  if (tab === 'monthly') return entry.monthlyRank;
  return entry.rank;
};

const getRankEmoji = (rank: number): string => {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
};

const LeaderboardScreen: React.FC = () => {
  const { colors } = useTheme();
  const s = useThemedStyles(createStyles);
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadLeaderboard = useCallback(async () => {
    try {
      // Load or generate leaderboard data
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      let data: LeaderboardEntry[] = stored ? JSON.parse(stored) : [];

      if (data.length === 0) {
        data = generateSampleLeaderboard();
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }

      setEntries(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadLeaderboard();
    setRefreshing(false);
  }, [loadLeaderboard]);

  // Filter and rank for the active tab; sorts a copy so stored entries keep their order.
  const rows = useMemo(() => {
    const visible = activeTab === 'friends' ? entries.filter((entry) => entry.isFriend) : entries;
    return visible
      .map((entry) => ({ entry, rank: rankFor(entry, activeTab) }))
      .sort((a, b) => a.rank - b.rank)
      .map(({ entry, rank }) => {
        const isCurrentUser = entry.userId === CURRENT_USER_ID;
        // The sample data already names the current user "You"; don't render "You (You)".
        const isNamedYou = entry.username === 'You';
        const savings = entry.totalSavings.toFixed(0);
        const co2 = entry.co2Offset.toFixed(0);
        const spokenName = isCurrentUser && !isNamedYou ? `${entry.username}, you` : entry.username;
        return {
          entry,
          rank,
          isCurrentUser,
          savings,
          co2,
          displayName: isCurrentUser && !isNamedYou ? `${entry.username} (You)` : entry.username,
          label:
            `Rank ${rank}, ${spokenName}, ${savings} kWh saved, ${co2} kg CO2 offset, ` +
            `${entry.streak} day streak, ${entry.achievements} achievement${entry.achievements === 1 ? '' : 's'}` +
            (entry.isFriend ? ', friend' : ''),
        };
      });
  }, [entries, activeTab]);

  const userEntry = useMemo(
    // Find current user (first entry for demo)
    () => entries.find((entry) => entry.userId === CURRENT_USER_ID) ?? entries[0] ?? null,
    [entries],
  );
  const userRank = userEntry ? rankFor(userEntry, activeTab) : null;

  const renderList = () => {
    if (!isLoaded) {
      return [0, 1, 2].map((key) => (
        <SkeletonCard key={key} lines={1} label="Loading leaderboard" style={s.skeletonCard} />
      ));
    }

    if (rows.length === 0) {
      return activeTab === 'friends' && entries.length > 0 ? (
        <EmptyState
          variant="inline"
          icon="👥"
          title="No friends in this preview"
          body="None of the sample players are marked as friends. Switch to Global to see the full standings."
          primaryAction={{ label: 'Show global rankings', onPress: () => setActiveTab('all') }}
        />
      ) : (
        <EmptyState
          variant="inline"
          icon="🏆"
          title="No rankings available yet"
          body="Start saving energy to climb the leaderboard!"
          primaryAction={{ label: 'Reload rankings', hint: 'Loads the sample standings again', onPress: onRefresh }}
        />
      );
    }

    return rows.map(({ entry, rank, isCurrentUser, savings, co2, displayName, label }, index) => (
      <View
        key={entry.id}
        style={[
          s.entryCard,
          isCurrentUser && s.currentUserCard,
          index < 3 && s.topThreeCard,
        ]}
        accessible
        accessibilityLabel={label}
      >
        <View style={s.rankContainer}>
          <Text style={s.rankText}>{getRankEmoji(rank)}</Text>
        </View>

        <Image source={{ uri: entry.avatar }} style={s.avatar} accessible={false} />

        <View style={s.infoContainer}>
          <View style={s.nameRow}>
            <Text style={[s.username, isCurrentUser && s.currentUserText]}>{displayName}</Text>
            {entry.isFriend && <Text style={s.friendBadge}>👥 Friend</Text>}
          </View>

          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={s.statValue}>{savings}</Text>
              <Text style={s.statLabel}>kWh Saved</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statValue}>{co2}</Text>
              <Text style={s.statLabel}>kg CO₂</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statValue}>{entry.streak}</Text>
              <Text style={s.statLabel}>🔥 Streak</Text>
            </View>
          </View>
        </View>

        <View style={s.achievementsContainer}>
          <Text style={s.achievementCount}>🏆 {entry.achievements}</Text>
        </View>
      </View>
    ));
  };

  return (
    <View style={s.container}>
      <FocusAwareStatusBar variant="hero" />
      {/* Header */}
      <LinearGradient colors={colors.heroGradient} style={s.header}>
        <Text style={s.headerLabel}>LOCAL PREVIEW</Text>
        <Text style={s.headerTitle} accessibilityRole="header">Leaderboard Preview</Text>
      </LinearGradient>

      <View style={s.previewNotice}>
        <Text style={s.previewNoticeText}>Sample standings are stored on this device. Connect a leaderboard service to compete with real people.</Text>
      </View>

      {/* Current User Card */}
      {userEntry && userRank !== null && (
        <View
          style={s.currentUserBanner}
          accessible
          accessibilityLabel={`Your sample position: rank ${userRank} in this preview. Total savings: ${userEntry.totalSavings.toFixed(0)} kWh`}
        >
          <View style={s.currentUserInfo}>
            <Image source={{ uri: userEntry.avatar }} style={s.bannerAvatar} accessible={false} />
            <View>
              <Text style={s.bannerName}>Your sample position</Text>
              <Text style={s.bannerRank}>
                {getRankEmoji(userRank)}
                {' '}in this preview
              </Text>
            </View>
          </View>
          <View style={s.bannerStats}>
            <Text style={s.bannerStatText}>{userEntry.totalSavings.toFixed(0)} kWh</Text>
            <Text style={s.bannerStatLabel}>Total Savings</Text>
          </View>
        </View>
      )}

      {/* Tab Selector */}
      <View style={s.tabContainer} accessibilityRole="tablist">
        {TABS.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <AccessibleTouchable
              key={tab.key}
              role="tab"
              label={tab.label}
              hint={tab.hint}
              accessibilityState={{ selected }}
              style={[s.tab, selected && s.activeTab]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[s.tabText, selected && s.activeTabText]}>
                {tab.icon} {tab.label}
              </Text>
            </AccessibleTouchable>
          );
        })}
      </View>

      {/* Leaderboard List */}
      <ScrollView
        style={s.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.card}
          />
        }
      >
        {renderList()}
      </ScrollView>

      {/* Bottom Info */}
      <View style={s.bottomInfo}>
        <Text style={s.bottomText} accessibilityLabel="Rankings update daily based on energy savings">
          💡 Rankings update daily based on energy savings
        </Text>
      </View>
    </View>
  );
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
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
  previewNotice: {
    marginHorizontal: Spacing.page,
    marginTop: Spacing.page,
    backgroundColor: c.primarySoft,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  previewNoticeText: { ...Typography.bodySmall, color: c.text, lineHeight: 18 },
  currentUserBanner: {
    backgroundColor: c.card,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: Radius.card,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: c.primary,
    ...Shadows.md,
  },
  currentUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bannerAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: Spacing.md,
    backgroundColor: c.border,
  },
  bannerName: {
    ...Typography.bodyMedium,
    color: c.textSecondary,
    marginBottom: 3,
  },
  bannerRank: {
    ...Typography.h3,
    color: c.text,
  },
  bannerStats: {
    alignItems: 'flex-end',
  },
  bannerStatText: {
    ...Typography.stat,
    color: c.primaryText,
  },
  bannerStatLabel: {
    ...Typography.bodySmall,
    color: c.textSecondary,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: c.card,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: Radius.md,
    padding: Spacing.xs,
    ...Shadows.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: c.primary,
  },
  tabText: {
    ...Typography.label,
    color: c.textSecondary,
  },
  activeTabText: {
    color: c.onPrimary,
  },
  scrollView: {
    flex: 1,
  },
  skeletonCard: {
    marginHorizontal: Spacing.lg,
    marginVertical: 6,
  },
  entryCard: {
    backgroundColor: c.card,
    marginHorizontal: Spacing.lg,
    marginVertical: 6,
    padding: Spacing.md,
    borderRadius: Radius.card,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadows.sm,
  },
  currentUserCard: {
    borderWidth: 2,
    borderColor: c.primary,
    backgroundColor: c.primarySoft,
  },
  topThreeCard: {
    ...Shadows.md,
  },
  rankContainer: {
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    ...Typography.h2,
    color: c.textSecondary,
  },
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    marginRight: Spacing.md,
    backgroundColor: c.border,
  },
  infoContainer: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  username: {
    ...Typography.h3,
    color: c.text,
    marginRight: Spacing.sm,
  },
  currentUserText: {
    color: c.primaryText,
  },
  friendBadge: {
    ...Typography.overline,
    color: c.text,
    backgroundColor: c.successSoft,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  statsRow: {
    flexDirection: 'row',
  },
  stat: {
    marginRight: Spacing.lg,
  },
  statValue: {
    ...Typography.label,
    color: c.text,
  },
  statLabel: {
    ...Typography.overline,
    color: c.textSecondary,
    letterSpacing: 0.3,
  },
  achievementsContainer: {
    alignItems: 'center',
  },
  achievementCount: {
    ...Typography.label,
    color: c.primaryText,
  },
  bottomInfo: {
    backgroundColor: c.card,
    padding: Spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  bottomText: {
    ...Typography.bodySmall,
    color: c.textSecondary,
    textAlign: 'center',
  },
});

export default LeaderboardScreen;

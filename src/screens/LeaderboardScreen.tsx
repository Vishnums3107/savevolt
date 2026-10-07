/**
 * Leaderboard: you and the friends whose SaveVolt score codes you imported. There is no server,
 * so every number is either computed from your own data or came from a friend's code.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDistanceToNow } from 'date-fns';
import { useEnergy } from '../context/EnergyContext';
import { ThemeColors, useTheme, useThemedStyles } from '../context/ThemeContext';
import { Radius, Spacing, Typography } from '../theme';
import {
  Button, Card, Chip, GlassPanel, HeroHeader, IconBubble, Screen, SectionHeader, TextField, toast,
} from '../components/ui';
import AccessibleTouchable from '../components/AccessibleTouchable';

type Metric = 'points' | 'week' | 'percent' | 'streak';

const METRICS: { key: Metric; label: string; icon: string }[] = [
  { key: 'points', label: 'Points', icon: 'star-four-points-outline' },
  { key: 'week', label: 'Saved this week', icon: 'lightning-bolt-outline' },
  { key: 'percent', label: '% below usual', icon: 'trending-down' },
  { key: 'streak', label: 'Streak', icon: 'fire' },
];

interface Row {
  id: string;
  name: string;
  isMe: boolean;
  points: number;
  level: number;
  week: number;
  percent: number;
  streak: number;
  badges: number;
  updated?: string;
}

const metricValue = (row: Row, metric: Metric) =>
  metric === 'points' ? row.points : metric === 'week' ? row.week : metric === 'percent' ? row.percent : row.streak;

const formatMetric = (row: Row, metric: Metric) => {
  switch (metric) {
    case 'points': return `${row.points} pts`;
    case 'week': return `${row.week.toFixed(1)} kWh`;
    case 'percent': return `${row.percent > 0 ? '−' : row.percent < 0 ? '+' : ''}${Math.abs(row.percent).toFixed(1)}%`;
    default: return `${row.streak} d`;
  }
};

const MEDALS = ['🥇', '🥈', '🥉'];

const LeaderboardScreen = () => {
  const { friends, points, usageRecords, streak, badges, settings, getScoreSummary, getScoreCode, importShareCode, removeFriend } = useEnergy(
    'friends', 'points', 'usageRecords', 'streak', 'badges', 'settings', 'getScoreSummary', 'getScoreCode', 'importShareCode', 'removeFriend',
  );
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [metric, setMetric] = useState<Metric>('points');
  const [code, setCode] = useState('');
  const [importing, setImporting] = useState(false);

  // The first release stored a generated sample leaderboard; it is no longer used
  useEffect(() => {
    AsyncStorage.removeItem('leaderboard_data').catch(() => {});
  }, []);

  const me = useMemo(() => getScoreSummary(),
    // Recompute when anything the score depends on changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [getScoreSummary, points, usageRecords, streak, badges, settings.displayName]);

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [
      { id: 'me', name: me.name, isMe: true, points: me.points, level: me.level, week: me.weekSavedKwh,
        percent: me.savingsPercent, streak: me.streak, badges: me.badges },
      ...friends.map((f) => ({
        id: f.id, name: f.name, isMe: false, points: f.points, level: f.level, week: f.weekSavedKwh,
        percent: f.savingsPercent, streak: f.streak, badges: f.badges, updated: f.generatedAt,
      })),
    ];
    return list.sort((a, b) => metricValue(b, metric) - metricValue(a, metric));
  }, [friends, me, metric]);

  const myRank = rows.findIndex((r) => r.isMe) + 1;

  const shareScore = async () => {
    try {
      await Share.share({
        message: `Can you beat my SaveVolt score? I'm level ${me.level} (${me.levelName}) with ${me.points} points. In SaveVolt open Goals, Leaderboard and paste this code:\n\n${getScoreCode()}`,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not share your score.');
    }
  };

  const addFriend = async () => {
    setImporting(true);
    try {
      const result = await importShareCode(code);
      setCode('');
      toast.success(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read that code.');
    } finally {
      setImporting(false);
    }
  };

  const confirmRemove = (row: Row) => {
    Alert.alert('Remove friend?', `Remove ${row.name} from your leaderboard?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeFriend(row.id) },
    ]);
  };

  return (
    <Screen withBack>
      <HeroHeader
        withBack
        eyebrow="LEADERBOARD"
        title="You and your friends"
        subtitle="Scores come from your own data and from codes your friends share with you."
        variant="grape"
      >
        <GlassPanel style={s.heroPanel}>
          <View style={s.heroStat}>
            <Text style={s.heroValue}>#{myRank}</Text>
            <Text style={s.heroLabel}>your rank</Text>
          </View>
          <View style={s.heroDivider} />
          <View style={s.heroStat}>
            <Text style={s.heroValue}>{me.points}</Text>
            <Text style={s.heroLabel}>points · L{me.level}</Text>
          </View>
          <View style={s.heroDivider} />
          <View style={s.heroStat}>
            <Text style={s.heroValue}>{friends.length}</Text>
            <Text style={s.heroLabel}>{friends.length === 1 ? 'friend' : 'friends'}</Text>
          </View>
        </GlassPanel>
      </HeroHeader>

      <View style={s.metrics}>
        {METRICS.map((m) => (
          <Chip key={m.key} label={m.label} icon={m.icon} selected={metric === m.key} onPress={() => setMetric(m.key)} />
        ))}
      </View>

      <View style={s.list}>
        {rows.map((row, index) => (
          <Card key={row.id} style={[s.row, row.isMe && s.rowMe]}>
            <View style={s.rowInner}>
              <Text style={s.rank} accessibilityLabel={`Rank ${index + 1}`}>{MEDALS[index] ?? `#${index + 1}`}</Text>
              <IconBubble icon={row.isMe ? 'account-star' : 'account'} tone={row.isMe ? 'primary' : 'accent'} size={40} />
              <View style={s.rowText}>
                <Text style={s.name} numberOfLines={1}>{row.isMe && row.name !== 'You' ? `${row.name} (you)` : row.name}</Text>
                <Text style={s.meta} numberOfLines={1}>
                  L{row.level} · {row.badges} badges · {row.streak} d streak
                  {row.updated ? ` · ${formatDistanceToNow(new Date(row.updated), { addSuffix: true })}` : ''}
                </Text>
              </View>
              <Text style={[s.value, { color: row.isMe ? colors.primaryText : colors.text }]}>{formatMetric(row, metric)}</Text>
              {!row.isMe ? (
                <AccessibleTouchable label={`Remove ${row.name}`} onPress={() => confirmRemove(row)} style={s.remove}>
                  <Text style={s.removeText}>✕</Text>
                </AccessibleTouchable>
              ) : null}
            </View>
          </Card>
        ))}
      </View>

      <SectionHeader title="Add friends" subtitle="Each of you shares a score code; paste theirs below. Share again any time to update." />
      <View style={s.list}>
        <Card>
          <View style={s.addForm}>
            <Button label="Share my score code" icon="share-variant" onPress={shareScore} full />
            <TextField
              label="Friend's code"
              placeholder="Paste a code starting with SV1S."
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button label="Add to leaderboard" icon="account-plus-outline" variant="secondary" onPress={addFriend} loading={importing} disabled={!code.trim()} full />
          </View>
        </Card>
        {friends.length === 0 ? (
          <Text style={s.hint}>
            No friends yet. Share your code over WhatsApp, SMS or email, and ask friends to send theirs back.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
  heroPanel: { flexDirection: 'row', alignItems: 'center', marginTop: 18, paddingVertical: 14 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroValue: { ...Typography.h1, color: c.textOnDark },
  heroLabel: { ...Typography.labelSmall, color: c.textOnDarkSub, marginTop: 2 },
  heroDivider: { width: 1, height: 32, backgroundColor: c.glassBorder },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: Spacing.page, marginTop: 18 },
  list: { paddingHorizontal: Spacing.page, gap: 10, marginTop: 14 },
  row: { padding: 12 },
  rowMe: { borderColor: c.primary, borderWidth: 1.5 },
  rowInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { ...Typography.h3, color: c.textSecondary, width: 34, textAlign: 'center' },
  rowText: { flex: 1 },
  name: { ...Typography.h3, color: c.text },
  meta: { ...Typography.bodySmall, color: c.textSecondary, marginTop: 2 },
  value: { ...Typography.statSmall, fontVariant: ['tabular-nums'] },
  remove: { width: 36, alignItems: 'center' },
  removeText: { ...Typography.label, color: c.textMuted },
  addForm: { gap: 12 },
  hint: { ...Typography.bodySmall, color: c.textSecondary, textAlign: 'center', paddingHorizontal: Spacing.lg, borderRadius: Radius.md },
});

export default LeaderboardScreen;

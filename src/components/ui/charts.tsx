import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, GestureResponderEvent, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { ThemeColors, useTheme, useThemedStyles } from '../../context/ThemeContext';
import { Typography } from '../../theme';
import { useReducedMotion } from './motion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── Ring gauge ──────────────────────────────────────────────────

interface RingGaugeProps {
  size?: number;
  stroke?: number;
  /** 0–1 (values above 1 draw a second, warning-coloured lap) */
  progress: number;
  colors?: [string, string];
  trackColor?: string;
  children?: ReactNode;
  label?: string;
}

/** Circular gauge with a gradient stroke that sweeps in. Children render in the centre. */
export const RingGauge = ({ size = 180, stroke = 14, progress, colors, trackColor, children, label }: RingGaugeProps) => {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const safe = Number.isFinite(progress) ? Math.max(progress, 0) : 0;
  const first = Math.min(safe, 1);
  const over = Math.min(Math.max(safe - 1, 0), 1);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const anim = useRef(new Animated.Value(reduced ? first : 0)).current;
  const overAnim = useRef(new Animated.Value(reduced ? over : 0)).current;

  useEffect(() => {
    if (reduced) { anim.setValue(first); overAnim.setValue(over); return; }
    Animated.sequence([
      Animated.timing(anim, { toValue: first, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(overAnim, { toValue: over, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
  }, [anim, overAnim, first, over, reduced]);

  const [from, to] = colors ?? theme.colors.gradVolt;
  const dash = (value: Animated.Value) => value.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] });

  return (
    <View
      style={{ width: size, height: size }}
      accessible={Boolean(label)}
      accessibilityRole={label ? 'progressbar' : undefined}
      accessibilityLabel={label}
      accessibilityValue={label ? { min: 0, max: 100, now: Math.round(Math.min(safe, 2) * 100) } : undefined}
    >
      <Svg width={size} height={size}>
        <Defs>
          <SvgGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </SvgGradient>
          <SvgGradient id="ringOver" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={theme.colors.amber} />
            <Stop offset="1" stopColor={theme.colors.rose} />
          </SvgGradient>
        </Defs>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor ?? theme.colors.glassStrong} strokeWidth={stroke} fill="none" />
          <AnimatedCircle
            cx={size / 2} cy={size / 2} r={radius} fill="none"
            stroke="url(#ringGradient)" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={dash(anim)}
          />
          {over > 0 && (
            <AnimatedCircle
              cx={size / 2} cy={size / 2} r={radius} fill="none"
              stroke="url(#ringOver)" strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={dash(overAnim)}
            />
          )}
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">{children}</View>
    </View>
  );
};

// ─── Area chart ──────────────────────────────────────────────────

export interface ChartPoint {
  label: string;
  value: number | null;
  /** Optional dashed reference value (e.g. baseline) */
  reference?: number | null;
}

interface AreaChartProps {
  data: ChartPoint[];
  height?: number;
  color?: string;
  formatValue?: (value: number) => string;
  /** Show every nth x label (auto by default) */
  labelEvery?: number;
  /** Horizontal target line */
  target?: number | null;
  onSelect?: (index: number | null) => void;
  accessibilityLabel: string;
}

/** Smooth area chart with gaps for missing days, a dashed reference line and tap-to-inspect. */
export const AreaChart = ({
  data, height = 190, color, formatValue = (v) => v.toFixed(1), labelEvery, target, onSelect, accessibilityLabel,
}: AreaChartProps) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const stroke = color ?? colors.primary;
  const padTop = 18; const padBottom = 24; const padX = 6;
  const plotH = height - padTop - padBottom;

  const values = data.flatMap((p) => [p.value, p.reference ?? null, ...(target ? [target] : [])]).filter((v): v is number => v !== null);
  const max = Math.max(...values, 0.001) * 1.12;
  const step = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0;
  const x = (i: number) => padX + i * step;
  const y = (v: number) => padTop + plotH - (v / max) * plotH;

  const { line, area, refLine } = useMemo(() => {
    if (width === 0) return { line: '', area: '', refLine: '' };
    // Split into runs of consecutive known values so missing days show as gaps
    const runs: { i: number; v: number }[][] = [];
    let run: { i: number; v: number }[] = [];
    data.forEach((p, i) => {
      if (p.value === null) { if (run.length) runs.push(run); run = []; } else run.push({ i, v: p.value });
    });
    if (run.length) runs.push(run);
    const smooth = (pts: { i: number; v: number }[]) => pts.map((p, k) => {
      if (k === 0) return `M${x(p.i)},${y(p.v)}`;
      const prev = pts[k - 1];
      const cx = (x(prev.i) + x(p.i)) / 2;
      return `C${cx},${y(prev.v)} ${cx},${y(p.v)} ${x(p.i)},${y(p.v)}`;
    }).join(' ');
    const lineD = runs.map((r) => (r.length === 1
      ? `M${x(r[0].i) - 2},${y(r[0].v)} L${x(r[0].i) + 2},${y(r[0].v)}` : smooth(r))).join(' ');
    const areaD = runs.filter((r) => r.length > 1).map((r) =>
      `${smooth(r)} L${x(r[r.length - 1].i)},${padTop + plotH} L${x(r[0].i)},${padTop + plotH} Z`).join(' ');
    const refs = data.map((p, i) => (p.reference != null ? { i, v: p.reference } : null)).filter(Boolean) as { i: number; v: number }[];
    const refD = refs.length > 1 ? refs.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i)},${y(p.v)}`).join(' ') : '';
    return { line: lineD, area: areaD, refLine: refD };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, width, max]);

  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / 6));
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const pick = (e: GestureResponderEvent) => {
    if (step === 0 && data.length !== 1) return;
    const index = data.length === 1 ? 0 : Math.round((e.nativeEvent.locationX - padX) / step);
    const clamped = Math.min(Math.max(index, 0), data.length - 1);
    const next = selected === clamped ? null : clamped;
    setSelected(next);
    onSelect?.(next);
  };
  const sel = selected !== null ? data[selected] : null;

  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Pressable onPress={pick} accessible={false}>
        <Svg width={width || 1} height={height}>
          <Defs>
            <SvgGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.35} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </SvgGradient>
          </Defs>
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <Line key={f} x1={padX} x2={width - padX} y1={padTop + plotH * (1 - f)} y2={padTop + plotH * (1 - f)}
              stroke={colors.divider} strokeWidth={1} />
          ))}
          {area ? <Path d={area} fill="url(#areaFill)" /> : null}
          {refLine ? <Path d={refLine} stroke={colors.textMuted} strokeWidth={1.5} strokeDasharray="5 5" fill="none" /> : null}
          {target ? (
            <Line x1={padX} x2={width - padX} y1={y(target)} y2={y(target)} stroke={colors.warning} strokeWidth={1.5} strokeDasharray="3 4" />
          ) : null}
          {line ? <Path d={line} stroke={stroke} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {data.map((p, i) => (p.value !== null && (data.length <= 14 || i === selected) ? (
            <Circle key={i} cx={x(i)} cy={y(p.value)} r={i === selected ? 5.5 : 3} fill={i === selected ? stroke : colors.card}
              stroke={stroke} strokeWidth={2} />
          ) : null))}
          {selected !== null ? (
            <Rect x={x(selected) - 0.75} y={padTop} width={1.5} height={plotH} fill={stroke} opacity={0.35} />
          ) : null}
        </Svg>
      </Pressable>
      <View style={s.xLabels} pointerEvents="none">
        {data.map((p, i) => (i % every === 0 || i === data.length - 1 ? (
          <Text key={i} style={[s.xLabel, { left: Math.min(Math.max(x(i) - 22, 0), Math.max(width - 44, 0)) }]} numberOfLines={1}>{p.label}</Text>
        ) : null))}
      </View>
      {sel ? (
        <View style={[s.tooltip, { left: Math.min(Math.max(x(selected!) - 60, 0), Math.max(width - 120, 0)) }]} pointerEvents="none">
          <Text style={s.tooltipLabel}>{sel.label}</Text>
          <Text style={s.tooltipValue}>{sel.value === null ? 'Not logged' : formatValue(sel.value)}</Text>
          {sel.reference != null ? <Text style={s.tooltipLabel}>usual {formatValue(sel.reference)}</Text> : null}
        </View>
      ) : null}
    </View>
  );
};

// ─── Bar chart ───────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  value: number | null;
  highlight?: boolean;
  color?: string;
}

export const BarChart = ({ data, height = 150, formatValue = (v) => v.toFixed(1), accessibilityLabel, showValues = true }: {
  data: BarDatum[]; height?: number; formatValue?: (v: number) => string; accessibilityLabel: string; showValues?: boolean;
}) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const max = Math.max(...data.map((d) => d.value ?? 0), 0.001);
  return (
    <View style={[s.bars, { height }]} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {data.map((d, i) => {
        const h = d.value ? Math.max((d.value / max) * (height - 40), 4) : 4;
        const fill = d.color ?? (d.highlight ? colors.primary : colors.surfaceMuted);
        return (
          <View key={`${d.label}-${i}`} style={s.barCol}>
            {showValues ? <Text style={s.barValue} numberOfLines={1}>{d.value === null ? '–' : formatValue(d.value)}</Text> : null}
            <View style={[s.bar, { height: h, backgroundColor: d.value === null ? colors.divider : fill }]} />
            <Text style={[s.barLabel, d.highlight && { color: colors.text }]} numberOfLines={1}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
};

// ─── Donut ───────────────────────────────────────────────────────

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export const DonutChart = ({ segments, size = 170, thickness = 22, children, accessibilityLabel, onSelect, selected }: {
  segments: DonutSegment[]; size?: number; thickness?: number; children?: ReactNode; accessibilityLabel: string;
  onSelect?: (index: number) => void; selected?: number | null;
}) => {
  const { colors } = useTheme();
  const total = segments.reduce((sum, seg) => sum + Math.max(seg.value, 0), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = segments.length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.surfaceMuted} strokeWidth={thickness} fill="none" />
          {total > 0 && segments.map((seg, i) => {
            const length = (Math.max(seg.value, 0) / total) * circumference;
            const dash = Math.max(length - gap, 0.1);
            const node = (
              <Circle
                key={seg.label}
                cx={size / 2} cy={size / 2} r={radius} fill="none"
                stroke={seg.color} strokeWidth={selected === i ? thickness + 6 : thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                onPress={onSelect ? () => onSelect(i) : undefined}
              />
            );
            offset += length;
            return node;
          })}
        </G>
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">{children}</View>
    </View>
  );
};

// ─── Calendar heatmap ────────────────────────────────────────────

export interface HeatDay {
  key: string;
  date: Date;
  value: number | null;
}

/** GitHub-style grid of the last weeks: one column per week, darker = more energy. */
export const CalendarHeatmap = ({ days, accessibilityLabel, onSelect, selectedKey }: {
  days: HeatDay[]; accessibilityLabel: string; onSelect?: (day: HeatDay) => void; selectedKey?: string | null;
}) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const known = days.map((d) => d.value).filter((v): v is number => v !== null);
  const min = Math.min(...known, 0);
  const max = Math.max(...known, 0.001);
  // Pad so the first column starts on Sunday
  const lead = days.length ? days[0].date.getDay() : 0;
  const cells: (HeatDay | null)[] = [...Array(lead).fill(null), ...days];
  const weeks: (HeatDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const shade = (v: number) => {
    const t = max === min ? 0.6 : (v - min) / (max - min);
    return [colors.primarySoft, colors.primaryLight, colors.primary, colors.primaryDark, colors.primaryDeep][Math.min(Math.floor(t * 5), 4)];
  };
  return (
    <View style={s.heatWrap} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={s.heatDays}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={s.heatDayLabel}>{i % 2 === 1 ? d : ''}</Text>)}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={s.heatCol}>
          {Array.from({ length: 7 }, (_, d) => {
            const day = week[d];
            if (!day) return <View key={d} style={[s.heatCell, s.heatEmpty]} />;
            const style = [
              s.heatCell,
              { backgroundColor: day.value === null ? colors.surfaceMuted : shade(day.value) },
              selectedKey === day.key && { borderWidth: 2, borderColor: colors.text },
            ];
            return onSelect ? (
              <Pressable key={d} onPress={() => onSelect(day)} style={style} accessibilityLabel={day.key} hitSlop={2} />
            ) : <View key={d} style={style} />;
          })}
        </View>
      ))}
    </View>
  );
};

// ─── Sparkline (tiny trend on cards) ─────────────────────────────

export const Sparkline = ({ values, width = 90, height = 32, color }: { values: (number | null)[]; width?: number; height?: number; color?: string }) => {
  const { colors } = useTheme();
  const known = values.map((v, i) => (v === null ? null : { i, v })).filter(Boolean) as { i: number; v: number }[];
  if (known.length < 2) return <View style={{ width, height }} />;
  const max = Math.max(...known.map((k) => k.v)); const min = Math.min(...known.map((k) => k.v));
  const span = max - min || 1;
  const step = width / Math.max(values.length - 1, 1);
  const d = known.map((k, n) => `${n === 0 ? 'M' : 'L'}${k.i * step},${height - 3 - ((k.v - min) / span) * (height - 6)}`).join(' ');
  return (
    <Svg width={width} height={height} accessible={false}>
      <Path d={d} stroke={color ?? colors.primary} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });

const createStyles = (c: ThemeColors) => StyleSheet.create({
  xLabels: { height: 16, marginTop: -18 },
  xLabel: { position: 'absolute', width: 44, textAlign: 'center', ...Typography.bodySmall, fontSize: 10, color: c.textMuted },
  tooltip: {
    position: 'absolute', top: 0, width: 120, backgroundColor: c.toastBg, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10,
  },
  tooltipLabel: { ...Typography.bodySmall, fontSize: 11, color: c.toastText, opacity: 0.75 },
  tooltipValue: { ...Typography.label, color: c.toastText },

  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '70%', maxWidth: 28, borderRadius: 7 },
  barValue: { ...Typography.bodySmall, fontSize: 10, color: c.textSecondary, marginBottom: 4 },
  barLabel: { ...Typography.labelSmall, fontSize: 10, color: c.textMuted, marginTop: 6 },

  heatWrap: { flexDirection: 'row', gap: 3 },
  heatDays: { gap: 3, marginRight: 2 },
  heatDayLabel: { height: 16, fontSize: 9, lineHeight: 16, color: c.textMuted },
  heatCol: { gap: 3, flex: 1 },
  heatCell: { height: 16, borderRadius: 4 },
  heatEmpty: { backgroundColor: 'transparent' },
});

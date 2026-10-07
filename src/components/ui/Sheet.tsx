import React, { ReactNode, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { ThemeColors, useTheme, useThemedStyles } from '../../context/ThemeContext';
import { Radius, Spacing, Typography } from '../../theme';
import AccessibleTouchable from '../AccessibleTouchable';
import { useReducedMotion } from './motion';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Sticky area under the scrolling content (e.g. the main button) */
  footer?: ReactNode;
  scroll?: boolean;
}

/** Bottom sheet that slides up over a scrim. Tap outside, the close button or back to dismiss. */
const Sheet = ({ visible, onClose, title, subtitle, children, footer, scroll = true }: SheetProps) => {
  const s = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) { slide.setValue(0); return; }
    if (reduced) { slide.setValue(1); return; }
    Animated.timing(slide, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, reduced, slide]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <Animated.View style={[s.sheet, { opacity: slide, transform: [{ translateY }] }]} accessibilityViewIsModal>
          <View style={s.handle} />
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.title} accessibilityRole="header">{title}</Text>
              {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
            </View>
            <AccessibleTouchable label="Close" onPress={onClose} style={s.close}>
              <Icon name="close" size={20} color={colors.textSecondary} accessible={false} importantForAccessibility="no" />
            </AccessibleTouchable>
          </View>
          {scroll ? (
            <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
          ) : <View style={s.bodyContent}>{children}</View>}
          {footer ? <View style={s.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createStyles = (c: ThemeColors) => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: c.overlay },
  sheet: {
    backgroundColor: c.card, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet,
    maxHeight: '90%', paddingBottom: Spacing.lg, borderWidth: 1, borderColor: c.cardBorder,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: Spacing.xl, paddingTop: 14, paddingBottom: 6 },
  headerText: { flex: 1 },
  title: { ...Typography.h1, color: c.text },
  subtitle: { ...Typography.bodyMedium, color: c.textSecondary, marginTop: 4 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceMuted },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.lg, gap: Spacing.lg },
  footer: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
});

export default Sheet;

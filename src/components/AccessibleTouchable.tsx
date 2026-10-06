import React, { ReactNode } from 'react';
import { StyleSheet, TouchableOpacity, TouchableOpacityProps } from 'react-native';

interface AccessibleTouchableProps extends TouchableOpacityProps {
  /** Human-readable label for screen readers */
  label: string;
  /** Hint text providing additional context */
  hint?: string;
  /** Accessibility role — defaults to 'button' */
  role?: 'button' | 'link' | 'tab' | 'checkbox' | 'radio';
  children: ReactNode;
}

/**
 * A wrapper around TouchableOpacity that ensures a minimum 44x44 touch target
 * and proper accessibility attributes. `style` (object, array, or falsy entries) is merged
 * after the minimum target; other TouchableOpacity props, including accessibilityState, pass
 * straight through.
 */
const AccessibleTouchable = ({
  label,
  hint,
  role = 'button',
  style,
  children,
  ...rest
}: AccessibleTouchableProps) => (
  <TouchableOpacity
    accessibilityLabel={label}
    accessibilityHint={hint}
    accessibilityRole={role}
    style={[styles.base, style]}
    activeOpacity={0.75}
    {...rest}
  >
    {children}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  base: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
  },
});

export default AccessibleTouchable;

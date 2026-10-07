import React, { useEffect, useRef, useState } from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import { useReducedMotion } from './motion';

interface AnimatedNumberProps {
  value: number;
  format: (value: number) => string;
  style?: StyleProp<TextStyle>;
  duration?: number;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Counts from the previous value to the new one. Screen readers always get the final value,
 * and reduce-motion users see it immediately.
 */
const AnimatedNumber = ({ value, format, style, duration = 800, numberOfLines, adjustsFontSizeToFit }: AnimatedNumberProps) => {
  const reduced = useReducedMotion();
  const safe = Number.isFinite(value) ? value : 0;
  const [shown, setShown] = useState(reduced ? safe : 0);
  const from = useRef(reduced ? safe : 0);
  const frame = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

  useEffect(() => {
    if (reduced) {
      from.current = safe;
      setShown(safe);
      return;
    }
    const start = from.current;
    const began = Date.now();
    const tick = () => {
      const t = Math.min((Date.now() - began) / duration, 1);
      const next = start + (safe - start) * easeOut(t);
      setShown(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else from.current = safe;
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      from.current = safe;
    };
  }, [safe, duration, reduced]);

  return (
    <Text style={style} accessibilityLabel={format(safe)} numberOfLines={numberOfLines} adjustsFontSizeToFit={adjustsFontSizeToFit}>
      {format(shown)}
    </Text>
  );
};

export default AnimatedNumber;

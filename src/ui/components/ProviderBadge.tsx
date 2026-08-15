import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

interface Props {
  readonly label: string;
  readonly color: string;
  readonly size?: 'sm' | 'md';
}

/** Цветная плашка платформы. */
export const ProviderBadge: React.FC<Props> = ({ label, color, size = 'sm' }) => (
  <View
    style={[
      styles.container,
      size === 'md' && styles.containerMd,
      { backgroundColor: color },
    ]}>
    <Text style={[styles.label, size === 'md' && styles.labelMd]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  containerMd: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.md,
  },
  label: {
    ...typography.badge,
    color: colors.white,
    letterSpacing: 0.6,
  },
  labelMd: {
    ...typography.overline,
    color: colors.white,
  },
});

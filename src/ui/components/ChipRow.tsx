import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export interface ChipOption {
  readonly id: string;
  readonly label: string;
  /** Цвет точки-маркера и активного контура; по умолчанию — акцент темы. */
  readonly color?: string;
}

interface Props {
  readonly options: readonly ChipOption[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  /** Показывать цветную точку слева (для платформ). */
  readonly showDots?: boolean;
}

/** Горизонтальный ряд фильтров (платформы, категории, вкладки библиотеки). */
export const ChipRow: React.FC<Props> = ({ options, selectedId, onSelect, showDots = false }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.content}>
    {options.map((option) => {
      const active = option.id === selectedId;
      const accent = option.color ?? colors.accent;
      return (
        <Pressable
          key={option.id}
          onPress={() => onSelect(option.id)}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          style={({ pressed }) => [
            styles.chip,
            active && { borderColor: accent, backgroundColor: colors.surfaceElevated },
            pressed && styles.pressed,
          ]}>
          {showDots && option.color ? (
            <View style={[styles.dot, { backgroundColor: accent }]} />
          ) : null}
          <Text
            style={[styles.label, active && styles.labelActive]}
            numberOfLines={1}>
            {option.label}
          </Text>
        </Pressable>
      );
    })}
  </ScrollView>
);

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 240,
  },
  pressed: {
    opacity: 0.7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
});

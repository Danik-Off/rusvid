import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly icon?: IconName;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly fullWidth?: boolean;
  readonly style?: ViewStyle;
}

export const Button: React.FC<Props> = ({
  label,
  onPress,
  variant = 'secondary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
}) => {
  const inactive = disabled || loading;
  const palette = PALETTE[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: palette.background, borderColor: palette.border },
        fullWidth && styles.fullWidth,
        pressed && styles.pressed,
        inactive && styles.inactive,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={palette.text} />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={18} color={palette.text} /> : null}
          <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const PALETTE: Record<ButtonVariant, { background: string; border: string; text: string }> = {
  primary: { background: colors.accent, border: colors.accent, text: colors.white },
  secondary: {
    background: colors.surfaceElevated,
    border: colors.border,
    text: colors.textPrimary,
  },
  ghost: { background: 'transparent', border: 'transparent', text: colors.textSecondary },
  danger: { background: colors.dangerSoft, border: 'transparent', text: colors.danger },
};

const styles = StyleSheet.create({
  base: {
    minHeight: 44, // комфортная цель для пальца
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  pressed: {
    opacity: 0.7,
  },
  inactive: {
    opacity: 0.5,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    ...typography.subtitle,
  },
});

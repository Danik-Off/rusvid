import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { absoluteFill, colors, radius, spacing, typography } from '../theme';
import { Icon, type IconName } from './Icon';

interface SheetProps {
  readonly visible: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}

/**
 * Нижняя шторка.
 *
 * Настройки плеера живут именно здесь, а не на отдельном экране: они меняются
 * во время просмотра, и уходить с кадра ради смены скорости неприемлемо.
 * Реализована через `Modal`, чтобы шторка перекрывала в том числе
 * полноэкранный режим, где обычный оверлей оказался бы под кадром.
 */
export const Sheet: React.FC<SheetProps> = ({ visible, title, onClose, children }) => {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: visible ? 220 : 160,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрыть" />
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + spacing.lg,
            opacity: slide,
            transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
          },
        ]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Закрыть">
            <Icon name="close" size={20} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView bounces={false} style={styles.body}>
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
};

interface SheetRowProps {
  readonly label: string;
  readonly value?: string;
  readonly icon?: IconName;
  readonly selected?: boolean;
  readonly onPress: () => void;
}

/** Строка шторки: слева иконка и подпись, справа значение или галочка. */
export const SheetRow: React.FC<SheetRowProps> = ({ label, value, icon, selected, onPress }) => (
  <Pressable
    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected }}>
    {icon ? <Icon name={icon} size={20} color={colors.textSecondary} /> : null}
    <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]} numberOfLines={1}>
      {label}
    </Text>
    {value ? <Text style={styles.rowValue}>{value}</Text> : null}
    {selected ? <Icon name="check" size={18} color={colors.accent} /> : null}
  </Pressable>
);

export const SheetSection: React.FC<{ readonly title: string; readonly children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const styles = StyleSheet.create({
  backdrop: {
    ...absoluteFill,
    backgroundColor: colors.scrim,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    backgroundColor: colors.surfaceSunken,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  body: {
    paddingHorizontal: spacing.sm,
  },
  section: {
    paddingTop: spacing.md,
    gap: spacing.xxs,
  },
  sectionTitle: {
    ...typography.overline,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  rowPressed: {
    backgroundColor: colors.surfaceElevated,
  },
  rowLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  rowLabelSelected: {
    fontWeight: '600',
  },
  rowValue: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

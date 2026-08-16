/** Переиспользуемые состояния экранов: загрузка, пусто, ошибка, частичный сбой. */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { ProviderErrorCode } from '../../core/errors/ProviderError';
import { colors, radius, spacing, typography } from '../theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';

export const LoadingView: React.FC<{ readonly label?: string }> = ({ label }) => (
  <View style={styles.centered}>
    <ActivityIndicator color={colors.accent} />
    {label ? <Text style={styles.caption}>{label}</Text> : null}
  </View>
);

export const ListFooterLoader: React.FC<{ readonly visible: boolean }> = ({ visible }) =>
  visible ? (
    <View style={styles.footer}>
      <ActivityIndicator color={colors.accent} />
    </View>
  ) : null;

interface EmptyStateProps {
  readonly icon?: IconName;
  readonly title: string;
  readonly hint?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = 'search',
  title,
  hint,
  actionLabel,
  onAction,
}) => (
  <View style={styles.centered}>
    <View style={styles.iconHalo}>
      <Icon name={icon} size={30} color={colors.textMuted} />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    {hint ? <Text style={styles.caption}>{hint}</Text> : null}
    {actionLabel && onAction ? (
      <Button label={actionLabel} onPress={onAction} style={styles.action} />
    ) : null}
  </View>
);

interface ErrorViewProps {
  readonly message: string;
  /**
   * Код ошибки. Нужен, чтобы отличить «нет сети» от «платформа сломалась»:
   * в метро человек жмёт «Повторить» впустую, потому что текст ошибки
   * платформы ничего не говорит о том, что дело в соединении.
   */
  readonly code?: ProviderErrorCode;
  readonly onRetry?: () => void;
  readonly secondaryLabel?: string;
  readonly onSecondary?: () => void;
}

/** Сбой соединения — это про устройство и сеть, а не про платформу. */
function isOffline(code: ProviderErrorCode | undefined): boolean {
  return code === 'NETWORK' || code === 'TIMEOUT';
}

export const ErrorView: React.FC<ErrorViewProps> = ({
  message,
  code,
  onRetry,
  secondaryLabel,
  onSecondary,
}) => (
  <View style={styles.centered}>
    <View style={[styles.iconHalo, isOffline(code) ? styles.iconHaloMuted : styles.iconHaloDanger]}>
      <Icon
        name={isOffline(code) ? 'refresh' : 'alert'}
        size={30}
        color={isOffline(code) ? colors.textMuted : colors.danger}
      />
    </View>
    <Text style={styles.errorTitle}>{isOffline(code) ? 'Нет связи' : message}</Text>
    {isOffline(code) ? (
      <Text style={styles.caption}>
        {code === 'TIMEOUT'
          ? 'Сеть отвечает слишком медленно. Проверьте соединение и попробуйте снова.'
          : 'Проверьте мобильный интернет или Wi-Fi — платформы тут ни при чём.'}
      </Text>
    ) : null}
    <View style={styles.actionRow}>
      {onRetry ? <Button label="Повторить" icon="refresh" onPress={onRetry} /> : null}
      {secondaryLabel && onSecondary ? (
        <Button label={secondaryLabel} variant="ghost" onPress={onSecondary} />
      ) : null}
    </View>
  </View>
);

interface FailureNoticeProps {
  readonly failures: readonly {
    readonly providerTitle: string;
    readonly message: string;
    readonly accentColor: string;
  }[];
}

/**
 * Полоса «часть платформ не ответила» — показывается НАД результатами:
 * выдача остальных платформ при этом остаётся рабочей.
 */
export const FailureNotice: React.FC<FailureNoticeProps> = ({ failures }) => {
  if (failures.length === 0) {
    return null;
  }
  return (
    <View style={styles.notice}>
      <Icon name="alert" size={16} color={colors.warning} />
      <View style={styles.noticeBody}>
        {failures.map((failure) => (
          <Text key={failure.providerTitle} style={styles.noticeText} numberOfLines={2}>
            <Text style={[styles.noticeProvider, { color: failure.accentColor }]}>
              {failure.providerTitle}
            </Text>
            {`  ${failure.message}`}
          </Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  centered: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  iconHalo: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconHaloDanger: {
    backgroundColor: colors.dangerSoft,
  },
  iconHaloMuted: {
    backgroundColor: colors.surfaceElevated,
  },
  footer: {
    paddingVertical: spacing.xl,
  },
  caption: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
  emptyTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  errorTitle: {
    ...typography.body,
    color: colors.textPrimary,
    textAlign: 'center',
    maxWidth: 320,
  },
  action: {
    marginTop: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.md,
  },
  noticeBody: {
    flex: 1,
    gap: spacing.xxs,
  },
  noticeText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  noticeProvider: {
    fontWeight: '700',
  },
});

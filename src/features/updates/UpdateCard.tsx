/**
 * Карточка «О приложении» с проверкой обновлений.
 *
 * Живёт в настройках и всегда показывает текущую версию — даже когда
 * обновлений нет. Это не украшение: без номера версии пользователь не может
 * ни понять, стоит ли у него свежая сборка, ни осмысленно сообщить о баге.
 */

import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_VERSION } from '../../app/version';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { Logo } from '../../ui/components/Logo';
import { colors, radius, spacing, typography } from '../../ui/theme';
import { RELEASES_URL } from './updateService';
import { useUpdatesStore } from './updatesStore';

export const UpdateCard: React.FC = () => {
  const status = useUpdatesStore((state) => state.status);
  const latest = useUpdatesStore((state) => state.latest);
  const error = useUpdatesStore((state) => state.error);
  const checkedAt = useUpdatesStore((state) => state.checkedAt);
  const check = useUpdatesStore((state) => state.check);
  const dismiss = useUpdatesStore((state) => state.dismiss);

  const available = status === 'available' && latest !== null;

  const openRelease = () => {
    void dismiss();
    void Linking.openURL(latest?.url ?? RELEASES_URL);
  };

  return (
    <View style={styles.card}>
      <View style={styles.identity}>
        <Logo size={48} />
        <View style={styles.identityText}>
          <Text style={styles.name}>RusVid</Text>
          <Text style={styles.version}>{`Версия ${APP_VERSION}`}</Text>
        </View>
      </View>

      {available ? (
        <View style={styles.newVersion}>
          <View style={styles.newVersionHead}>
            <Icon name="external" size={15} color={colors.accent} />
            <Text style={styles.newVersionTitle}>{`Доступна версия ${latest.version}`}</Text>
          </View>
          {latest.notes.length > 0 ? (
            <Text style={styles.notes} numberOfLines={8}>
              {latest.notes}
            </Text>
          ) : null}
          <Text style={styles.hint}>
            APK откроется на странице релиза в браузере. Установку подтвердит система —
            приложение само ничего не устанавливает.
          </Text>
          <Button label="Открыть страницу релиза" variant="primary" fullWidth onPress={openRelease} />
        </View>
      ) : null}

      {status === 'error' && error ? (
        <View style={styles.errorRow}>
          <Icon name="alert" size={14} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>{describeState(status, checkedAt)}</Text>
        <Pressable
          onPress={() => {
            void check(true);
          }}
          disabled={status === 'checking'}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ disabled: status === 'checking' }}>
          <Text style={[styles.checkLink, status === 'checking' && styles.checkLinkDisabled]}>
            {status === 'checking' ? 'Проверяем…' : 'Проверить'}
          </Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="link"
        onPress={() => {
          void Linking.openURL(RELEASES_URL);
        }}>
        <Text style={styles.link}>Все релизы на GitHub →</Text>
      </Pressable>
    </View>
  );
};

function describeState(status: string, checkedAt: number | null): string {
  if (status === 'checking') {
    return 'Смотрим релизы на GitHub';
  }
  if (status === 'available') {
    return 'Установлена не последняя версия';
  }
  if (status === 'upToDate') {
    return checkedAt
      ? `Обновлений нет · проверено ${formatCheckedAt(checkedAt)}`
      : 'Установлена последняя версия';
  }
  return 'Обновления проверяются раз в сутки';
}

function formatCheckedAt(timestamp: number): string {
  const date = new Date(timestamp);
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay
    ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ru-RU');
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: spacing.xxs,
  },
  name: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  version: {
    ...typography.caption,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  newVersion: {
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  newVersionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  newVersionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flex: 1,
  },
  notes: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  footerText: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
  checkLink: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '700',
  },
  checkLinkDisabled: {
    color: colors.textMuted,
  },
  link: {
    ...typography.caption,
    color: colors.accent,
  },
});

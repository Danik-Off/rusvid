import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAppContainer } from '../../app/container/AppContainer';
import type { RootStackParamList } from '../../app/navigation/types';
import type { ProviderId } from '../../core/model/media';
import type { VideoProvider } from '../../core/provider/VideoProvider';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { colors, hitSlop, radius, spacing, typography } from '../../ui/theme';
import { useSettingsStore } from './settingsStore';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const settings = useSettingsStore((state) => state.settings);
  const signedIn = useSettingsStore((state) => state.signedIn);
  const toggleProvider = useSettingsStore((state) => state.toggleProvider);
  const setHistoryEnabled = useSettingsStore((state) => state.setHistoryEnabled);
  const setPreferNativePlayer = useSettingsStore((state) => state.setPreferNativePlayer);
  const signOut = useSettingsStore((state) => state.signOut);
  const verifyAllSessions = useSettingsStore((state) => state.verifyAllSessions);

  const providers = getAppContainer().registry.all();

  // Сессия на сайте могла истечь между запусками — сверяемся при открытии
  // экрана, чтобы не показывать «Вход выполнен» для протухшей сессии.
  useEffect(() => {
    void verifyAllSessions();
  }, [verifyAllSessions]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.screenTitle}>Настройки</Text>

        <Section title="Платформы" hint="Выключенные не участвуют в поиске и ленте">
          {providers.map((provider) => (
            <ProviderRow
              key={provider.meta.id}
              provider={provider}
              enabled={settings.enabledProviders.includes(provider.meta.id)}
              signedIn={signedIn[provider.meta.id] === true}
              onToggle={() => {
                void toggleProvider(provider.meta.id);
              }}
              onSignIn={() =>
                navigation.navigate('Auth', { providerId: provider.meta.id as ProviderId })
              }
              onSignOut={() => {
                void signOut(provider.meta.id);
              }}
            />
          ))}
        </Section>

        <Section title="Проверка">
          <Pressable
            style={styles.navRow}
            accessibilityRole="button"
            onPress={() => navigation.navigate('Diagnostics')}>
            <View style={styles.navIcon}>
              <Icon name="refresh" size={18} color={colors.accent} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Проверить платформы</Text>
              <Text style={styles.rowHint}>
                Живые запросы к API каждой платформы: поиск, лента, категории, ссылка на видео
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textMuted} />
          </Pressable>
        </Section>

        <Section title="Воспроизведение">
          <ToggleRow
            title="Нативный плеер"
            hint="Играть HLS напрямую там, где платформа отдаёт поток. Выключите, если видео не запускается — всё пойдёт через веб-плеер платформы."
            value={settings.preferNativePlayer}
            onChange={(value) => {
              void setPreferNativePlayer(value);
            }}
          />
        </Section>

        <Section title="Приватность">
          <ToggleRow
            title="История просмотров"
            hint="Хранится только на устройстве и никуда не отправляется."
            value={settings.historyEnabled}
            onChange={(value) => {
              void setHistoryEnabled(value);
            }}
          />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
};

interface ProviderRowProps {
  readonly provider: VideoProvider;
  readonly enabled: boolean;
  readonly signedIn: boolean;
  readonly onToggle: () => void;
  readonly onSignIn: () => void;
  readonly onSignOut: () => void;
}

/**
 * Карточка платформы: переключатель + блок авторизации.
 * Вид блока определяется `provider.auth`, а не именем платформы —
 * добавление платформы с OAuth не потребует правок этого файла.
 */
const ProviderRow: React.FC<ProviderRowProps> = ({
  provider,
  enabled,
  signedIn,
  onToggle,
  onSignIn,
  onSignOut,
}) => {
  const { auth, meta } = provider;

  return (
    <View style={styles.providerCard}>
      <View style={styles.row}>
        <View style={[styles.providerDot, { backgroundColor: meta.accentColor }]} />
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{meta.title}</Text>
          <Text style={styles.rowHint}>{meta.description}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ true: meta.accentColor, false: colors.border }}
          thumbColor={colors.textPrimary}
          hitSlop={hitSlop}
        />
      </View>

      {auth.kind === 'none' ? (
        <View style={styles.authRow}>
          <Icon name="check" size={14} color={colors.success} />
          <Text style={styles.authText}>{auth.reason}</Text>
        </View>
      ) : signedIn ? (
        <View style={styles.authRow}>
          <Icon name="check" size={14} color={colors.success} />
          <Text style={styles.authText}>Вход выполнен</Text>
          <Button label="Выйти" variant="danger" onPress={onSignOut} style={styles.authButton} />
        </View>
      ) : (
        <View style={styles.authRow}>
          <Icon name="lock" size={14} color={colors.warning} />
          <Text style={styles.authText}>{auth.benefit}</Text>
          <Button label="Войти" variant="primary" onPress={onSignIn} style={styles.authButton} />
        </View>
      )}
    </View>
  );
};

const Section: React.FC<{
  readonly title: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}> = ({ title, hint, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    <View style={styles.sectionBody}>{children}</View>
  </View>
);

interface ToggleRowProps {
  readonly title: string;
  readonly hint: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({ title, hint, value, onChange }) => (
  <View style={styles.row}>
    <View style={styles.rowText}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowHint}>{hint}</Text>
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: colors.accent, false: colors.border }}
      thumbColor={colors.textPrimary}
      hitSlop={hitSlop}
    />
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.xl,
  },
  screenTitle: {
    ...typography.display,
    color: colors.textPrimary,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.overline,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -spacing.xs,
  },
  sectionBody: {
    gap: spacing.sm,
  },
  providerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  navIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowText: {
    flex: 1,
    gap: spacing.xxs,
  },
  rowTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  rowHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  authRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  authText: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  authButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
});

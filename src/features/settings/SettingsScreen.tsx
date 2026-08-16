import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAppContainer } from '../../app/container/AppContainer';
import { LEGAL_SHORT_NOTICE } from '../../core/legal/legalText';
import type { RootStackParamList } from '../../app/navigation/types';
import type { ProviderId } from '../../core/model/media';
import type { VideoProvider } from '../../core/provider/VideoProvider';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { Sheet, SheetRow } from '../../ui/components/Sheet';
import { colors, hitSlop, radius, spacing, typography } from '../../ui/theme';
import {
  PLAYBACK_RATES,
  QUALITY_PREFERENCES,
  type AppSettings,
  type QualityPreference,
} from '../../data/settings/AppSettings';
import { useBottomSpace } from '../player/usePlayerLayout';
import { UpdateCard } from '../updates/UpdateCard';
import { useSettingsStore } from './settingsStore';

const SEEK_STEPS = [5, 10, 15, 30];

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const settings = useSettingsStore((state) => state.settings);
  const signedIn = useSettingsStore((state) => state.signedIn);
  const toggleProvider = useSettingsStore((state) => state.toggleProvider);
  const update = useSettingsStore((state) => state.update);
  const signOut = useSettingsStore((state) => state.signOut);
  const verifyAllSessions = useSettingsStore((state) => state.verifyAllSessions);
  const bottomSpace = useBottomSpace();
  const [choice, setChoice] = useState<'rate' | 'quality' | 'seekStep' | null>(null);

  const providers = getAppContainer().registry.all();

  const set = <K extends keyof AppSettings>(key: K) =>
    (value: AppSettings[K]) => {
      void update({ [key]: value } as Partial<AppSettings>);
    };

  // Сессия на сайте могла истечь между запусками — сверяемся при открытии
  // экрана, чтобы не показывать «Вход выполнен» для протухшей сессии.
  useEffect(() => {
    void verifyAllSessions();
  }, [verifyAllSessions]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomSpace + spacing.xl }]}>
        <Text style={styles.screenTitle}>Настройки</Text>

        <Section
          title="Платформы"
          hint="Выключенные не участвуют в поиске и ленте. Приложение неофициальное: оно не связано с платформами, а их названия принадлежат их владельцам.">
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
                // Выход ходит в системное хранилище cookie и может не
                // получиться. Молчаливый `void` здесь означал бы «кнопка
                // нажата, ничего не произошло, никто не сказал почему».
                void signOut(provider.meta.id).catch((error: unknown) => {
                  Alert.alert(
                    'Не удалось выйти',
                    error instanceof Error ? error.message : 'Неизвестная ошибка',
                  );
                });
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
            onChange={set('preferNativePlayer')}
          />
          <ToggleRow
            title="Продолжать с места остановки"
            hint="Открытое повторно видео стартует с той секунды, на которой вы его закрыли."
            value={settings.resumePlayback}
            onChange={set('resumePlayback')}
          />
          <ToggleRow
            title="Автовоспроизведение"
            hint="После ролика запускается следующий из списка, откуда вы его открыли."
            value={settings.autoplayNext}
            onChange={set('autoplayNext')}
          />
          <ChoiceRow
            title="Скорость по умолчанию"
            value={settings.defaultRate === 1 ? 'Обычная' : `${settings.defaultRate}×`}
            onPress={() => setChoice('rate')}
          />
          <ChoiceRow
            title="Максимальное качество"
            value={settings.preferredQuality === 'auto' ? 'Авто' : `${settings.preferredQuality}p`}
            onPress={() => setChoice('quality')}
          />
          <ChoiceRow
            title="Шаг перемотки"
            value={`${settings.seekStepSec} сек`}
            onPress={() => setChoice('seekStep')}
          />
          <ToggleRow
            title="Жесты в плеере"
            hint="Двойной тап — перемотка, удержание — ускорение, вертикальный свайп в полноэкранном режиме — громкость и затемнение."
            value={settings.playerGestures}
            onChange={set('playerGestures')}
          />
        </Section>

        <Section title="Фон и окно">
          <ToggleRow
            title="Фоновое воспроизведение"
            hint="Звук продолжает идти после сворачивания приложения, в шторке появляется уведомление с управлением."
            value={settings.backgroundPlayback}
            onChange={set('backgroundPlayback')}
          />
          <ToggleRow
            title="Картинка в картинке"
            hint="При выходе из приложения видео сворачивается в плавающее окно поверх других приложений."
            value={settings.pictureInPicture}
            onChange={set('pictureInPicture')}
          />
        </Section>

        <Section title="Приватность">
          <ToggleRow
            title="История просмотров"
            hint="Хранится только на устройстве и никуда не отправляется. Без неё не работает продолжение просмотра."
            value={settings.historyEnabled}
            onChange={set('historyEnabled')}
          />
        </Section>

        <Section title="О приложении">
          <Pressable
            style={styles.navRow}
            accessibilityRole="button"
            onPress={() => navigation.navigate('Legal')}>
            <View style={styles.navIcon}>
              <Icon name="lock" size={18} color={colors.accent} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Правовая информация</Text>
              <Text style={styles.rowHint}>
                Условия использования, отказ от ответственности, обращения правообладателей
              </Text>
            </View>
            <Icon name="chevronRight" size={18} color={colors.textMuted} />
          </Pressable>
        </Section>

        <Section title="О приложении">
          <UpdateCard />
        </Section>

        <View style={styles.about}>
          <Logo size={56} />
          <Text style={styles.aboutName}>RusVid</Text>
          <Text style={styles.aboutTagline}>Rutube · VK Видео · Sasflix</Text>
          <Text style={styles.aboutLegal}>{LEGAL_SHORT_NOTICE}</Text>
        </View>
      </ScrollView>

      <Sheet visible={choice === 'rate'} title="Скорость по умолчанию" onClose={() => setChoice(null)}>
        {PLAYBACK_RATES.map((rate) => (
          <SheetRow
            key={rate}
            label={rate === 1 ? 'Обычная' : `${rate}×`}
            selected={settings.defaultRate === rate}
            onPress={() => {
              set('defaultRate')(rate);
              setChoice(null);
            }}
          />
        ))}
      </Sheet>

      <Sheet visible={choice === 'quality'} title="Максимальное качество" onClose={() => setChoice(null)}>
        {QUALITY_PREFERENCES.map((quality) => (
          <SheetRow
            key={String(quality)}
            label={quality === 'auto' ? 'Авто' : `${quality}p`}
            value={quality === 'auto' ? 'по скорости сети' : undefined}
            selected={settings.preferredQuality === quality}
            onPress={() => {
              set('preferredQuality')(quality as QualityPreference);
              setChoice(null);
            }}
          />
        ))}
      </Sheet>

      <Sheet visible={choice === 'seekStep'} title="Шаг перемотки" onClose={() => setChoice(null)}>
        {SEEK_STEPS.map((step) => (
          <SheetRow
            key={step}
            label={`${step} секунд`}
            selected={settings.seekStepSec === step}
            onPress={() => {
              set('seekStepSec')(step);
              setChoice(null);
            }}
          />
        ))}
      </Sheet>
    </SafeAreaView>
  );
};

/** Строка настройки с выбором из списка — значение справа, выбор в шторке. */
const ChoiceRow: React.FC<{
  readonly title: string;
  readonly value: string;
  readonly onPress: () => void;
}> = ({ title, value, onPress }) => (
  <Pressable style={styles.navRow} accessibilityRole="button" onPress={onPress}>
    <View style={styles.rowText}>
      <Text style={styles.rowTitle}>{title}</Text>
    </View>
    <Text style={styles.rowValue}>{value}</Text>
    <Icon name="chevronRight" size={18} color={colors.textMuted} />
  </Pressable>
);

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
  rowValue: {
    ...typography.caption,
    color: colors.textMuted,
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
  about: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  aboutName: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  aboutTagline: {
    ...typography.caption,
    color: colors.textMuted,
  },
  aboutLegal: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});

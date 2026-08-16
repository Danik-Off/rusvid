/**
 * Универсальный экран входа.
 *
 * Экран не знает ничего про конкретные платформы: он читает `provider.auth`
 * и работает по спецификации — OAuth-редирект (`OAuthSpec`) или вход на
 * сайте платформы с подхватом cookie-сессии (`WebLoginSpec`).
 * Появится четвёртая платформа — этот файл не изменится.
 *
 * Пароль пользователя в обоих вариантах вводится на странице платформы
 * внутри WebView и через наш код не проходит.
 */

import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { getAppContainer } from '../../app/container/AppContainer';
import { LEGAL_SHORT_NOTICE } from '../../core/legal/legalText';
import type { AuthScreenProps } from '../../app/navigation/types';
import type { ProviderId } from '../../core/model/media';
import type { OAuthSpec, WebLoginSpec } from '../../core/provider/auth';
import { MOBILE_USER_AGENT } from '../../providers/shared/userAgent';
import { Button } from '../../ui/components/Button';
import { Icon } from '../../ui/components/Icon';
import { ProviderBadge } from '../../ui/components/ProviderBadge';
import { LoadingView } from '../../ui/components/StateViews';
import { colors, radius, spacing, typography } from '../../ui/theme';
import { useSettingsStore } from '../settings/settingsStore';

export const AuthScreen: React.FC<AuthScreenProps> = ({ route }) => {
  const { providerId } = route.params;
  const provider = getAppContainer().registry.get(providerId);
  const auth = provider.auth;

  if (auth.kind === 'oauth') {
    return <OAuthFlow providerId={providerId} spec={auth} />;
  }
  if (auth.kind === 'webLogin') {
    return <WebLoginFlow providerId={providerId} spec={auth} />;
  }
  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <View style={styles.centered}>
        <Text style={styles.paragraph}>{auth.reason}</Text>
      </View>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Вариант 1: вход на сайте платформы, сессия живёт в системных cookie
// ---------------------------------------------------------------------------

interface FlowProps<TSpec> {
  readonly providerId: ProviderId;
  readonly spec: TSpec;
}

const WebLoginFlow: React.FC<FlowProps<WebLoginSpec>> = ({ providerId, spec }) => {
  const navigation = useNavigation();
  const provider = getAppContainer().registry.get(providerId);
  const verifySession = useSettingsStore((state) => state.verifySession);

  const [browserOpen, setBrowserOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Автоматически определить момент входа нельзя: у платформ нет редиректа,
   * по которому это видно, — форма живёт внутри SPA. Поэтому проверяем
   * сессию живым запросом: сами после каждой навигации и по кнопке.
   */
  const checkSession = useCallback(
    async (silent: boolean) => {
      setChecking(true);
      const active = await verifySession(providerId);
      setChecking(false);
      if (active) {
        setBrowserOpen(false);
        navigation.goBack();
      } else if (!silent) {
        setError('Сессия ещё не появилась. Завершите вход на сайте и попробуйте снова.');
      }
    },
    [navigation, providerId, verifySession],
  );

  if (browserOpen) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.webViewBar}>
          <Text style={styles.webViewTitle} numberOfLines={1}>
            {provider.meta.title}
          </Text>
          <Button
            label={checking ? 'Проверяем…' : 'Я вошёл'}
            variant="primary"
            loading={checking}
            onPress={() => {
              void checkSession(false);
            }}
            style={styles.webViewButton}
          />
          <Button label="Закрыть" variant="ghost" onPress={() => setBrowserOpen(false)} />
        </View>
        <WebView
          source={{ uri: spec.loginUrl }}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled
          // Сессия должна остаться в системном хранилище cookie: именно из
          // него её берут обычные запросы приложения после входа.
          sharedCookiesEnabled
          userAgent={MOBILE_USER_AGENT}
          onNavigationStateChange={(event: WebViewNavigation): void => {
            // Дешёвая эвристика: после успешного входа сайты уводят
            // пользователя с формы, так что проверяем сессию тихо.
            if (!event.loading) {
              void checkSession(true);
            }
          }}
          onError={() => setError('Не удалось открыть сайт платформы')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Hero title={provider.meta.title} badge={provider.meta.badge} color={provider.meta.accentColor}>
          {spec.benefit}
        </Hero>

        <View style={styles.card}>
          <View style={styles.noteRow}>
            <Icon name="lock" size={16} color={colors.success} />
            <Text style={styles.note}>
              Вход выполняется на сайте платформы. Приложение не видит ваш пароль —
              оно узнаёт только о том, что сессия появилась.
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Как войти</Text>
          <Text style={styles.hint}>{spec.instructions}</Text>
        </View>

        {error ? <ErrorBox message={error} /> : null}

        <Button
          label="Открыть сайт и войти"
          icon="external"
          variant="primary"
          fullWidth
          onPress={() => {
            setError(null);
            setBrowserOpen(true);
          }}
        />

        <Button
          label={checking ? 'Проверяем…' : 'Проверить сессию'}
          icon="refresh"
          fullWidth
          loading={checking}
          onPress={() => {
            void checkSession(false);
          }}
        />

        {spec.logoutUrl ? (
          <Text
            style={styles.link}
            accessibilityRole="link"
            onPress={() => {
              void Linking.openURL(spec.logoutUrl as string);
            }}>
            Выйти на сайте платформы →
          </Text>
        ) : null}

        <LegalFootnote />
      </ScrollView>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Вариант 2: OAuth-редирект с токеном во фрагменте URL
// ---------------------------------------------------------------------------

const OAuthFlow: React.FC<FlowProps<OAuthSpec>> = ({ providerId, spec }) => {
  const navigation = useNavigation();
  const provider = getAppContainer().registry.get(providerId);

  const storedClientId = useSettingsStore((state) => state.clientIds[providerId] ?? '');
  const setClientId = useSettingsStore((state) => state.setClientId);
  const setToken = useSettingsStore((state) => state.setToken);

  const [clientIdDraft, setClientIdDraft] = useState(storedClientId);
  const [manualToken, setManualToken] = useState('');
  const [browserOpen, setBrowserOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = useCallback(
    async (token: string) => {
      setBusy(true);
      await setToken(providerId, token);
      setBusy(false);
      setBrowserOpen(false);
      navigation.goBack();
    },
    [navigation, providerId, setToken],
  );

  const canStart = !spec.requiresClientId || clientIdDraft.trim().length > 0;

  if (browserOpen) {
    return (
      <SafeAreaView style={styles.screen} edges={['bottom']}>
        <View style={styles.webViewBar}>
          <Text style={styles.webViewTitle} numberOfLines={1}>
            Вход в {provider.meta.title}
          </Text>
          <Button label="Отмена" variant="ghost" onPress={() => setBrowserOpen(false)} />
        </View>
        {busy ? (
          <LoadingView label="Сохраняем токен…" />
        ) : (
          <WebView
            source={{ uri: spec.buildAuthorizeUrl(clientIdDraft.trim()) }}
            style={styles.webView}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            onNavigationStateChange={(event: WebViewNavigation): void => {
              const failure = spec.extractError(event.url);
              if (failure) {
                setBrowserOpen(false);
                setError(
                  failure.startsWith('access_denied')
                    ? 'Вы отклонили доступ. Без него платформа не отдаёт видео.'
                    : `Платформа отклонила вход: ${failure}`,
                );
                return;
              }
              const token = spec.extractToken(event.url);
              if (token) {
                void finish(token);
              }
            }}
            onError={() => setError('Не удалось открыть страницу входа')}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Hero title={provider.meta.title} badge={provider.meta.badge} color={provider.meta.accentColor}>
          {spec.benefit}
        </Hero>

        <View style={styles.card}>
          <View style={styles.noteRow}>
            <Icon name="lock" size={16} color={colors.success} />
            <Text style={styles.note}>{spec.scopeDescription}</Text>
          </View>
        </View>

        {spec.requiresClientId ? (
          <View style={styles.card}>
            <Text style={styles.label}>{spec.clientIdLabel}</Text>
            <Text style={styles.hint}>
              Платформа выдаёт токены только зарегистрированным приложениям. Создайте
              своё (тип «Standalone») и вставьте его ID — он сохранится, повторно
              вводить не придётся.
            </Text>
            <TextInput
              style={styles.input}
              value={clientIdDraft}
              onChangeText={setClientIdDraft}
              onBlur={() => {
                void setClientId(providerId, clientIdDraft);
              }}
              placeholder={spec.clientIdPlaceholder}
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              accessibilityLabel={spec.clientIdLabel}
            />
            <Text
              style={styles.link}
              accessibilityRole="link"
              onPress={() => {
                void Linking.openURL(spec.helpUrl);
              }}>
              Открыть список моих приложений →
            </Text>
          </View>
        ) : null}

        {error ? <ErrorBox message={error} /> : null}

        <Button
          label="Войти через браузер"
          icon="external"
          variant="primary"
          fullWidth
          disabled={!canStart}
          onPress={() => {
            setError(null);
            void setClientId(providerId, clientIdDraft);
            setBrowserOpen(true);
          }}
        />

        <View style={styles.card}>
          <Text style={styles.label}>Уже есть готовый токен</Text>
          <Text style={styles.hint}>
            Запасной путь, если вход через браузер недоступен: вставьте access token
            с правом на видео вручную.
          </Text>
          <TextInput
            style={styles.input}
            value={manualToken}
            onChangeText={setManualToken}
            placeholder="vk1.a.…"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            accessibilityLabel="Access token"
          />
          <Button
            label="Сохранить токен"
            disabled={manualToken.trim().length === 0}
            onPress={() => {
              void finish(manualToken.trim());
            }}
          />
        </View>

        <LegalFootnote />
      </ScrollView>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------

const Hero: React.FC<{
  readonly title: string;
  readonly badge: string;
  readonly color: string;
  readonly children: React.ReactNode;
}> = ({ title, badge, color, children }) => (
  <View style={styles.hero}>
    <ProviderBadge label={badge} color={color} size="md" />
    <Text style={styles.heroTitle}>{title}</Text>
    <Text style={styles.paragraph}>{children}</Text>
  </View>
);

/**
 * Напоминание о том, чей это клиент, — именно на экране входа.
 *
 * Здесь пользователь передаёт приложению доступ к своей учётной записи, и это
 * единственное место, где он мог бы принять его за официальный клиент платформы.
 */
const LegalFootnote: React.FC = () => <Text style={styles.hint}>{LEGAL_SHORT_NOTICE}</Text>;

const ErrorBox: React.FC<{ readonly message: string }> = ({ message }) => (
  <View style={styles.errorBox}>
    <Icon name="alert" size={16} color={colors.danger} />
    <Text style={styles.errorText}>{message}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  hero: {
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  heroTitle: {
    ...typography.display,
    color: colors.textPrimary,
  },
  paragraph: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  noteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
  label: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  link: {
    ...typography.caption,
    color: colors.accent,
  },
  errorBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    flex: 1,
  },
  webViewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSunken,
  },
  webViewTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flex: 1,
  },
  webViewButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  webView: {
    flex: 1,
    backgroundColor: colors.white,
  },
});

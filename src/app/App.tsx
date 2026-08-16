import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LEGAL_VERSION } from '../core/legal/legalText';
import { LoadingView } from '../ui/components/StateViews';
import { colors } from '../ui/theme';
import { DisclaimerScreen } from '../features/legal/DisclaimerScreen';
import { useLibraryStore } from '../features/library/libraryStore';
import { PlayerOverlay } from '../features/player/PlayerOverlay';
import { useSettingsStore } from '../features/settings/settingsStore';
import { RootNavigator } from './navigation/RootNavigator';

/**
 * Корневой компонент.
 *
 * До гидратации настроек и библиотеки экраны не рендерятся: иначе лента
 * успела бы сходить в сеть со значениями по умолчанию, а через мгновение —
 * ещё раз, уже с настройками пользователя.
 *
 * Пока текущая редакция правовых условий не принята, вместо всего интерфейса
 * показывается `DisclaimerScreen`: до согласия приложение не делает ни одного
 * запроса к платформам.
 *
 * Плеер смонтирован рядом с навигатором, а не внутри него: он переживает
 * любые переходы между экранами и вкладками.
 */
const App: React.FC = () => {
  const hydrateSettings = useSettingsStore((state) => state.hydrate);
  const hydrateLibrary = useLibraryStore((state) => state.hydrate);
  const acceptedLegalVersion = useSettingsStore((state) => state.settings.acceptedLegalVersion);
  const [ready, setReady] = useState(false);

  const accepted = acceptedLegalVersion >= LEGAL_VERSION;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.all([hydrateSettings(), hydrateLibrary()]);
      if (!cancelled) {
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateSettings, hydrateLibrary]);

  // Проверка сессий требует сети — не задерживаем показ интерфейса ради неё и
  // не трогаем платформы до того, как пользователь принял условия: до согласия
  // приложение не должно сходить в сеть ни разу.
  useEffect(() => {
    if (ready && accepted) {
      void useSettingsStore.getState().verifyAllSessions();
    }
  }, [ready, accepted]);

  return (
    <SafeAreaProvider>
      {/* Android 15+ рисует приложение edge-to-edge, фон статус-бара задаёт тема. */}
      <StatusBar barStyle="light-content" />
      {!ready ? (
        <View style={styles.splash}>
          <LoadingView label="Загружаем настройки…" />
        </View>
      ) : !accepted ? (
        <View style={styles.root}>
          <DisclaimerScreen />
        </View>
      ) : (
        <View style={styles.root}>
          <RootNavigator />
          <PlayerOverlay />
        </View>
      )}
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  splash: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default App;

import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoadingView } from '../ui/components/StateViews';
import { colors } from '../ui/theme';
import { useLibraryStore } from '../features/library/libraryStore';
import { useSettingsStore } from '../features/settings/settingsStore';
import { RootNavigator } from './navigation/RootNavigator';

/**
 * Корневой компонент.
 *
 * До гидратации настроек и библиотеки экраны не рендерятся: иначе лента
 * успела бы сходить в сеть со значениями по умолчанию, а через мгновение —
 * ещё раз, уже с настройками пользователя.
 */
const App: React.FC = () => {
  const hydrateSettings = useSettingsStore((state) => state.hydrate);
  const hydrateLibrary = useLibraryStore((state) => state.hydrate);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.all([hydrateSettings(), hydrateLibrary()]);
      if (!cancelled) {
        setReady(true);
      }
      // Проверка сессий требует сети — не задерживаем показ интерфейса ради неё.
      void useSettingsStore.getState().verifyAllSessions();
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrateSettings, hydrateLibrary]);

  return (
    <SafeAreaProvider>
      {/* Android 15+ рисует приложение edge-to-edge, фон статус-бара задаёт тема. */}
      <StatusBar barStyle="light-content" />
      {ready ? (
        <RootNavigator />
      ) : (
        <View style={styles.splash}>
          <LoadingView label="Загружаем настройки…" />
        </View>
      )}
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default App;

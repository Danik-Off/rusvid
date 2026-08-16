import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAppContainer } from '../../app/container/AppContainer';
import type { RootStackParamList } from '../../app/navigation/types';
import type { VideoSummary } from '../../core/model/media';
import { ChipRow, type ChipOption } from '../../ui/components/ChipRow';
import { VideoList } from '../../ui/components/VideoList';
import { colors, spacing, typography } from '../../ui/theme';
import { useLibraryStore } from '../library/libraryStore';
import { usePlayerStore } from '../player/playerStore';
import { useBottomSpace } from '../player/usePlayerLayout';
import { useSettingsStore } from '../settings/settingsStore';
import { useFeedStore, type FeedScope } from './feedStore';

type Navigation = NativeStackNavigationProp<RootStackParamList>;

export const FeedScreen: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const feed = useFeedStore();
  const refresh = useFeedStore((state) => state.refresh);
  const enabledProviders = useSettingsStore((state) => state.settings.enabledProviders);
  const settingsHydrated = useSettingsStore((state) => state.hydrated);
  const signedIn = useSettingsStore((state) => state.signedIn);
  const signedInKey = Object.entries(signedIn)
    .filter(([, value]) => value)
    .map(([key]) => key)
    .join(',');
  const progressOf = useLibraryStore((state) => state.progressOf);
  const isFavorite = useLibraryStore((state) => state.isFavorite);
  const openPlayer = usePlayerStore((state) => state.open);
  const bottomSpace = useBottomSpace();

  const isIdle = feed.status === 'idle';

  // Первая загрузка — только после того, как известно, какие платформы включены.
  useEffect(() => {
    if (settingsHydrated && isIdle) {
      void refresh();
    }
  }, [settingsHydrated, isIdle, refresh]);

  // Смена набора платформ в настройках должна отражаться в ленте сразу.
  const providersKey = enabledProviders.join(',');
  useEffect(() => {
    if (settingsHydrated && !isIdle) {
      void refresh();
    }
    // isIdle намеренно не в зависимостях: перезапуск нужен только на смену
    // набора платформ, а не на каждый переход ленты в состояние загрузки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providersKey, settingsHydrated, refresh]);

  const scopeOptions = useMemo<ChipOption[]>(() => {
    const { registry } = getAppContainer();
    const active = registry.active(enabledProviders);
    const options: ChipOption[] = [{ id: 'all', label: 'Все платформы' }];

    // «Подписки» показываем, только если хоть где-то выполнен вход:
    // иначе вкладка гарантированно пустая.
    if (active.some((provider) => provider.capabilities.subscriptionsFeed && provider.isSignedIn())) {
      options.push({ id: 'subscriptions', label: 'Подписки' });
    }

    for (const provider of active) {
      if (provider.capabilities.trendingFeed) {
        options.push({
          id: provider.meta.id,
          label: provider.meta.title,
          color: provider.meta.accentColor,
        });
      }
    }
    return options;
    // signedInKey нужен, чтобы вкладка «Подписки» появилась сразу после входа.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledProviders, signedInKey]);

  const categoryOptions = useMemo<ChipOption[]>(
    () => [
      { id: 'all', label: 'Все категории' },
      ...feed.categories.map((category) => ({ id: category.id, label: category.title })),
    ],
    [feed.categories],
  );

  // Вместе с видео плееру отдаётся вся лента: она становится очередью «Далее»,
  // и после ролика автоматически идёт следующий, а не пустой экран.
  const openVideo = (video: VideoSummary) => openPlayer(video, feed.items);

  const header = (
    <View style={styles.header}>
      <Text style={styles.screenTitle}>Лента</Text>
      <ChipRow
        options={scopeOptions}
        selectedId={feed.scope}
        showDots
        onSelect={(id) => {
          void feed.setScope(id as FeedScope);
        }}
      />
      {feed.scope !== 'all' && feed.scope !== 'subscriptions' && feed.categories.length > 0 ? (
        <ChipRow
          options={categoryOptions}
          selectedId={feed.categoryId ?? 'all'}
          onSelect={(id) => {
            void feed.setCategory(id === 'all' ? null : id);
          }}
        />
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <VideoList
        items={feed.items}
        loading={feed.status === 'loading'}
        loadingMore={feed.status === 'loadingMore'}
        error={feed.status === 'error' ? feed.error : null}
        failures={feed.failures}
        header={header}
        emptyIcon="play"
        emptyTitle="Лента пуста"
        emptyHint="Проверьте, что нужные платформы включены в настройках"
        emptyActionLabel="Открыть настройки"
        onEmptyAction={() => navigation.navigate('Tabs', { screen: 'Settings' })}
        onPressItem={openVideo}
        onEndReached={() => {
          void feed.loadMore();
        }}
        onRefresh={() => {
          void refresh();
        }}
        onRetry={() => {
          void refresh();
        }}
        progressOf={progressOf}
        isFavorite={isFavorite}
        bottomSpace={bottomSpace}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: spacing.sm,
  },
  screenTitle: {
    ...typography.display,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
});

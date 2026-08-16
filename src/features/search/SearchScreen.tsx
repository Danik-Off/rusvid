import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAppContainer } from '../../app/container/AppContainer';
import type { VideoSummary } from '../../core/model/media';
import { Icon } from '../../ui/components/Icon';
import { VideoList } from '../../ui/components/VideoList';
import { colors, hitSlop, radius, spacing, typography } from '../../ui/theme';
import { useLibraryMarks, useLibraryStore } from '../library/libraryStore';
import { usePlayerStore } from '../player/playerStore';
import { useBottomSpace } from '../player/usePlayerLayout';
import { useSettingsStore } from '../settings/settingsStore';
import { useSearchHistoryStore } from './searchHistory';
import { useSearchStore } from './searchStore';

export const SearchScreen: React.FC = () => {
  const search = useSearchStore();
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const enabledProviders = useSettingsStore((state) => state.settings.enabledProviders);
  const marks = useLibraryMarks();
  const toggleFavorite = useLibraryStore((state) => state.toggleFavorite);
  const openPlayer = usePlayerStore((state) => state.open);
  const bottomSpace = useBottomSpace();

  /** Платформы, которые реально будут опрошены — их и обещаем пользователю. */
  const searchable = useMemo(
    () =>
      getAppContainer()
        .registry.active(enabledProviders)
        .filter((provider) => provider.capabilities.search),
    [enabledProviders],
  );

  const recent = useSearchHistoryStore((state) => state.queries);
  const hydrateRecent = useSearchHistoryStore((state) => state.hydrate);
  const rememberQuery = useSearchHistoryStore((state) => state.remember);
  const forgetQuery = useSearchHistoryStore((state) => state.forget);
  const hydratedRecent = useSearchHistoryStore((state) => state.hydrated);

  useEffect(() => {
    if (!hydratedRecent) {
      void hydrateRecent();
    }
  }, [hydratedRecent, hydrateRecent]);

  const idle = search.status === 'idle';

  const openVideo = (video: VideoSummary) => openPlayer(video, search.items);

  const run = (query: string) => {
    setDraft(query);
    void rememberQuery(query);
    void search.submit(query);
  };

  const submit = () => run(draft);

  const header = (
    <View style={styles.header}>
      <Text style={styles.screenTitle}>Поиск</Text>
      <View style={[styles.searchBar, focused && styles.searchBarFocused]}>
        <Icon name="search" size={18} color={focused ? colors.accent : colors.textMuted} />
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Искать во всех платформах"
          placeholderTextColor={colors.textMuted}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Поисковый запрос"
        />
        {draft.length > 0 ? (
          <Pressable
            hitSlop={hitSlop}
            onPress={() => {
              setDraft('');
              search.reset();
            }}
            accessibilityRole="button"
            accessibilityLabel="Очистить запрос">
            <Icon name="close" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {idle && recent.length > 0 ? (
        <View style={styles.recent}>
          <View style={styles.recentHead}>
            <Icon name="clock" size={14} color={colors.textMuted} />
            <Text style={styles.recentTitle}>Недавние запросы</Text>
          </View>
          <View style={styles.recentList}>
            {recent.map((query) => (
              <View key={query} style={styles.recentChip}>
                <Pressable
                  hitSlop={hitSlop}
                  onPress={() => run(query)}
                  accessibilityRole="button"
                  accessibilityLabel={`Искать «${query}»`}>
                  <Text style={styles.recentLabel} numberOfLines={1}>
                    {query}
                  </Text>
                </Pressable>
                <Pressable
                  hitSlop={hitSlop}
                  onPress={() => {
                    void forgetQuery(query);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Убрать «${query}» из недавних`}>
                  <Icon name="close" size={13} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {searchable.length > 0 ? (
        <View style={styles.sourceRow}>
          {searchable.map((provider) => (
            <View key={provider.meta.id} style={styles.sourceTag}>
              <View style={[styles.sourceDot, { backgroundColor: provider.meta.accentColor }]} />
              <Text style={styles.sourceLabel}>{provider.meta.title}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <VideoList
        items={search.items}
        loading={search.status === 'loading'}
        loadingMore={search.status === 'loadingMore'}
        error={search.status === 'error' ? search.error : null}
        errorCode={search.errorCode ?? undefined}
        failures={search.failures}
        header={header}
        emptyIcon="search"
        emptyTitle={idle ? 'Что ищем?' : 'Ничего не найдено'}
        emptyHint={
          idle
            ? searchable.length > 0
              ? 'Запрос уходит во все платформы сразу, результаты перемешиваются'
              : 'Все платформы выключены или не настроены — загляните в настройки'
            : 'Попробуйте другой запрос или включите больше платформ'
        }
        onPressItem={openVideo}
        onToggleFavorite={toggleFavorite}
        onEndReached={() => {
          void search.loadMore();
        }}
        onRetry={() => {
          void search.retry();
        }}
        progressOf={marks.progressOf}
        isFavorite={marks.isFavorite}
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
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  screenTitle: {
    ...typography.display,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchBarFocused: {
    borderColor: colors.accent,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.md,
  },
  recent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  recentTitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  recentList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
  },
  recentLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  sourceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sourceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sourceLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

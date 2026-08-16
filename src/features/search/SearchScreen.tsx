import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAppContainer } from '../../app/container/AppContainer';
import type { VideoSummary } from '../../core/model/media';
import { Icon } from '../../ui/components/Icon';
import { VideoList } from '../../ui/components/VideoList';
import { colors, hitSlop, radius, spacing, typography } from '../../ui/theme';
import { useLibraryStore } from '../library/libraryStore';
import { usePlayerStore } from '../player/playerStore';
import { useBottomSpace } from '../player/usePlayerLayout';
import { useSettingsStore } from '../settings/settingsStore';
import { useSearchStore } from './searchStore';

export const SearchScreen: React.FC = () => {
  const search = useSearchStore();
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const enabledProviders = useSettingsStore((state) => state.settings.enabledProviders);
  const progressOf = useLibraryStore((state) => state.progressOf);
  const isFavorite = useLibraryStore((state) => state.isFavorite);
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

  const openVideo = (video: VideoSummary) => openPlayer(video, search.items);

  const submit = () => {
    void search.submit(draft);
  };

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

  const idle = search.status === 'idle';

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <VideoList
        items={search.items}
        loading={search.status === 'loading'}
        loadingMore={search.status === 'loadingMore'}
        error={search.status === 'error' ? search.error : null}
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
        onEndReached={() => {
          void search.loadMore();
        }}
        onRetry={() => {
          void search.retry();
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

import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { VideoSummary } from '../../core/model/media';
import { ChipRow } from '../../ui/components/ChipRow';
import { Icon } from '../../ui/components/Icon';
import { VideoList } from '../../ui/components/VideoList';
import { colors, hitSlop, spacing, typography } from '../../ui/theme';
import { usePlayerStore } from '../player/playerStore';
import { useBottomSpace } from '../player/usePlayerLayout';
import { useLibraryStore } from './libraryStore';

type Tab = 'history' | 'favorites';

const TABS = [
  { id: 'history', label: 'История' },
  { id: 'favorites', label: 'Избранное' },
] as const;

export const LibraryScreen: React.FC = () => {
  const [tab, setTab] = useState<Tab>('history');
  const library = useLibraryStore();
  const openPlayer = usePlayerStore((state) => state.open);
  const bottomSpace = useBottomSpace();

  const items = useMemo<VideoSummary[]>(
    () =>
      tab === 'history'
        ? library.history.map((entry) => entry.video)
        : library.favorites.map((entry) => entry.video),
    [tab, library.history, library.favorites],
  );

  const confirmClear = () => {
    const isHistory = tab === 'history';
    Alert.alert(
      isHistory ? 'Очистить историю?' : 'Очистить избранное?',
      'Действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Очистить',
          style: 'destructive',
          onPress: () => {
            void (isHistory ? library.clearHistory() : library.clearFavorites());
          },
        },
      ],
    );
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Text style={styles.screenTitle}>Библиотека</Text>
        {items.length > 0 ? (
          <Pressable
            hitSlop={hitSlop}
            onPress={confirmClear}
            accessibilityRole="button"
            accessibilityLabel="Очистить список"
            style={styles.clearButton}>
            <Icon name="trash" size={18} color={colors.danger} />
          </Pressable>
        ) : null}
      </View>
      <ChipRow options={[...TABS]} selectedId={tab} onSelect={(id) => setTab(id as Tab)} />
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <VideoList
        items={items}
        loading={!library.hydrated}
        loadingMore={false}
        error={null}
        failures={[]}
        header={header}
        emptyIcon={tab === 'history' ? 'library' : 'star'}
        emptyTitle={tab === 'history' ? 'История пуста' : 'В избранном пусто'}
        emptyHint={
          tab === 'history'
            ? 'Здесь появятся видео, которые вы смотрели, — вместе с позицией просмотра'
            : 'Добавьте видео долгим нажатием на карточку или кнопкой в плеере'
        }
        onPressItem={(video) => openPlayer(video, items)}
        onLongPressItem={(video) => {
          void library.toggleFavorite(video);
        }}
        progressOf={library.progressOf}
        isFavorite={library.isFavorite}
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  screenTitle: {
    ...typography.display,
    color: colors.textPrimary,
  },
  clearButton: {
    padding: spacing.xs,
  },
});

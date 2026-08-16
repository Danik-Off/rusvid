import React, { useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

import { getProviderMeta } from '../../app/container/providerMeta';
import type { ProviderFailure } from '../../core/aggregator/AggregatorService';
import type { VideoSummary } from '../../core/model/media';
import { colors, spacing } from '../theme';
import { VideoListSkeleton } from './Skeleton';
import { EmptyState, ErrorView, FailureNotice, ListFooterLoader } from './StateViews';
import { VideoCard } from './VideoCard';
import type { IconName } from './Icon';

interface Props {
  readonly items: readonly VideoSummary[];
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly error: string | null;
  readonly failures: readonly ProviderFailure[];
  readonly emptyIcon?: IconName;
  readonly emptyTitle: string;
  readonly emptyHint?: string;
  readonly emptyActionLabel?: string;
  readonly onEmptyAction?: () => void;
  readonly header?: React.ReactElement | null;
  readonly onPressItem: (video: VideoSummary) => void;
  readonly onLongPressItem?: (video: VideoSummary) => void;
  readonly onEndReached?: () => void;
  readonly onRefresh?: () => void;
  readonly onRetry?: () => void;
  readonly progressOf?: (video: VideoSummary) => number | undefined;
  readonly isFavorite?: (uid: string) => boolean;
  /**
   * Сколько места снизу занято таб-баром, системной навигацией и свёрнутым
   * плеером. Без этого последняя карточка прячется под панелями и по ней
   * невозможно попасть пальцем.
   */
  readonly bottomSpace?: number;
}

/**
 * Общий список видео для ленты, поиска и библиотеки.
 * Держит в одном месте пустые состояния, ошибки и бесконечную прокрутку.
 */
export const VideoList: React.FC<Props> = ({
  items,
  loading,
  loadingMore,
  error,
  failures,
  emptyIcon,
  emptyTitle,
  emptyHint,
  emptyActionLabel,
  onEmptyAction,
  header,
  onPressItem,
  onLongPressItem,
  onEndReached,
  onRefresh,
  onRetry,
  progressOf,
  isFavorite,
  bottomSpace = 0,
}) => {
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<VideoSummary>) => (
      <VideoCard
        video={item}
        onPress={onPressItem}
        onLongPress={onLongPressItem}
        progress={progressOf?.(item)}
        isFavorite={isFavorite?.(item.uid)}
      />
    ),
    [onPressItem, onLongPressItem, progressOf, isFavorite],
  );

  const noticeItems = useMemo(
    () =>
      failures.map((failure) => ({
        providerTitle: failure.providerTitle,
        message: failure.error.message,
        accentColor: getProviderMeta(failure.providerId).accentColor,
      })),
    [failures],
  );

  const listHeader = (
    <View>
      {header}
      <FailureNotice failures={noticeItems} />
    </View>
  );

  const renderEmpty = () => {
    // Скелетоны только на первой загрузке: при обновлении списка данные
    // уже на экране и подменять их заглушками нельзя.
    if (loading) {
      return <VideoListSkeleton />;
    }
    if (error) {
      return <ErrorView message={error} onRetry={onRetry} />;
    }
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        hint={emptyHint}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    );
  };

  return (
    <FlatList
      data={items as VideoSummary[]}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={renderEmpty}
      ListFooterComponent={<ListFooterLoader visible={loadingMore} />}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      contentContainerStyle={[
        items.length === 0 ? styles.emptyContainer : styles.container,
        { paddingBottom: bottomSpace + spacing.xl },
      ]}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={loading && items.length > 0}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        ) : undefined
      }
      // Длинные ленты: не держим в памяти больше нескольких экранов.
      removeClippedSubviews
      initialNumToRender={6}
      maxToRenderPerBatch={8}
      windowSize={11}
    />
  );
};

function keyExtractor(item: VideoSummary): string {
  return item.uid;
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.sm,
  },
  emptyContainer: {
    flexGrow: 1,
  },
});

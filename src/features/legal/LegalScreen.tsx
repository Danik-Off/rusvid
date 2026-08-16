/**
 * «Правовая информация» — тот же текст, что показывается при первом запуске,
 * доступный в любой момент из настроек.
 *
 * Условия, которые можно прочитать только один раз и только до начала работы,
 * ничего не стоят: пользователь должен иметь возможность вернуться к ним,
 * а автор — сослаться на то, что текст всё время был на виду.
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LEGAL_SHORT_NOTICE } from '../../core/legal/legalText';
import { colors, radius, spacing, typography } from '../../ui/theme';
import { useBottomSpace } from '../player/usePlayerLayout';
import { LegalFullText, LegalHighlights } from './LegalDocument';

export const LegalScreen: React.FC = () => {
  const bottomSpace = useBottomSpace();

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomSpace + spacing.xl }]}>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{LEGAL_SHORT_NOTICE}</Text>
        </View>

        <LegalHighlights />
        <LegalFullText />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  notice: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

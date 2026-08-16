/**
 * Разметка правовых текстов, общая для экрана первого запуска и для экрана
 * «Правовая информация» в настройках.
 *
 * Компоненты ничего не решают и ничего не хранят: они только рисуют то, что
 * лежит в `core/legal/legalText.ts`. Текст правится там — оба экрана меняются
 * вместе, разъехаться они не могут.
 */

import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import {
  LEGAL_CONTACT_URL,
  LEGAL_HIGHLIGHTS,
  LEGAL_SECTIONS,
  LEGAL_UPDATED,
  type LegalHighlightId,
} from '../../core/legal/legalText';
import { Icon, type IconName } from '../../ui/components/Icon';
import { colors, radius, spacing, typography } from '../../ui/theme';

/** Иконка на блок — в `core/` её держать нельзя, там нет знания об UI. */
const HIGHLIGHT_ICONS: Record<LegalHighlightId, IconName> = {
  unofficial: 'alert',
  noncommercial: 'star',
  content: 'play',
  responsibility: 'lock',
  privacy: 'settings',
};

/** Короткая версия условий — карточками, чтобы её действительно прочитали. */
export const LegalHighlights: React.FC = () => (
  <View style={styles.highlights}>
    {LEGAL_HIGHLIGHTS.map((highlight) => (
      <View key={highlight.id} style={styles.card}>
        <View style={styles.cardHead}>
          <Icon name={HIGHLIGHT_ICONS[highlight.id]} size={18} color={colors.accent} />
          <Text style={styles.cardTitle}>{highlight.title}</Text>
        </View>
        <Text style={styles.cardText}>{highlight.text}</Text>
      </View>
    ))}
  </View>
);

/** Полный текст условий по разделам. */
export const LegalFullText: React.FC = () => (
  <View style={styles.document}>
    {LEGAL_SECTIONS.map((section) => (
      <View key={section.title} style={styles.section}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        {section.paragraphs.map((paragraph) => (
          <Text key={paragraph.slice(0, 40)} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
      </View>
    ))}

    <Text
      style={styles.link}
      accessibilityRole="link"
      onPress={() => {
        void Linking.openURL(LEGAL_CONTACT_URL);
      }}>
      Связаться с автором (обращения правообладателей) →
    </Text>

    <Text style={styles.updated}>Редакция от {LEGAL_UPDATED}</Text>
  </View>
);

const styles = StyleSheet.create({
  highlights: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flex: 1,
  },
  cardText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  document: {
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  paragraph: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  link: {
    ...typography.caption,
    color: colors.accent,
  },
  updated: {
    ...typography.caption,
    color: colors.textMuted,
  },
});

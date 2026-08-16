/**
 * Экран первого запуска: правовые условия и явное согласие с ними.
 *
 * Показывается вместо всего остального интерфейса, пока принятая версия
 * условий (`acceptedLegalVersion`) меньше текущей `LEGAL_VERSION`. Ни поиска,
 * ни ленты, ни плеера до нажатия «Принимаю» не существует — иначе согласие
 * было бы декоративным.
 *
 * Кнопка стоит в конце прокрутки, а не прилипшей к низу, намеренно: чтобы
 * до неё добраться, текст условий приходится пролистать.
 */

import React, { useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LEGAL_UPDATED } from '../../core/legal/legalText';
import { Button } from '../../ui/components/Button';
import { Logo } from '../../ui/components/Logo';
import { colors, radius, spacing, typography } from '../../ui/theme';
import { useSettingsStore } from '../settings/settingsStore';
import { LegalFullText, LegalHighlights } from './LegalDocument';

export const DisclaimerScreen: React.FC = () => {
  const acceptLegal = useSettingsStore((state) => state.acceptLegal);
  const [fullTextVisible, setFullTextVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Logo size={64} />
          <Text style={styles.title}>RusVid</Text>
          <Text style={styles.subtitle}>
            Неофициальное некоммерческое приложение. Прочитайте, прежде чем начать.
          </Text>
        </View>

        <LegalHighlights />

        {fullTextVisible ? (
          <LegalFullText />
        ) : (
          <Button
            label="Читать полный текст условий"
            icon="chevronDown"
            fullWidth
            onPress={() => setFullTextVisible(true)}
          />
        )}

        <View style={styles.consent}>
          <Text style={styles.consentText}>
            Нажимая «Принимаю», вы подтверждаете, что прочитали и поняли условия редакции
            от {LEGAL_UPDATED}, используете приложение по своей воле и на свой риск и берёте
            ответственность за собственное использование на себя. Текст всегда доступен
            в настройках, в разделе «Правовая информация».
          </Text>
        </View>

        <Button
          label="Принимаю"
          variant="primary"
          fullWidth
          loading={busy}
          onPress={() => {
            setBusy(true);
            void acceptLegal();
          }}
        />

        <Button
          label="Не согласен — выйти"
          variant="ghost"
          fullWidth
          onPress={() => {
            BackHandler.exitApp();
          }}
        />
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
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.lg,
  },
  title: {
    ...typography.display,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  consent: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  consentText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

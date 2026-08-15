import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getProviderMeta } from '../../app/container/providerMeta';
import { Button } from '../../ui/components/Button';
import { Icon, type IconName } from '../../ui/components/Icon';
import { ProviderBadge } from '../../ui/components/ProviderBadge';
import { colors, radius, spacing, typography } from '../../ui/theme';
import { useDiagnosticsStore, type CheckStep, type ProviderReport } from './diagnosticsStore';

export const DiagnosticsScreen: React.FC = () => {
  const { reports, running, finishedAt, run } = useDiagnosticsStore();

  useEffect(() => {
    if (reports.length === 0 && !running) {
      void run();
    }
    // Запускаем ровно один раз при открытии экрана.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Проверка делает настоящие запросы к API каждой включённой платформы и
          показывает, на каком шаге всё ломается.
        </Text>

        {reports.map((report) => (
          <ReportCard key={report.providerId} report={report} />
        ))}

        <Button
          label={running ? 'Проверяем…' : 'Проверить заново'}
          icon="refresh"
          variant="primary"
          fullWidth
          loading={running}
          onPress={() => {
            void run();
          }}
        />

        {finishedAt && !running ? (
          <Text style={styles.timestamp}>
            Последняя проверка: {new Date(finishedAt).toLocaleTimeString('ru-RU')}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const ReportCard: React.FC<{ readonly report: ProviderReport }> = ({ report }) => {
  const meta = getProviderMeta(report.providerId);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <ProviderBadge label={meta.badge} color={meta.accentColor} />
        <Text style={styles.cardTitle}>{report.providerTitle}</Text>
        <View style={[styles.verdict, report.ok ? styles.verdictOk : styles.verdictFail]}>
          <Icon
            name={report.ok ? 'check' : 'alert'}
            size={13}
            color={report.ok ? colors.success : colors.danger}
          />
          <Text style={[styles.verdictText, { color: report.ok ? colors.success : colors.danger }]}>
            {report.ok ? 'Работает' : 'Есть проблемы'}
          </Text>
        </View>
      </View>

      {report.steps.map((step) => (
        <StepRow key={step.name} step={step} />
      ))}
    </View>
  );
};

const STEP_ICON: Record<CheckStep['status'], IconName> = {
  ok: 'check',
  failed: 'alert',
  skipped: 'chevronRight',
};

const STEP_COLOR: Record<CheckStep['status'], string> = {
  ok: colors.success,
  failed: colors.danger,
  skipped: colors.textMuted,
};

const StepRow: React.FC<{ readonly step: CheckStep }> = ({ step }) => (
  <View style={styles.step}>
    <Icon name={STEP_ICON[step.status]} size={15} color={STEP_COLOR[step.status]} />
    <View style={styles.stepBody}>
      <View style={styles.stepTitleRow}>
        <Text style={styles.stepName}>{step.name}</Text>
        {step.durationMs > 0 ? (
          <Text style={styles.stepTiming}>{step.durationMs} мс</Text>
        ) : null}
      </View>
      <Text style={[styles.stepDetail, step.status === 'failed' && styles.stepDetailFailed]}>
        {step.detail}
      </Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  intro: {
    ...typography.caption,
    color: colors.textMuted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flex: 1,
  },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  verdictOk: {
    backgroundColor: 'rgba(67,217,163,0.14)',
  },
  verdictFail: {
    backgroundColor: colors.dangerSoft,
  },
  verdictText: {
    ...typography.badge,
  },
  step: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  stepBody: {
    flex: 1,
    gap: 1,
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  stepTiming: {
    ...typography.caption,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  stepDetail: {
    ...typography.caption,
    color: colors.textMuted,
  },
  stepDetailFailed: {
    color: colors.danger,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});

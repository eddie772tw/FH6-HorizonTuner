import { useSettings } from '../../context/SettingsContext';
import { DriftCandidate } from './DriftCandidate';
import { DriftCompare } from './DriftCompare';
import { DriftObservation } from './DriftObservation';
import { DriftReportCard } from './DriftReportCard';
import type { DriftDocument } from './driftTypes';
import { documentsOf } from './driftTypes';

interface Props {
  workflowId: string;
  documents: DriftDocument[];
  busy: boolean;
  saveFinish: (runId: string, body: unknown) => Promise<unknown>;
  createCandidate: (body: unknown) => Promise<unknown>;
  compareRuns: (baseIds: string[], candIds: string[]) => Promise<unknown>;
  decide: (choice: string) => Promise<void>;
}

export function DriftResults({ documents, busy, saveFinish, createCandidate, compareRuns, decide }: Props) {
  const { t } = useSettings();
  const runs = documentsOf(documents, 'run');
  const setups = documentsOf(documents, 'setup');
  const summaries = documentsOf(documents, 'summary');
  const finishes = documentsOf(documents, 'finish');
  const reports = documentsOf(documents, 'comparison');
  const latestSummary = summaries[summaries.length - 1];
  const latestFinish = finishes.find(f => f.runId === latestSummary?.runId);
  const latestRun = runs.find(r => r.id === latestSummary?.runId);
  const latestSetup = setups.find(s => s.id === latestRun?.setupId);
  const latestReport = reports[reports.length - 1];

  return (
    <div className="d-flex flex-column gap-3">
      {latestSummary && (
        <DriftObservation summary={latestSummary} finish={latestFinish} busy={busy} saveFinish={body => saveFinish(latestSummary.runId, body)} />
      )}
      {latestRun && latestSetup && (
        <DriftCandidate run={latestRun} setup={latestSetup} busy={busy} createCandidate={createCandidate} />
      )}
      {runs.length >= 2 && (
        <DriftCompare runs={runs} setups={setups} busy={busy} compareRuns={compareRuns} />
      )}
      {latestReport && (
        <DriftReportCard report={latestReport} busy={busy} decide={decide} />
      )}
      {!latestSummary && (
        <div className="glass-panel p-4 text-body-secondary text-center">{t('No recorded drift runs yet for this workflow.')}</div>
      )}
    </div>
  );
}

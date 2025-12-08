import React from 'react';
import type { ProgressStep } from '../../lib/progress.types';
import { TERMINAL_COLORS } from './theme';
const PROPAGATION_TEXT =
  'DNS propagation can take up to 2 minutes. Local checks finish first; global checks may keep running.';

export type StepLogEntry = {
  id: string;
  phase: ProgressStep['phase'];
  text: string;
  status: ProgressStep['status'];
  timestamp: number;
  bucket?: string;
};

function getStatusColor(status: ProgressStep['status']): string {
  switch (status) {
    case 'success':
      return TERMINAL_COLORS.success;
    case 'error':
      return TERMINAL_COLORS.error;
    case 'warning':
      return TERMINAL_COLORS.warning;
    case 'running':
      return TERMINAL_COLORS.accent;
    default:
      return TERMINAL_COLORS.textMuted;
  }
}

export function LiveLog({
  entries,
  startedAt,
}: {
  entries: StepLogEntry[];
  startedAt: number | null;
}): JSX.Element | null {
  if (!startedAt) return null;

  const formattedEntries = entries.map(entry => ({
    ...entry,
    elapsed: formatTimestamp(entry.timestamp),
  }));

  if (formattedEntries.length === 0) {
    return <div className="text-xs text-[#8b949e]">{'->'} waiting for updates</div>;
  }

  return (
    <div className="space-y-1 font-mono text-sm">
      {formattedEntries.map(entry => (
        <div key={entry.id} className="flex items-center gap-2">
          <span style={{ color: getStatusColor(entry.status) }}>{'->'}</span>
          <span className="w-12 text-[#8b949e]">{entry.phase.toUpperCase()}</span>
          <span className="flex-[0_1_70%] truncate text-[#c9d1d9]">{entry.text}</span>
          <span className="w-10 text-right text-[#8b949e]">{entry.elapsed}</span>
        </div>
      ))}
    </div>
  );
}

export function useStepLogs(
  steps: ProgressStep[],
  startedAt: number | null,
  lastEventAt: number | null
): StepLogEntry[] {
  const [entries, setEntries] = React.useState<StepLogEntry[]>([]);
  const previous = React.useRef<ProgressStep[]>([]);
  const counter = React.useRef(0);

  React.useEffect(() => {
    setEntries([]);
    previous.current = [];
    counter.current = 0;
  }, [startedAt]);

  React.useEffect(() => {
    if (!startedAt) return;
    const additions: StepLogEntry[] = [];

    steps.forEach(step => {
      const entry = maybeCreateLogEntry(step, previous.current, counter, lastEventAt);
      if (entry) additions.push(entry);
    });

    if (additions.length > 0) {
      setEntries(prev => mergeLogs(prev, additions));
    }
    previous.current = steps;
  }, [steps, startedAt, lastEventAt]);

  return entries;
}

function getBucket(phase: ProgressStep['phase'], text: string): string | null {
  const lower = text.toLowerCase();
  if (phase === 'dns' && lower.includes('local check')) return 'local';
  if (phase === 'dns' && lower.includes('global check')) return 'global';
  return null;
}

function maybeCreateLogEntry(
  step: ProgressStep,
  previous: ProgressStep[],
  counterRef: React.MutableRefObject<number>,
  lastEventAt: number | null
): StepLogEntry | null {
  const prev = findPreviousStep(previous, step.phase);
  const prevDetail = getDetailText(prev);
  const detail = getDetailText(step);
  if (!shouldLogStep(detail, prevDetail, step, prev)) return null;
  counterRef.current += 1;
  return {
    id: `${step.phase}-${counterRef.current}`,
    phase: step.phase,
    text: detail,
    status: step.status,
    timestamp: lastEventAt ?? Date.now(),
    bucket: getBucket(step.phase, detail) ?? undefined,
  };
}

function mergeLogs(existing: StepLogEntry[], additions: StepLogEntry[]): StepLogEntry[] {
  const next = [...existing];
  additions.forEach(add => {
    const bucket = add.bucket ?? getBucket(add.phase, add.text);
    if (!bucket) {
      next.push(add);
      return;
    }
    const idx = findBucketIndex(next, add.phase, bucket);
    const withBucket = { ...add, bucket };
    if (idx >= 0) {
      next[idx] = { ...next[idx], ...withBucket };
    } else {
      next.push(withBucket);
    }
  });
  return next;
}

export function getPropagationHint(steps: ProgressStep[]): string | null {
  const dnsStep = steps.find(step => step.phase === 'dns');
  if (!dnsStep) return null;
  if (dnsStep.status !== 'running') return null;
  const detail = dnsStep.detail?.toLowerCase() ?? '';
  const isPropagation =
    detail.includes('local') || detail.includes('global') || detail.includes('propagation');
  return isPropagation ? PROPAGATION_TEXT : null;
}

function formatTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function findBucketIndex(
  entries: StepLogEntry[],
  phase: ProgressStep['phase'],
  bucket: string
): number {
  return entries.findIndex(entry => {
    if (entry.phase !== phase) return false;
    const entryBucket = entry.bucket ?? getBucket(entry.phase, entry.text);
    return entryBucket === bucket;
  });
}

function getDetailText(step?: ProgressStep): string {
  if (!step) return '';
  return step.detail || step.message || '';
}

function findPreviousStep(
  previous: ProgressStep[],
  phase: ProgressStep['phase']
): ProgressStep | undefined {
  return previous.find(item => item.phase === phase);
}

function shouldLogStep(
  detail: string,
  prevDetail: string,
  step: ProgressStep,
  prev: ProgressStep | undefined
): boolean {
  if (step.status === 'pending') return false;
  if (detail !== prevDetail) return true;
  return prev ? step.status !== prev.status : true;
}

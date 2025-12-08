import React from 'react';
import type { ProgressEvent, ProgressStep } from '../../lib/progress.types';
import { ResultDisplay } from './result-display';
import { TERMINAL_COLORS } from './theme';

const PROGRESS_CHARS = {
  filled: '#',
  empty: '.',
  partial: '+',
};

const STATUS_ICONS = {
  pending: '.',
  running: '>',
  success: '*',
  error: 'x',
  warning: '!',
};

const PROGRESS_WIDTH = 20;
const SPINNER_INTERVAL_MS = 150;
const PROPAGATION_TEXT =
  'DNS propagation can take up to 2 minutes. Local checks finish first; global checks may keep running.';

type StepLogEntry = {
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

interface ProgressBarProps {
  progress: number;
  width?: number;
}
export function ProgressBar({ progress, width = PROGRESS_WIDTH }: ProgressBarProps): JSX.Element {
  const filled = Math.floor((progress / 100) * width);
  const empty = width - filled;

  return (
    <span className="font-mono">
      [{PROGRESS_CHARS.filled.repeat(filled)}
      {PROGRESS_CHARS.empty.repeat(empty)}]
    </span>
  );
}

interface ProgressStepRowProps {
  step: ProgressStep;
  label: string;
}
export function ProgressStepRow({ step, label }: ProgressStepRowProps): JSX.Element {
  const icon = STATUS_ICONS[step.status];
  const iconColor = getStatusColor(step.status);
  const spinnerFrames = ['-', '\\', '|', '/'];
  const [spinnerIndex, setSpinnerIndex] = React.useState(0);

  React.useEffect(() => {
    if (step.status !== 'running') return undefined;
    const interval = setInterval(() => {
      setSpinnerIndex((i: number): number => (i + 1) % spinnerFrames.length);
    }, SPINNER_INTERVAL_MS);
    return (): void => clearInterval(interval);
  }, [step.status, spinnerFrames.length]);

  const displayIcon = step.status === 'running' ? spinnerFrames[spinnerIndex] : icon;

  return (
    <div className="flex items-center gap-3 font-mono text-sm">
      <span style={{ color: iconColor, width: '16px', textAlign: 'center' }}>{displayIcon}</span>
      <span className="w-16 text-[#8b949e]">{label}</span>
      <ProgressBar progress={step.progress} width={PROGRESS_WIDTH} />
      <span className="flex-1 truncate text-xs" style={{ color: TERMINAL_COLORS.textMuted }}>
        {step.detail}
      </span>
    </div>
  );
}

interface ProgressOutputProps {
  serviceId: string | null;
  serviceName: string;
  action: 'expose' | 'unexpose' | null;
  steps: ProgressStep[];
  result: ProgressEvent['result'] | null;
  startedAt: number | null;
  lastEventAt: number | null;
  onRetrySsl?: () => void;
  isRetrying?: boolean;
  retryResult?: { success: boolean; error?: string } | null;
}

export function ProgressOutput({
  serviceId,
  serviceName,
  action,
  steps,
  result,
  startedAt,
  lastEventAt,
  onRetrySsl,
  isRetrying,
  retryResult,
}: ProgressOutputProps): JSX.Element | null {
  const logs = useStepLogs(action ? steps : [], startedAt, lastEventAt);
  const propagationHint = action ? getPropagationHint(steps) : null;
  if (!action) return null;

  return (
    <div className="mt-6 border-t border-[#30363d] pt-6">
      <CommandLine action={action} serviceName={serviceName} />
      <div className="space-y-3 pl-4">
        <StepList steps={steps} />
        {propagationHint && <HintBox text={propagationHint} />}
        <LiveLog entries={logs} startedAt={startedAt} />
      </div>
      {result && (
        <ResultDisplay
          result={result}
          action={action}
          serviceId={serviceId}
          onRetrySsl={onRetrySsl}
          isRetrying={isRetrying}
          retryResult={retryResult}
        />
      )}
    </div>
  );
}

function StepList({ steps }: { steps: ProgressStep[] }): JSX.Element {
  return (
    <div className="space-y-2">
      {steps.map(step => (
        <ProgressStepRow key={step.phase} step={step} label={step.phase.toUpperCase()} />
      ))}
    </div>
  );
}

function HintBox({ text }: { text: string }): JSX.Element {
  return (
    <div className="rounded border border-[#30363d] bg-[#161b22] px-3 py-2 text-xs text-[#8b949e]">
      {text}
    </div>
  );
}

function CommandLine({
  action,
  serviceName,
}: {
  action: string;
  serviceName: string;
}): JSX.Element {
  return (
    <div className="mb-4 font-mono text-sm">
      <span style={{ color: TERMINAL_COLORS.success }}>{'->'}</span>{' '}
      <span className="font-bold">autoxpose</span> {action} {serviceName}
    </div>
  );
}

export function InlineSpinner(): JSX.Element {
  const frames = ['-', '\\', '|', '/'];
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i: number): number => (i + 1) % frames.length);
    }, SPINNER_INTERVAL_MS);
    return (): void => clearInterval(interval);
  }, [frames.length]);

  return <span style={{ color: TERMINAL_COLORS.accent }}>{frames[index]}</span>;
}

function LiveLog({
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

function useStepLogs(
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

function getPropagationHint(steps: ProgressStep[]): string | null {
  const dnsStep = steps.find(step => step.phase === 'dns');
  if (!dnsStep) return null;
  if (dnsStep.status !== 'running') return null;
  const detail = dnsStep.detail?.toLowerCase() ?? '';
  const isPropagation =
    detail.includes('local') || detail.includes('global') || detail.includes('propagation');
  return isPropagation ? PROPAGATION_TEXT : null;
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

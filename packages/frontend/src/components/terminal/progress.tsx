import React from 'react';
import type { ProgressEvent, ProgressStep } from '../../lib/progress.types';
import { LiveLog, getPropagationHint, useStepLogs } from './progress-log';
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

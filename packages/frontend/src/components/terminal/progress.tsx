import type { ProgressEvent, ProgressStep } from '../../lib/progress.types';
import { ResultDisplay } from './result-display';
import { TERMINAL_COLORS } from './theme';

const PROGRESS_CHARS = {
  filled: '█',
  empty: '░',
  partial: '▓',
};

const STATUS_ICONS = {
  pending: '○',
  running: '◐',
  success: '✓',
  error: '✗',
  warning: '⚠',
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
export function ProgressBar({ progress, width = 20 }: ProgressBarProps): JSX.Element {
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

  const spinnerFrames = ['\u25D0', '\u25D3', '\u25D1', '\u25D2'];
  const [spinnerIndex, setSpinnerIndex] = React.useState(0);

  React.useEffect(() => {
    if (step.status !== 'running') return undefined;
    const interval = setInterval(() => {
      setSpinnerIndex((i: number): number => (i + 1) % spinnerFrames.length);
    }, 150);
    return (): void => clearInterval(interval);
  }, [step.status, spinnerFrames.length]);

  const displayIcon = step.status === 'running' ? spinnerFrames[spinnerIndex] : icon;

  return (
    <div className="flex items-center gap-3 font-mono text-sm">
      <span style={{ color: iconColor, width: '16px', textAlign: 'center' }}>{displayIcon}</span>
      <span className="w-16 text-[#8b949e]">{label}</span>
      <ProgressBar progress={step.progress} width={20} />
      <span className="flex-1 truncate text-xs" style={{ color: TERMINAL_COLORS.textMuted }}>
        {step.detail}
      </span>
    </div>
  );
}

import React from 'react';

interface ProgressOutputProps {
  serviceId: string | null;
  serviceName: string;
  action: 'expose' | 'unexpose' | null;
  steps: ProgressStep[];
  result: ProgressEvent['result'] | null;
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
  onRetrySsl,
  isRetrying,
  retryResult,
}: ProgressOutputProps): JSX.Element | null {
  if (!action) return null;

  return (
    <div className="mt-6 border-t border-[#30363d] pt-6">
      <CommandLine action={action} serviceName={serviceName} />
      <div className="space-y-2 pl-4">
        {steps.map(step => (
          <ProgressStepRow key={step.phase} step={step} label={step.phase.toUpperCase()} />
        ))}
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
  const frames = ['\u25D0', '\u25D3', '\u25D1', '\u25D2'];
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i: number): number => (i + 1) % frames.length);
    }, 150);
    return (): void => clearInterval(interval);
  }, [frames.length]);

  return <span style={{ color: TERMINAL_COLORS.accent }}>{frames[index]}</span>;
}

import type { ProviderStatus } from '../lib/api';

export function Spinner(): JSX.Element {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

interface StatusBadgeProps {
  isLoading: boolean;
  isExposing: boolean;
  isExposed: boolean;
}

export function StatusBadge({ isLoading, isExposing, isExposed }: StatusBadgeProps): JSX.Element {
  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        <Spinner />
        {isExposing ? 'Exposing...' : 'Removing...'}
      </span>
    );
  }
  const cls = isExposed ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-600';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {isExposed ? 'Exposed' : 'Not Exposed'}
    </span>
  );
}

interface ConfigDisplayProps {
  current: ProviderStatus | null;
}

export function ConfigDisplay({ current }: ConfigDisplayProps): JSX.Element | null {
  if (!current?.configured) return null;
  return (
    <div className="mt-3 text-xs text-neutral-500 space-y-1">
      <p>
        <span className="text-neutral-400">Provider:</span> {current.provider}
      </p>
      {current.config?.url && (
        <p>
          <span className="text-neutral-400">URL:</span> {current.config.url}
        </p>
      )}
      {current.config?.username && (
        <p>
          <span className="text-neutral-400">Username:</span> {current.config.username}
        </p>
      )}
      {current.config?.password && (
        <p>
          <span className="text-neutral-400">Password:</span> {current.config.password}
        </p>
      )}
    </div>
  );
}

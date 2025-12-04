import type { ProgressEvent } from '../../lib/progress.types';
import { TERMINAL_COLORS } from './theme';

function parseSSLError(raw?: string): string {
  if (!raw) return 'SSL certificate could not be issued';
  if (raw.includes('No such authorization')) return 'DNS not yet visible to certificate authority';
  if (raw.includes('Internal Error')) return 'Certificate authority unreachable - try again';
  return 'SSL certificate request failed';
}

interface ResultDisplayProps {
  result: NonNullable<ProgressEvent['result']>;
  action: 'expose' | 'unexpose';
  serviceId: string | null;
  onRetrySsl?: () => void;
  isRetrying?: boolean;
  retryResult?: { success: boolean; error?: string } | null;
}

function SslPendingResult(props: ResultDisplayProps): JSX.Element {
  const { result, onRetrySsl, isRetrying, retryResult } = props;
  if (retryResult?.success) {
    const url = `https://${result.domain}`;
    return (
      <div className="mt-4 pl-4 font-mono text-sm" style={{ color: TERMINAL_COLORS.success }}>
        <span className="mr-2">{'\u2713'}</span>
        SSL issued -{' '}
        <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
          {url}
        </a>
      </div>
    );
  }
  const errorMsg = retryResult ? parseSSLError(retryResult.error) : parseSSLError(result.sslError);
  return (
    <div className="mt-4 pl-4 font-mono text-sm">
      <div style={{ color: TERMINAL_COLORS.warning }}>
        <span className="mr-2">{'\u26A0'}</span>Exposed at http://{result.domain} (SSL pending)
      </div>
      <div className="mt-2 text-xs" style={{ color: TERMINAL_COLORS.textMuted }}>
        {errorMsg}
      </div>
      {onRetrySsl && (
        <button
          onClick={onRetrySsl}
          disabled={isRetrying}
          className="mt-2 rounded border border-[#30363d] px-2 py-1 text-xs hover:border-[#58a6ff] disabled:opacity-50"
          style={{ color: TERMINAL_COLORS.accent }}
        >
          {isRetrying ? 'Retrying...' : 'Retry SSL'}
        </button>
      )}
    </div>
  );
}

export function ResultDisplay(props: ResultDisplayProps): JSX.Element {
  const { result, action } = props;
  if (result.success && result.sslPending) return <SslPendingResult {...props} />;
  if (result.success) {
    const url = result.domain ? `https://${result.domain}` : '';
    const msg =
      action === 'expose' && url ? (
        <>
          Exposed at{' '}
          <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
            {url}
          </a>
        </>
      ) : action === 'expose' ? (
        'Service exposed'
      ) : (
        'Service unexposed'
      );
    return (
      <div className="mt-4 pl-4 font-mono text-sm" style={{ color: TERMINAL_COLORS.success }}>
        <span className="mr-2">{'\u2713'}</span>
        {msg}
      </div>
    );
  }
  return (
    <div className="mt-4 pl-4 font-mono text-sm" style={{ color: TERMINAL_COLORS.error }}>
      <span className="mr-2">{'\u2717'}</span>
      {result.error || 'Operation failed'}
    </div>
  );
}

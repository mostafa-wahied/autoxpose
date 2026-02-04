import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type WildcardConfig, type WildcardDetection } from '../../../lib/api';
import { TERMINAL_COLORS } from '../theme';

interface DnsHeaderProps {
  isConfigured: boolean;
  isEditing: boolean;
  isWildcardMode: boolean;
  onEdit: () => void;
}

export function DnsHeader({
  isConfigured,
  isEditing,
  isWildcardMode,
  onEdit,
}: DnsHeaderProps): JSX.Element {
  const title = isWildcardMode ? 'Wildcard Mode' : 'DNS Provider';
  const badgeText = isWildcardMode ? 'wildcard' : 'configured';

  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[#c9d1d9]">{title}</span>
        {(isConfigured || isWildcardMode) && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{ background: `${TERMINAL_COLORS.success}20`, color: TERMINAL_COLORS.success }}
          >
            {badgeText}
          </span>
        )}
      </div>
      {isConfigured && !isEditing && !isWildcardMode && (
        <button onClick={onEdit} className="text-xs text-[#58a6ff] hover:underline">
          Edit
        </button>
      )}
    </div>
  );
}

export function DnsDisabledState(): JSX.Element {
  return (
    <div className="rounded border border-[#30363d] bg-[#161b22] p-4 opacity-50">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-medium text-[#c9d1d9]">DNS Provider</span>
        <span className="rounded bg-[#30363d] px-1.5 py-0.5 text-[10px] text-[#8b949e]">
          step 2
        </span>
      </div>
      <div className="flex items-center justify-center py-6 text-center">
        <p className="text-xs text-[#8b949e]">Configure proxy first, then set up DNS here</p>
      </div>
    </div>
  );
}

interface WildcardModeDisplayProps {
  wildcardConfig?: WildcardConfig | null;
  wildcardDetection?: WildcardDetection | null;
}

export function WildcardModeDisplay({
  wildcardConfig,
  wildcardDetection,
}: WildcardModeDisplayProps): JSX.Element {
  const queryClient = useQueryClient();
  const domain = wildcardConfig?.domain || wildcardDetection?.domain || 'unknown';
  const hasCert = wildcardConfig?.certId !== null && wildcardConfig?.certId !== undefined;

  const disableMutation = useMutation({
    mutationFn: () => api.settings.saveWildcard(false, ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['wildcard-detection'] });
    },
  });

  return (
    <div className="rounded border border-[#30363d] bg-[#161b22] p-4">
      <DnsHeader isConfigured={false} isEditing={false} isWildcardMode={true} onEdit={() => {}} />
      <div className="space-y-2 text-xs text-[#8b949e]">
        <p className="font-mono text-[#58a6ff]">*.{domain}</p>
        <p>
          <span className="text-[#484f58]">DNS:</span> Skipped (wildcard covers all subdomains)
        </p>
        <p>
          <span className="text-[#484f58]">SSL:</span>{' '}
          {hasCert ? 'Wildcard certificate linked' : 'No certificate detected'}
        </p>
        {!hasCert && (
          <p className="mt-2 rounded border border-[#f0883e50] bg-[#f0883e15] px-2 py-1.5 text-[#f0883e]">
            Add *.{domain} SSL cert to NPM for HTTPS
          </p>
        )}
        <button
          onClick={() => disableMutation.mutate()}
          disabled={disableMutation.isPending}
          className="mt-2 text-[#58a6ff] hover:underline disabled:opacity-50"
        >
          {disableMutation.isPending ? 'Switching...' : 'Switch to DNS mode'}
        </button>
      </div>
    </div>
  );
}

interface WildcardChoiceSectionProps {
  wildcardDetection: WildcardDetection;
}

export function WildcardChoiceSection({
  wildcardDetection,
}: WildcardChoiceSectionProps): JSX.Element | null {
  const queryClient = useQueryClient();

  const enableMutation = useMutation({
    mutationFn: () => api.settings.saveWildcard(true, wildcardDetection.domain || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['wildcard-detection'] });
    },
  });

  if (!wildcardDetection.detected) return null;

  return (
    <div className="mb-4 rounded border border-[#238636] bg-[#23863615] p-3">
      <p className="mb-2 text-xs text-[#3fb950]">
        Wildcard detected: <span className="font-mono">{wildcardDetection.fullDomain}</span>
      </p>
      <button
        onClick={() => enableMutation.mutate()}
        disabled={enableMutation.isPending}
        className="text-xs text-[#58a6ff] hover:underline disabled:opacity-50"
      >
        {enableMutation.isPending ? 'Enabling...' : 'Use wildcard mode (skip DNS setup)'}
      </button>
    </div>
  );
}

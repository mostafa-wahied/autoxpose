import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, type SettingsStatus } from '../../lib/api';
import { DNS_PROVIDERS, DnsFormFields } from './dns-form-fields';
import { FormActions } from './form-components';
import { TestConnectionButton, type TestState } from './test-button';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';

interface DnsConfigSectionProps {
  current: SettingsStatus['dns'] | null;
}

export function DnsConfigSection({ current }: DnsConfigSectionProps): JSX.Element {
  const [isEditing, setIsEditing] = useState(!current?.configured);
  const isConfigured = current?.configured ?? false;

  return (
    <div className="rounded border border-[#30363d] bg-[#161b22] p-4">
      <DnsHeader
        isConfigured={isConfigured}
        isEditing={isEditing}
        onEdit={() => setIsEditing(true)}
      />
      {isEditing ? (
        <DnsEditForm current={current} onDone={() => setIsEditing(false)} />
      ) : (
        <DnsDisplay current={current} />
      )}
    </div>
  );
}

interface DnsHeaderProps {
  isConfigured: boolean;
  isEditing: boolean;
  onEdit: () => void;
}

function DnsHeader({ isConfigured, isEditing, onEdit }: DnsHeaderProps): JSX.Element {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[#c9d1d9]">DNS Provider</span>
        {isConfigured && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px]"
            style={{ background: `${TERMINAL_COLORS.success}20`, color: TERMINAL_COLORS.success }}
          >
            configured
          </span>
        )}
      </div>
      {isConfigured && !isEditing && (
        <Tooltip content="Edit DNS settings">
          <button onClick={onEdit} className="text-xs text-[#58a6ff] hover:underline">
            Edit
          </button>
        </Tooltip>
      )}
    </div>
  );
}

interface DnsEditFormProps {
  current: SettingsStatus['dns'] | null;
  onDone: () => void;
}

type DnsFormState = {
  provider: string;
  token: string;
  zoneId: string;
  domain: string;
  apiKey: string;
  secretKey: string;
  isPending: boolean;
  isError: boolean;
  mutate: () => void;
  isConfigured: boolean;
  canSave: boolean;
  setProvider: (v: string) => void;
  setToken: (v: string) => void;
  setZoneId: (v: string) => void;
  setDomain: (v: string) => void;
  setApiKey: (v: string) => void;
  setSecretKey: (v: string) => void;
  hasToken: boolean;
  hasApiKey: boolean;
};

function useDnsForm(current: SettingsStatus['dns'] | null, onDone: () => void): DnsFormState {
  const [provider, setProvider] = useState(current?.provider || 'cloudflare');
  const [token, setToken] = useState('');
  const [zoneId, setZoneId] = useState(current?.config?.zoneId || '');
  const [domain, setDomain] = useState(current?.domain || '');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (current?.provider) setProvider(current.provider);
    if (current?.config?.zoneId) setZoneId(current.config.zoneId);
    if (current?.domain) setDomain(current.domain);
  }, [current]);

  const buildConfig = (): Record<string, string> => {
    if (provider === 'porkbun') return { apiKey, secretKey, domain };
    if (provider === 'digitalocean') return { token, domain };
    return { token, zoneId, domain };
  };

  const mutation = useMutation({
    mutationFn: () => api.settings.saveDns(provider, buildConfig()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      onDone();
    },
  });

  const isConfigured = current?.configured ?? false;
  const hasCredentials = provider === 'porkbun' ? apiKey || isConfigured : token || isConfigured;

  return {
    provider,
    token,
    zoneId,
    domain,
    apiKey,
    secretKey,
    isConfigured,
    isPending: mutation.isPending,
    isError: mutation.isError,
    mutate: () => mutation.mutate(),
    canSave: Boolean(hasCredentials && domain),
    setProvider,
    setToken,
    setZoneId,
    setDomain,
    setApiKey,
    setSecretKey,
    hasToken: Boolean(current?.config?.token),
    hasApiKey: Boolean(current?.config?.apiKey),
  };
}

function DnsEditForm({ current, onDone }: DnsEditFormProps): JSX.Element {
  const form = useDnsForm(current, onDone);

  return (
    <div className="space-y-3">
      <DnsFormFields
        provider={form.provider}
        token={form.token}
        zoneId={form.zoneId}
        domain={form.domain}
        apiKey={form.apiKey}
        secretKey={form.secretKey}
        hasToken={form.hasToken}
        hasApiKey={form.hasApiKey}
        onProviderChange={form.setProvider}
        onTokenChange={form.setToken}
        onZoneIdChange={form.setZoneId}
        onDomainChange={form.setDomain}
        onApiKeyChange={form.setApiKey}
        onSecretKeyChange={form.setSecretKey}
      />
      <FormActions
        isPending={form.isPending}
        canSave={form.canSave}
        showCancel={form.isConfigured}
        onSave={form.mutate}
        onCancel={onDone}
      />
      {form.isError && <p className="text-xs text-[#f85149]">Failed to save settings</p>}
    </div>
  );
}

function DnsDisplay({ current }: { current: SettingsStatus['dns'] | null }): JSX.Element {
  const [testState, setTestState] = useState<TestState>({ status: 'idle' });
  const providerLabel = DNS_PROVIDERS.find(p => p.value === current?.provider)?.label;

  const handleTest = async (): Promise<void> => {
    setTestState({ status: 'testing' });
    try {
      const result = await api.settings.testDns();
      setTestState(result.ok ? { status: 'success' } : { status: 'error', error: result.error });
    } catch {
      setTestState({ status: 'error', error: 'Connection test failed' });
    }
  };

  return (
    <div className="space-y-2 text-xs text-[#8b949e]">
      {current?.domain && (
        <p>
          <span className="text-[#484f58]">Domain:</span> {current.domain}
        </p>
      )}
      <p>
        <span className="text-[#484f58]">Provider:</span> {providerLabel}
      </p>
      {current?.config?.zoneId && (
        <p>
          <span className="text-[#484f58]">Zone ID:</span> {current.config.zoneId}
        </p>
      )}
      <p>
        <span className="text-[#484f58]">Credentials:</span> Saved
      </p>
      <TestConnectionButton status={testState.status} error={testState.error} onTest={handleTest} />
    </div>
  );
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, type SettingsStatus } from '../../lib/api';
import { FormActions, FormInput, FormSelect } from './form-components';
import { TestConnectionButton, type TestState } from './test-button';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';

interface DnsConfigSectionProps {
  current: SettingsStatus['dns'] | null;
}

export function DnsConfigSection({ current }: DnsConfigSectionProps): JSX.Element {
  const [provider, setProvider] = useState(current?.provider || 'cloudflare');
  const [token, setToken] = useState('');
  const [zoneId, setZoneId] = useState(current?.config?.zoneId || '');
  const [domain, setDomain] = useState(current?.domain || '');
  const [isEditing, setIsEditing] = useState(!current?.configured);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (current?.provider) setProvider(current.provider);
    if (current?.config?.zoneId) setZoneId(current.config.zoneId);
    if (current?.domain) setDomain(current.domain);
  }, [current]);

  const mutation = useMutation({
    mutationFn: () => api.settings.saveDns(provider, { token, zoneId, domain }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setToken('');
      setIsEditing(false);
    },
  });

  const isConfigured = current?.configured ?? false;
  const formProps = {
    provider,
    token,
    zoneId,
    domain,
    isConfigured,
    isPending: mutation.isPending,
    isError: mutation.isError,
    onProviderChange: setProvider,
    onTokenChange: setToken,
    onZoneIdChange: setZoneId,
    onDomainChange: setDomain,
    onSave: (): void => mutation.mutate(),
    onCancel: (): void => setIsEditing(false),
    hasToken: Boolean(current?.config?.token),
  };

  return (
    <div className="rounded border border-[#30363d] bg-[#161b22] p-4">
      <DnsHeader
        isConfigured={isConfigured}
        isEditing={isEditing}
        onEdit={() => setIsEditing(true)}
      />
      {isEditing ? <DnsForm {...formProps} /> : <DnsDisplay current={current} />}
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

interface DnsFormProps {
  provider: string;
  token: string;
  zoneId: string;
  domain: string;
  isConfigured: boolean;
  isPending: boolean;
  isError: boolean;
  hasToken: boolean;
  onProviderChange: (v: string) => void;
  onTokenChange: (v: string) => void;
  onZoneIdChange: (v: string) => void;
  onDomainChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

function DnsForm(props: DnsFormProps): JSX.Element {
  const canSave = Boolean((props.token || props.isConfigured) && props.domain);
  const placeholder = props.hasToken ? 'Saved' : 'Enter token';

  return (
    <div className="space-y-3">
      <FormInput
        label="Base Domain"
        placeholder="example.com"
        value={props.domain}
        onChange={props.onDomainChange}
      />
      <FormSelect
        label="Provider"
        value={props.provider}
        onChange={props.onProviderChange}
        options={[
          { value: 'cloudflare', label: 'Cloudflare' },
          { value: 'netlify', label: 'Netlify' },
        ]}
      />
      <FormInput
        label="API Token"
        type="password"
        placeholder={placeholder}
        value={props.token}
        onChange={props.onTokenChange}
      />
      <FormInput
        label="Zone ID"
        placeholder="Zone ID"
        value={props.zoneId}
        onChange={props.onZoneIdChange}
      />
      <FormActions
        isPending={props.isPending}
        canSave={canSave}
        showCancel={props.isConfigured}
        onSave={props.onSave}
        onCancel={props.onCancel}
      />
      {props.isError && <p className="text-xs text-[#f85149]">Failed to save settings</p>}
    </div>
  );
}

function DnsDisplay({ current }: { current: SettingsStatus['dns'] | null }): JSX.Element {
  const [testState, setTestState] = useState<TestState>({ status: 'idle' });

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
        <span className="text-[#484f58]">Provider:</span> {current?.provider}
      </p>
      {current?.config?.zoneId && (
        <p>
          <span className="text-[#484f58]">Zone ID:</span> {current.config.zoneId}
        </p>
      )}
      <p>
        <span className="text-[#484f58]">Token:</span> Saved
      </p>
      <TestConnectionButton status={testState.status} error={testState.error} onTest={handleTest} />
    </div>
  );
}

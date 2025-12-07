import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, type SettingsStatus } from '../../lib/api';
import { FormActions, FormInput, FormSelect } from './form-components';
import { PROXY_PROVIDERS, ProxyDisplay } from './proxy-display';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';

interface ProxyConfigSectionProps {
  current: SettingsStatus['proxy'] | null;
}

export function ProxyConfigSection({ current }: ProxyConfigSectionProps): JSX.Element {
  const [isEditing, setIsEditing] = useState(!current?.configured);
  const isConfigured = current?.configured ?? false;

  return (
    <div className="rounded border border-[#30363d] bg-[#161b22] p-4">
      <ProxyHeader
        isConfigured={isConfigured}
        isEditing={isEditing}
        onEdit={() => setIsEditing(true)}
      />
      {isEditing ? (
        <ProxyEditForm current={current} onDone={() => setIsEditing(false)} />
      ) : (
        <ProxyDisplay current={current} />
      )}
    </div>
  );
}

interface ProxyHeaderProps {
  isConfigured: boolean;
  isEditing: boolean;
  onEdit: () => void;
}

function ProxyHeader({ isConfigured, isEditing, onEdit }: ProxyHeaderProps): JSX.Element {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[#c9d1d9]">Proxy Provider</span>
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
        <Tooltip content="Edit proxy settings">
          <button onClick={onEdit} className="text-xs text-[#58a6ff] hover:underline">
            Edit
          </button>
        </Tooltip>
      )}
    </div>
  );
}

interface ProxyEditFormProps {
  current: SettingsStatus['proxy'] | null;
  onDone: () => void;
}

type ProxyFormState = {
  provider: string;
  url: string;
  username: string;
  password: string;
  isPending: boolean;
  isError: boolean;
  mutate: () => void;
  isConfigured: boolean;
  isNpm: boolean;
  canSave: boolean;
  setProvider: (v: string) => void;
  setUrl: (v: string) => void;
  setUsername: (v: string) => void;
  setPassword: (v: string) => void;
  hasPassword: boolean;
};

function useProxyForm(current: SettingsStatus['proxy'] | null, onDone: () => void): ProxyFormState {
  const [provider, setProvider] = useState(current?.provider || 'npm');
  const [url, setUrl] = useState(current?.config?.url || '');
  const [username, setUsername] = useState(current?.config?.username || '');
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();
  const isConfigured = current?.configured ?? false;
  const isNpm = provider === 'npm';

  useEffect(() => {
    if (current?.provider) setProvider(current.provider);
    if (current?.config?.url) setUrl(current.config.url);
    if (current?.config?.username) setUsername(current.config.username);
  }, [current]);

  const mutation = useMutation({
    mutationFn: () => {
      const config: Record<string, string> =
        provider === 'caddy' ? { url } : { url, username, password };
      return api.settings.saveProxy(provider, config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      onDone();
    },
  });

  return {
    provider,
    url,
    username,
    password,
    isConfigured,
    isNpm,
    isPending: mutation.isPending,
    isError: mutation.isError,
    mutate: () => mutation.mutate(),
    canSave: Boolean(isNpm ? url && username && (password || isConfigured) : url),
    setProvider,
    setUrl,
    setUsername,
    setPassword,
    hasPassword: Boolean(current?.config?.password),
  };
}

function ProxyEditForm({ current, onDone }: ProxyEditFormProps): JSX.Element {
  const form = useProxyForm(current, onDone);
  const pwPlaceholder = form.hasPassword ? 'Saved' : 'Enter password';

  return (
    <div className="space-y-3">
      <FormSelect
        label="Provider"
        value={form.provider}
        onChange={form.setProvider}
        options={PROXY_PROVIDERS}
      />
      <FormInput
        label={form.isNpm ? 'NPM URL' : 'Caddy Admin API'}
        placeholder={form.isNpm ? 'http://192.168.1.100:81' : 'http://localhost:2019'}
        value={form.url}
        onChange={form.setUrl}
      />
      {form.isNpm && (
        <>
          <FormInput
            label="Username"
            placeholder="admin@example.com"
            value={form.username}
            onChange={form.setUsername}
          />
          <FormInput
            label="Password"
            type="password"
            placeholder={pwPlaceholder}
            value={form.password}
            onChange={form.setPassword}
          />
        </>
      )}
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

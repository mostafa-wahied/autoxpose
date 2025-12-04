import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, type SettingsStatus } from '../../lib/api';
import { FormActions, FormInput, FormSelect } from './form-components';
import { TestConnectionButton, type TestState } from './test-button';
import { TERMINAL_COLORS } from './theme';
import { Tooltip } from './tooltip';

interface ProxyConfigSectionProps {
  current: SettingsStatus['proxy'] | null;
}

export function ProxyConfigSection({ current }: ProxyConfigSectionProps): JSX.Element {
  const [provider] = useState('npm');
  const [url, setUrl] = useState(current?.config?.url || '');
  const [username, setUsername] = useState(current?.config?.username || '');
  const [password, setPassword] = useState('');
  const [isEditing, setIsEditing] = useState(!current?.configured);
  const queryClient = useQueryClient();
  const isConfigured = current?.configured ?? false;

  useEffect(() => {
    if (current?.config?.url) setUrl(current.config.url);
    if (current?.config?.username) setUsername(current.config.username);
  }, [current]);

  const mutation = useMutation({
    mutationFn: () => api.settings.saveProxy(provider, { url, username, password }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setPassword('');
      setIsEditing(false);
    },
  });

  return (
    <div className="rounded border border-[#30363d] bg-[#161b22] p-4">
      <ProxyHeader
        isConfigured={isConfigured}
        isEditing={isEditing}
        onEdit={() => setIsEditing(true)}
      />
      {isEditing ? (
        <ProxyForm
          provider={provider}
          url={url}
          username={username}
          password={password}
          isConfigured={isConfigured}
          isPending={mutation.isPending}
          isError={mutation.isError}
          onUrlChange={setUrl}
          onUsernameChange={setUsername}
          onPasswordChange={setPassword}
          onSave={() => mutation.mutate()}
          onCancel={() => setIsEditing(false)}
          hasPassword={Boolean(current?.config?.password)}
        />
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

interface ProxyFormProps {
  provider: string;
  url: string;
  username: string;
  password: string;
  isConfigured: boolean;
  isPending: boolean;
  isError: boolean;
  hasPassword: boolean;
  onUrlChange: (v: string) => void;
  onUsernameChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

function ProxyForm(props: ProxyFormProps): JSX.Element {
  const canSave = props.url && props.username && (props.password || props.isConfigured);
  const pwPlaceholder = props.hasPassword ? 'Saved' : 'Enter password';

  return (
    <div className="space-y-3">
      <FormSelect
        label="Provider"
        value={props.provider}
        onChange={() => {}}
        options={[{ value: 'npm', label: 'Nginx Proxy Manager' }]}
        disabled
      />
      <FormInput
        label="NPM URL"
        placeholder="http://192.168.1.100:81"
        value={props.url}
        onChange={props.onUrlChange}
      />
      <FormInput
        label="Username"
        placeholder="admin@example.com"
        value={props.username}
        onChange={props.onUsernameChange}
      />
      <FormInput
        label="Password"
        type="password"
        placeholder={pwPlaceholder}
        value={props.password}
        onChange={props.onPasswordChange}
      />
      <FormActions
        isPending={props.isPending}
        canSave={Boolean(canSave)}
        showCancel={props.isConfigured}
        onSave={props.onSave}
        onCancel={props.onCancel}
      />
      {props.isError && <p className="text-xs text-[#f85149]">Failed to save settings</p>}
    </div>
  );
}

function ProxyDisplay({ current }: { current: SettingsStatus['proxy'] | null }): JSX.Element {
  const [testState, setTestState] = useState<TestState>({ status: 'idle' });

  const handleTest = async (): Promise<void> => {
    setTestState({ status: 'testing' });
    try {
      const result = await api.settings.testProxy();
      setTestState(result.ok ? { status: 'success' } : { status: 'error', error: result.error });
    } catch {
      setTestState({ status: 'error', error: 'Connection test failed' });
    }
  };

  return (
    <div className="space-y-2 text-xs text-[#8b949e]">
      <p>
        <span className="text-[#484f58]">Provider:</span> Nginx Proxy Manager
      </p>
      <p>
        <span className="text-[#484f58]">URL:</span> {current?.config?.url}
      </p>
      <p>
        <span className="text-[#484f58]">Username:</span> {current?.config?.username}
      </p>
      <p>
        <span className="text-[#484f58]">Password:</span> Saved
      </p>
      <TestConnectionButton status={testState.status} error={testState.error} onTest={handleTest} />
    </div>
  );
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, type SettingsStatus } from '../../../lib/api';
import { FormActions, FormInput, FormSelect } from '../form-components';
import { TestConnectionButton, type TestState } from '../test-button';

export const DNS_PROVIDERS = [
  { value: 'cloudflare', label: 'Cloudflare' },
  { value: 'netlify', label: 'Netlify' },
  { value: 'digitalocean', label: 'DigitalOcean' },
  { value: 'porkbun', label: 'Porkbun' },
  { value: 'aliyun', label: 'Aliyun' },
  { value: 'dnspod', label: 'DNSPod' },
];

interface DnsFieldsProps {
  provider: string;
  token: string;
  zoneId: string;
  domain: string;
  apiKey: string;
  secretKey: string;
  accessKeyId: string;
  accessKeySecret: string;
  secretId: string;
  dnspodSecretKey: string;
  hasToken: boolean;
  hasApiKey: boolean;
  hasAccessKey: boolean;
  hasSecretId: boolean;
  onProviderChange: (v: string) => void;
  onTokenChange: (v: string) => void;
  onZoneIdChange: (v: string) => void;
  onDomainChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
  onSecretKeyChange: (v: string) => void;
  onAccessKeyIdChange: (v: string) => void;
  onAccessKeySecretChange: (v: string) => void;
  onSecretIdChange: (v: string) => void;
  onDnspodSecretKeyChange: (v: string) => void;
}

function PorkbunFields(props: {
  apiKey: string;
  secretKey: string;
  apiKeyPlaceholder: string;
  onApiKeyChange: (v: string) => void;
  onSecretKeyChange: (v: string) => void;
}): JSX.Element {
  return (
    <>
      <FormInput
        label="API Key"
        type="password"
        placeholder={props.apiKeyPlaceholder}
        value={props.apiKey}
        onChange={props.onApiKeyChange}
      />
      <FormInput
        label="Secret Key"
        type="password"
        placeholder="Enter secret key"
        value={props.secretKey}
        onChange={props.onSecretKeyChange}
      />
    </>
  );
}

function AliyunFields(props: {
  accessKeyId: string;
  accessKeySecret: string;
  hasAccessKey: boolean;
  onAccessKeyIdChange: (v: string) => void;
  onAccessKeySecretChange: (v: string) => void;
}): JSX.Element {
  const placeholder = props.hasAccessKey ? 'Saved' : 'Enter AccessKey ID';
  return (
    <>
      <FormInput
        label="AccessKey ID"
        type="password"
        placeholder={placeholder}
        value={props.accessKeyId}
        onChange={props.onAccessKeyIdChange}
      />
      <FormInput
        label="AccessKey Secret"
        type="password"
        placeholder={props.hasAccessKey ? 'Saved' : 'Enter AccessKey Secret'}
        value={props.accessKeySecret}
        onChange={props.onAccessKeySecretChange}
      />
    </>
  );
}

function DnspodFields(props: {
  secretId: string;
  dnspodSecretKey: string;
  hasSecretId: boolean;
  onSecretIdChange: (v: string) => void;
  onDnspodSecretKeyChange: (v: string) => void;
}): JSX.Element {
  const placeholder = props.hasSecretId ? 'Saved' : 'Enter SecretId';
  return (
    <>
      <FormInput
        label="SecretId"
        type="password"
        placeholder={placeholder}
        value={props.secretId}
        onChange={props.onSecretIdChange}
      />
      <FormInput
        label="SecretKey"
        type="password"
        placeholder={props.hasSecretId ? 'Saved' : 'Enter SecretKey'}
        value={props.dnspodSecretKey}
        onChange={props.onDnspodSecretKeyChange}
      />
    </>
  );
}

function DnsFormFields(props: DnsFieldsProps): JSX.Element {
  const isPorkbun = props.provider === 'porkbun';
  const isAliyun = props.provider === 'aliyun';
  const isDnspod = props.provider === 'dnspod';
  const needsZone = props.provider === 'cloudflare' || props.provider === 'netlify';
  const tokenPlaceholder = props.hasToken ? 'Saved' : 'Enter token';
  const apiKeyPlaceholder = props.hasApiKey ? 'Saved' : 'Enter API key';

  return (
    <>
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
        options={DNS_PROVIDERS}
      />
      {isPorkbun ? (
        <PorkbunFields
          apiKey={props.apiKey}
          secretKey={props.secretKey}
          apiKeyPlaceholder={apiKeyPlaceholder}
          onApiKeyChange={props.onApiKeyChange}
          onSecretKeyChange={props.onSecretKeyChange}
        />
      ) : isAliyun ? (
        <AliyunFields
          accessKeyId={props.accessKeyId}
          accessKeySecret={props.accessKeySecret}
          hasAccessKey={props.hasAccessKey}
          onAccessKeyIdChange={props.onAccessKeyIdChange}
          onAccessKeySecretChange={props.onAccessKeySecretChange}
        />
      ) : isDnspod ? (
        <DnspodFields
          secretId={props.secretId}
          dnspodSecretKey={props.dnspodSecretKey}
          hasSecretId={props.hasSecretId}
          onSecretIdChange={props.onSecretIdChange}
          onDnspodSecretKeyChange={props.onDnspodSecretKeyChange}
        />
      ) : (
        <FormInput
          label="API Token"
          type="password"
          placeholder={tokenPlaceholder}
          value={props.token}
          onChange={props.onTokenChange}
        />
      )}
      {needsZone && (
        <FormInput
          label="Zone ID"
          placeholder="Zone ID"
          value={props.zoneId}
          onChange={props.onZoneIdChange}
        />
      )}
    </>
  );
}

type DnsFormState = {
  provider: string;
  token: string;
  zoneId: string;
  domain: string;
  apiKey: string;
  secretKey: string;
  accessKeyId: string;
  accessKeySecret: string;
  secretId: string;
  dnspodSecretKey: string;
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
  setAccessKeyId: (v: string) => void;
  setAccessKeySecret: (v: string) => void;
  setSecretId: (v: string) => void;
  setDnspodSecretKey: (v: string) => void;
  hasToken: boolean;
  hasApiKey: boolean;
  hasAccessKey: boolean;
  hasSecretId: boolean;
};

function useDnsForm(current: SettingsStatus['dns'] | null, onDone: () => void): DnsFormState {
  const [provider, setProvider] = useState(current?.provider || 'cloudflare');
  const [token, setToken] = useState('');
  const [zoneId, setZoneId] = useState(current?.config?.zoneId || '');
  const [domain, setDomain] = useState(current?.domain || '');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [accessKeyId, setAccessKeyId] = useState('');
  const [accessKeySecret, setAccessKeySecret] = useState('');
  const [secretId, setSecretId] = useState('');
  const [dnspodSecretKey, setDnspodSecretKey] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (current?.provider) setProvider(current.provider);
    if (current?.config?.zoneId) setZoneId(current.config.zoneId);
    if (current?.domain) setDomain(current.domain);
  }, [current]);

  const buildConfig = (): Record<string, string> => {
    if (provider === 'porkbun') return { apiKey, secretKey, domain };
    if (provider === 'digitalocean') return { token, domain };
    if (provider === 'aliyun') return { accessKeyId, accessKeySecret, domain };
    if (provider === 'dnspod') return { secretId, secretKey: dnspodSecretKey, domain };
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
  const hasCredentials =
    provider === 'porkbun'
      ? apiKey || isConfigured
      : provider === 'aliyun'
        ? accessKeyId || isConfigured
        : provider === 'dnspod'
          ? secretId || isConfigured
          : token || isConfigured;

  return {
    provider,
    token,
    zoneId,
    domain,
    apiKey,
    secretKey,
    accessKeyId,
    accessKeySecret,
    secretId,
    dnspodSecretKey,
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
    setAccessKeyId,
    setAccessKeySecret,
    setSecretId,
    setDnspodSecretKey,
    hasToken: Boolean(current?.config?.token),
    hasApiKey: Boolean(current?.config?.apiKey),
    hasAccessKey: Boolean(current?.config?.accessKeyId),
    hasSecretId: Boolean(current?.config?.secretId),
  };
}

interface DnsEditFormProps {
  current: SettingsStatus['dns'] | null;
  onDone: () => void;
}

export function DnsEditForm({ current, onDone }: DnsEditFormProps): JSX.Element {
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
        accessKeyId={form.accessKeyId}
        accessKeySecret={form.accessKeySecret}
        secretId={form.secretId}
        dnspodSecretKey={form.dnspodSecretKey}
        hasToken={form.hasToken}
        hasApiKey={form.hasApiKey}
        hasAccessKey={form.hasAccessKey}
        hasSecretId={form.hasSecretId}
        onProviderChange={form.setProvider}
        onTokenChange={form.setToken}
        onZoneIdChange={form.setZoneId}
        onDomainChange={form.setDomain}
        onApiKeyChange={form.setApiKey}
        onSecretKeyChange={form.setSecretKey}
        onAccessKeyIdChange={form.setAccessKeyId}
        onAccessKeySecretChange={form.setAccessKeySecret}
        onSecretIdChange={form.setSecretId}
        onDnspodSecretKeyChange={form.setDnspodSecretKey}
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

export function DnsDisplay({ current }: { current: SettingsStatus['dns'] | null }): JSX.Element {
  const [testState, setTestState] = useState<TestState>({ status: 'idle' });
  const providerLabel = DNS_PROVIDERS.find(p => p.value === current?.provider)?.label;

  const handleTest = async (): Promise<void> => {
    setTestState({ status: 'testing' });
    try {
      const result = await api.settings.testDns();
      setTestState(
        result.ok
          ? { status: 'success' }
          : { status: 'error', error: result.error || 'Connection test failed' }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection test failed';
      setTestState({ status: 'error', error: message });
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

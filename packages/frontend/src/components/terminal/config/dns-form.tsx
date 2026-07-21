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
  { value: 'ovh', label: 'OVH' },
];

const OVH_ENDPOINTS = [
  { value: 'ovh-eu', label: 'OVH Europe' },
  { value: 'ovh-ca', label: 'OVH Canada' },
  { value: 'ovh-us', label: 'OVH US' },
];

interface DnsFieldsProps {
  provider: string;
  token: string;
  zoneId: string;
  domain: string;
  apiKey: string;
  secretKey: string;
  appKey: string;
  appSecret: string;
  consumerKey: string;
  endpoint: string;
  hasToken: boolean;
  hasApiKey: boolean;
  hasAppKey: boolean;
  onProviderChange: (v: string) => void;
  onTokenChange: (v: string) => void;
  onZoneIdChange: (v: string) => void;
  onDomainChange: (v: string) => void;
  onApiKeyChange: (v: string) => void;
  onSecretKeyChange: (v: string) => void;
  onAppKeyChange: (v: string) => void;
  onAppSecretChange: (v: string) => void;
  onConsumerKeyChange: (v: string) => void;
  onEndpointChange: (v: string) => void;
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

function OvhFields(props: {
  appKey: string;
  appSecret: string;
  consumerKey: string;
  endpoint: string;
  appKeyPlaceholder: string;
  onAppKeyChange: (v: string) => void;
  onAppSecretChange: (v: string) => void;
  onConsumerKeyChange: (v: string) => void;
  onEndpointChange: (v: string) => void;
}): JSX.Element {
  return (
    <>
      <FormSelect
        label="Endpoint"
        value={props.endpoint || 'ovh-eu'}
        onChange={props.onEndpointChange}
        options={OVH_ENDPOINTS}
      />
      <FormInput
        label="Application Key"
        type="password"
        placeholder={props.appKeyPlaceholder}
        value={props.appKey}
        onChange={props.onAppKeyChange}
      />
      <FormInput
        label="Application Secret"
        type="password"
        placeholder="Enter application secret"
        value={props.appSecret}
        onChange={props.onAppSecretChange}
      />
      <FormInput
        label="Consumer Key"
        type="password"
        placeholder="Enter consumer key"
        value={props.consumerKey}
        onChange={props.onConsumerKeyChange}
      />
    </>
  );
}

function DnsFormFields(props: DnsFieldsProps): JSX.Element {
  const isPorkbun = props.provider === 'porkbun';
  const isOvh = props.provider === 'ovh';
  const needsZone = props.provider === 'cloudflare' || props.provider === 'netlify';
  const tokenPlaceholder = props.hasToken ? 'Saved' : 'Enter token';
  const apiKeyPlaceholder = props.hasApiKey ? 'Saved' : 'Enter API key';
  const appKeyPlaceholder = props.hasAppKey ? 'Saved' : 'Enter application key';

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
      ) : isOvh ? (
        <OvhFields
          appKey={props.appKey}
          appSecret={props.appSecret}
          consumerKey={props.consumerKey}
          endpoint={props.endpoint}
          appKeyPlaceholder={appKeyPlaceholder}
          onAppKeyChange={props.onAppKeyChange}
          onAppSecretChange={props.onAppSecretChange}
          onConsumerKeyChange={props.onConsumerKeyChange}
          onEndpointChange={props.onEndpointChange}
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
  appKey: string;
  appSecret: string;
  consumerKey: string;
  endpoint: string;
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
  setAppKey: (v: string) => void;
  setAppSecret: (v: string) => void;
  setConsumerKey: (v: string) => void;
  setEndpoint: (v: string) => void;
  hasToken: boolean;
  hasApiKey: boolean;
  hasAppKey: boolean;
};

function useDnsForm(current: SettingsStatus['dns'] | null, onDone: () => void): DnsFormState {
  const [provider, setProvider] = useState(current?.provider || 'cloudflare');
  const [token, setToken] = useState('');
  const [zoneId, setZoneId] = useState(current?.config?.zoneId || '');
  const [domain, setDomain] = useState(current?.domain || '');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [endpoint, setEndpoint] = useState(current?.config?.endpoint || 'ovh-eu');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (current?.provider) setProvider(current.provider);
    if (current?.config?.zoneId) setZoneId(current.config.zoneId);
    if (current?.domain) setDomain(current.domain);
    if (current?.config?.endpoint) setEndpoint(current.config.endpoint);
  }, [current]);

  const buildConfig = (): Record<string, string> => {
    if (provider === 'porkbun') return { apiKey, secretKey, domain };
    if (provider === 'ovh') return { appKey, appSecret, consumerKey, endpoint, domain };
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
  const hasCredentials =
    provider === 'porkbun'
      ? apiKey || isConfigured
      : provider === 'ovh'
        ? appKey || isConfigured
        : token || isConfigured;

  return {
    provider,
    token,
    zoneId,
    domain,
    apiKey,
    secretKey,
    appKey,
    appSecret,
    consumerKey,
    endpoint,
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
    setAppKey,
    setAppSecret,
    setConsumerKey,
    setEndpoint,
    hasToken: Boolean(current?.config?.token),
    hasApiKey: Boolean(current?.config?.apiKey),
    hasAppKey: Boolean(current?.config?.appKey),
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
        appKey={form.appKey}
        appSecret={form.appSecret}
        consumerKey={form.consumerKey}
        endpoint={form.endpoint}
        hasToken={form.hasToken}
        hasApiKey={form.hasApiKey}
        hasAppKey={form.hasAppKey}
        onProviderChange={form.setProvider}
        onTokenChange={form.setToken}
        onZoneIdChange={form.setZoneId}
        onDomainChange={form.setDomain}
        onApiKeyChange={form.setApiKey}
        onSecretKeyChange={form.setSecretKey}
        onAppKeyChange={form.setAppKey}
        onAppSecretChange={form.setAppSecret}
        onConsumerKeyChange={form.setConsumerKey}
        onEndpointChange={form.setEndpoint}
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

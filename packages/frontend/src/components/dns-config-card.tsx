import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, type ProviderStatus } from '../lib/api';
import { ProviderForm } from './provider-form';

const DNS_PROVIDERS = ['cloudflare', 'netlify'];
type Props = { current: ProviderStatus | null };

function ConfigDisplay({ current }: Props): JSX.Element | null {
  if (!current?.configured) return null;
  return (
    <div className="mt-3 text-xs text-neutral-500 space-y-1">
      <p>
        <span className="text-neutral-400">Provider:</span> {current.provider}
      </p>
      {current.config?.zoneId && (
        <p>
          <span className="text-neutral-400">Zone ID:</span> {current.config.zoneId}
        </p>
      )}
      {current.config?.token && (
        <p>
          <span className="text-neutral-400">Token:</span> {current.config.token}
        </p>
      )}
    </div>
  );
}

export function DnsConfigCard({ current }: Props): JSX.Element {
  const [provider, setProvider] = useState(current?.provider || 'cloudflare');
  const [token, setToken] = useState('');
  const [zoneId, setZoneId] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (current?.provider) setProvider(current.provider);
    if (current?.config?.zoneId) setZoneId(current.config.zoneId);
  }, [current]);

  const mutation = useMutation({
    mutationFn: () => api.settings.saveDns(provider, { token, zoneId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setToken('');
    },
  });

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h3 className="font-medium">DNS Provider</h3>
      <p className="mt-1 text-sm text-neutral-500">Configure DNS for automatic record creation</p>
      <ProviderForm
        providers={DNS_PROVIDERS}
        provider={provider}
        onProviderChange={setProvider}
        onSubmit={() => mutation.mutate()}
        isPending={mutation.isPending}
        isSuccess={mutation.isSuccess}
        isError={mutation.isError}
        buttonText="Save DNS"
      >
        <input
          type="password"
          placeholder={current?.config?.token ? 'API Token (saved)' : 'API Token'}
          value={token}
          onChange={e => setToken(e.target.value)}
          className="w-full rounded border border-neutral-300 p-2 text-sm"
        />
        <input
          type="text"
          placeholder="Zone ID"
          value={zoneId}
          onChange={e => setZoneId(e.target.value)}
          className="w-full rounded border border-neutral-300 p-2 text-sm"
        />
      </ProviderForm>
      <ConfigDisplay current={current} />
    </div>
  );
}

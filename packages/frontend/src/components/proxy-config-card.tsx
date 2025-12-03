import { useProxyConfig } from '../hooks/use-proxy-config';
import type { ProviderStatus } from '../lib/api';
import { ProviderForm } from './provider-form';
import { ConfigDisplay } from './ui';

const PROVIDERS = ['npm'];
type Props = { current: ProviderStatus | null };

export function ProxyConfigCard({ current }: Props): JSX.Element {
  const cfg = useProxyConfig(current);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h3 className="font-medium">Proxy Provider</h3>
      <p className="mt-1 text-sm text-neutral-500">Configure reverse proxy for routing traffic</p>
      <ProviderForm
        providers={PROVIDERS}
        provider={cfg.provider}
        onProviderChange={cfg.setProvider}
        onSubmit={() => cfg.mutation.mutate()}
        isPending={cfg.mutation.isPending}
        isSuccess={cfg.mutation.isSuccess}
        isError={cfg.mutation.isError}
        buttonText="Save Proxy"
      >
        <input
          type="text"
          placeholder="NPM URL (e.g. http://your-lan-ip:81)"
          value={cfg.url}
          onChange={e => cfg.setUrl(e.target.value)}
          className="w-full rounded border border-neutral-300 p-2 text-sm"
        />
        <input
          type="text"
          placeholder="Username"
          value={cfg.username}
          onChange={e => cfg.setUsername(e.target.value)}
          className="w-full rounded border border-neutral-300 p-2 text-sm"
        />
        <input
          type="password"
          placeholder={current?.config?.password ? 'Password (saved)' : 'Password'}
          value={cfg.password}
          onChange={e => cfg.setPassword(e.target.value)}
          className="w-full rounded border border-neutral-300 p-2 text-sm"
        />
      </ProviderForm>
      <ConfigDisplay current={current} />
    </div>
  );
}

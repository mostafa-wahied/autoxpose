import { useQuery } from '@tanstack/react-query';
import { DnsConfigCard } from '../components/dns-config-card';
import { ProxyConfigCard } from '../components/proxy-config-card';
import { api } from '../lib/api';

export function Settings(): JSX.Element {
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: api.settings.status });

  if (isLoading) return <div className="text-neutral-500">Loading settings...</div>;

  return (
    <div>
      <h1 className="text-2xl font-medium tracking-tight">Settings</h1>
      <p className="mt-2 text-neutral-600">
        Configure DNS and proxy providers for automatic exposure.
      </p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <DnsConfigCard current={data?.dns ?? null} />
        <ProxyConfigCard current={data?.proxy ?? null} />
      </div>
    </div>
  );
}

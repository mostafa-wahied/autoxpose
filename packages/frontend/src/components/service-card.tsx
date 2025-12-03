import { useServiceMutations } from '../hooks/use-service-mutations';
import type { ServiceRecord } from '../lib/api';

type Props = { service: ServiceRecord };

function getPublicUrl(svc: ServiceRecord, exposed: boolean): string {
  if (!svc.domain || !exposed) return '';
  return `https://${svc.domain}`;
}

function ServiceLink({ url }: { url: string }): JSX.Element {
  if (!url) return <p className="mt-1 text-sm text-neutral-500">No domain configured</p>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 block text-sm text-blue-600 hover:underline"
    >
      {url}
    </a>
  );
}

function ActionButtons({
  toggle,
  del,
  isExposed,
  isLoading,
}: {
  toggle: { mutate: () => void; isPending: boolean };
  del: { mutate: () => void; isPending: boolean };
  isExposed: boolean;
  isLoading: boolean;
}): JSX.Element {
  const toggleCls = isExposed
    ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
    : 'bg-emerald-600 text-white hover:bg-emerald-700';
  const toggleText = toggle.isPending
    ? isExposed
      ? 'Removing...'
      : 'Exposing...'
    : isExposed
      ? 'Unexpose'
      : 'Expose';

  return (
    <div className="mt-4 flex gap-2">
      <button
        onClick={(): void => {
          toggle.mutate();
        }}
        disabled={isLoading}
        className={`rounded px-3 py-1.5 text-sm font-medium ${toggleCls} ${isLoading ? 'opacity-50' : ''}`}
      >
        {toggleText}
      </button>
      <button
        onClick={(): void => {
          del.mutate();
        }}
        disabled={isLoading}
        className={`rounded bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 ${del.isPending ? 'opacity-50' : ''}`}
      >
        {del.isPending ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  );
}

export function ServiceCard({ service }: Props): JSX.Element {
  const { expose, unexpose, del } = useServiceMutations(service.id);
  const isExposed = Boolean(service.dnsRecordId || service.proxyHostId);
  const toggle = isExposed ? unexpose : expose;
  const isLoading = toggle.isPending || del.isPending;
  const statusCls = isExposed
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-neutral-100 text-neutral-600';

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium text-neutral-900">{service.name}</h3>
          <ServiceLink url={getPublicUrl(service, isExposed)} />
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusCls}`}>
          {isExposed ? 'Exposed' : 'Not Exposed'}
        </span>
      </div>
      <div className="mt-3 text-xs text-neutral-400">Source: {service.source}</div>
      <ActionButtons toggle={toggle} del={del} isExposed={isExposed} isLoading={isLoading} />
    </div>
  );
}

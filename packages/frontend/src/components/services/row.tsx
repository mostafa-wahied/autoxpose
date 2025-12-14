import { useServiceMutations } from '../../hooks/use-service-mutations';
import type { ServiceRecord } from '../../lib/api';
import { StatusBadge } from '../ui';

type Props = { service: ServiceRecord };

function SubdomainCell({ subdomain, url }: { subdomain: string; url: string }): JSX.Element {
  if (!url) return <span className="text-neutral-400">-</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:underline"
    >
      {subdomain}
    </a>
  );
}

function ActionCell({
  isExposed,
  isLoading,
  onToggle,
  onDelete,
  delPending,
}: {
  isExposed: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onDelete: () => void;
  delPending: boolean;
}): JSX.Element {
  const btnCls = isExposed
    ? 'text-neutral-600 hover:text-neutral-800'
    : 'text-emerald-600 hover:text-emerald-700';
  const toggleText = isLoading
    ? isExposed
      ? 'Removing...'
      : 'Exposing...'
    : isExposed
      ? 'Unexpose'
      : 'Expose';
  return (
    <td className="py-3 pr-4 flex gap-2">
      <button
        onClick={onToggle}
        disabled={isLoading || delPending}
        className={`text-sm disabled:opacity-50 ${btnCls}`}
      >
        {toggleText}
      </button>
      <button
        onClick={onDelete}
        disabled={isLoading || delPending}
        className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
      >
        {delPending ? 'Deleting...' : 'Delete'}
      </button>
    </td>
  );
}

export function ServiceRow({ service }: Props): JSX.Element {
  const { expose, unexpose, del } = useServiceMutations(service.id);
  const isExposed = Boolean(service.dnsRecordId || service.proxyHostId);
  const isLoading = expose.isPending || unexpose.isPending;
  const url = service.subdomain ? (isExposed ? `https://${service.subdomain}` : '') : '';

  return (
    <tr className="border-b border-neutral-100">
      <td className="py-3 pl-4 pr-4">
        <div className="font-medium text-neutral-900">{service.name}</div>
      </td>
      <td className="py-3 pr-4 text-sm">
        <SubdomainCell subdomain={service.subdomain || ''} url={url} />
      </td>
      <td className="py-3 pr-4 font-mono text-xs text-neutral-500">:{service.port}</td>
      <td className="py-3 pr-4">
        <StatusBadge isLoading={isLoading} isExposing={expose.isPending} isExposed={isExposed} />
      </td>
      <td className="py-3 pr-4 text-sm text-neutral-500">{service.source}</td>
      <ActionCell
        isExposed={isExposed}
        isLoading={isLoading}
        onToggle={(): void => {
          (isExposed ? unexpose : expose).mutate();
        }}
        onDelete={(): void => {
          del.mutate();
        }}
        delPending={del.isPending}
      />
    </tr>
  );
}

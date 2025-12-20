import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ServiceRecord } from '../../lib/api';

export function CleanupSection(): JSX.Element {
  const queryClient = useQueryClient();
  const [working, setWorking] = useState<Record<string, boolean>>({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['orphans'],
    queryFn: api.services.getOrphans,
    refetchInterval: 5000,
  });

  const cleanupMutation = useMutation({
    mutationFn: (id: string) => api.services.cleanup(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orphans'] });
      void queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });

  const handleCleanup = (id: string): void => {
    setWorking({ ...working, [id]: true });
    cleanupMutation.mutate(id, {
      onSettled: () => {
        setWorking({ ...working, [id]: false });
        void refetch();
      },
    });
  };

  const orphans = data?.orphans ?? [];

  if (isLoading) {
    return (
      <div className="rounded-md border border-[#30363d] bg-[#161b22] p-4">
        <h4 className="mb-3 text-sm font-semibold text-[#c9d1d9]">Orphaned Resources</h4>
        <p className="text-xs text-[#8b949e]">Loading...</p>
      </div>
    );
  }

  if (orphans.length === 0) {
    return (
      <div className="rounded-md border border-[#30363d] bg-[#161b22] p-4">
        <h4 className="mb-3 text-sm font-semibold text-[#c9d1d9]">Orphaned Resources</h4>
        <p className="text-xs text-[#8b949e]">
          No orphaned resources found. Services created by autoxpose with no matching container will
          appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-[#30363d] bg-[#161b22] p-4">
      <h4 className="mb-3 text-sm font-semibold text-[#c9d1d9]">
        Orphaned Resources ({orphans.length})
      </h4>
      <p className="mb-3 text-xs text-[#8b949e]">
        These services were created by autoxpose but their containers no longer exist.
      </p>
      <div className="space-y-2">
        {orphans.map(orphan => (
          <OrphanRow
            key={orphan.id}
            orphan={orphan}
            onCleanup={handleCleanup}
            isWorking={working[orphan.id] ?? false}
          />
        ))}
      </div>
    </div>
  );
}

interface OrphanRowProps {
  orphan: ServiceRecord;
  onCleanup: (id: string) => void;
  isWorking: boolean;
}

function OrphanRow({ orphan, onCleanup, isWorking }: OrphanRowProps): JSX.Element {
  const created = orphan.createdAt ? new Date(orphan.createdAt).toLocaleString() : 'Unknown';

  return (
    <div className="flex items-center justify-between rounded border border-[#30363d] bg-[#0d1117] p-3">
      <div className="flex-1">
        <div className="text-xs font-semibold text-[#c9d1d9]">{orphan.name}</div>
        <div className="mt-1 text-xs text-[#8b949e]">
          {orphan.subdomain}:{orphan.port} • Created {created}
        </div>
      </div>
      <button
        onClick={() => onCleanup(orphan.id)}
        disabled={isWorking}
        className="rounded bg-[#da3633] px-3 py-1 text-xs font-semibold text-white transition-all hover:bg-[#e5534b] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isWorking ? 'Cleaning...' : 'Clean Up'}
      </button>
    </div>
  );
}

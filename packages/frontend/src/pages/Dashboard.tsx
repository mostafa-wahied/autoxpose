import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DashboardHeader } from '../components/dashboard-header';
import { ServiceCard } from '../components/service-card';
import { api } from '../lib/api';

export function Dashboard(): JSX.Element {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['services'],
    queryFn: api.services.list,
  });
  const scanMutation = useMutation({
    mutationFn: api.discovery.scan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services'] }),
  });

  if (isLoading)
    return <div className="flex h-64 items-center justify-center text-neutral-500">Loading...</div>;
  if (error)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        Failed to load
      </div>
    );

  const services = data?.services || [];

  return (
    <div>
      <DashboardHeader
        onScan={() => scanMutation.mutate()}
        isPending={scanMutation.isPending}
        count={services.length}
      />

      {scanMutation.isSuccess && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          Scan: {scanMutation.data.created} created, {scanMutation.data.updated} updated
        </div>
      )}

      {services.length === 0 ? (
        <div className="mt-8 rounded-lg border-2 border-dashed border-neutral-200 p-8 text-center">
          <p className="text-neutral-500">No services yet. Click Scan Containers to discover.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map(s => (
            <ServiceCard key={s.id} service={s} />
          ))}
        </div>
      )}
    </div>
  );
}

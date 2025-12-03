import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { api, type ServiceRecord } from '../lib/api';

type ServiceMutationsReturn = {
  expose: UseMutationResult<{ service: ServiceRecord }, Error, void, unknown>;
  unexpose: UseMutationResult<{ service: ServiceRecord }, Error, void, unknown>;
  del: UseMutationResult<{ success: boolean }, Error, void, unknown>;
  invalidate: () => void;
};

export function useServiceMutations(serviceId: string): ServiceMutationsReturn {
  const qc = useQueryClient();
  const invalidate = (): void => {
    qc.invalidateQueries({ queryKey: ['services'] });
  };

  const expose = useMutation({
    mutationFn: () => api.services.expose(serviceId),
    onSuccess: invalidate,
  });

  const unexpose = useMutation({
    mutationFn: () => api.services.unexpose(serviceId),
    onSuccess: invalidate,
  });

  const del = useMutation({
    mutationFn: () => api.services.delete(serviceId),
    onSuccess: invalidate,
  });

  return { expose, unexpose, del, invalidate };
}

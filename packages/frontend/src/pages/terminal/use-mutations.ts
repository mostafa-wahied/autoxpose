import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';

type ScanResult = { discovered: number; created: number; updated: number; removed: number };
type DeleteResult = { success: boolean };

interface MutationsReturn {
  scanMutation: UseMutationResult<ScanResult, Error, void>;
  deleteMutation: UseMutationResult<DeleteResult, Error, string>;
  deletingServiceId: string | null;
  setDeletingServiceId: (id: string | null) => void;
}

export function useTerminalMutations(): MutationsReturn {
  const queryClient = useQueryClient();
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);

  const scanMutation = useMutation({
    mutationFn: api.discovery.scan,
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (serviceId: string) => api.services.delete(serviceId),
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setDeletingServiceId(null);
    },
  });

  return { scanMutation, deleteMutation, deletingServiceId, setDeletingServiceId };
}

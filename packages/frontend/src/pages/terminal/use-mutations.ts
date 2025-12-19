import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useState, useRef, useCallback } from 'react';
import { api, type ServiceRecord } from '../../lib/api';
import { useAutoExposePolling } from './use-auto-expose-polling';

type ScanResult = {
  discovered: number;
  created: number;
  updated: number;
  removed: number;
  autoExposed?: number;
  autoExposingServices?: Array<{ id: string; name: string; subdomain: string }>;
};
type DeleteResult = { success: boolean };
type UpdateResult = { service: ServiceRecord };
type UpdateInput = { id: string; subdomain?: string; name?: string };
type RetrySslResult = { success: boolean; error?: string };

interface MutationsReturn {
  scanMutation: UseMutationResult<ScanResult, Error, void>;
  deleteMutation: UseMutationResult<DeleteResult, Error, string>;
  updateMutation: UseMutationResult<UpdateResult, Error, UpdateInput>;
  retrySslMutation: UseMutationResult<RetrySslResult, Error, string>;
  deletingServiceId: string | null;
  setDeletingServiceId: (id: string | null) => void;
  scanTrigger: number;
}

export function useTerminalMutations(): MutationsReturn {
  const queryClient = useQueryClient();
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [autoExposingIds, setAutoExposingIds] = useState<Set<string>>(new Set());
  const [scanTrigger, setScanTrigger] = useState(0);
  const scanResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scanMutation = useMutation({
    mutationFn: api.discovery.scan,
    onSuccess: (data: ScanResult): void => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setScanTrigger(prev => prev + 1);
      if (data.autoExposingServices && data.autoExposingServices.length > 0) {
        setAutoExposingIds(new Set(data.autoExposingServices.map(s => s.id)));
      }

      if (scanResetTimeoutRef.current) {
        clearTimeout(scanResetTimeoutRef.current);
      }

      scanResetTimeoutRef.current = setTimeout(() => {
        scanMutation.reset();
      }, 30000);
    },
  });

  const handlePollingComplete = useCallback(() => {
    setAutoExposingIds(new Set());
  }, []);

  useAutoExposePolling({
    autoExposingIds,
    scanMutation,
    scanResetTimeoutRef,
    onComplete: handlePollingComplete,
  });

  const deleteMutation = useMutation({
    mutationFn: (serviceId: string) => api.services.delete(serviceId),
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setDeletingServiceId(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateInput) => {
      const updates: Partial<{ name: string; subdomain: string }> = {};
      if (input.subdomain !== undefined) updates.subdomain = input.subdomain;
      if (input.name !== undefined) updates.name = input.name;
      return api.services.update(input.id, updates);
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });

  const retrySslMutation = useMutation({
    mutationFn: (serviceId: string) => api.services.retrySsl(serviceId),
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });

  return {
    scanMutation,
    deleteMutation,
    updateMutation,
    retrySslMutation,
    deletingServiceId,
    setDeletingServiceId,
    scanTrigger,
  };
}

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { type ServiceRecord } from '../../lib/api';

interface PollingConfig {
  autoExposingIds: Set<string>;
  scanMutation: UseMutationResult<unknown, Error, void>;
  scanResetTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  onComplete: () => void;
}

export function useAutoExposePolling(config: PollingConfig): void {
  const { autoExposingIds, scanMutation, scanResetTimeoutRef, onComplete } = config;
  const queryClient = useQueryClient();
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkCompletion = useCallback(() => {
    const servicesData = queryClient.getQueryData<ServiceRecord[]>(['services']);
    if (!servicesData) return false;

    const hasUnexposedServices = Array.from(autoExposingIds).some(id => {
      const service = servicesData.find(s => s.id === id);
      return service && !service.enabled;
    });

    return !hasUnexposedServices;
  }, [autoExposingIds, queryClient]);

  const handleComplete = useCallback(() => {
    onComplete();
    if (scanResetTimeoutRef.current) {
      clearTimeout(scanResetTimeoutRef.current);
    }
    scanMutation.reset();
  }, [onComplete, scanResetTimeoutRef, scanMutation]);

  useEffect(() => {
    if (autoExposingIds.size === 0) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollIntervalRef.current = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['services'] });

      if (checkCompletion()) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        handleComplete();
      }
    }, 2000);

    return (): void => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [autoExposingIds, queryClient, checkCompletion, handleComplete]);
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../lib/api';

export function useChangeDetection(): void {
  const queryClient = useQueryClient();
  const lastVersionRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const { data } = useQuery({
    queryKey: ['changes', 'version'],
    queryFn: api.services.getChangesVersion,
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (!data) return;

    if (lastVersionRef.current === 0) {
      lastVersionRef.current = data.version;
      return;
    }

    if (data.version !== lastVersionRef.current) {
      lastVersionRef.current = data.version;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['services'] });
        timerRef.current = null;
      }, 250);
    }
  }, [data, queryClient]);

  useEffect(() => {
    const cleanup = (): void => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    return cleanup;
  }, []);
}

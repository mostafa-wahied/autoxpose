import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import type { ProgressEvent, ProgressStep } from '../lib/progress.types';

export interface ExposeStreamState {
  isActive: boolean;
  serviceId: string | null;
  action: 'expose' | 'unexpose' | null;
  steps: ProgressStep[];
  result: ProgressEvent['result'] | null;
  error: string | null;
}

const initialState: ExposeStreamState = {
  isActive: false,
  serviceId: null,
  action: null,
  steps: [],
  result: null,
  error: null,
};

export interface UseExposeStreamReturn {
  state: ExposeStreamState;
  expose: (serviceId: string) => void;
  unexpose: (serviceId: string) => void;
  clear: () => void;
}

function createInitialSteps(action: 'expose' | 'unexpose'): ProgressStep[] {
  const verb = action === 'expose' ? 'Creating' : 'Removing';
  return [
    {
      phase: 'dns',
      status: 'pending',
      progress: 0,
      message: `${verb} DNS record`,
      detail: 'Waiting...',
    },
    {
      phase: 'proxy',
      status: 'pending',
      progress: 0,
      message: `${verb} proxy host`,
      detail: 'Waiting...',
    },
  ];
}

type SetState = React.Dispatch<React.SetStateAction<ExposeStreamState>>;

function handleMessage(event: MessageEvent, setState: SetState, onComplete: () => void): void {
  const data: ProgressEvent = JSON.parse(event.data);
  setState(prev => ({ ...prev, steps: data.steps, result: data.result ?? prev.result }));

  if (data.type === 'complete' || data.type === 'error') {
    onComplete();
  }
}

function handleError(setState: SetState): void {
  setState(prev => ({ ...prev, isActive: false, error: 'Connection lost. Please try again.' }));
}

export function useExposeStream(): UseExposeStreamReturn {
  const [state, setState] = useState<ExposeStreamState>(initialState);
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const startStream = useCallback(
    (serviceId: string, action: 'expose' | 'unexpose') => {
      cleanup();

      setState({
        isActive: true,
        serviceId,
        action,
        steps: createInitialSteps(action),
        result: null,
        error: null,
      });

      const url = `/api/services/${serviceId}/${action}/stream`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      const onComplete = (): void => {
        eventSource.close();
        eventSourceRef.current = null;
        setTimeout(() => {
          setState((prev): ExposeStreamState => ({ ...prev, isActive: false }));
          queryClient.invalidateQueries({ queryKey: ['services'] });
        }, 500);
      };

      eventSource.onmessage = (e): void => handleMessage(e, setState, onComplete);
      eventSource.onerror = (): void => {
        handleError(setState);
        eventSource.close();
        eventSourceRef.current = null;
      };
    },
    [cleanup, queryClient]
  );

  const expose = useCallback((id: string): void => startStream(id, 'expose'), [startStream]);
  const unexpose = useCallback((id: string): void => startStream(id, 'unexpose'), [startStream]);
  const clear = useCallback((): void => {
    cleanup();
    setState(initialState);
  }, [cleanup]);

  return { state, expose, unexpose, clear };
}

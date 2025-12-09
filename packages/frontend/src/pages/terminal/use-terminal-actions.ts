import { useCallback, useEffect, useMemo, useState } from 'react';
import { useExposeStream, type ExposeStreamState } from '../../hooks/use-expose-stream';
import { type ServiceRecord } from '../../lib/api';
import { type ConfirmAction } from './confirm-dialogs';
import { useTerminalMutations } from './use-mutations';

type ScanMutation = ReturnType<typeof useTerminalMutations>['scanMutation'];
type DeleteMutation = ReturnType<typeof useTerminalMutations>['deleteMutation'];
type BatchAction = { action: 'expose' | 'unexpose'; queue: string[] } | null;

export interface TerminalActions {
  handleExpose: (service: ServiceRecord) => void;
  handleDelete: (service: ServiceRecord) => void;
  handleSubdomainChange: (service: ServiceRecord, subdomain: string) => void;
  handleExposeAll: () => void;
  handleUnexposeAll: () => void;
  handleScan: () => void;
  handleConfirm: () => void;
  handleUnexpose: (service: ServiceRecord) => void;
  handleRetrySsl: () => void;
  setConfirmAction: (action: ConfirmAction) => void;
}

export interface TerminalState {
  streamState: ExposeStreamState;
  scanMutation: ScanMutation;
  retrySslMutation: ReturnType<typeof useTerminalMutations>['retrySslMutation'];
  confirmAction: ConfirmAction;
  deletingServiceId: string | null;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

interface ConfirmParams {
  confirmAction: ConfirmAction;
  services: ServiceRecord[];
  deleteMutation: DeleteMutation;
  expose: (id: string) => void;
  unexpose: (id: string) => void;
  startBatch: (action: 'expose' | 'unexpose', ids: string[]) => void;
  setDeletingServiceId: (id: string | null) => void;
  setConfirmAction: (action: ConfirmAction) => void;
}

function executeConfirm(p: ConfirmParams): void {
  if (!p.confirmAction) return;
  if (p.confirmAction.type === 'delete') {
    p.setDeletingServiceId(p.confirmAction.service.id);
    p.deleteMutation.mutate(p.confirmAction.service.id);
  } else if (p.confirmAction.type === 'expose-all') {
    const targets = p.services.filter(s => !s.enabled).map(s => s.id);
    p.startBatch('expose', targets);
  } else if (p.confirmAction.type === 'unexpose-all') {
    const targets = p.services.filter(s => s.enabled).map(s => s.id);
    p.startBatch('unexpose', targets);
  }
  p.setConfirmAction(null);
}

interface Params {
  services: ServiceRecord[];
  needsSetup?: boolean;
}

interface Handlers {
  expose: (id: string) => void;
  unexpose: (id: string) => void;
  clear: () => void;
  scanMutation: ScanMutation;
  updateMutation: ReturnType<typeof useTerminalMutations>['updateMutation'];
  retrySslMutation: ReturnType<typeof useTerminalMutations>['retrySslMutation'];
  activeServiceId: string | null;
}

function useHandlers(
  h: Handlers,
  setConfirmAction: (a: ConfirmAction) => void
): Omit<TerminalActions, 'handleConfirm' | 'setConfirmAction'> {
  const handleExpose = useCallback(
    (s: ServiceRecord): void => (h.clear(), s.enabled ? h.unexpose(s.id) : h.expose(s.id)),
    [h]
  );
  const handleUnexpose = useCallback(
    (s: ServiceRecord): void => (h.clear(), h.unexpose(s.id)),
    [h]
  );
  const handleDelete = useCallback(
    (s: ServiceRecord): void => setConfirmAction({ type: 'delete', service: s }),
    [setConfirmAction]
  );
  const handleSubdomainChange = useCallback(
    (s: ServiceRecord, subdomain: string): void => h.updateMutation.mutate({ id: s.id, subdomain }),
    [h.updateMutation]
  );
  const handleExposeAll = useCallback(
    (): void => setConfirmAction({ type: 'expose-all' }),
    [setConfirmAction]
  );
  const handleUnexposeAll = useCallback(
    (): void => setConfirmAction({ type: 'unexpose-all' }),
    [setConfirmAction]
  );
  const handleScan = useCallback((): void => h.scanMutation.mutate(), [h.scanMutation]);
  const handleRetrySsl = useCallback((): void => {
    if (h.activeServiceId) h.retrySslMutation.mutate(h.activeServiceId);
  }, [h.activeServiceId, h.retrySslMutation]);
  return {
    handleExpose,
    handleDelete,
    handleSubdomainChange,
    handleExposeAll,
    handleUnexposeAll,
    handleScan,
    handleUnexpose,
    handleRetrySsl,
  };
}

function useMutationsAndState(needsSetup: boolean): {
  streamState: ExposeStreamState;
  expose: (id: string) => void;
  unexpose: (id: string) => void;
  clear: () => void;
  mutations: ReturnType<typeof useTerminalMutations>;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
  confirmAction: ConfirmAction;
  setConfirmAction: (a: ConfirmAction) => void;
} {
  const { state: streamState, expose, unexpose, clear } = useExposeStream();
  const mutations = useTerminalMutations();
  const [settingsOpen, setSettingsOpen] = useState(needsSetup);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  useEffect(() => {
    if (needsSetup && !settingsOpen) setSettingsOpen(true);
  }, [needsSetup, settingsOpen]);

  return {
    streamState,
    expose,
    unexpose,
    clear,
    mutations,
    settingsOpen,
    setSettingsOpen,
    confirmAction,
    setConfirmAction,
  };
}

function useBatchQueue(params: {
  clear: () => void;
  expose: (id: string) => void;
  unexpose: (id: string) => void;
  streamState: ExposeStreamState;
}): { startBatch: (action: 'expose' | 'unexpose', ids: string[]) => void } {
  const [batch, setBatch] = useState<BatchAction>(null);

  const startBatch = useCallback(
    (action: 'expose' | 'unexpose', ids: string[]): void => {
      const unique = ids.filter(Boolean);
      if (unique.length === 0) return;
      params.clear();
      setBatch({ action, queue: unique });
    },
    [params]
  );

  useEffect(() => {
    if (!batch) return;
    if (params.streamState.isActive) return;
    const [next, ...rest] = batch.queue;
    if (!next) {
      setBatch(null);
      return;
    }
    if (batch.action === 'expose') {
      params.expose(next);
    } else {
      params.unexpose(next);
    }
    setBatch(
      rest.length > 0 ? { action: batch.action, queue: rest } : { action: batch.action, queue: [] }
    );
  }, [batch, params]);

  return { startBatch };
}

export function useTerminalActions({ services, needsSetup = false }: Params): {
  actions: TerminalActions;
  state: TerminalState;
} {
  const ctx = useMutationsAndState(needsSetup);
  const { streamState, expose, unexpose, mutations, confirmAction, setConfirmAction, clear } = ctx;

  const { startBatch } = useBatchQueue({
    clear,
    expose,
    unexpose,
    streamState,
  });

  const handlers = useHandlers(
    {
      expose,
      unexpose,
      clear,
      scanMutation: mutations.scanMutation,
      updateMutation: mutations.updateMutation,
      retrySslMutation: mutations.retrySslMutation,
      activeServiceId: streamState.serviceId,
    },
    setConfirmAction
  );

  const handleConfirm = useCallback(
    (): void =>
      executeConfirm({
        confirmAction,
        services,
        deleteMutation: mutations.deleteMutation,
        expose,
        unexpose,
        startBatch,
        setDeletingServiceId: mutations.setDeletingServiceId,
        setConfirmAction,
      }),
    [confirmAction, services, mutations, expose, startBatch, unexpose, setConfirmAction]
  );

  const actions = useMemo(
    (): TerminalActions => ({ ...handlers, handleConfirm, setConfirmAction }),
    [handlers, handleConfirm, setConfirmAction]
  );

  const state = useMemo(
    (): TerminalState => ({
      streamState,
      scanMutation: mutations.scanMutation,
      retrySslMutation: mutations.retrySslMutation,
      confirmAction,
      deletingServiceId: mutations.deletingServiceId,
      settingsOpen: ctx.settingsOpen,
      setSettingsOpen: ctx.setSettingsOpen,
    }),
    [streamState, mutations, confirmAction, ctx.settingsOpen, ctx.setSettingsOpen]
  );

  return { actions, state };
}

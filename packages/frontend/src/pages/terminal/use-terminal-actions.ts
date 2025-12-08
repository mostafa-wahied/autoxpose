import { useCallback, useEffect, useMemo, useState } from 'react';
import { useExposeStream, type ExposeStreamState } from '../../hooks/use-expose-stream';
import { type ServiceRecord } from '../../lib/api';
import { type ConfirmAction } from './confirm-dialogs';
import { useTerminalMutations } from './use-mutations';

type ScanMutation = ReturnType<typeof useTerminalMutations>['scanMutation'];
type DeleteMutation = ReturnType<typeof useTerminalMutations>['deleteMutation'];

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
  setDeletingServiceId: (id: string | null) => void;
  setConfirmAction: (action: ConfirmAction) => void;
}

function executeConfirm(p: ConfirmParams): void {
  if (!p.confirmAction) return;
  if (p.confirmAction.type === 'delete') {
    p.setDeletingServiceId(p.confirmAction.service.id);
    p.deleteMutation.mutate(p.confirmAction.service.id);
  } else if (p.confirmAction.type === 'expose-all') {
    const t = p.services.find(s => !s.enabled);
    if (t) p.expose(t.id);
  } else if (p.confirmAction.type === 'unexpose-all') {
    const t = p.services.find(s => s.enabled);
    if (t) p.unexpose(t.id);
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

export function useTerminalActions({ services, needsSetup = false }: Params): {
  actions: TerminalActions;
  state: TerminalState;
} {
  const ctx = useMutationsAndState(needsSetup);
  const { streamState, expose, unexpose, clear, mutations, confirmAction, setConfirmAction } = ctx;

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
        setDeletingServiceId: mutations.setDeletingServiceId,
        setConfirmAction,
      }),
    [confirmAction, services, mutations, expose, unexpose, setConfirmAction]
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

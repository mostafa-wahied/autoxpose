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
  setConfirmAction: (action: ConfirmAction) => void;
}

export interface TerminalState {
  streamState: ExposeStreamState;
  scanMutation: ScanMutation;
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
}

function useHandlers(
  h: Handlers,
  setConfirmAction: (a: ConfirmAction) => void
): Omit<TerminalActions, 'handleConfirm' | 'setConfirmAction'> {
  const handleExpose = useCallback(
    (s: ServiceRecord): void => (h.clear(), s.enabled ? h.unexpose(s.id) : h.expose(s.id)),
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
  return {
    handleExpose,
    handleDelete,
    handleSubdomainChange,
    handleExposeAll,
    handleUnexposeAll,
    handleScan,
  };
}

export function useTerminalActions({ services, needsSetup = false }: Params): {
  actions: TerminalActions;
  state: TerminalState;
} {
  const { state: streamState, expose, unexpose, clear } = useExposeStream();
  const { scanMutation, deleteMutation, updateMutation, deletingServiceId, setDeletingServiceId } =
    useTerminalMutations();
  const [settingsOpen, setSettingsOpen] = useState(needsSetup);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  useEffect(() => {
    if (needsSetup && !settingsOpen) setSettingsOpen(true);
  }, [needsSetup, settingsOpen]);

  const handlers = useHandlers(
    { expose, unexpose, clear, scanMutation, updateMutation },
    setConfirmAction
  );
  const handleConfirm = useCallback(
    (): void =>
      executeConfirm({
        confirmAction,
        services,
        deleteMutation,
        expose,
        unexpose,
        setDeletingServiceId,
        setConfirmAction,
      }),
    [confirmAction, services, deleteMutation, expose, unexpose, setDeletingServiceId]
  );

  const actions = useMemo(
    (): TerminalActions => ({ ...handlers, handleConfirm, setConfirmAction }),
    [handlers, handleConfirm]
  );
  const state = useMemo(
    (): TerminalState => ({
      streamState,
      scanMutation,
      confirmAction,
      deletingServiceId,
      settingsOpen,
      setSettingsOpen,
    }),
    [streamState, scanMutation, confirmAction, deletingServiceId, settingsOpen]
  );
  return { actions, state };
}

import { useCallback, useMemo, useState } from 'react';
import { useExposeStream, type ExposeStreamState } from '../../hooks/use-expose-stream';
import { type ServiceRecord } from '../../lib/api';
import { type ConfirmAction } from './confirm-dialogs';
import { useTerminalMutations } from './use-mutations';

type ScanMutation = ReturnType<typeof useTerminalMutations>['scanMutation'];
type DeleteMutation = ReturnType<typeof useTerminalMutations>['deleteMutation'];

export interface TerminalActions {
  handleExpose: (service: ServiceRecord) => void;
  handleDelete: (service: ServiceRecord) => void;
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
}

interface Handlers {
  expose: (id: string) => void;
  unexpose: (id: string) => void;
  clear: () => void;
  scanMutation: ScanMutation;
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
  const handleExposeAll = useCallback(
    (): void => setConfirmAction({ type: 'expose-all' }),
    [setConfirmAction]
  );
  const handleUnexposeAll = useCallback(
    (): void => setConfirmAction({ type: 'unexpose-all' }),
    [setConfirmAction]
  );
  const handleScan = useCallback((): void => h.scanMutation.mutate(), [h.scanMutation]);
  return { handleExpose, handleDelete, handleExposeAll, handleUnexposeAll, handleScan };
}

export function useTerminalActions({ services }: Params): {
  actions: TerminalActions;
  state: TerminalState;
} {
  const { state: streamState, expose, unexpose, clear } = useExposeStream();
  const { scanMutation, deleteMutation, deletingServiceId, setDeletingServiceId } =
    useTerminalMutations();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const handlers = useHandlers({ expose, unexpose, clear, scanMutation }, setConfirmAction);
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

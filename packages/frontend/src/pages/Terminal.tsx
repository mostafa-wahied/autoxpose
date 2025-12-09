import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { SettingsStatusBar, TerminalHeader, TerminalSidebar } from '../components/terminal';
import { SettingsPanel } from '../components/terminal/settings-panel';
import { TerminalThemeProvider } from '../components/terminal/theme';
import { api, type ServiceRecord } from '../lib/api';
import { ConfirmDialogs } from './terminal/confirm-dialogs';
import { ContentArea } from './terminal/content-area';
import { ErrorView, LoadingView } from './terminal/status-views';
import { useTerminalActions } from './terminal/use-terminal-actions';

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

function getConnectionStatus(
  isLoading: boolean,
  dnsOk: boolean,
  proxyOk: boolean
): ConnectionStatus {
  if (isLoading) return 'connecting';
  return dnsOk && proxyOk ? 'connected' : 'disconnected';
}

function checkNeedsSetup(
  isLoading: boolean,
  dnsOk: boolean,
  proxyOk: boolean,
  networkWarning: boolean
): boolean {
  return !isLoading && (!dnsOk || !proxyOk || networkWarning);
}

function getLoadingId(
  streamState: { isActive: boolean; serviceId: string | null },
  deletingId: string | null
): string | null {
  const streamLoading = streamState.isActive ? streamState.serviceId : null;
  return streamLoading || deletingId;
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

function trySettingsShortcut(
  key: string,
  event: KeyboardEvent,
  isOpen: boolean,
  toggle: (open: boolean) => void
): boolean {
  const isSettingsKey = key === ',' || key === 'comma';
  if (!isSettingsKey || event.shiftKey) return false;
  event.preventDefault();
  toggle(!isOpen);
  return true;
}

function handleActionShortcut(
  key: string,
  event: KeyboardEvent,
  actions: {
    canExpose: boolean;
    onExposeAll: () => void;
    onUnexposeAll: () => void;
    onScan: () => void;
  }
): void {
  if (!event.altKey) return;
  if (key === 'e') {
    event.preventDefault();
    if (actions.canExpose) actions.onExposeAll();
    return;
  }
  if (key === 'u') {
    event.preventDefault();
    actions.onUnexposeAll();
    return;
  }
  if (key === 's') {
    event.preventDefault();
    actions.onScan();
  }
}

function useTerminalShortcuts(params: {
  onExposeAll: () => void;
  onUnexposeAll: () => void;
  onScan: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  canExpose: boolean;
}): void {
  const { onExposeAll, onUnexposeAll, onScan, settingsOpen, setSettingsOpen, canExpose } = params;

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (isTextTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;
      if (!ctrl) return;

      const toggled = trySettingsShortcut(key, event, settingsOpen, setSettingsOpen);
      if (toggled) return;

      handleActionShortcut(key, event, {
        canExpose,
        onExposeAll,
        onUnexposeAll,
        onScan,
      });
    };

    const remove = (): void => window.removeEventListener('keydown', handleShortcut);
    window.addEventListener('keydown', handleShortcut);
    return remove;
  }, [canExpose, onExposeAll, onScan, onUnexposeAll, setSettingsOpen, settingsOpen]);
}

function TerminalDashboard(): JSX.Element {
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: api.services.list });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.settings.status });
  if (servicesQuery.isLoading) return <LoadingView />;
  if (servicesQuery.error) return <ErrorView />;
  return (
    <TerminalDashboardContent
      services={servicesQuery.data?.services || []}
      settings={settingsQuery.data}
      settingsLoading={settingsQuery.isLoading}
    />
  );
}

interface DashboardContentProps {
  services: ServiceRecord[];
  settings: Awaited<ReturnType<typeof api.settings.status>> | undefined;
  settingsLoading: boolean;
}

function TerminalDashboardContent({
  services,
  settings,
  settingsLoading,
}: DashboardContentProps): JSX.Element {
  const dnsOk = settings?.dns?.configured ?? false;
  const proxyOk = settings?.proxy?.configured ?? false;
  const serverIpWarning = settings?.network?.serverIpWarning ?? false;
  const needsSetup = checkNeedsSetup(settingsLoading, dnsOk, proxyOk, serverIpWarning);
  const canExpose = dnsOk && proxyOk && !serverIpWarning;
  const canExposeReason = serverIpWarning
    ? 'Public IP not set. Set SERVER_IP before exposing.'
    : 'Set subdomain and configure DNS/Proxy first';
  const { actions, state } = useTerminalActions({ services, needsSetup });
  const exposedCount = services.filter(s => s.enabled).length;
  const activeService = services.find(s => s.id === state.streamState.serviceId);
  const loadingId = getLoadingId(state.streamState, state.deletingServiceId);
  const connectionStatus = getConnectionStatus(settingsLoading, dnsOk, proxyOk);
  useTerminalShortcuts({
    onExposeAll: actions.handleExposeAll,
    onUnexposeAll: actions.handleUnexposeAll,
    onScan: actions.handleScan,
    settingsOpen: state.settingsOpen,
    setSettingsOpen: state.setSettingsOpen,
    canExpose,
  });

  return (
    <div
      className="flex h-screen flex-col font-mono text-sm text-[#e2e8f0]"
      style={{ background: 'linear-gradient(135deg, #0b0d11 0%, #0f1218 50%, #0a0c11 100%)' }}
    >
      <TerminalHeader
        serviceCount={services.length}
        exposedCount={exposedCount}
        connectionStatus={connectionStatus}
        serverName={settings?.platform?.name ?? 'Server'}
        canExpose={canExpose}
        onExposeAll={actions.handleExposeAll}
        onUnexposeAll={actions.handleUnexposeAll}
        onScan={actions.handleScan}
        isScanning={state.scanMutation.isPending}
      />
      <MainContent
        services={services}
        state={state}
        actions={actions}
        activeService={activeService}
        loadingId={loadingId}
        settingsData={settings}
        baseDomain={settings?.dns?.domain ?? null}
        canExpose={canExpose}
        canExposeReason={canExpose ? undefined : canExposeReason}
      />
      <ConfirmDialogs
        action={state.confirmAction}
        serviceCount={services.length}
        exposedCount={exposedCount}
        onConfirm={actions.handleConfirm}
        onCancel={() => actions.setConfirmAction(null)}
      />
    </div>
  );
}

interface MainContentProps {
  services: ServiceRecord[];
  state: ReturnType<typeof useTerminalActions>['state'];
  actions: ReturnType<typeof useTerminalActions>['actions'];
  activeService: ServiceRecord | undefined;
  loadingId: string | null;
  settingsData: Awaited<ReturnType<typeof api.settings.status>> | undefined;
  baseDomain: string | null;
  canExpose: boolean;
  canExposeReason?: string;
}

function MainContent({
  services,
  state,
  actions,
  activeService,
  loadingId,
  settingsData,
  baseDomain,
  canExpose,
  canExposeReason,
}: MainContentProps): JSX.Element {
  return (
    <div className="flex flex-1 overflow-hidden">
      <TerminalSidebar services={services} activeServiceId={state.streamState.serviceId} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-6">
          <ContentArea
            services={services}
            state={state}
            actions={actions}
            activeService={activeService}
            loadingServiceId={loadingId}
            settingsData={settingsData}
            baseDomain={baseDomain}
            canExpose={canExpose}
            canExposeReason={canExposeReason}
            onScan={actions.handleScan}
          />
        </div>
        <SettingsPanel
          settings={settingsData}
          isOpen={state.settingsOpen}
          onClose={() => state.setSettingsOpen(false)}
        />
        <SettingsStatusBar
          settings={settingsData}
          isExpanded={state.settingsOpen}
          onToggle={() => state.setSettingsOpen(!state.settingsOpen)}
        />
      </div>
    </div>
  );
}

export function Terminal(): JSX.Element {
  return (
    <TerminalThemeProvider>
      <TerminalDashboard />
    </TerminalThemeProvider>
  );
}

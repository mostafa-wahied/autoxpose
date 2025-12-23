import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { SettingsStatusBar, TerminalHeader, TerminalSidebar } from '../components/terminal';
import { KeyboardShortcutsModal } from '../components/terminal/keyboard-shortcuts-modal';
import { OrphansModal } from '../components/terminal/orphans-modal';
import { SettingsPanel } from '../components/terminal/settings-panel';
import { TerminalThemeProvider } from '../components/terminal/theme';
import { api, type ServiceRecord } from '../lib/api';
import { ConfirmDialogs } from './terminal/confirm-dialogs';
import { ContentArea } from './terminal/content-area';
import { useTerminalShortcuts } from './terminal/keyboard-shortcuts';
import { ErrorView, LoadingView } from './terminal/status-views';
import { useTerminalActions } from './terminal/use-terminal-actions';

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

function dedupeServices(items: ServiceRecord[]): ServiceRecord[] {
  const map = new Map<string, ServiceRecord>();
  for (const item of items) {
    const key = item.sourceId || item.name;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      continue;
    }
    const a = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
    const b = item.updatedAt ? new Date(item.updatedAt).getTime() : 0;
    if (b >= a) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

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

interface ServiceItem {
  id: string;
  name: string;
  subdomain: string;
  enabled: boolean;
}

function mapServicesToTopology(services: ServiceRecord[]): ServiceItem[] {
  return services.map(s => ({
    id: s.id,
    name: s.name,
    subdomain: s.subdomain,
    enabled: s.enabled ?? false,
  }));
}

function useSmartRefetchInterval(services: ServiceRecord[] | undefined): number | false {
  if (!services || services.length === 0) return false;

  const hasExposed = services.some(s => s.enabled);
  if (!hasExposed) return false;

  const hasRecentExpose = services.some(s => {
    if (!s.enabled || !s.updatedAt) return false;
    const timeSinceUpdate = Date.now() - new Date(s.updatedAt).getTime();
    return timeSinceUpdate < 300000;
  });

  const hasWarnings = services.some(s => s.configWarnings && s.configWarnings !== '[]');
  const hasSslPending = services.some(s => s.sslPending);

  if (hasRecentExpose) return 5000;
  if (hasWarnings || hasSslPending) return 10000;
  return 30000;
}

function TerminalDashboard(): JSX.Element {
  const servicesQuery = useQuery({
    queryKey: ['services'],
    queryFn: api.services.list,
  });

  const refetchInterval = useSmartRefetchInterval(servicesQuery.data?.services);

  useEffect(() => {
    if (refetchInterval !== false) {
      const interval = setInterval((): void => {
        servicesQuery.refetch();
      }, refetchInterval);
      return (): void => clearInterval(interval);
    }
  }, [refetchInterval, servicesQuery]);

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

function useDashboardState(
  services: ServiceRecord[],
  settings: Awaited<ReturnType<typeof api.settings.status>> | undefined,
  settingsLoading: boolean
): {
  dnsOk: boolean;
  proxyOk: boolean;
  needsSetup: boolean;
  canExpose: boolean;
  canExposeReason: string;
  exposedCount: number;
  connectionStatus: ConnectionStatus;
} {
  const dnsOk = settings?.dns?.configured ?? false;
  const proxyOk = settings?.proxy?.configured ?? false;
  const serverIpState = settings?.network?.serverIpState ?? 'missing';
  const serverIpBlocking = ['missing', 'invalid', 'placeholder'].includes(serverIpState);
  const needsSetup = checkNeedsSetup(settingsLoading, dnsOk, proxyOk, serverIpBlocking);
  const canExpose = dnsOk && proxyOk && !serverIpBlocking;
  const canExposeReason = serverIpBlocking
    ? 'Public IP not set. Set SERVER_IP before exposing.'
    : 'Set subdomain and configure DNS/Proxy first';
  const exposedCount = services.filter(s => s.enabled).length;
  const connectionStatus = getConnectionStatus(settingsLoading, dnsOk, proxyOk);

  return {
    dnsOk,
    proxyOk,
    needsSetup,
    canExpose,
    canExposeReason,
    exposedCount,
    connectionStatus,
  };
}

function TerminalDashboardContent({
  services,
  settings,
  settingsLoading,
}: DashboardContentProps): JSX.Element {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [orphansOpen, setOrphansOpen] = useState(false);
  const stableServices = dedupeServices(services);
  const dashboardState = useDashboardState(stableServices, settings, settingsLoading);
  const { actions, state } = useTerminalActions({
    services: stableServices,
    needsSetup: dashboardState.needsSetup,
  });

  const orphansQuery = useQuery({
    queryKey: ['orphans'],
    queryFn: api.services.getOrphans,
    refetchInterval: 10000,
  });

  const orphanCount = orphansQuery.data?.orphans?.length ?? 0;
  const activeService = stableServices.find(s => s.id === state.streamState.serviceId);
  useTerminalShortcuts({
    onExposeAll: actions.handleExposeAll,
    onUnexposeAll: actions.handleUnexposeAll,
    onScan: actions.handleScan,
    settingsOpen: state.settingsOpen,
    setSettingsOpen: state.setSettingsOpen,
    canExpose: dashboardState.canExpose,
    shortcutsOpen,
    setShortcutsOpen,
  });

  return (
    <div className="flex h-screen flex-col bg-[#0d1117] font-mono text-sm text-[#c9d1d9]">
      <TerminalHeader
        serviceCount={stableServices.length}
        exposedCount={dashboardState.exposedCount}
        connectionStatus={dashboardState.connectionStatus}
        serverName={settings?.platform?.name ?? 'Server'}
        canExpose={dashboardState.canExpose}
        onExposeAll={actions.handleExposeAll}
        onUnexposeAll={actions.handleUnexposeAll}
        onScan={actions.handleScan}
        isScanning={state.scanMutation.isPending}
        dnsProvider={settings?.dns?.provider}
        proxyProvider={settings?.proxy?.provider}
        services={mapServicesToTopology(stableServices)}
        dnsConfigured={dashboardState.dnsOk}
        proxyConfigured={dashboardState.proxyOk}
        onHelp={() => setShortcutsOpen(true)}
        platformName={settings?.platform?.name}
      />
      <DashboardMain
        services={stableServices}
        state={state}
        actions={actions}
        activeService={activeService}
        settings={settings}
        dashboardState={dashboardState}
        orphanCount={orphanCount}
        setShortcutsOpen={setShortcutsOpen}
        setOrphansOpen={setOrphansOpen}
      />
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <OrphansModal isOpen={orphansOpen} onClose={() => setOrphansOpen(false)} />
    </div>
  );
}

interface DashboardMainProps {
  services: ServiceRecord[];
  state: ReturnType<typeof useTerminalActions>['state'];
  actions: ReturnType<typeof useTerminalActions>['actions'];
  activeService: ServiceRecord | undefined;
  settings: Awaited<ReturnType<typeof api.settings.status>> | undefined;
  dashboardState: ReturnType<typeof useDashboardState>;
  orphanCount: number;
  setShortcutsOpen: (open: boolean) => void;
  setOrphansOpen: (open: boolean) => void;
}

function DashboardMain(props: DashboardMainProps): JSX.Element {
  return (
    <>
      <MainContent
        services={props.services}
        state={props.state}
        actions={props.actions}
        activeService={props.activeService}
        loadingId={getLoadingId(props.state.streamState, props.state.deletingServiceId)}
        settingsData={props.settings}
        baseDomain={props.settings?.dns?.domain ?? null}
        canExpose={props.dashboardState.canExpose}
        canExposeReason={
          props.dashboardState.canExpose ? undefined : props.dashboardState.canExposeReason
        }
        setShortcutsOpen={props.setShortcutsOpen}
        orphanCount={props.orphanCount}
        onOrphansClick={() => props.setOrphansOpen(true)}
      />
      <ConfirmDialogs
        action={props.state.confirmAction}
        serviceCount={props.services.length}
        exposedCount={props.dashboardState.exposedCount}
        onConfirm={props.actions.handleConfirm}
        onCancel={() => props.actions.setConfirmAction(null)}
      />
    </>
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
  setShortcutsOpen: (open: boolean) => void;
  orphanCount: number;
  onOrphansClick: () => void;
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
  setShortcutsOpen,
  orphanCount,
  onOrphansClick,
}: MainContentProps): JSX.Element {
  return (
    <div className="flex flex-1 overflow-hidden">
      <TerminalSidebar
        services={services}
        activeServiceId={state.streamState.serviceId}
        onHelp={() => setShortcutsOpen(true)}
      />
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
          orphanCount={orphanCount}
          onOrphansClick={onOrphansClick}
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

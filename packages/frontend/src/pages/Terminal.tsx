import { useQuery } from '@tanstack/react-query';
import {
  CommandPrompt,
  SettingsStatusBar,
  TerminalHeader,
  TerminalSidebar,
} from '../components/terminal';
import { ProgressOutput } from '../components/terminal/progress';
import { SettingsPanel } from '../components/terminal/settings-panel';
import { TerminalThemeProvider } from '../components/terminal/theme';
import { api, type ServiceRecord } from '../lib/api';
import { ConfirmDialogs } from './terminal/confirm-dialogs';
import { ServiceGrid } from './terminal/service-grid';
import { ErrorView, LoadingView, ScanSuccessNotice } from './terminal/status-views';
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

function checkNeedsSetup(isLoading: boolean, dnsOk: boolean, proxyOk: boolean): boolean {
  return !isLoading && (!dnsOk || !proxyOk);
}

function getLoadingId(
  streamState: { isActive: boolean; serviceId: string | null },
  deletingId: string | null
): string | null {
  const streamLoading = streamState.isActive ? streamState.serviceId : null;
  return streamLoading || deletingId;
}

function TerminalDashboard(): JSX.Element {
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: api.services.list });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.settings.status });
  const services = servicesQuery.data?.services || [];
  const settings = settingsQuery.data;
  const dnsOk = settings?.dns?.configured ?? false;
  const proxyOk = settings?.proxy?.configured ?? false;
  const needsSetup = checkNeedsSetup(settingsQuery.isLoading, dnsOk, proxyOk);
  const canExpose = dnsOk && proxyOk;
  const { actions, state } = useTerminalActions({ services, needsSetup });

  if (servicesQuery.isLoading) return <LoadingView />;
  if (servicesQuery.error) return <ErrorView />;

  const exposedCount = services.filter(s => s.enabled).length;
  const activeService = services.find(s => s.id === state.streamState.serviceId);
  const loadingId = getLoadingId(state.streamState, state.deletingServiceId);
  const connectionStatus = getConnectionStatus(settingsQuery.isLoading, dnsOk, proxyOk);

  return (
    <div className="flex h-screen flex-col bg-[#0d1117] font-mono text-sm text-[#c9d1d9]">
      <TerminalHeader
        serviceCount={services.length}
        exposedCount={exposedCount}
        connectionStatus={connectionStatus}
        serverName={settings?.platform?.name ?? 'Server'}
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
            loadingId={loadingId}
            baseDomain={baseDomain}
            canExpose={canExpose}
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

interface ContentAreaProps {
  services: ServiceRecord[];
  state: ReturnType<typeof useTerminalActions>['state'];
  actions: ReturnType<typeof useTerminalActions>['actions'];
  activeService: ServiceRecord | undefined;
  loadingId: string | null;
  baseDomain: string | null;
  canExpose: boolean;
}

function ContentArea({
  services,
  state,
  actions,
  activeService,
  loadingId,
  baseDomain,
  canExpose,
}: ContentAreaProps): JSX.Element {
  return (
    <div className="space-y-6">
      <CommandPrompt command={`autoxpose status --services ${services.length}`} />
      {state.scanMutation.isSuccess && <ScanSuccessNotice data={state.scanMutation.data} />}
      <ServiceGrid
        services={services}
        activeServiceId={state.streamState.serviceId}
        onExpose={actions.handleExpose}
        onDelete={actions.handleDelete}
        onSubdomainChange={actions.handleSubdomainChange}
        loadingServiceId={loadingId}
        baseDomain={baseDomain}
        canExpose={canExpose}
      />
      {state.streamState.serviceId && activeService && (
        <ProgressOutput
          serviceId={state.streamState.serviceId}
          serviceName={activeService.name}
          action={state.streamState.action}
          steps={state.streamState.steps}
          result={state.streamState.result}
          onRetrySsl={actions.handleRetrySsl}
          isRetrying={state.retrySslMutation.isPending}
          retryResult={state.retrySslMutation.data}
        />
      )}
      {!state.streamState.isActive && <CommandPrompt />}
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

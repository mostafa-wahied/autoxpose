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
import { useTerminalActions } from './terminal/use-terminal-actions';

function getConnectionStatus(
  isLoading: boolean,
  dnsConfigured: boolean,
  proxyConfigured: boolean
): 'connected' | 'disconnected' | 'connecting' {
  if (isLoading) return 'connecting';
  if (dnsConfigured && proxyConfigured) return 'connected';
  return 'disconnected';
}

function TerminalDashboard(): JSX.Element {
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: api.services.list });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.settings.status });

  const services = servicesQuery.data?.services || [];
  const { actions, state } = useTerminalActions({ services });

  if (servicesQuery.isLoading) {
    return <LoadingView />;
  }

  if (servicesQuery.error) {
    return <ErrorView />;
  }

  const exposedCount = services.filter(s => s.enabled).length;
  const activeService = services.find(s => s.id === state.streamState.serviceId);
  const loadingId = state.streamState.isActive
    ? state.streamState.serviceId
    : state.deletingServiceId;
  const dnsOk = settingsQuery.data?.dns?.configured ?? false;
  const proxyOk = settingsQuery.data?.proxy?.configured ?? false;
  const connectionStatus = getConnectionStatus(settingsQuery.isLoading, dnsOk, proxyOk);

  return (
    <div className="flex h-screen flex-col bg-[#0d1117] font-mono text-sm text-[#c9d1d9]">
      <TerminalHeader
        serviceCount={services.length}
        exposedCount={exposedCount}
        connectionStatus={connectionStatus}
        serverName="autoxpose"
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
        settingsData={settingsQuery.data}
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
}

function MainContent({
  services,
  state,
  actions,
  activeService,
  loadingId,
  settingsData,
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
}

function ContentArea({
  services,
  state,
  actions,
  activeService,
  loadingId,
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
        loadingServiceId={loadingId}
      />
      {state.streamState.serviceId && activeService && (
        <ProgressOutput
          serviceId={state.streamState.serviceId}
          serviceName={activeService.name}
          action={state.streamState.action}
          steps={state.streamState.steps}
          result={state.streamState.result}
        />
      )}
      {!state.streamState.isActive && <CommandPrompt />}
    </div>
  );
}

interface ScanNoticeData {
  created: number;
  updated: number;
}

function ScanSuccessNotice({ data }: { data: ScanNoticeData }): JSX.Element {
  return (
    <div className="rounded border border-[#238636] bg-[#23863620] px-4 py-2 text-sm">
      <span className="text-[#3fb950]">{'\u2713'}</span> Scan complete: {data.created} created,{' '}
      {data.updated} updated
    </div>
  );
}

function LoadingView(): JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center bg-[#0d1117] font-mono text-[#c9d1d9]">
      <CommandPrompt command="Loading services..." />
    </div>
  );
}

function ErrorView(): JSX.Element {
  return (
    <div className="flex h-screen items-center justify-center bg-[#0d1117] font-mono text-[#f85149]">
      [ERROR] Failed to load services. Check your connection.
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

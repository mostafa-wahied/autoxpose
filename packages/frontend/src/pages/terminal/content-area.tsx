import { CommandPrompt } from '../../components/terminal';
import { ProgressOutput } from '../../components/terminal/progress';
import { ScanSuccessNotice } from './status-views';
import { ServiceGrid } from './service-grid';
import { type ServiceRecord } from '../../lib/api';
import { CommandConsole } from './command-console';
import { type useTerminalActions } from './use-terminal-actions';
import type { ExposeStreamState } from '../../hooks/use-expose-stream';

interface ContentAreaProps {
  services: ServiceRecord[];
  state: ReturnType<typeof useTerminalActions>['state'];
  actions: ReturnType<typeof useTerminalActions>['actions'];
  activeService: ServiceRecord | undefined;
  loadingServiceId: string | null;
  baseDomain: string | null;
  canExpose: boolean;
  canExposeReason?: string;
  settingsData: Awaited<ReturnType<typeof import('../../lib/api').api.settings.status>> | undefined;
  onScan: () => void;
}

export function ContentArea(props: ContentAreaProps): JSX.Element {
  const {
    services,
    state,
    actions,
    activeService,
    loadingServiceId,
    baseDomain,
    canExpose,
    canExposeReason,
    settingsData,
    onScan,
  } = props;
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
        onNameChange={actions.handleNameChange}
        onRetrySsl={actions.handleRetrySslForService}
        loadingServiceId={loadingServiceId}
        baseDomain={baseDomain}
        canExpose={canExpose}
        canExposeReason={canExposeReason}
        onScan={onScan}
        retrySslPending={state.retrySslMutation.isPending}
        scanTrigger={state.scanTrigger}
      />
      <ProgressSection
        streamState={state.streamState}
        activeService={activeService}
        onRetry={actions.handleRetrySsl}
        retrying={state.retrySslMutation.isPending}
        retryResult={state.retrySslMutation.data}
      />
      <CommandConsole
        services={services}
        settings={settingsData}
        onExpose={actions.handleExpose}
        onUnexpose={actions.handleUnexpose}
        onToggleSettings={state.setSettingsOpen}
        onScan={onScan}
      />
    </div>
  );
}

function ProgressSection({
  streamState,
  activeService,
  onRetry,
  retrying,
  retryResult,
}: {
  streamState: ExposeStreamState;
  activeService: ServiceRecord | undefined;
  onRetry: () => void;
  retrying: boolean;
  retryResult: ReturnType<
    (typeof import('./use-terminal-actions'))['useTerminalActions']
  >['state']['retrySslMutation']['data'];
}): JSX.Element | null {
  if (!streamState.serviceId || !activeService) return null;
  return (
    <ProgressOutput
      serviceId={streamState.serviceId}
      serviceName={activeService.name}
      action={streamState.action}
      steps={streamState.steps}
      result={streamState.result}
      startedAt={streamState.startedAt}
      lastEventAt={streamState.lastEventAt}
      onRetrySsl={onRetry}
      isRetrying={retrying}
      retryResult={retryResult}
    />
  );
}

import { CommandPrompt } from '../../components/terminal';
import { ProgressOutput } from '../../components/terminal/progress';
import { ScanSuccessNotice } from './status-views';
import { ServiceGrid } from './service-grid';
import { type ServiceRecord } from '../../lib/api';
import { CommandConsole } from './command-console';
import { type useTerminalActions } from './use-terminal-actions';

interface ContentAreaProps {
  services: ServiceRecord[];
  state: ReturnType<typeof useTerminalActions>['state'];
  actions: ReturnType<typeof useTerminalActions>['actions'];
  activeService: ServiceRecord | undefined;
  loadingServiceId: string | null;
  baseDomain: string | null;
  canExpose: boolean;
  settingsData: Awaited<ReturnType<typeof import('../../lib/api').api.settings.status>> | undefined;
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
    settingsData,
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
        loadingServiceId={loadingServiceId}
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
          startedAt={state.streamState.startedAt}
          lastEventAt={state.streamState.lastEventAt}
          onRetrySsl={actions.handleRetrySsl}
          isRetrying={state.retrySslMutation.isPending}
          retryResult={state.retrySslMutation.data}
        />
      )}
      <CommandConsole
        services={services}
        settings={settingsData}
        onExpose={actions.handleExpose}
        onUnexpose={actions.handleExpose}
        onToggleSettings={state.setSettingsOpen}
      />
    </div>
  );
}

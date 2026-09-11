import { CommandPrompt, TagFilters, useTagFilters } from '../../components/terminal';
import { ProgressOutput } from '../../components/terminal/progress';
import { ScanSuccessNotice } from './status-views';
import { ServiceGrid } from './service-grid';
import { type ServiceRecord } from '../../lib/api';
import { CommandConsole } from './command-console';
import { type useTerminalActions } from './use-terminal-actions';
import type { ExposeStreamState } from '../../hooks/use-expose-stream';
import { WildcardModeHint } from './wildcard-mode-hint';
import { MobileServices } from '../../components/terminal/mobile-services';

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
  isWildcardMode: boolean;
  onHelp: () => void;
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
    isWildcardMode,
  } = props;

  const { selectedTags, setSelectedTags, tagCounts, filteredServices } = useTagFilters(services);

  return (
    <div className="space-y-6">
      <div className="flex min-w-0 items-center gap-3">
        <MobileServices services={filteredServices} onHelp={props.onHelp} />
        <div className="min-w-0 break-words">
          <CommandPrompt command={`autoxpose status --services ${services.length}`} />
        </div>
      </div>
      {state.scanMutation.isSuccess && <ScanSuccessNotice data={state.scanMutation.data} />}
      <WildcardModeHint
        services={services}
        baseDomain={baseDomain}
        isWildcardMode={isWildcardMode}
        isDnsConfigured={settingsData?.dns?.configured ?? false}
      />
      <TagFilters
        selectedTags={selectedTags}
        onTagsChange={setSelectedTags}
        tagCounts={tagCounts}
      />
      <ServiceGrid
        services={filteredServices}
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
        isWildcardMode={isWildcardMode}
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

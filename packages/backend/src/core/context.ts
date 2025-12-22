import type { DiscoveredService } from '../features/discovery/docker.js';
import { DockerDiscoveryProvider } from '../features/discovery/docker.js';
import { ExposeService, StreamingExposeService } from '../features/expose/index.js';
import type { ProgressCallback } from '../features/expose/expose-handlers.js';
import { ServicesRepository } from '../features/services/services.repository.js';
import { ServicesService } from '../features/services/services.service.js';
import { SyncService } from '../features/services/sync.service.js';
import { MetadataLoader } from '../features/services/metadata-loader.js';
import { TagDetector } from '../features/services/tag-detector.js';
import { MetadataUpdater } from '../features/services/metadata-updater.js';
import { SettingsRepository, SettingsService } from '../features/settings/index.js';
import { ChangeTracker } from './change-tracker.js';
import type { AppDatabase } from './database/index.js';
import { createLogger } from './logger/index.js';

const logger = createLogger('context');

function createNoopProgressCallback(): ProgressCallback {
  return event => {
    logger.debug(
      {
        serviceId: event.serviceId,
        action: event.action,
        type: event.type,
      },
      'Auto-expose progress'
    );
  };
}

export interface AppContext {
  services: ServicesService;
  servicesRepo: ServicesRepository;
  settings: SettingsService;
  expose: ExposeService;
  streamingExpose: StreamingExposeService;
  sync: SyncService;
  discovery: DockerDiscoveryProvider | null;
  changeTracker: ChangeTracker;
  lanIp: string;
  metadataLoader: MetadataLoader;
  metadataUpdater: MetadataUpdater;
  startWatcher: () => void;
}

type CoreServices = {
  servicesRepo: ServicesRepository;
  services: ServicesService;
  settings: SettingsService;
  expose: ExposeService;
  streamingExpose: StreamingExposeService;
  sync: SyncService;
  metadataLoader: MetadataLoader;
  tagDetector: TagDetector;
  metadataUpdater: MetadataUpdater;
};

interface CoreServicesOptions {
  db: AppDatabase;
  publicIp: string;
  lanIp: string;
  lanProvided: boolean;
  changeTracker: ChangeTracker;
}

function createCoreServices(options: CoreServicesOptions): CoreServices {
  const { db, publicIp, lanIp, lanProvided, changeTracker } = options;
  const servicesRepo = new ServicesRepository(db, changeTracker);
  const settingsRepo = new SettingsRepository(db);
  const settings = new SettingsService(settingsRepo, { serverIp: publicIp, lanIp, lanProvided });
  const metadataLoader = new MetadataLoader();
  const tagDetector = new TagDetector(metadataLoader);
  const metadataUpdater = new MetadataUpdater(metadataLoader);
  const services = new ServicesService(servicesRepo, settings, tagDetector);
  const sync = new SyncService(servicesRepo, settings);
  const exposeContext = { servicesRepo, settings, publicIp, lanIp, sync };
  const expose = new ExposeService(exposeContext);
  const streamingExpose = new StreamingExposeService(servicesRepo, settings, publicIp, lanIp);
  return {
    servicesRepo,
    services,
    settings,
    expose,
    streamingExpose,
    sync,
    metadataLoader,
    tagDetector,
    metadataUpdater,
  };
}

type NetworkOptions = { publicIp?: string; lanIp?: string; lanProvided?: boolean };

export function createAppContext(
  db: AppDatabase,
  dockerConfig?: { socketPath?: string; host?: string; labelPrefix?: string },
  network?: NetworkOptions
): AppContext {
  const resolvedLanIp = network?.lanIp || 'localhost';
  const resolvedPublicIp = network?.publicIp || 'localhost';
  const changeTracker = new ChangeTracker();
  const core = createCoreServices({
    db,
    publicIp: resolvedPublicIp,
    lanIp: resolvedLanIp,
    lanProvided: Boolean(network?.lanProvided),
    changeTracker,
  });

  const discovery = dockerConfig ? new DockerDiscoveryProvider(dockerConfig) : null;

  const startWatcher = (): void => {
    if (!discovery) return;
    const deps: DockerEventDeps = {
      services: core.services,
      expose: core.expose,
      streamingExpose: core.streamingExpose,
      settings: core.settings,
      sync: core.sync,
      servicesRepo: core.servicesRepo,
      discovery,
    };
    discovery.watch(
      (svc: DiscoveredService, event: string) => handleDockerEvent(svc, event, deps),
      (containerId: string) => handleContainerRemoved(containerId, deps)
    );
    logger.info('Docker watcher started');
  };

  return { ...core, discovery, changeTracker, lanIp: resolvedLanIp, startWatcher };
}

interface DockerEventDeps {
  services: ServicesService;
  expose: ExposeService;
  streamingExpose: StreamingExposeService;
  settings: SettingsService;
  sync: SyncService;
  servicesRepo: ServicesRepository;
  discovery: DockerDiscoveryProvider;
}

async function handleContainerRemoved(containerId: string, deps: DockerEventDeps): Promise<void> {
  const existing = await deps.servicesRepo.findBySourceId(containerId);
  if (!existing) return;
  logger.info(
    { name: existing.name, containerId },
    'Container labels changed; reconciling via scan'
  );
  await fullReconcile(deps);
}

async function handleDockerEvent(
  service: DiscoveredService,
  event: string,
  deps: DockerEventDeps
): Promise<void> {
  logger.info({ name: service.name, event, autoExpose: service.autoExpose }, 'Docker event');

  if (event === 'start' || event === 'update') {
    const svc = await deps.services.upsertService(service);
    await deps.sync.detectExistingConfigurations([svc]);
    await fullReconcile(deps);
    const isNewService = !svc.enabled && !svc.dnsRecordId && !svc.proxyHostId;
    if (isNewService && service.autoExpose) {
      const hasConfig = await checkProvidersConfigured(deps.settings);
      if (!hasConfig) {
        logger.warn({ name: service.name }, 'Auto-expose skipped: no providers configured');
        return;
      }
      logger.info({ serviceId: svc.id, name: svc.name }, 'Auto-exposing on container start');
      deps.streamingExpose
        .exposeWithProgress(svc.id, createNoopProgressCallback())
        .catch((err: unknown) => {
          logger.error({ err, serviceId: svc.id }, 'Auto-expose failed');
        });
    }
  }
}

async function fullReconcile(deps: DockerEventDeps): Promise<void> {
  const discovered = await deps.discovery.discover();
  await deps.services.syncFromDiscovery(discovered);
  const all = await deps.services.getAllServices();
  await deps.sync.detectExistingConfigurations(all);
}

async function checkProvidersConfigured(settings: SettingsService): Promise<boolean> {
  const dns = await settings.getDnsProvider();
  const proxy = await settings.getProxyProvider();
  return dns !== null || proxy !== null;
}

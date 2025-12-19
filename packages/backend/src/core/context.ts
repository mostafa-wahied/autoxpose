import type { DiscoveredService } from '../features/discovery/docker.js';
import { DockerDiscoveryProvider } from '../features/discovery/docker.js';
import { ExposeService, StreamingExposeService } from '../features/expose/index.js';
import type { ProgressCallback } from '../features/expose/expose-handlers.js';
import { ServicesRepository } from '../features/services/services.repository.js';
import { ServicesService } from '../features/services/services.service.js';
import { SyncService } from '../features/services/sync.service.js';
import { SettingsRepository, SettingsService } from '../features/settings/index.js';
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
  lanIp: string;
  startWatcher: () => void;
}

type CoreServices = {
  servicesRepo: ServicesRepository;
  services: ServicesService;
  settings: SettingsService;
  expose: ExposeService;
  streamingExpose: StreamingExposeService;
  sync: SyncService;
};

function createCoreServices(
  db: AppDatabase,
  publicIp: string,
  lanIp: string,
  lanProvided: boolean
): CoreServices {
  const servicesRepo = new ServicesRepository(db);
  const settingsRepo = new SettingsRepository(db);
  const settings = new SettingsService(settingsRepo, { serverIp: publicIp, lanIp, lanProvided });
  const services = new ServicesService(servicesRepo, settings);
  const sync = new SyncService(servicesRepo, settings);
  const exposeContext = { servicesRepo, settings, publicIp, lanIp, sync };
  const expose = new ExposeService(exposeContext);
  const streamingExpose = new StreamingExposeService(servicesRepo, settings, publicIp, lanIp);
  return { servicesRepo, services, settings, expose, streamingExpose, sync };
}

type NetworkOptions = { publicIp?: string; lanIp?: string; lanProvided?: boolean };

export function createAppContext(
  db: AppDatabase,
  dockerConfig?: { socketPath?: string; host?: string; labelPrefix?: string },
  network?: NetworkOptions
): AppContext {
  const resolvedLanIp = network?.lanIp || 'localhost';
  const resolvedPublicIp = network?.publicIp || 'localhost';
  const core = createCoreServices(
    db,
    resolvedPublicIp,
    resolvedLanIp,
    Boolean(network?.lanProvided)
  );

  const discovery = dockerConfig ? new DockerDiscoveryProvider(dockerConfig) : null;

  const startWatcher = (): void => {
    if (!discovery) return;
    const deps: DockerEventDeps = {
      services: core.services,
      expose: core.expose,
      streamingExpose: core.streamingExpose,
      settings: core.settings,
    };
    discovery.watch((svc: DiscoveredService, event: string) => handleDockerEvent(svc, event, deps));
    logger.info('Docker watcher started');
  };

  return { ...core, discovery, lanIp: resolvedLanIp, startWatcher };
}

interface DockerEventDeps {
  services: ServicesService;
  expose: ExposeService;
  streamingExpose: StreamingExposeService;
  settings: SettingsService;
}

async function handleDockerEvent(
  service: DiscoveredService,
  event: string,
  deps: DockerEventDeps
): Promise<void> {
  logger.info({ name: service.name, event, autoExpose: service.autoExpose }, 'Docker event');

  if (event === 'start') {
    const result = await deps.services.syncFromDiscovery([service]);
    if (result.created.length > 0 && service.autoExpose) {
      const hasConfig = await checkProvidersConfigured(deps.settings);
      if (!hasConfig) {
        logger.warn({ name: service.name }, 'Auto-expose skipped: no providers configured');
        return;
      }
      const svc = result.created[0];
      logger.info({ serviceId: svc.id, name: svc.name }, 'Auto-exposing on container start');
      deps.streamingExpose
        .exposeWithProgress(svc.id, createNoopProgressCallback())
        .catch((err: unknown) => {
          logger.error({ err, serviceId: svc.id }, 'Auto-expose failed');
        });
    }
  }
}

async function checkProvidersConfigured(settings: SettingsService): Promise<boolean> {
  const dns = await settings.getDnsProvider();
  const proxy = await settings.getProxyProvider();
  return dns !== null || proxy !== null;
}

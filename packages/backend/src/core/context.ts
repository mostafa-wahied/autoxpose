import type { DiscoveredService } from '../features/discovery/discovery.types.js';
import { DockerDiscoveryProvider } from '../features/discovery/docker.js';
import { ExposeService, StreamingExposeService } from '../features/expose/index.js';
import { ServicesRepository } from '../features/services/services.repository.js';
import { ServicesService } from '../features/services/services.service.js';
import { SettingsRepository, SettingsService } from '../features/settings/index.js';
import type { AppDatabase } from './database/index.js';
import { createLogger } from './logger/index.js';

const logger = createLogger('context');

export interface AppContext {
  services: ServicesService;
  settings: SettingsService;
  expose: ExposeService;
  streamingExpose: StreamingExposeService;
  discovery: DockerDiscoveryProvider | null;
  lanIp: string;
  startWatcher: () => void;
}

export function createAppContext(
  db: AppDatabase,
  dockerSocket?: string,
  publicIp?: string,
  lanIp?: string
): AppContext {
  const resolvedLanIp = lanIp || 'localhost';
  const servicesRepository = new ServicesRepository(db);
  const servicesService = new ServicesService(servicesRepository);
  const settingsRepository = new SettingsRepository(db);
  const settingsService = new SettingsService(settingsRepository);
  const exposeService = new ExposeService(
    servicesRepository,
    settingsService,
    publicIp || 'localhost',
    resolvedLanIp
  );
  const streamingExposeService = new StreamingExposeService(
    servicesRepository,
    settingsService,
    publicIp || 'localhost',
    resolvedLanIp
  );

  let discovery: DockerDiscoveryProvider | null = null;
  if (dockerSocket) {
    discovery = new DockerDiscoveryProvider(dockerSocket, 'autoxpose');
  }

  const startWatcher = (): void => {
    if (!discovery) return;
    const deps: DockerEventDeps = {
      services: servicesService,
      expose: exposeService,
      settings: settingsService,
    };
    discovery.watch((service: DiscoveredService, event: string) => {
      handleDockerEvent(service, event, deps);
    });
    logger.info('Docker watcher started');
  };

  return {
    services: servicesService,
    settings: settingsService,
    expose: exposeService,
    streamingExpose: streamingExposeService,
    discovery,
    lanIp: resolvedLanIp,
    startWatcher,
  };
}

interface DockerEventDeps {
  services: ServicesService;
  expose: ExposeService;
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
      deps.expose.expose(svc.id).catch(err => {
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

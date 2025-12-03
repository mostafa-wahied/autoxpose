import { DockerDiscoveryProvider } from '../features/discovery/docker.js';
import { ExposeService, StreamingExposeService } from '../features/expose/index.js';
import { ServicesRepository } from '../features/services/services.repository.js';
import { ServicesService } from '../features/services/services.service.js';
import { SettingsRepository, SettingsService } from '../features/settings/index.js';
import type { AppDatabase } from './database/index.js';

export interface AppContext {
  services: ServicesService;
  settings: SettingsService;
  expose: ExposeService;
  streamingExpose: StreamingExposeService;
  discovery: DockerDiscoveryProvider | null;
  lanIp: string;
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

  return {
    services: servicesService,
    settings: settingsService,
    expose: exposeService,
    streamingExpose: streamingExposeService,
    discovery,
    lanIp: resolvedLanIp,
  };
}

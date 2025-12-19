import type { FastifyPluginAsync } from 'fastify';
import type { SettingsService } from '../settings/settings.service.js';
import { createLogger } from '../../core/logger/index.js';

const logger = createLogger('proxy-routes');

export function createProxyRoutes(settings: SettingsService): FastifyPluginAsync {
  return async server => {
    server.get('/providers', async () => {
      return { providers: ['npm', 'caddy'] };
    });

    server.get('/hosts', async () => {
      try {
        logger.debug('Fetching proxy hosts');
        const provider = await settings.getProxyProvider();
        if (!provider) {
          logger.debug('No proxy provider configured');
          return { hosts: [] };
        }
        logger.debug({ provider: provider.name }, 'Calling provider listHosts');
        const hosts = await provider.listHosts();
        logger.debug({ count: hosts.length }, 'Proxy hosts fetched');
        return { hosts };
      } catch (error) {
        logger.error({ error }, 'Failed to list proxy hosts');
        return { hosts: [] };
      }
    });

    server.post('/hosts', async request => {
      const body = request.body;
      return { created: body };
    });

    server.delete('/hosts/:id', async request => {
      const { id } = request.params as { id: string };
      return { deleted: id };
    });
  };
}

export const proxyRoutes: FastifyPluginAsync = async () => {
  throw new Error('Use createProxyRoutes(settings) instead');
};

import type { FastifyPluginAsync } from 'fastify';
import type { SettingsService } from '../settings/settings.service.js';
import { createLogger } from '../../core/logger/index.js';

const logger = createLogger('dns-routes');

export function createDnsRoutes(settings: SettingsService): FastifyPluginAsync {
  return async server => {
    server.get('/providers', async () => {
      return { providers: ['netlify', 'cloudflare', 'digitalocean'] };
    });

    server.get('/records', async () => {
      try {
        logger.debug('Fetching DNS records');
        const provider = await settings.getDnsProvider();
        if (!provider) {
          logger.debug('No DNS provider configured');
          return { records: [] };
        }
        logger.debug({ provider: provider.name }, 'Calling provider listRecords');
        const records = await provider.listRecords();
        logger.debug({ count: records.length }, 'DNS records fetched');
        return { records };
      } catch (error) {
        logger.error({ error }, 'Failed to list DNS records');
        return { records: [] };
      }
    });

    server.post('/records', async request => {
      const body = request.body;
      return { created: body };
    });

    server.delete('/records/:id', async request => {
      const { id } = request.params as { id: string };
      return { deleted: id };
    });
  };
}

export const dnsRoutes: FastifyPluginAsync = async () => {
  throw new Error('Use createDnsRoutes(settings) instead');
};

import type { FastifyPluginAsync } from 'fastify';
import type { AccessListService } from './access-list.service.js';

export function createAccessListRoutes(accessListService: AccessListService): FastifyPluginAsync {
  return async server => {
    server.get('/', async () => {
      const supported = await accessListService.isSupported();
      if (!supported) return { supported: false, accessLists: [] };
      return { supported: true, accessLists: await accessListService.getAll() };
    });

    server.post('/sync', async (_request, reply) => {
      const supported = await accessListService.isSupported();
      if (!supported) {
        return reply.status(400).send({
          error: 'Access lists are only available when Nginx Proxy Manager is the proxy provider',
        });
      }

      const result = await accessListService.syncFromProvider();
      if (!result.ok) {
        return reply.status(502).send({ error: result.error ?? 'Failed to sync access lists' });
      }
      return { synced: result.synced };
    });
  };
}

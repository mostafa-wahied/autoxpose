import type { FastifyPluginAsync } from 'fastify';
import type { AccessListService } from './access-list.service.js';

export function createAccessListRoutes(
  accessListService: AccessListService
): FastifyPluginAsync {
  return async server => {
    server.get('/', async () => {
      const lists = await accessListService.getAll();
      return { accessLists: lists };
    });

    server.post('/sync', async () => {
      const result = await accessListService.syncFromProvider();
      return result;
    });
  };
}

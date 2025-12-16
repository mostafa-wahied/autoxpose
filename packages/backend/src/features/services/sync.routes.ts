import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import type { AppContext } from '../../core/context.js';
import type { SyncStatus } from './sync.service.js';

interface IdParams {
  id: string;
}

interface BulkCheckBody {
  serviceIds: string[];
}

const notFound = (reply: FastifyReply): FastifyReply =>
  reply.status(404).send({ error: 'Service not found' });

export const createSyncRoutes = (ctx: AppContext): FastifyPluginAsync => {
  return async server => {
    server.get('/status', async (): Promise<{ statuses: SyncStatus[] }> => {
      const services = await ctx.services.getAllServices();
      const statuses = await ctx.sync.getStatuses(services);
      return { statuses };
    });

    server.post<{ Body: BulkCheckBody }>('/check-bulk', async request => {
      const { serviceIds } = request.body;
      const services = await Promise.all(serviceIds.map(id => ctx.services.getServiceById(id)));
      const validServices = services.filter((s): s is NonNullable<typeof s> => s !== null);

      const results: Record<string, boolean> = {};
      for (const service of validServices) {
        const hasProvider =
          Boolean(service.enabled) && Boolean(service.dnsRecordId || service.proxyHostId);
        results[service.id] = hasProvider;
      }

      return { results };
    });

    server.post<{ Params: IdParams }>('/:id', async (request, reply) => {
      const service = await ctx.services.getServiceById(request.params.id);
      if (!service) return notFound(reply);
      const updated = await ctx.sync.syncService(service);
      return { service: updated, synced: true };
    });

    server.post('/all', async () => {
      const services = await ctx.services.getAllServices();
      return ctx.sync.syncAll(services);
    });
  };
};

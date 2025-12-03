import type { FastifyPluginAsync } from 'fastify';
import type { AppContext } from '../../core/context.js';

export const createDiscoveryRoutes = (ctx: AppContext): FastifyPluginAsync => {
  return async server => {
    server.get('/containers', async (_request, reply) => {
      if (!ctx.discovery) {
        return reply.status(503).send({ error: 'Docker discovery not available' });
      }
      const containers = await ctx.discovery.discover();
      return { containers };
    });

    server.post('/scan', async (_request, reply) => {
      if (!ctx.discovery) {
        return reply.status(503).send({ error: 'Docker discovery not available' });
      }
      const discovered = await ctx.discovery.discover();
      const result = await ctx.services.syncFromDiscovery(discovered);
      return {
        discovered: discovered.length,
        created: result.created.length,
        updated: result.updated.length,
        removed: result.removed.length,
      };
    });
  };
};

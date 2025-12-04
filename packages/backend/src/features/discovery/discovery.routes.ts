import type { FastifyPluginAsync } from 'fastify';
import type { AppContext } from '../../core/context.js';
import { createLogger } from '../../core/logger/index.js';

const logger = createLogger('discovery-routes');

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

      for (const svc of result.autoExpose) {
        logger.info({ serviceId: svc.id, name: svc.name }, 'Auto-exposing service');
        ctx.expose.expose(svc.id).catch(err => {
          logger.error({ err, serviceId: svc.id }, 'Auto-expose failed');
        });
      }

      return {
        discovered: discovered.length,
        created: result.created.length,
        updated: result.updated.length,
        removed: result.removed.length,
        autoExposed: result.autoExpose.length,
      };
    });
  };
};

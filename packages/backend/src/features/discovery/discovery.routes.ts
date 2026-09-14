import type { FastifyPluginAsync } from 'fastify';
import type { AppContext } from '../../core/context.js';
import type { ProgressCallback } from '../expose/expose-handlers.js';
import { createLogger } from '../../core/logger/index.js';

const logger = createLogger('discovery-routes');

function createNoopProgressCallback(): ProgressCallback {
  return event => {
    logger.debug(
      { serviceId: event.serviceId, action: event.action, type: event.type },
      'Auto-expose progress'
    );
  };
}

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
      const allServices = await ctx.services.getAllServices();
      await ctx.sync.detectExistingConfigurations(allServices);
      const autoExposeSourceIds = new Set(
        discovered.filter(service => service.autoExpose).map(service => service.id)
      );
      const servicesToAutoExpose = allServices.filter(
        service =>
          service.sourceId &&
          autoExposeSourceIds.has(service.sourceId) &&
          !service.enabled &&
          service.exposureSource !== 'paused'
      );
      for (const service of servicesToAutoExpose) {
        logger.info({ serviceId: service.id, name: service.name }, 'Auto-exposing service');
        ctx.streamingExpose
          .exposeWithProgress(service.id, createNoopProgressCallback(), true)
          .catch(error => {
            logger.error({ err: error, serviceId: service.id }, 'Auto-expose failed');
          });
      }
      return {
        discovered: discovered.length,
        created: result.created.length,
        updated: result.updated.length,
        removed: result.removed.length,
        autoExposed: servicesToAutoExpose.length,
        autoExposingServices: servicesToAutoExpose.map(service => ({
          id: service.id,
          name: service.name,
          subdomain: service.subdomain,
        })),
      };
    });
  };
};

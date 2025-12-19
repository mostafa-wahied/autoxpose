import type { FastifyPluginAsync } from 'fastify';
import type { ExposeService } from './expose.service.js';

type IdParams = { id: string };

export function createExposeRoutes(expose: ExposeService): FastifyPluginAsync {
  return async server => {
    server.post<{ Params: IdParams }>('/:id/expose', async (request, reply) => {
      const { id } = request.params;
      const result = await expose.expose(id);
      return reply.code(200).send(result);
    });

    server.post<{ Params: IdParams }>('/:id/unexpose', async (request, reply) => {
      const { id } = request.params;
      const result = await expose.unexpose(id);
      return reply.code(200).send({ service: result });
    });

    server.post<{ Params: IdParams }>('/:id/dns-only', async (request, reply) => {
      const { id } = request.params;
      const result = await expose.exposeDnsOnly(id);
      return reply.code(200).send(result);
    });

    server.post<{ Params: IdParams }>('/:id/proxy-only', async (request, reply) => {
      const { id } = request.params;
      const result = await expose.exposeProxyOnly(id);
      return reply.code(200).send(result);
    });
  };
}

import type { FastifyPluginAsync } from 'fastify';

export const proxyRoutes: FastifyPluginAsync = async server => {
  server.get('/providers', async () => {
    return { providers: ['npm', 'caddy'] };
  });

  server.get('/hosts', async () => {
    return { hosts: [] };
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

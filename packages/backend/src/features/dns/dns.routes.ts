import type { FastifyPluginAsync } from 'fastify';

export const dnsRoutes: FastifyPluginAsync = async server => {
  server.get('/providers', async () => {
    return { providers: ['netlify', 'cloudflare', 'digitalocean'] };
  });

  server.get('/records', async () => {
    return { records: [] };
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

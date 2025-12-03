import { z } from 'zod';

export const appConfigSchema = z.object({
  port: z.number().default(3000),
  serverIp: z.string().default('localhost'),
  lanIp: z.string().default('localhost'),
  database: z
    .object({
      path: z.string().default('./data/autoxpose.db'),
    })
    .default({ path: './data/autoxpose.db' }),
  docker: z
    .object({
      socketPath: z.string().default('/var/run/docker.sock'),
      labelPrefix: z.string().default('autoxpose'),
    })
    .default({}),
  dns: z
    .object({
      provider: z.enum(['netlify', 'cloudflare', 'digitalocean']).optional(),
      domain: z.string().optional(),
      token: z.string().optional(),
      zoneId: z.string().optional(),
    })
    .optional(),
  proxy: z
    .object({
      provider: z.enum(['npm', 'traefik', 'caddy']).optional(),
      url: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
    })
    .optional(),
});

export type AppConfig = z.infer<typeof appConfigSchema>;

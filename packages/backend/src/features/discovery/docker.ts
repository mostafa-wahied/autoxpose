import type { FastifyPluginAsync } from 'fastify';
import Docker from 'dockerode';
import type { AppContext } from '../../core/context.js';
import { createLogger } from '../../core/logger/index.js';

export type DiscoveredService = {
  id: string;
  name: string;
  subdomain: string;
  port: number;
  scheme: string;
  source: string;
  labels: Record<string, string>;
  autoExpose: boolean;
};

export interface DiscoveryProvider {
  readonly name: string;
  discover(): Promise<DiscoveredService[]>;
  watch(callback: (service: DiscoveredService, event: string) => void): void;
  stop(): void;
}

type EventStream = NodeJS.ReadableStream & { destroy(): void };

const logger = createLogger('docker-discovery');
const routesLogger = createLogger('discovery-routes');

const HTTPS_PRIVATE_PORTS = [443, 8443, 9443, 10443];

export class DockerDiscoveryProvider implements DiscoveryProvider {
  readonly name = 'docker';
  private docker: Docker;
  private labelPrefix: string;
  private eventStream: EventStream | null = null;

  constructor(connection: { socketPath?: string; host?: string; labelPrefix?: string }) {
    this.docker = this.createDockerClient(connection);
    this.labelPrefix = connection.labelPrefix || 'autoxpose';
  }

  async discover(): Promise<DiscoveredService[]> {
    const containers = await this.docker.listContainers({ all: false });
    logger.info({ count: containers.length }, 'Listed containers');
    return containers
      .map((c: Docker.ContainerInfo) => this.mapContainerInfo(c))
      .filter((s: DiscoveredService | null): s is DiscoveredService => s !== null);
  }

  watch(callback: (service: DiscoveredService, event: string) => void): void {
    this.docker.getEvents(
      { filters: { type: ['container'] } },
      (err: Error | null, stream?: NodeJS.ReadableStream) => {
        if (err || !stream) {
          logger.error({ err }, 'Failed to watch Docker events');
          return;
        }

        this.eventStream = stream as EventStream;
        let buffer = '';

        stream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const parts = buffer.split('\n');
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            if (!part.trim()) continue;
            try {
              const event = JSON.parse(part) as {
                Action: string;
                Actor: { ID: string };
              };
              if (event.Action === 'start' || event.Action === 'stop') {
                this.inspectContainer(event.Actor.ID).then(service => {
                  if (service) {
                    callback(service, event.Action);
                  }
                });
              }
            } catch (err) {
              logger.warn({ err, raw: part }, 'Failed to parse Docker event chunk');
            }
          }
        });
      }
    );
  }

  stop(): void {
    if (this.eventStream) {
      this.eventStream.destroy();
      this.eventStream = null;
    }
  }

  private async inspectContainer(containerId: string): Promise<DiscoveredService | null> {
    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();
    return this.mapInspectedContainer(info);
  }

  private isEnabled(enableValue: string | undefined): boolean {
    return enableValue === 'true' || enableValue === 'auto';
  }

  private resolvePortFromInfo(
    labels: Record<string, string>,
    ports: Docker.Port[]
  ): { port: number; scheme: string } | null {
    const explicitPort = labels[`${this.labelPrefix}.port`];
    const explicitScheme = labels[`${this.labelPrefix}.scheme`];

    if (explicitPort) {
      return { port: parseInt(explicitPort, 10), scheme: explicitScheme || 'http' };
    }

    const { selectedPort, detectedScheme } = this.selectBestPortFromInfo(ports);
    if (!selectedPort) return null;

    return { port: selectedPort, scheme: explicitScheme || detectedScheme };
  }

  private mapContainerInfo(container: Docker.ContainerInfo): DiscoveredService | null {
    const labels = container.Labels || {};
    const enableValue = labels[`${this.labelPrefix}.enable`];

    logger.debug({ id: container.Id, labels, enable: enableValue }, 'Checking container');

    if (!this.isEnabled(enableValue)) return null;

    const resolved = this.resolvePortFromInfo(labels, container.Ports);
    if (!resolved) {
      logger.debug({ id: container.Id }, 'No port found');
      return null;
    }

    const name = container.Names?.[0]?.replace(/^\//, '') || '';
    const subdomain = labels[`${this.labelPrefix}.subdomain`] || name;
    return {
      id: container.Id,
      name: labels[`${this.labelPrefix}.name`] || name,
      subdomain,
      port: resolved.port,
      scheme: resolved.scheme,
      source: 'docker',
      labels,
      autoExpose: enableValue === 'auto',
    };
  }

  private selectBestPortFromInfo(ports: Docker.Port[]): {
    selectedPort: number | null;
    detectedScheme: string;
  } {
    if (!ports || ports.length === 0) {
      return { selectedPort: null, detectedScheme: 'http' };
    }

    const mappings = ports
      .filter(p => p.PublicPort)
      .map(p => ({ publicPort: p.PublicPort!, privatePort: p.PrivatePort }));

    if (mappings.length === 0) {
      return { selectedPort: ports[0]?.PrivatePort || null, detectedScheme: 'http' };
    }

    const httpsMapping = mappings.find(m => HTTPS_PRIVATE_PORTS.includes(m.privatePort));
    if (httpsMapping) {
      logger.debug(
        { port: httpsMapping.publicPort, privatePort: httpsMapping.privatePort },
        'Selected HTTPS port'
      );
      return { selectedPort: httpsMapping.publicPort, detectedScheme: 'https' };
    }

    return { selectedPort: mappings[0].publicPort, detectedScheme: 'http' };
  }

  private resolvePortFromBindings(
    labels: Record<string, string>,
    bindings: Record<string, unknown>
  ): { port: number; scheme: string } | null {
    const explicitPort = labels[`${this.labelPrefix}.port`];
    const explicitScheme = labels[`${this.labelPrefix}.scheme`];

    if (explicitPort) {
      return { port: parseInt(explicitPort, 10), scheme: explicitScheme || 'http' };
    }

    const { selectedPort, detectedScheme } = this.selectBestPortFromBindings(bindings);
    if (!selectedPort) return null;

    return { port: selectedPort, scheme: explicitScheme || detectedScheme };
  }

  private mapInspectedContainer(info: Docker.ContainerInspectInfo): DiscoveredService | null {
    const labels = info.Config.Labels || {};
    const enableValue = labels[`${this.labelPrefix}.enable`];

    if (!this.isEnabled(enableValue)) return null;

    const portBindings = info.NetworkSettings.Ports || {};
    const resolved = this.resolvePortFromBindings(labels, portBindings);
    if (!resolved) return null;

    const name = info.Name.replace(/^\//, '');
    const subdomain = labels[`${this.labelPrefix}.subdomain`] || name;
    return {
      id: info.Id,
      name: labels[`${this.labelPrefix}.name`] || name,
      subdomain,
      port: resolved.port,
      scheme: resolved.scheme,
      source: 'docker',
      labels,
      autoExpose: enableValue === 'auto',
    };
  }

  private selectBestPortFromBindings(bindings: Record<string, unknown>): {
    selectedPort: number | null;
    detectedScheme: string;
  } {
    const entries = Object.entries(bindings);
    if (entries.length === 0) {
      return { selectedPort: null, detectedScheme: 'http' };
    }

    const mappings: Array<{ publicPort: number; privatePort: number }> = [];

    for (const [portKey, hostBindings] of entries) {
      const privatePort = parseInt(portKey.split('/')[0], 10);
      const hostPort = (hostBindings as Array<{ HostPort: string }>)?.[0]?.HostPort;
      if (hostPort) {
        mappings.push({ publicPort: parseInt(hostPort, 10), privatePort });
      }
    }

    if (mappings.length === 0) {
      const firstPrivate = parseInt(entries[0][0].split('/')[0], 10);
      return { selectedPort: firstPrivate, detectedScheme: 'http' };
    }

    const httpsMapping = mappings.find(m => HTTPS_PRIVATE_PORTS.includes(m.privatePort));
    if (httpsMapping) {
      logger.debug(
        { port: httpsMapping.publicPort, privatePort: httpsMapping.privatePort },
        'Selected HTTPS port from bindings'
      );
      return { selectedPort: httpsMapping.publicPort, detectedScheme: 'https' };
    }

    return { selectedPort: mappings[0].publicPort, detectedScheme: 'http' };
  }

  private createDockerClient(connection: { socketPath?: string; host?: string }): Docker {
    if (connection.host) {
      const parsed = this.parseHost(connection.host);
      if (parsed.socketPath) {
        return new Docker({ socketPath: parsed.socketPath });
      }
      return new Docker({
        protocol: parsed.protocol,
        host: parsed.host,
        port: parsed.port,
      });
    }

    return new Docker({ socketPath: connection.socketPath || '/var/run/docker.sock' });
  }

  private parseHost(host: string): {
    socketPath?: string;
    protocol?: 'http' | 'https' | 'ssh';
    host?: string;
    port?: number;
  } {
    if (host.startsWith('unix://')) {
      return { socketPath: host.replace('unix://', '') };
    }

    let target = host;
    const hasProtocol =
      host.startsWith('tcp://') || host.startsWith('http://') || host.startsWith('https://');
    if (!hasProtocol) {
      target = `tcp://${host}`;
    }

    const url = new URL(target);
    const protocol =
      url.protocol.replace(':', '') === 'tcp'
        ? 'http'
        : (url.protocol.replace(':', '') as 'http' | 'https' | 'ssh');
    const port = url.port ? parseInt(url.port, 10) : 2375;

    return { protocol, host: url.hostname, port };
  }
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

      for (const svc of result.autoExpose) {
        routesLogger.info({ serviceId: svc.id, name: svc.name }, 'Auto-exposing service');
        ctx.expose.expose(svc.id).catch(err => {
          routesLogger.error({ err, serviceId: svc.id }, 'Auto-expose failed');
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

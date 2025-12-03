import Docker from 'dockerode';
import { createLogger } from '../../core/logger/index.js';
import type { DiscoveredService, DiscoveryProvider } from './discovery.types.js';

type EventStream = NodeJS.ReadableStream & { destroy(): void };

const logger = createLogger('docker-discovery');

const HTTPS_PRIVATE_PORTS = [443, 8443, 9443];

export class DockerDiscoveryProvider implements DiscoveryProvider {
  readonly name = 'docker';
  private docker: Docker;
  private labelPrefix: string;
  private eventStream: EventStream | null = null;

  constructor(socketPath: string, labelPrefix: string = 'autoxpose') {
    this.docker = new Docker({ socketPath });
    this.labelPrefix = labelPrefix;
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

        stream.on('data', (chunk: Buffer) => {
          const event = JSON.parse(chunk.toString()) as {
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

  private mapContainerInfo(container: Docker.ContainerInfo): DiscoveredService | null {
    const labels = container.Labels || {};
    const enabled = labels[`${this.labelPrefix}.enable`];

    logger.debug({ id: container.Id, labels, enabled }, 'Checking container');

    if (enabled !== 'true') return null;

    const explicitPort = labels[`${this.labelPrefix}.port`];
    const explicitScheme = labels[`${this.labelPrefix}.scheme`];

    let port: number | null;
    let scheme: string;

    if (explicitPort) {
      port = parseInt(explicitPort, 10);
      scheme = explicitScheme || 'http';
    } else {
      const { selectedPort, detectedScheme } = this.selectBestPortFromInfo(container.Ports);
      port = selectedPort;
      scheme = explicitScheme || detectedScheme;
    }

    if (!port) {
      logger.debug({ id: container.Id }, 'No port found');
      return null;
    }

    const name = container.Names?.[0]?.replace(/^\//, '') || '';
    return {
      id: container.Id,
      name: labels[`${this.labelPrefix}.name`] || name,
      domain: labels[`${this.labelPrefix}.domain`] || '',
      port,
      scheme,
      source: 'docker',
      labels,
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

  private mapInspectedContainer(info: Docker.ContainerInspectInfo): DiscoveredService | null {
    const labels = info.Config.Labels || {};
    const enabled = labels[`${this.labelPrefix}.enable`];

    if (enabled !== 'true') return null;

    const explicitPort = labels[`${this.labelPrefix}.port`];
    const explicitScheme = labels[`${this.labelPrefix}.scheme`];

    let port: number | null;
    let scheme: string;

    if (explicitPort) {
      port = parseInt(explicitPort, 10);
      scheme = explicitScheme || 'http';
    } else {
      const portBindings = info.NetworkSettings.Ports || {};
      const { selectedPort, detectedScheme } = this.selectBestPortFromBindings(portBindings);
      port = selectedPort;
      scheme = explicitScheme || detectedScheme;
    }

    if (!port) return null;

    return {
      id: info.Id,
      name: labels[`${this.labelPrefix}.name`] || info.Name.replace(/^\//, ''),
      domain: labels[`${this.labelPrefix}.domain`] || '',
      port,
      scheme,
      source: 'docker',
      labels,
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
}

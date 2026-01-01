import type Docker from 'dockerode';
import { createLogger } from '../../core/logger/index.js';

const logger = createLogger('port-inspector');

export async function getContainerExposedPorts(
  docker: Docker,
  containerId: string
): Promise<number[]> {
  try {
    const info = await docker.getContainer(containerId).inspect();
    const portBindings = info.NetworkSettings.Ports || {};
    const ports: number[] = [];
    for (const [portKey, hostBindings] of Object.entries(portBindings)) {
      const privatePort = parseInt(portKey.split('/')[0], 10);
      const hostPort = (hostBindings as Array<{ HostPort: string }>)?.[0]?.HostPort;
      if (hostPort) {
        ports.push(parseInt(hostPort, 10));
      } else {
        ports.push(privatePort);
      }
    }
    return ports;
  } catch (err) {
    logger.error({ err, containerId }, 'Failed to get exposed ports');
    return [];
  }
}

import type { DockerDiscoveryProvider } from '../discovery/docker.js';

export async function isPortExposedByContainer(
  containerId: string | null,
  port: number,
  dockerProvider?: DockerDiscoveryProvider
): Promise<boolean> {
  if (!containerId || !dockerProvider) return true;
  const exposedPorts = await dockerProvider.getExposedPorts(containerId);
  return exposedPorts.includes(port);
}

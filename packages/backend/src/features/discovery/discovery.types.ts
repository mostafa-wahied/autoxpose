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

export type DockerContainer = {
  id: string;
  name: string;
  image: string;
  state: string;
  labels: Record<string, string>;
  ports: Array<{
    privatePort: number;
    publicPort?: number;
    type: string;
  }>;
};

export interface DiscoveryProvider {
  readonly name: string;
  discover(): Promise<DiscoveredService[]>;
  watch(callback: (service: DiscoveredService, event: string) => void): void;
  stop(): void;
}

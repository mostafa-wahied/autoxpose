import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from '../../core/logger/index.js';

const logger = createLogger('metadata-loader');

export interface ServiceInfo {
  name: string;
  tags: string[];
  imagePatterns: string[];
  namePatterns: string[];
  ports: number[];
  url: string;
  description: string;
}

export interface ServiceMetadata {
  version: string;
  lastUpdated: string;
  services: ServiceInfo[];
}

export class MetadataLoader {
  private metadata: ServiceMetadata | null = null;
  private imageIndex: Map<string, ServiceInfo> = new Map();
  private nameIndex: Map<string, ServiceInfo> = new Map();
  private portIndex: Map<number, ServiceInfo[]> = new Map();

  async load(): Promise<void> {
    const dataDir = '/app/packages/backend/data';
    const runtimePath = path.join(dataDir, 'service-metadata.json');
    const embeddedPath = '/app/packages/backend/src/data/service-metadata.json';

    let metadataPath = embeddedPath;

    if (fs.existsSync(runtimePath)) {
      metadataPath = runtimePath;
      logger.info('Loading metadata from runtime path');
    } else {
      logger.info('Loading metadata from embedded resource');
    }

    try {
      const content = fs.readFileSync(metadataPath, 'utf-8');
      this.metadata = JSON.parse(content) as ServiceMetadata;
      this.buildIndices();
      logger.info(`Loaded ${this.metadata.services.length} services`);
    } catch (error) {
      logger.error('Failed to load metadata', { error });
      throw new Error('Failed to load service metadata');
    }
  }

  private buildIndices(): void {
    if (!this.metadata) return;

    for (const service of this.metadata.services) {
      for (const pattern of service.imagePatterns) {
        this.imageIndex.set(pattern.toLowerCase(), service);
      }

      for (const pattern of service.namePatterns) {
        this.nameIndex.set(pattern.toLowerCase(), service);
      }

      for (const port of service.ports) {
        const existing = this.portIndex.get(port) || [];
        existing.push(service);
        this.portIndex.set(port, existing);
      }
    }
  }

  findByImage(imageName: string): ServiceInfo | null {
    if (!this.metadata) return null;

    const lower = imageName.toLowerCase();

    for (const [pattern, service] of this.imageIndex.entries()) {
      if (lower.includes(pattern) || pattern.includes(lower)) {
        return service;
      }
    }

    return null;
  }

  findByName(containerName: string): ServiceInfo | null {
    if (!this.metadata) return null;

    const lower = containerName.toLowerCase();

    for (const [pattern, service] of this.nameIndex.entries()) {
      if (lower.includes(pattern) || pattern.includes(lower)) {
        return service;
      }
    }

    return null;
  }

  findByPort(port: number): ServiceInfo[] {
    if (!this.metadata) return [];
    return this.portIndex.get(port) || [];
  }

  getVersion(): string {
    return this.metadata?.version || 'unknown';
  }

  getLastUpdated(): string {
    return this.metadata?.lastUpdated || 'unknown';
  }
}

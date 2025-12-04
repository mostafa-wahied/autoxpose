import type { DiscoveredService } from '../discovery/discovery.types.js';
import type {
  CreateServiceInput,
  ServiceRecord,
  ServicesRepository,
} from './services.repository.js';

type SyncResult = {
  created: ServiceRecord[];
  updated: ServiceRecord[];
  removed: string[];
  autoExpose: ServiceRecord[];
};

export class ServicesService {
  constructor(private repository: ServicesRepository) {}

  async getAllServices(): Promise<ServiceRecord[]> {
    return this.repository.findAll();
  }

  async getServiceById(id: string): Promise<ServiceRecord | undefined> {
    return this.repository.findById(id);
  }

  async createService(input: CreateServiceInput): Promise<ServiceRecord> {
    return this.repository.create(input);
  }

  async updateService(
    id: string,
    input: Partial<Omit<CreateServiceInput, 'source' | 'sourceId'>>
  ): Promise<ServiceRecord | undefined> {
    return this.repository.update(id, input);
  }

  async deleteService(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  async syncFromDiscovery(discovered: DiscoveredService[]): Promise<SyncResult> {
    const existing = await this.repository.findAll();
    const existingBySourceId = new Map(existing.filter(s => s.sourceId).map(s => [s.sourceId!, s]));
    const autoExposeIds = new Set(discovered.filter(d => d.autoExpose).map(d => d.id));

    const seenSourceIds = new Set<string>();
    const created = await this.processNewServices(discovered, existingBySourceId, seenSourceIds);
    const updated = await this.processUpdates(discovered, existingBySourceId);
    const removed = await this.removeStaleServices(existing, seenSourceIds);
    const autoExpose = created.filter(s => s.sourceId && autoExposeIds.has(s.sourceId));

    return { created, updated, removed, autoExpose };
  }

  private async processNewServices(
    discovered: DiscoveredService[],
    existingMap: Map<string, ServiceRecord>,
    seenIds: Set<string>
  ): Promise<ServiceRecord[]> {
    const created: ServiceRecord[] = [];
    for (const disc of discovered) {
      seenIds.add(disc.id);
      if (existingMap.has(disc.id)) continue;
      const svc = await this.repository.create({
        name: disc.name,
        subdomain: disc.subdomain,
        port: disc.port,
        scheme: disc.scheme,
        source: disc.source,
        sourceId: disc.id,
      });
      created.push(svc);
    }
    return created;
  }

  private async processUpdates(
    discovered: DiscoveredService[],
    existingMap: Map<string, ServiceRecord>
  ): Promise<ServiceRecord[]> {
    const updated: ServiceRecord[] = [];
    for (const disc of discovered) {
      const existing = existingMap.get(disc.id);
      if (!existing) continue;
      const needsUpdate = this.serviceNeedsUpdate(existing, disc);
      if (!needsUpdate) continue;
      const subdomainToUse = disc.subdomain || existing.subdomain;
      const upd = await this.repository.update(existing.id, {
        name: disc.name,
        subdomain: subdomainToUse,
        port: disc.port,
        scheme: disc.scheme,
      });
      if (upd) updated.push(upd);
    }
    return updated;
  }

  private serviceNeedsUpdate(existing: ServiceRecord, disc: DiscoveredService): boolean {
    const subdomainChanged = disc.subdomain && existing.subdomain !== disc.subdomain;
    return existing.name !== disc.name || subdomainChanged || existing.port !== disc.port;
  }

  private async removeStaleServices(
    existing: ServiceRecord[],
    seenIds: Set<string>
  ): Promise<string[]> {
    const removed: string[] = [];
    for (const svc of existing) {
      const isStale = svc.source === 'docker' && svc.sourceId && !seenIds.has(svc.sourceId);
      if (!isStale) continue;
      await this.repository.delete(svc.id);
      removed.push(svc.id);
    }
    return removed;
  }
}

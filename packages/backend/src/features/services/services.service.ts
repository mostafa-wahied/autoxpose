import type { DiscoveredService } from '../discovery/docker.js';
import type { SettingsService } from '../settings/settings.service.js';
import type { TagDetector } from './tag-detector.js';
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
  constructor(
    private repository: ServicesRepository,
    private settings?: SettingsService,
    private tagDetector?: TagDetector
  ) {}

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

  async fixConfig(id: string): Promise<{ fixed: string[]; errors: string[] }> {
    if (!this.settings) {
      throw new Error('Settings service required for fixConfig');
    }

    const service = await this.repository.findById(id);
    if (!service || !service.configWarnings) {
      return { fixed: [], errors: [] };
    }

    const proxy = await this.settings.getProxyProvider();
    if (!proxy || !service.proxyHostId) {
      return { fixed: [], errors: ['No proxy configuration to fix'] };
    }

    const result = await this.applyFixes(service, proxy);

    if (result.fixed.length > 0) {
      await this.repository.update(id, { configWarnings: null });
    }

    return result;
  }

  private async applyFixes(
    service: ServiceRecord,
    proxy: Awaited<ReturnType<SettingsService['getProxyProvider']>>
  ): Promise<{ fixed: string[]; errors: string[] }> {
    const warnings = JSON.parse(service.configWarnings!) as string[];
    const fixed: string[] = [];
    const errors: string[] = [];

    for (const warning of warnings) {
      if (warning === 'port_mismatch' && proxy) {
        try {
          await proxy.updateHost(service.proxyHostId!, { targetPort: service.port });
          fixed.push('port_mismatch');
        } catch (err) {
          errors.push(`Failed to fix port: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }
    }

    return { fixed, errors };
  }

  async upsertService(discovered: DiscoveredService): Promise<ServiceRecord> {
    const existing = await this.repository.findBySourceId(discovered.id);
    const tags = this.detectServiceTags(discovered);

    if (existing) {
      const needsUpdate = this.serviceNeedsUpdate(existing, discovered);
      if (!needsUpdate) return existing;
      const hasExplicitSubdomain = discovered.labels[`autoxpose.subdomain`] !== undefined;
      const subdomainToUse = hasExplicitSubdomain ? discovered.subdomain : existing.subdomain;
      const updated = await this.repository.update(existing.id, {
        name: discovered.name,
        subdomain: subdomainToUse,
        port: discovered.port,
        scheme: discovered.scheme,
        tags,
      });
      return updated!;
    }
    return this.repository.create({
      name: discovered.name,
      subdomain: discovered.subdomain,
      port: discovered.port,
      scheme: discovered.scheme,
      source: discovered.source,
      sourceId: discovered.id,
      tags,
    });
  }

  private detectServiceTags(discovered: DiscoveredService): string {
    if (!this.tagDetector) return JSON.stringify(['utility']);

    const tags = this.tagDetector.detectTags({
      labels: discovered.labels,
      image: discovered.image,
      name: discovered.name,
      port: discovered.port,
    });

    return JSON.stringify(tags);
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
      const tags = this.detectServiceTags(disc);
      const svc = await this.repository.create({
        name: disc.name,
        subdomain: disc.subdomain,
        port: disc.port,
        scheme: disc.scheme,
        source: disc.source,
        sourceId: disc.id,
        tags,
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
      const hasExplicitSubdomain = disc.labels[`autoxpose.subdomain`] !== undefined;
      const subdomainToUse = hasExplicitSubdomain ? disc.subdomain : existing.subdomain;
      const tags = this.detectServiceTags(disc);
      const upd = await this.repository.update(existing.id, {
        name: disc.name,
        subdomain: subdomainToUse,
        port: disc.port,
        scheme: disc.scheme,
        tags,
      });
      if (upd) updated.push(upd);
    }
    return updated;
  }

  private serviceNeedsUpdate(existing: ServiceRecord, disc: DiscoveredService): boolean {
    const hasExplicitSubdomain = disc.labels[`autoxpose.subdomain`] !== undefined;
    const subdomainChanged = hasExplicitSubdomain && existing.subdomain !== disc.subdomain;
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

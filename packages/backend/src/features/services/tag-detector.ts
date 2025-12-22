import { MetadataLoader } from './metadata-loader.js';

interface ServiceInput {
  labels: Record<string, string>;
  image: string;
  name: string;
  port: number;
}

export class TagDetector {
  constructor(private loader: MetadataLoader) {}

  detectTags(service: ServiceInput): string[] {
    const manualTags = this.checkManualLabels(service.labels);
    if (manualTags.length > 0) {
      return manualTags;
    }

    const imageMatch = this.loader.findByImage(service.image);
    if (imageMatch) {
      return imageMatch.tags;
    }

    const nameMatch = this.loader.findByName(service.name);
    if (nameMatch) {
      return nameMatch.tags;
    }

    const portMatches = this.loader.findByPort(service.port);
    if (portMatches.length > 0) {
      return portMatches[0].tags;
    }

    return ['utility'];
  }

  private checkManualLabels(labels: Record<string, string>): string[] {
    const tagLabel = labels['autoxpose.tags'] || labels['autoxpose.tag'];
    if (!tagLabel) return [];

    return tagLabel
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
  }
}

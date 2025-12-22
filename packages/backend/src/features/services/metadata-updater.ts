import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { createLogger } from '../../core/logger/index.js';
import type { ServiceMetadata } from './metadata-loader.js';
import type { MetadataLoader } from './metadata-loader.js';

const logger = createLogger('metadata-updater');

export class MetadataUpdater {
  private readonly updateInterval = 7 * 24 * 60 * 60 * 1000;
  private readonly sourceUrl =
    'https://raw.githubusercontent.com/mostafa-wahied/autoxpose/main/packages/backend/src/data/service-metadata.json';
  private timer: NodeJS.Timeout | null = null;

  constructor(private loader: MetadataLoader) {}

  async startAutoUpdate(): Promise<void> {
    logger.info('Starting metadata auto-update task (fetches from GitHub repo)');
    logger.info('Note: For fresh rebuild run: pnpm build:metadata');

    this.timer = setInterval(async () => {
      try {
        const updated = await this.checkForUpdates();
        if (updated) {
          logger.info('Metadata updated successfully');
        }
      } catch (error) {
        logger.error('Metadata update check failed', { error });
      }
    }, this.updateInterval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Metadata auto-update task stopped');
    }
  }

  async checkForUpdates(): Promise<boolean> {
    logger.info('Checking for metadata updates');

    const latest = await this.fetchLatest();
    if (!latest) {
      logger.warn('Failed to fetch latest metadata');
      return false;
    }

    const currentVersion = this.loader.getVersion();
    if (latest.version === currentVersion) {
      logger.info('Metadata is up to date');
      return false;
    }

    logger.info(`Updating metadata from ${currentVersion} to ${latest.version}`);
    await this.saveToFilesystem(latest);
    await this.loader.load();

    return true;
  }

  private async fetchLatest(): Promise<ServiceMetadata | null> {
    return new Promise(resolve => {
      https
        .get(this.sourceUrl, res => {
          if (res.statusCode !== 200) {
            logger.error(`HTTP ${res.statusCode} fetching metadata`);
            resolve(null);
            return;
          }

          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            try {
              const metadata = JSON.parse(data) as ServiceMetadata;
              resolve(metadata);
            } catch (error) {
              logger.error('Failed to parse metadata JSON', { error });
              resolve(null);
            }
          });
        })
        .on('error', error => {
          logger.error('Failed to fetch metadata', { error });
          resolve(null);
        });
    });
  }

  private async saveToFilesystem(metadata: ServiceMetadata): Promise<void> {
    const dataDir = '/app/packages/backend/data';
    const outputPath = path.join(dataDir, 'service-metadata.json');

    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2));
    logger.info('Metadata saved to filesystem');
  }
}

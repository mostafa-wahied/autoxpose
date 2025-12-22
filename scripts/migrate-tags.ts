import Database from 'better-sqlite3';
import Dockerode from 'dockerode';
import { MetadataLoader } from '../packages/backend/src/features/services/metadata-loader.js';
import { TagDetector } from '../packages/backend/src/features/services/tag-detector.js';

async function migrateExistingServices(): Promise<void> {
  console.log('=== Service Tags Migration ===\n');

  const dbPath = process.env.DB_PATH || '/app/packages/backend/data/autoxpose.db';
  const db = new Database(dbPath);

  const loader = new MetadataLoader();
  await loader.load();
  console.log(`Loaded metadata version: ${loader.getVersion()}\n`);

  const detector = new TagDetector(loader);
  const docker = new Dockerode({ socketPath: '/var/run/docker.sock' });

  const services = db
    .prepare('SELECT id, name, source_id, port FROM services WHERE (tags IS NULL OR tags = ?) AND source = ?')
    .all('null', 'docker') as Array<{ id: string; name: string; source_id: string | null; port: number }>;

  console.log(`Found ${services.length} services without tags\n`);

  if (services.length === 0) {
    console.log('All services already have tags!');
    db.close();
    return;
  }

  let updated = 0;
  let failed = 0;

  for (const service of services) {
    try {
      const containerId = service.source_id;
      if (!containerId) {
        console.log(`⚠️  ${service.name}: No container ID, using name-based detection`);
        const tags = detector.detectTags({
          labels: {},
          image: service.name.toLowerCase(),
          name: service.name,
          port: service.port || 80,
        });
        const tagsJson = JSON.stringify(tags);
        db.prepare('UPDATE services SET tags = ? WHERE id = ?').run(tagsJson, service.id);
        console.log(`✅ ${service.name}: ${tags.join(', ')}`);
        updated++;
        continue;
      }

      const container = docker.getContainer(containerId);
      const info = await container.inspect();

      const imageName = info.Config.Image || '';
      const containerName = info.Name.replace(/^\//, '') || service.name;
      const labels = info.Config.Labels || {};
      const ports = Object.keys(info.Config.ExposedPorts || {});
      const primaryPort = ports.length > 0 ? parseInt(ports[0].split('/')[0]) : service.port || 80;

      const tags = detector.detectTags({
        labels,
        image: imageName,
        name: containerName,
        port: primaryPort,
      });

      const tagsJson = JSON.stringify(tags);
      db.prepare('UPDATE services SET tags = ? WHERE id = ?').run(tagsJson, service.id);

      console.log(`✅ ${service.name}: ${tags.join(', ')} (${imageName})`);
      updated++;
    } catch (error) {
      console.error(`❌ ${service.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      failed++;
    }
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${services.length}`);

  db.close();
}

migrateExistingServices().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});

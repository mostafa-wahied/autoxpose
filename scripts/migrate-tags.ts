import Database from 'better-sqlite3';
import { MetadataLoader } from '../packages/backend/src/features/services/metadata-loader.js';
import { TagDetector } from '../packages/backend/src/features/services/tag-detector.js';

async function migrateExistingServices(): Promise<void> {
  const dbPath = process.env.DB_PATH || '/app/packages/backend/data/autoxpose.db';
  const db = new Database(dbPath);

  const loader = new MetadataLoader();
  await loader.load();

  const detector = new TagDetector(loader);

  const services = db
    .prepare('SELECT id, name, source_id FROM services WHERE tags IS NULL AND source = ?')
    .all('docker') as Array<{ id: string; name: string; source_id: string | null }>;

  console.log(`Found ${services.length} services without tags`);

  let updated = 0;

  for (const service of services) {
    const containerName = service.source_id || service.name;
    const imageName = containerName;
    const tags = detector.detectTags({
      labels: {},
      image: imageName,
      name: containerName,
      port: 80,
    });

    const tagsJson = JSON.stringify(tags);
    db.prepare('UPDATE services SET tags = ? WHERE id = ?').run(tagsJson, service.id);

    console.log(`Updated ${service.name}: ${tagsJson}`);
    updated++;
  }

  console.log(`\nMigration complete! Updated ${updated} services.`);
  db.close();
}

migrateExistingServices().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});

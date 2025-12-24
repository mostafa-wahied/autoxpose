import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { fileURLToPath } from 'url';
import { URL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_TAGS = 2;

type CategoryTag = string;

interface ServiceInfo {
  name: string;
  tags: string[];
  imagePatterns: string[];
  namePatterns: string[];
  ports: number[];
  url: string;
  description: string;
  source?: string[];
  topics?: string[];
}

interface Metadata {
  version: string;
  lastUpdated: string;
  services: ServiceInfo[];
}

interface ServiceMap {
  [normalizedName: string]: ServiceInfo;
}

const TAG_SPECIFICITY: Record<string, number> = {
  ai: 1,
  database: 2,
  security: 3,
  development: 4,
  monitoring: 5,
  media: 6,
  dashboard: 7,
  automation: 8,
  communication: 9,
  productivity: 10,
  networking: 11,
  storage: 12,
  web: 13,
  download: 14,
  gaming: 15,
  utility: 16,
};

const AI_PATTERNS = {
  strong: [
    /\b(llm|large language model)\b/i,
    /\bgpt\b/i,
    /\bollama\b/i,
    /\b(neural network|machine learning model)\b/i,
    /\b(ai inference|model inference)\b/i,
    /\b(embedding|vector (database|store))\b/i,
    /\brag\b.*\b(retrieval|augment)/i,
    /\bopenai\b/i,
    /\blangchain\b/i,
  ],
  exclude: [/analytics.*ai/i, /dashboard.*ai/i, /ai.*insights/i, /ai.*powered.*analytics/i],
};

const CATEGORY_MAP: Record<string, string> = {
  analytics: 'monitoring',
  'archiving and digital preservation': 'utility',
  automation: 'automation',
  'blogging platforms': 'web',
  'booking and scheduling': 'productivity',
  'bookmarks and link sharing': 'productivity',
  'calendar & contacts': 'productivity',
  communication: 'communication',
  'communication - custom communication systems': 'communication',
  'communication - email': 'communication',
  'communication - irc': 'communication',
  'communication - sip': 'communication',
  'communication - social networks and forums': 'communication',
  'communication - video conferencing': 'communication',
  'communication - xmpp': 'communication',
  'community-supported agriculture': 'productivity',
  'conference management': 'productivity',
  'content management systems': 'web',
  'database management': 'database',
  dns: 'utility',
  'document management': 'productivity',
  'document management - e-books': 'productivity',
  'document management - institutional repository and digital library software': 'productivity',
  'document management - integrated library systems': 'productivity',
  'e-commerce': 'web',
  'federated identity & authentication': 'security',
  'feed readers': 'web',
  'file transfer & synchronization': 'utility',
  'file transfer - distributed filesystems': 'utility',
  'file transfer - object storage & file servers': 'utility',
  'file transfer - peer-to-peer filesharing': 'download',
  'file transfer - single-click & drag-n-drop upload': 'utility',
  'file transfer - web based file managers': 'utility',
  games: 'gaming',
  'games - administrative utilities & control panels': 'gaming',
  genealogy: 'productivity',
  groupware: 'productivity',
  'human resources management': 'productivity',
  'internet of things': 'automation',
  'inventory management': 'productivity',
  'knowledge management tools': 'productivity',
  'learning and courses': 'productivity',
  'maps and global positioning system': 'utility',
  'media streaming': 'media',
  'media streaming - audio streaming': 'media',
  'media streaming - multimedia streaming': 'media',
  'media streaming - video streaming': 'media',
  miscellaneous: 'utility',
  'money, budgeting & management': 'productivity',
  monitoring: 'monitoring',
  'note-taking & editors': 'productivity',
  'office suites': 'productivity',
  'password managers': 'security',
  pastebins: 'utility',
  'personal dashboards': 'web',
  'photo and video galleries': 'media',
  'polls and events': 'productivity',
  proxy: 'utility',
  'recipe management': 'productivity',
  'remote access': 'utility',
  'resource planning': 'productivity',
  'search engines': 'web',
  'self-hosting solutions': 'utility',
  'software development': 'development',
  'software development - api management': 'development',
  'software development - continuous integration & deployment': 'development',
  'software development - fiddle/playground': 'development',
  'software development - project management': 'development',
  'software development - testing': 'development',
  'static site generators': 'web',
  'status / uptime pages': 'monitoring',
  'task management & to-do lists': 'productivity',
  ticketing: 'productivity',
  'time tracking': 'productivity',
  'url shorteners': 'web',
  'video surveillance': 'security',
  vpn: 'security',
  'web servers': 'web',
  wikis: 'web',
};

const MANUAL_OVERRIDES: Record<string, Partial<ServiceInfo>> = {};

const COMMON_IMAGES: Record<string, string[]> = {
  plex: ['plexinc/pms-docker', 'linuxserver/plex'],
  jellyfin: ['jellyfin/jellyfin', 'linuxserver/jellyfin'],
  emby: ['emby/embyserver', 'linuxserver/emby'],
  nextcloud: ['nextcloud', 'linuxserver/nextcloud'],
  'home assistant': ['homeassistant/home-assistant', 'ghcr.io/home-assistant/home-assistant'],
  portainer: ['portainer/portainer-ce', 'portainer/portainer-ee'],
  grafana: ['grafana/grafana'],
  prometheus: ['prom/prometheus'],
  transmission: ['linuxserver/transmission', 'haugene/transmission-openvpn'],
  sonarr: ['linuxserver/sonarr', 'ghcr.io/hotio/sonarr'],
  radarr: ['linuxserver/radarr', 'ghcr.io/hotio/radarr'],
  lidarr: ['linuxserver/lidarr'],
  bazarr: ['linuxserver/bazarr'],
  prowlarr: ['linuxserver/prowlarr'],
  jackett: ['linuxserver/jackett'],
  qbittorrent: ['linuxserver/qbittorrent', 'ghcr.io/hotio/qbittorrent'],
  deluge: ['linuxserver/deluge'],
  nzbget: ['linuxserver/nzbget'],
  sabnzbd: ['linuxserver/sabnzbd'],
  calibre: ['linuxserver/calibre', 'linuxserver/calibre-web'],
  photoprism: ['photoprism/photoprism'],
  vaultwarden: ['vaultwarden/server'],
  bitwarden: ['bitwarden/self-host'],
  gitea: ['gitea/gitea'],
  gitlab: ['gitlab/gitlab-ce', 'gitlab/gitlab-ee'],
  'code-server': ['codercom/code-server', 'linuxserver/code-server'],
  nginx: ['nginx', 'linuxserver/nginx'],
  traefik: ['traefik'],
  caddy: ['caddy'],
  postgres: ['postgres'],
  mysql: ['mysql'],
  mariadb: ['mariadb', 'linuxserver/mariadb'],
  mongodb: ['mongo'],
  redis: ['redis'],
  watchtower: ['containrrr/watchtower'],
  'uptime-kuma': ['louislam/uptime-kuma'],
  duplicati: ['linuxserver/duplicati'],
  syncthing: ['linuxserver/syncthing', 'syncthing/syncthing'],
  frigate: ['ghcr.io/blakeblackshear/frigate'],
  authentik: ['ghcr.io/goauthentik/server'],
  authelia: ['authelia/authelia'],
  wireguard: ['linuxserver/wireguard'],
  openvpn: ['kylemanna/openvpn'],
  pihole: ['pihole/pihole'],
  adguard: ['adguard/adguardhome'],
  unifi: ['linuxserver/unifi-controller', 'jacobalberty/unifi'],
  paperless: ['ghcr.io/paperless-ngx/paperless-ngx'],
  bookstack: ['linuxserver/bookstack'],
  wikijs: ['ghcr.io/requarks/wiki'],
  mattermost: ['mattermost/mattermost-team-edition'],
  'rocket.chat': ['rocket.chat'],
  matrix: ['matrixdotorg/synapse'],
  joplin: ['joplin/server'],
  ghost: ['ghost'],
};

const COMMON_PORTS: Record<string, number> = {
  http: 80,
  https: 443,
  postgres: 5432,
  mysql: 3306,
  mariadb: 3306,
  mongodb: 27017,
  redis: 6379,
  nginx: 80,
  traefik: 80,
  caddy: 80,
  plex: 32400,
  jellyfin: 8096,
  emby: 8096,
  transmission: 9091,
  qbittorrent: 8080,
  sonarr: 8989,
  radarr: 7878,
  lidarr: 8686,
  bazarr: 6767,
  prowlarr: 9696,
  jackett: 9117,
  grafana: 3000,
  prometheus: 9090,
  portainer: 9000,
  nextcloud: 80,
  'home assistant': 8123,
  'uptime-kuma': 3001,
  vaultwarden: 80,
  gitea: 3000,
  gitlab: 80,
  'code-server': 8443,
  pihole: 80,
  adguard: 3000,
};

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function detectAIService(service: ServiceInfo): boolean {
  const text = `${service.name} ${service.description}`.toLowerCase();

  if (AI_PATTERNS.exclude.some(pattern => pattern.test(text))) {
    return false;
  }

  return AI_PATTERNS.strong.some(pattern => pattern.test(text));
}

function selectTags(allTags: string[]): string[] {
  const unique = [...new Set(allTags)];

  const filtered =
    unique.includes('utility') && unique.length > 1 ? unique.filter(t => t !== 'utility') : unique;

  const ranked = filtered.sort((a, b) => {
    const rankA = TAG_SPECIFICITY[a] || 99;
    const rankB = TAG_SPECIFICITY[b] || 99;
    return rankA - rankB;
  });

  return ranked.slice(0, MAX_TAGS);
}

function mergeServices(existing: ServiceInfo, incoming: ServiceInfo, source: string): ServiceInfo {
  const allTags = [...existing.tags, ...incoming.tags];
  const allImages = [...existing.imagePatterns, ...incoming.imagePatterns];
  const allNames = [...existing.namePatterns, ...incoming.namePatterns];
  const allPorts = [...existing.ports, ...incoming.ports];

  return {
    name: existing.name,
    tags: selectTags(allTags),
    imagePatterns: [...new Set(allImages)],
    namePatterns: [...new Set(allNames)],
    ports: [...new Set(allPorts)],
    url: existing.url || incoming.url,
    description:
      existing.description.length > incoming.description.length
        ? existing.description
        : incoming.description,
    source: [...new Set([...(existing.source || []), source])],
  };
}

function httpsGet(url: string, customHeaders?: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'autoxpose-metadata-builder',
        ...customHeaders,
      },
    };

    https
      .get(
        url,
        opts,
        (res: NodeJS.ReadableStream & { statusCode?: number; headers: { location?: string } }) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
            if (res.headers.location) {
              const redirectUrl = res.headers.location.startsWith('http')
                ? res.headers.location
                : new URL(res.headers.location, url).toString();
              return httpsGet(redirectUrl).then(resolve).catch(reject);
            }
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }

          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => resolve(data));
        }
      )
      .on('error', reject);
  });
}

async function fetchAwesomeSelfhosted(): Promise<ServiceInfo[]> {
  console.log('Fetching awesome-selfhosted...');
  const markdown = await httpsGet(
    'https://raw.githubusercontent.com/awesome-selfhosted/awesome-selfhosted/master/README.md'
  );

  const services: ServiceInfo[] = [];
  const lines = markdown.split('\n');
  let currentCategory = '';

  for (const line of lines) {
    if (line.startsWith('### ')) {
      currentCategory = line.replace('### ', '').trim().toLowerCase();
      continue;
    }

    const match = line.match(/^- \[([^\]]+)\]\([^)]+\) - ([^([]+)/);
    if (!match) continue;

    const name = match[1].trim();
    const description = match[2].trim();
    const tag = CATEGORY_MAP[currentCategory] || 'utility';

    const nameLower = name.toLowerCase();
    const imagePatterns = COMMON_IMAGES[nameLower] || [
      `${nameLower.replace(/\s+/g, '')}/${nameLower.replace(/\s+/g, '')}`,
      `linuxserver/${nameLower.replace(/\s+/g, '-')}`,
    ];

    const namePatterns = [
      nameLower,
      nameLower.replace(/\s+/g, '-'),
      nameLower.replace(/\s+/g, ''),
      `ix-${nameLower.replace(/\s+/g, '-')}`,
    ];

    const ports = COMMON_PORTS[nameLower] ? [COMMON_PORTS[nameLower]] : [];

    services.push({
      name,
      tags: [tag],
      imagePatterns,
      namePatterns,
      ports,
      url: '',
      description,
      source: ['awesome-selfhosted'],
    });
  }

  console.log(`  Found ${services.length} services from awesome-selfhosted`);
  return services;
}

async function fetchTrueNASCatalog(): Promise<ServiceInfo[]> {
  console.log('Fetching TrueNAS catalog...');

  try {
    const html = await httpsGet('https://apps.truenas.com/catalog');
    const services: ServiceInfo[] = [];

    const catalogMatch = html.match(/"\/catalog\/[^"]*":\{[^}]*\}/g);
    if (!catalogMatch) {
      console.warn('  Could not find TrueNAS catalog data');
      return [];
    }

    for (const entry of catalogMatch) {
      const titleMatch = entry.match(/title:"([^"]+)"/);
      const urlMatch = entry.match(/"\/catalog\/([^\/"]+)\/"/);

      if (!titleMatch || !urlMatch) continue;

      const name = titleMatch[1];
      const slug = urlMatch[1];
      const description = `TrueNAS app: ${name}`;

      const nameLower = name.toLowerCase();
      const normalizedSlug = slug.replace(/-/g, '');

      // Infer category from name and description (TrueNAS doesn't provide topics or detailed metadata)
      const tags = inferCategoryFromTopics([], name + ' ' + description, name);

      services.push({
        name,
        tags,
        imagePatterns: [
          `${normalizedSlug}/${normalizedSlug}`,
          `linuxserver/${slug}`,
          `ghcr.io/${normalizedSlug}/${normalizedSlug}`,
          `${slug}/${slug}`,
        ],
        namePatterns: [nameLower, slug, normalizedSlug, `ix-${slug}`],
        ports: [],
        url: `https://apps.truenas.com/catalog/${slug}`,
        description,
        source: ['truenas'],
      });
    }

    console.log(`  Found ${services.length} services from TrueNAS`);
    return services;
  } catch (error) {
    console.warn('  Failed to fetch TrueNAS catalog:', error);
    return [];
  }
}

// Map GitHub topics to autoxpose categories
function inferCategoryFromTopics(
  topics: string[],
  description: string,
  name: string = ''
): CategoryTag[] {
  const lowerTopics = topics.map(t => t.toLowerCase());
  const lowerDesc = description.toLowerCase();
  const lowerName = name.toLowerCase();

  // AI/LLM detection (highest priority)
  if (
    lowerTopics.some(t =>
      t.match(/^(ai|llm|machine-learning|artificial-intelligence|ml|neural|gpt|llama)$/)
    ) ||
    lowerDesc.match(/\b(llm|large language model|ai model|machine learning|neural network)\b/)
  ) {
    return ['ai'];
  }

  // Monitoring (include "tracker", "observability")
  if (
    lowerTopics.some(t =>
      t.match(/^(monitoring|observability|metrics|logs|logging|prometheus|grafana)$/)
    ) ||
    lowerDesc.match(
      /\b(monitor|observability|metrics|log viewer|logging|port track|container track|prometheus|grafana)\b/
    ) ||
    lowerName.match(/tracker|monitor|observ|grafana|prometheus/)
  ) {
    return ['monitoring'];
  }

  // Media
  if (
    lowerTopics.some(t => t.match(/^(media|plex|jellyfin|video|streaming|movies|tv-shows)$/)) ||
    lowerDesc.match(/\b(media server|video streaming|movies|tv shows|plex|jellyfin)\b/)
  ) {
    return ['media'];
  }

  // Database
  if (lowerTopics.some(t => t.match(/^(database|db|sql|postgres|mysql|mongodb|redis)$/))) {
    return ['database'];
  }

  // Networking
  if (lowerTopics.some(t => t.match(/^(networking|vpn|proxy|dns|nginx|traefik|reverse-proxy)$/))) {
    return ['networking'];
  }

  // Security
  if (lowerTopics.some(t => t.match(/^(security|auth|authentication|authorization|sso|oauth)$/))) {
    return ['security'];
  }

  // Development
  if (
    lowerTopics.some(t => t.match(/^(development|dev-tools|ci-cd|git|github|gitlab|ide|docker)$/))
  ) {
    return ['development'];
  }

  // Automation
  if (lowerTopics.some(t => t.match(/^(automation|workflow|orchestration|scheduler)$/))) {
    return ['automation'];
  }

  // Communication
  if (lowerTopics.some(t => t.match(/^(chat|communication|messaging|email|matrix|xmpp)$/))) {
    return ['communication'];
  }

  // Productivity
  if (lowerTopics.some(t => t.match(/^(productivity|notes|wiki|knowledge-base|bookmarks)$/))) {
    return ['productivity'];
  }

  // Storage
  if (lowerTopics.some(t => t.match(/^(storage|backup|sync|cloud|s3|object-storage)$/))) {
    return ['storage'];
  }

  // Dashboard (application launchers, homepage, startpage)
  if (
    lowerTopics.some(t => t.match(/^(dashboard|homepage|startpage|launcher)$/)) ||
    lowerDesc.match(
      /\b(dashboard|homepage|application launcher|start page|organise.*applications)\b/
    ) ||
    lowerName.match(/heimdall|homer|homarr|dashy|flame|organizr/)
  ) {
    return ['dashboard'];
  }

  // Default to utility
  return ['utility'];
}

async function fetchGitHubTrending(): Promise<ServiceInfo[]> {
  console.log('Fetching GitHub trending repositories...');

  try {
    const queries = [
      'topic:self-hosted+stars:>1000&sort=stars&order=desc&per_page=100',
      'docker+container+stars:>5000&sort=stars&order=desc&per_page=100',
      'homelab+stars:>1000&sort=stars&order=desc&per_page=50',
    ];

    const services: ServiceInfo[] = [];
    const seenRepos = new Set<string>();

    for (const query of queries) {
      try {
        const json = await httpsGet(`https://api.github.com/search/repositories?q=${query}`, {
          'User-Agent': 'autoxpose',
        });
        const data = JSON.parse(json);

        for (const repo of data.items || []) {
          const repoFullName = repo.full_name.toLowerCase();
          if (seenRepos.has(repoFullName)) continue;
          seenRepos.add(repoFullName);

          const name = repo.name
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (l: string) => l.toUpperCase());
          const description = repo.description || '';
          const slug = repo.name.toLowerCase();
          const topics = repo.topics || [];

          // Infer category from GitHub topics and description
          const tags = inferCategoryFromTopics(topics, description, name);

          services.push({
            name,
            tags,
            imagePatterns: [`${repoFullName}`, `ghcr.io/${repoFullName}`, `${slug}/${slug}`],
            namePatterns: [slug, slug.replace(/-/g, ''), slug.replace(/-/g, '_')],
            ports: [],
            url: repo.html_url,
            description,
            source: ['github'],
            topics,
          });
        }
      } catch (error) {
        console.warn(`  Failed query: ${query}`);
      }
    }

    const specificServices = [
      'mostafa-wahied/portracker',
      'amir20/dozzle',
      'mudler/localai',
      'portainer/portainer',
    ];
    for (const repo of specificServices) {
      if (seenRepos.has(repo.toLowerCase())) continue;
      try {
        const json = await httpsGet(`https://api.github.com/repos/${repo}`, {
          'User-Agent': 'autoxpose',
        });
        const data = JSON.parse(json);
        const name = data.name.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
        const slug = data.name.toLowerCase();
        const topics = data.topics || [];
        const description = data.description || '';

        // Infer category from GitHub topics and description
        const tags = inferCategoryFromTopics(topics, description, name);

        services.push({
          name,
          tags,
          imagePatterns: [
            `${repo.toLowerCase()}`,
            `ghcr.io/${repo.toLowerCase()}`,
            `${slug}/${slug}`,
          ],
          namePatterns: [slug, slug.replace(/-/g, ''), slug.replace(/-/g, '_')],
          ports: [],
          url: data.html_url,
          description,
          source: ['github'],
          topics,
        });
        seenRepos.add(repo.toLowerCase());
      } catch (error) {
        console.warn(`  Could not fetch ${repo}`);
      }
    }

    console.log(`  Found ${services.length} unique services from GitHub`);
    return services;
  } catch (error) {
    console.warn('  Failed to fetch GitHub repositories:', error);
    return [];
  }
}

function applyManualOverrides(serviceMap: ServiceMap): void {
  console.log('Applying manual overrides...');

  for (const [key, override] of Object.entries(MANUAL_OVERRIDES)) {
    const normalized = normalizeName(key);
    const existing = serviceMap[normalized];

    if (existing) {
      serviceMap[normalized] = {
        ...existing,
        ...override,
        imagePatterns: override.imagePatterns || existing.imagePatterns,
        namePatterns: existing.namePatterns,
        ports: existing.ports,
        source: [...new Set([...(existing.source || []), 'manual-override'])],
      };
    } else {
      const nameLower = key.toLowerCase();
      serviceMap[normalized] = {
        name: override.name || key,
        tags: override.tags || ['utility'],
        imagePatterns: override.imagePatterns || [`${nameLower}/${nameLower}`],
        namePatterns: [nameLower, nameLower.replace(/\s+/g, '-'), nameLower.replace(/\s+/g, '')],
        ports: [],
        url: '',
        description: override.description || '',
        source: ['manual-override'],
      };
    }
  }
}

function applyAIDetection(serviceMap: ServiceMap): void {
  console.log('Applying AI detection...');
  let aiCount = 0;

  for (const service of Object.values(serviceMap)) {
    if (detectAIService(service)) {
      service.tags = selectTags([...service.tags, 'ai']);
      aiCount++;
    }
  }

  console.log(`  Detected ${aiCount} AI services`);
}

function deduplicateAndMerge(allServices: ServiceInfo[]): ServiceMap {
  console.log('Deduplicating and merging services...');
  const serviceMap: ServiceMap = {};

  for (const service of allServices) {
    const normalized = normalizeName(service.name);

    if (serviceMap[normalized]) {
      serviceMap[normalized] = mergeServices(
        serviceMap[normalized],
        service,
        service.source?.[0] || 'unknown'
      );
    } else {
      serviceMap[normalized] = service;
    }
  }

  console.log(`  Deduplicated to ${Object.keys(serviceMap).length} unique services`);
  return serviceMap;
}

async function main(): Promise<void> {
  console.log('=== Building Service Metadata ===\n');

  const allServices: ServiceInfo[] = [];

  allServices.push(...(await fetchAwesomeSelfhosted()));
  allServices.push(...(await fetchTrueNASCatalog()));
  allServices.push(...(await fetchGitHubTrending()));

  console.log(`\nTotal services collected: ${allServices.length}`);

  const serviceMap = deduplicateAndMerge(allServices);

  applyManualOverrides(serviceMap);
  applyAIDetection(serviceMap);

  const services = Object.values(serviceMap).map(service => {
    const finalService = { ...service };
    delete finalService.source;
    return finalService;
  });

  console.log('\nGenerating metadata...');
  const now = new Date();
  const metadata: Metadata = {
    version: now.toISOString().split('T')[0],
    lastUpdated: now.toISOString(),
    services,
  };

  const outputPath = path.join(__dirname, '../packages/backend/src/data/service-metadata.json');
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Writing to ${outputPath}...`);
  fs.writeFileSync(outputPath, JSON.stringify(metadata, null, 2));

  console.log('\n=== Done! ===');
  console.log(`Version: ${metadata.version}`);
  console.log(`Services: ${metadata.services.length}`);
  console.log(`File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);

  const aiServices = services.filter(s => s.tags.includes('ai'));
  console.log(`AI services: ${aiServices.length}`);
  console.log(
    `  Examples: ${aiServices
      .slice(0, 5)
      .map(s => s.name)
      .join(', ')}`
  );
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

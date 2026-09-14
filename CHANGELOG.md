# Changelog

All notable changes to autoxpose will be documented in this file.

## [0.5.2] - 2026-09-14

### Security

- **Safer Settings**: Block changes from untrusted websites and hide credentials in setup errors.

### Fixed

- **Service Controls**: Keep stopped services stopped after scans and restarts.
- **Setup**: Fix first-time setup and prevent invalid changes from replacing working settings.
- **Recovery**: Improve retries after failed DNS or proxy changes.
- **DNS Discovery**: Find records that were previously missed.

## [0.5.1] - 2026-09-11

### Fixed

- **Caddy Configuration**: Keep your existing Caddy settings and other sites unchanged when exposing a service.
- **Mobile Layout**: Give service cards more room on phones with a collapsible service list.

## [0.5.0] - 2026-09-10

### Added

- **DNS Providers**: Add support for Aliyun and Tencent Cloud DNSPod China.

### Changed

- **DNS Settings**: Check credentials before replacing working DNS settings.
- **DNS Status**: Recognize paused Aliyun and DNSPod records as inactive.

## [0.4.2] - 2026-07-17

### Security

- **Website Access**: Prevent other websites from reading your settings or provider credentials.
  - **[sub]** Set `CORS_ORIGIN` to allow specific origins if needed.

### Fixed

- **Docker Discovery**: Discover containers without extra Docker permission setup, while keeping the app running as a non-root user.
  - **[sub]** Manually adding `group_add` to your compose file is no longer required.

- **Startup Discovery**: Find containers that are already running when autoxpose starts.

## [0.4.1] - 2026-03-18

### Fixed

- **Wildcard Mode**: More reliable expose and settings behavior
  - **[sub]** No per-app DNS records are created in wildcard mode
  - **[sub]** Wildcard detection now prefers the active app domain in NPM
  - **[sub]** Settings reset and cleanup are safer

## [0.4.0] - 2026-02-04

### Added

- **Wildcard Mode**: Skip individual DNS record creation when using wildcard DNS and SSL certificates
  - **[sub]** Auto-detect `*.domain.com` certificates from NPM
  - **[sub]** DNS credentials no longer required when wildcard mode is active

- **Portracker Integration**: Expose data for portracker to display publicly accessible services
  - **[sub]** `/api/services?includeExternal=true` returns all exposed services including manually configured ones

---

## [0.3.0] - 2026-02-03

**Highlights**

- Service Tags - Auto-categorize services with GitHub topics inference
- DDNS Support - Dynamic IP hostname resolution for CNAME records
- Orphaned Resource Cleanup - Detect and remove stale DNS records and proxy hosts

---

### Added

- **Service Tags**: Auto-categorize services (web, database, media, etc.) with color-coded badges
  - **[sub]** GitHub topics inference for automatic tag assignment
  - **[sub]** Custom tags via inline editing

- **DDNS/CNAME Support**: Dynamic IP hostname resolution for users with changing public IPs

- **Orphaned Resource Cleanup**: Detect and clean up stale DNS records and proxy hosts

### Fixed

- **DNS Record Recreation**: Fixed recreation after external deletion
- **SSL Retry**: Update service state correctly after SSL retry success

---

## [0.2.0] - 2026-01-20

**Highlights**

- Network Topology Visualizer - Interactive network graph of services
- Service Renaming - Inline editing for service names

---

### Added

- **Network Topology Visualizer**: Interactive graph showing service connections and relationships

- **Service Renaming**: Inline editing to rename services from the dashboard

- **Keyboard Shortcuts**: Modal showing available shortcuts for power users

### Fixed

- **Subdomain Preservation**: Preserve user-edited subdomains during container rescan

---

## [0.1.0] - 2026-01-10

### Initial Release

- **Automatic Discovery**: Scan Docker containers for autoxpose labels
- **DNS Management**: Create and remove DNS records with propagation verification
- **SSL & Scheme Auto-Detection**: Automatic HTTPS detection and SSL certificate management
- **Auto-Expose Mode**: Automatically expose services with `autoxpose.enable=auto`
- **Supported Providers**: Cloudflare, Netlify, DigitalOcean, Porkbun (DNS); NPM, Caddy (Proxy)
- **Terminal UI**: Interactive terminal interface for configuration and management

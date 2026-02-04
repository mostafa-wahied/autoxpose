# Changelog

All notable changes to autoxpose will be documented in this file.

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

# AutoXpose

Automatic DNS and reverse proxy configuration for self-hosted apps.

## What it does

When you start a container with the right labels, AutoXpose:

1. Creates a DNS record pointing to your server
2. Configures your reverse proxy to route traffic to the container

## Quick Start

```yaml
services:
  autoxpose:
    image: autoxpose/autoxpose:latest
    ports:
      - '3000:3000'
    volumes:
      - ./data:/app/data
      - ./config.yaml:/app/config.yaml:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
```

## Container Labels

```yaml
services:
  myapp:
    image: myapp:latest
    labels:
      - autoxpose.enable=true
      - autoxpose.subdomain=myapp
```

### Label Reference

| Label                 | Values                  | Default        | Description                                       |
| --------------------- | ----------------------- | -------------- | ------------------------------------------------- |
| `autoxpose.enable`    | `true`, `auto`, `false` | -              | `true` = show in UI, `auto` = auto-expose on scan |
| `autoxpose.subdomain` | string                  | container name | Subdomain for the service                         |
| `autoxpose.port`      | number                  | auto-detected  | Override port detection                           |
| `autoxpose.scheme`    | `http`, `https`         | auto-detected  | Override scheme detection                         |
| `autoxpose.name`      | string                  | container name | Display name in UI                                |

### Minimal Setup

Only `autoxpose.enable=true` is required. Everything else is auto-detected.

### Auto-Expose

Use `autoxpose.enable=auto` to automatically expose services when discovered:

```yaml
labels:
  - autoxpose.enable=auto
  - autoxpose.subdomain=myapp
```

## Configuration

Copy `config.example.yaml` to `config.yaml` and edit:

```yaml
dns:
  provider: netlify # or cloudflare, digitalocean
  domain: yourdomain.com

proxy:
  provider: npm # or traefik, caddy
  url: http://npm:81
```

## Supported Providers

DNS: Netlify, Cloudflare, DigitalOcean

Proxy: Nginx Proxy Manager, Traefik, Caddy

## License

MIT

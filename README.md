<div align="center">
  <h1 style="font-size: 3em; margin-bottom: 0.1em;">AutoXpose</h1>
</div>

<p align="center">
  <strong>Automatic DNS and reverse proxy configuration for Docker containers.</strong>
</p>

<p align="center">
  <a href="https://github.com/mostafa-wahied/autoxpose/blob/main/LICENSE"><img src="https://img.shields.io/github/license/mostafa-wahied/autoxpose?style=flat-square" alt="License"></a>
  <a href="https://github.com/mostafa-wahied/autoxpose/releases"><img src="https://img.shields.io/github/v/release/mostafa-wahied/autoxpose?style=flat-square" alt="Latest Release"></a>
</p>

Add a label to your container, and AutoXpose creates the DNS record and configures your reverse proxy with SSL - no manual setup required.

---

## Key Features

- **Automatic Discovery**: Scans Docker containers for AutoXpose labels.
- **DNS Management**: Creates and removes DNS records automatically.
- **Proxy Configuration**: Configures your reverse proxy with SSL certificates.
- **Auto-Expose Mode**: Automatically expose services when discovered with `autoxpose.enable=auto`.
- **Lightweight**: Single container with embedded database. No external dependencies.

## Deployment

Create a `docker-compose.yml` file:

```yaml
services:
  autoxpose:
    image: autoxpose/autoxpose:latest
    ports:
      - '3000:3000'
    environment:
      - SERVER_IP=203.0.113.50 # Your public IP for DNS records
      - LAN_IP=192.168.1.100 # Your LAN IP for proxy targets
    volumes:
      - autoxpose-data:/app/packages/backend/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped

volumes:
  autoxpose-data:
```

Then run:

```sh
docker-compose up -d
```

Access the dashboard at `http://your-server:3000`

## Configuration

| Variable    | Description                    | Required |
| ----------- | ------------------------------ | -------- |
| `SERVER_IP` | Your public IP for DNS records | Yes      |
| `LAN_IP`    | Your LAN IP for proxy targets  | Yes      |

DNS and proxy providers are configured through the web UI.

**Supported DNS Providers:** Netlify, Cloudflare, DigitalOcean

**Supported Proxy Providers:** Nginx Proxy Manager, Traefik, Caddy

## Container Labels

Add labels to containers you want to expose:

```yaml
services:
  myapp:
    image: myapp:latest
    labels:
      - autoxpose.enable=true
```

| Label                 | Description                                         | Required |
| --------------------- | --------------------------------------------------- | -------- |
| `autoxpose.enable`    | `true` to show in UI, `auto` to auto-expose         | Yes      |
| `autoxpose.subdomain` | Subdomain for the service (default: container name) | No       |
| `autoxpose.port`      | Override auto-detected port                         | No       |
| `autoxpose.scheme`    | Override auto-detected scheme (`http`/`https`)      | No       |
| `autoxpose.name`      | Display name in UI (default: container name)        | No       |

## Roadmap

- [ ] Traefik and Caddy proxy provider implementations
- [ ] DigitalOcean DNS provider implementation
- [ ] Manual service entries (non-Docker)
- [ ] Health check monitoring

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

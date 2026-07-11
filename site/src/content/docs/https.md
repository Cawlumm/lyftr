---
title: HTTPS & Reverse Proxy
description: Put Lyftr behind Caddy or nginx with automatic HTTPS (Let's Encrypt) for a public, secure instance.
---

Lyftr's container serves plain HTTP on a host port. To expose it publicly — and to use the **mobile
app**, which needs a real hostname — put it behind a reverse proxy that terminates HTTPS.

:::caution[Port conflict]
By default the compose file publishes Lyftr on host port **80** (`PORT=80`). A reverse proxy also
wants 80/443, so first move Lyftr to a different host port — set `PORT=8080` in your `.env` — and
point the proxy at `localhost:8080`.
:::

## Caddy (easiest — automatic HTTPS)

[Caddy](https://caddyserver.com) fetches and renews Let's Encrypt certificates for you. A one-line
`Caddyfile`:

```caddyfile
lyftr.example.com {
    reverse_proxy localhost:8080
}
```

Then reload Caddy. That's it — HTTPS is live and auto-renewing.

## nginx + Certbot

```nginx
server {
    server_name lyftr.example.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then issue a certificate with [Certbot](https://certbot.eff.org):

```bash
sudo certbot --nginx -d lyftr.example.com
```

## Point Lyftr at your public origin

After the proxy is up, set `CORS_ORIGIN` to your HTTPS URL so browser and mobile clients are
allowed, and restart:

```bash
# in .env
CORS_ORIGIN=https://lyftr.example.com
```

```bash
docker compose up -d
```

See [Configuration](../configuration/) for the full list of variables, and the
[Mobile App](../mobile/) page for pointing the phone app at your new HTTPS server.

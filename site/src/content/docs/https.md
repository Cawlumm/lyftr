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

## LAN-only? Get a real certificate anyway (recommended)

If Lyftr never leaves your network, you can still have a genuine, publicly-trusted
certificate — no ports open to the internet. Use a domain you own, point a record at a
private address, and let Caddy prove ownership over DNS instead of HTTP:

```caddyfile
lyftr.home.example.com {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }
    reverse_proxy localhost:8080
}
```

This is the best option by a distance: every device trusts it out of the box, nothing is
exposed, and renewal is automatic. It needs a domain you control and a DNS provider with an
API — [Caddy's DNS provider modules](https://github.com/caddy-dns) cover most of them.

## Private CA / self-signed certificates

If you have no domain and must use your own CA, the mobile app can work with it, but there
are rules that trip people up:

- **Install the CA on the device**, not just the server. On Android: *Settings → Security →
  Encryption & credentials → Install a certificate → CA certificate*. On iOS: install the
  profile, then enable it under *Settings → General → About → Certificate Trust Settings*.
- **The certificate must carry a Subject Alternative Name.** A Common Name alone has not
  been accepted for years. If you connect by IP, the IP must be in the SAN as an
  `IP Address` entry — a `DNS` entry will not match.
- Use RSA ≥ 2048 or EC ≥ 256, SHA-256 or better, and TLS 1.2+.
- **Android app v0.3.0 or newer is required.** Earlier builds ignore the device's
  user-installed CA store entirely, so a private CA can never work on them — the app
  reports that it can't reach the server even though the server is fine.

:::caution[Plain HTTP on Android]
Android blocks unencrypted HTTP by default. Lyftr's Android app **v0.3.0+** permits it so
that `http://<lan-ip>:8080` works for a standard `docker compose` install. On older builds
plain HTTP fails no matter what the server does.
:::

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

---
name: share-caddy-cert
description: Temporarily share this machine's Caddy local CA root certificate with a new device on the LAN, so that device can trust HTTPS on potato.local:<port> addresses. Use when the user asks to "share/expose/send the caddy cert", "let my [phone/tablet/laptop/Chromebook] trust the local HTTPS", or "how do I get my new device onto potato.local".
whenToUse: A device does not yet trust Caddy's local CA and needs the root certificate to install as a trusted CA. Trigger phrases are "share the caddy cert", "trust the local HTTPS", and "get my device onto potato.local".
---

# Skill: share-caddy-cert

Temporarily share this machine's Caddy local CA root certificate with a new
device on the LAN, so that device can trust HTTPS on `potato.local:<port>`
addresses (see the Caddy setup in the personal bundle's `lang/README.md`, and
the `devtunnel` skill, for context — same CA, same trust model).

## When to use

The user asks to "share/expose/send the caddy cert," "let my [phone/tablet/
laptop/Chromebook] trust the local HTTPS," "how do I get my new device onto
potato.local," or similar — i.e. they have a device that doesn't yet trust
Caddy's local CA and needs to download the root cert to install as a
trusted CA.

## What it does

Runs `~/.local/bin/share-caddy-cert [port]` (default port `1350`):

- Copies the CA root cert (`~/.local/share/caddy/pki/authorities/local/root.crt`)
  into a fresh temp directory.
- Serves **only** that file over **plain HTTP** (deliberately not HTTPS — a
  device that doesn't trust the CA yet can't verify a cert signed by that
  same untrusted CA; plain HTTP for a one-time credential-bootstrap download
  is the standard pattern here) on the machine's LAN IP.
- Prints the exact URL to open on the new device.
- **Self-destructs after 30 minutes**: stops the server and deletes the temp
  copy automatically. Ctrl+C stops it (and cleans up) early. No manual
  cleanup needed either way.

It never touches sudo/firewalld — the default port is inside the same range
already opened for `devtunnel`.

## Workflow

1. Run `~/.local/bin/share-caddy-cert` (add a port argument if 1350 is busy
   — pick another port in the same already-open 1338-1360 range devtunnel
   uses, e.g. `share-caddy-cert 1355`).
2. **This blocks in the foreground for up to 30 minutes** — run it via a
   long-running/background shell tool, not a synchronous one, so you can
   keep talking to the user while it's up.
3. Relay the printed URL to the user.
4. Tell them: after downloading, install it as a **trusted root/CA
   certificate** (not a "server"/leaf cert) in the new device's settings —
   steps differ per platform:
   - **ChromeOS/Chromebook**: Settings → Security and privacy → Manage
     certificates → Authorities tab → Import.
   - **Android**: Settings → Security → Encryption & credentials → Install
     a certificate → CA certificate.
   - **iOS**: opening the URL prompts a "profile downloaded" banner —
     Settings → General → VPN & Device Management → install the profile,
     **then** Settings → General → About → Certificate Trust Settings →
     enable full trust for the new root.
5. It's safe to just let the server expire on its own — no follow-up needed.
   If they need it again later (e.g. after 30 minutes), just re-run it.

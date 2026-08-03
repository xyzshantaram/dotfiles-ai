# Skill: devtunnel

Run a local dev server and expose it over HTTPS on the LAN at
`https://potato.local:<port>/`, using `~/.local/bin/devtunnel`. Built on the
same Caddy + local-CA + mDNS setup documented in
`dotfiles-ai/OPENCODE_SETUP.md` (see also the `share-caddy-cert` skill, for
getting a *new* device to trust that CA in the first place).

The live script this skill drives is `~/.local/bin/devtunnel` (on `PATH`,
outside this repo). A tracked copy lives alongside this file at
`devtunnel` in this directory — if you change the live script's behavior,
copy the update back here too so the two don't drift.

## When to use

The user wants to run a dev server (Vite, Next.js, a plain HTTP server,
anything) and reach it from another device on the LAN — a phone, tablet,
Chromebook, or just wants a real HTTPS URL instead of `localhost`. Also use
this whenever the user asks to "toggle"/start/stop/restart/list a dev
tunnel or exposed server.

## Design constraints (read before improvising a workaround)

- **URLs are always `potato.local:<port>`, never `<name>.potato.local`.**
  avahi (mDNS) only auto-answers queries for its own literal hostname
  (`potato.local`), not arbitrary subdomains beneath it — publishing a new
  subdomain needs a root-owned `/etc/avahi/hosts` entry, which isn't
  rootless. `<name>` (first argument to `start`) is purely a local tracking
  label — state dir, Caddyfile markers, `devtunnel list` — it never appears
  in the actual URL. Don't invent `<name>.potato.local` URLs; they will not
  resolve.
- **The script never touches sudo/firewalld.** It only picks a port from a
  pre-opened range (`1338-1360/tcp`, opened once out-of-band). If it reports
  no free port, either stop an unused tunnel or widen the range (needs
  sudo — ask the user to run it, don't attempt it yourself):
  ```sh
  sudo firewall-cmd --permanent --add-port=<new-range>/tcp
  sudo firewall-cmd --reload
  ```
  then bump `PORT_RANGE_HI` in the script.
- **mDNS also needs the `mdns` firewalld service allowed**, separately from
  the port range above — that only covers Caddy's HTTPS ports, not the UDP
  5353 multicast traffic other devices use to resolve `potato.local` in the
  first place. If `potato.local` won't resolve from another device but a
  direct `https://<LAN-IP>:<port>/` works, this is almost always the gap:
  ```sh
  sudo firewall-cmd --permanent --add-service=mdns
  sudo firewall-cmd --reload
  ```
  If a direct LAN-IP connection *also* fails, that's not this script or
  Caddy/avahi/firewalld at all — it's a network-layer block (most often
  AP/client isolation on the router). That's not fixable from this
  machine's shell; the user needs to check their router's admin panel.
- **Most target dev servers need their own "allowed hosts" config for
  `potato.local`**, since the browser sends that as the `Host` header
  through the proxy and modern dev servers reject unrecognized hosts as
  DNS-rebinding protection. For Vite specifically, tile-studio already has
  a generic hook for this — set `VITE_ALLOWED_HOSTS=potato.local` as an env
  var on the command you pass to `devtunnel start` (don't hardcode
  `potato.local` into any project's committed `vite.config.ts` — use an env
  var so it stays a no-op for anyone else who clones the repo). Other
  frameworks have their own equivalent option; check if the target project
  already exposes one before adding new config.
- **HMR/live-reload may not follow through the proxy** (the dev server
  usually advertises its own internal port to the browser for the reload
  websocket). The app still loads and works; a manual refresh picks up
  edits if hot-reload doesn't fire.
- **Restarting Caddy (which every `start`/`stop`/`restart` does) briefly
  blips every other proxied service**, including `potato.local:1337`
  (opencode-web — this very chat, if you're running on this same session).
  It's fast (~100ms) and self-healing; not worth avoiding, just don't be
  alarmed by a momentary reconnect. Avoid firing off several `start`/`stop`/
  `restart` calls back-to-back against tunnels you don't own the lifecycle
  of — each one bounces Caddy and briefly drops every tunnel it's proxying,
  not just the one being touched.
- **`restart --all` restarts every tracked tunnel, including ones you
  didn't start this session.** Treat it like any other bulk restart of
  shared infrastructure — check `devtunnel list` first and confirm with the
  user before running it if there's any tunnel on the list you don't
  recognize as your own.

## Command reference

```
devtunnel start <name> <port> -- <command...>
    Run <command...> in the background, wait for it to bind 127.0.0.1:<port>,
    add a Caddy vhost, restart Caddy, print the HTTPS URL.

devtunnel stop <name>
devtunnel stop --all

devtunnel restart <name>
devtunnel restart --all
    Stop then start the tracked tunnel again with its original command and
    local port. Reuses the same external Caddy port too, so the URL doesn't
    change — unless that port got taken by something else in the meantime,
    in which case a fresh one is picked and printed.

devtunnel list
    name / running-or-dead / pid / local port / URL / log path.

devtunnel logs <name> [-f]

devtunnel -h | --help
```

## Workflow

1. Figure out what local port the user's dev server actually binds to (its
   own default, or one they specify).
2. `devtunnel start <name> <port> -- <the actual command>` — this **blocks
   until the server starts listening** (up to 30s) before printing the URL,
   so run it via a long-running/background shell tool if you're not sure
   the command will bind quickly, but a normal synchronous call is fine for
   most dev servers (it returns once bound, doesn't stay foregrounded).
3. Relay the printed `https://potato.local:<port>/` URL to the user.
4. If they hit the "no free port" case, or a "host not allowed" error from
   the underlying dev server, see the constraints above before improvising.
5. `devtunnel restart <name>` if the underlying process died, needs picking
   up changed env/config, or is just misbehaving — it keeps the same URL.
   `devtunnel stop <name>` when done for good, or leave it running —
   nothing expires on its own (unlike `share-caddy-cert`, which
   self-destructs after 30 min; devtunnel tunnels are meant to persist
   across a work session).

## Examples

```sh
devtunnel start tile-studio 5173 -- env VITE_ALLOWED_HOSTS=potato.local npx vite --host 0.0.0.0 --port 5173 --strictPort
devtunnel list
devtunnel logs tile-studio -f
devtunnel restart tile-studio
devtunnel stop tile-studio
```

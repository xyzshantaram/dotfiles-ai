# LAN web stack (dsh web behind Caddy TLS)

Serves `dsh web` from your phone over HTTPS on the LAN. The browser hits
`https://potato.local:1337`, Caddy terminates TLS on the LAN interface, and
the proxy forwards to `dsh web` bound to `127.0.0.1:3080` only. This mirrors
the opencode-web.service pattern in `dotfiles-ai/OPENCODE_SETUP.md`.

## Files

| File | Deploy to | Role |
|------|-----------|------|
| `dsh-web.service` | `~/.config/systemd/user/` | Runs `dsh web --host 127.0.0.1 --port 3080 --trusted-host potato.local:1337 --no-open` under `user-www.target` |
| `Caddyfile` | `~/.config/caddy/Caddyfile` | Global options plus the `potato.local:1337` vhost proxying to `127.0.0.1:3080` |
| this README | — | Setup and mDNS notes |

## Install

```sh
cp dsh-web.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now dsh-web.service
systemctl --user restart caddy.service   # after merging the Caddyfile
```

Check it:

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3080/          # expect 200
curl -sk -o /dev/null -w '%{http_code}\n' https://potato.local:1337/     # expect 200
```

Restart the whole stack with `systemctl --user restart user-www.target`.

## mDNS notes

Name resolution uses avahi's `potato.local`, not a dsh flag. Android resolves
`.local` with one-shot mDNS queries (RFC 6762 §5.1), which only avahi answers
reliably. `.local` does not resolve on Android over VPN or mobile data, and it
works only on the same wifi.

Allow the `mdns` firewalld service (`sudo firewall-cmd --permanent
--add-service=mdns && sudo firewall-cmd --reload`) or `potato.local` will not
resolve from other devices while direct LAN-IP access still works.

## Security flag

opencode-web enforced its own basic auth. dsh web ships no auth
(`dsh-host-webserver` README: "No TLS, auth, or origin policy"). Basic auth is
ENABLED in the Caddyfile (user decision). The shipped hash is for the
placeholder password `potato123`. Regenerate it for a real password before
exposing the stack to a shared LAN:

```sh
caddy hash-password          # paste the output over the $2a$... line in Caddyfile
systemctl --user restart caddy
```

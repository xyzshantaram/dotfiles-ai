---
name: caffeine
description: Toggle whether this Linux laptop is allowed to sleep/suspend. Use when the user says "caffeine", "keep the laptop awake", "don't let it sleep", "stay awake", "I'm heading out but keep working", or the reverse — "let it sleep now", "turn off caffeine", "go to bed" (as an instruction to release the lock so the machine can suspend). Primary-agent only; not available to subagents.
compatibility: linux, systemd
---

# caffeine

Holds or releases a `systemd-logind` inhibitor lock that blocks suspend and
idle-triggered suspend. Display blanking (DPMS/screensaver) is untouched —
that is handled by the desktop environment separately from logind, so the
screen still turns off on its own timeout even while caffeine is ON. This
avoids burn-in while still keeping the machine reachable (e.g. over SSH from
a phone or Chromebook).

State is a PID file under `$XDG_RUNTIME_DIR` (falls back to `/tmp`), so it is
automatically stale after a reboot — no cleanup needed.

## Usage

Run the bundled script with one of `on|off|status|toggle`:

```
~/.config/opencode/skills/caffeine/scripts/caffeine.sh on
~/.config/opencode/skills/caffeine/scripts/caffeine.sh off
~/.config/opencode/skills/caffeine/scripts/caffeine.sh status
```

- `on` — starts (or confirms) the inhibitor. Idempotent: running it again
  while already on just reports the existing lock, it does not stack locks.
- `off` — releases the inhibitor. The very next idle timeout or lid-close can
  now suspend the machine normally. This is the command for "I'm going to
  bed, let it sleep."
- `status` — reports ON/OFF plus the holder PID if ON.
- `toggle` — flips whichever state it is currently in, for a fast one-shot
  invocation when the user just says "caffeine" with no direction.

Always report the resulting state back to the user after running a command
(the script's own output line is enough — do not just say "done").

## Notes

- No `sudo` is required; this is a normal user-session D-Bus call to
  `systemd-logind`.
- Turning caffeine `off` does not force an immediate suspend — it only
  removes the block, so the machine sleeps on its normal idle timeout or lid
  action from that point on.
- If the user asks to check state without changing it ("is caffeine on?"),
  use `status` only.

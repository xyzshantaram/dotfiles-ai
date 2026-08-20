---
name: caffeine
description: Toggle whether this Linux laptop may sleep or suspend. Use when the user says "caffeine", "keep the laptop awake", "do not let it sleep", "stay awake", or the reverse ("let it sleep now", "turn off caffeine", "go to bed"). Primary agent only. Not available to subagents.
whenToUse: The user wants to hold or release the sleep inhibitor. Trigger phrases are "caffeine", "keep the laptop awake", "do not let it sleep", "let it sleep now", "turn off caffeine", and "go to bed".
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
scripts/caffeine.sh on
scripts/caffeine.sh off
scripts/caffeine.sh status
```

Resolve `scripts/caffeine.sh` against this skill's base directory.

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

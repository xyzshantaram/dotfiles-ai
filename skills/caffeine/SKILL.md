---
name: caffeine
description: Toggle whether this Linux laptop may sleep or suspend, and optionally blank the display until a keypress. Use when the user says "caffeine", "keep the laptop awake", "do not let it sleep", "stay awake", "turn the screen off", "blank the screen", or the reverse ("let it sleep now", "turn off caffeine", "go to bed"). Primary agent only. Not available to subagents.
whenToUse: The user wants to hold or release the sleep inhibitor, or blank the display while the inhibitor is held. Trigger phrases are "caffeine", "keep the laptop awake", "do not let it sleep", "let it sleep now", "turn off caffeine", "go to bed", "turn the screen off", and "blank the screen".
---

# caffeine

Holds or releases a `systemd-logind` inhibitor lock that blocks suspend and
idle-triggered suspend. It can also blank the display on demand via KWin's
DPMS control.

State is a PID file under `$XDG_RUNTIME_DIR` (falls back to `/tmp`), so it is
automatically stale after a reboot. No cleanup is needed.

## Usage

Run the bundled script with one of `on|off|status|toggle|blank`:

```
scripts/caffeine.sh on
scripts/caffeine.sh off
scripts/caffeine.sh status
scripts/caffeine.sh toggle
scripts/caffeine.sh blank
```

Resolve `scripts/caffeine.sh` against this skill's base directory.

- `on` — starts (or confirms) the inhibitor. Idempotent: running it again
  while already on just reports the existing lock. It does not stack locks.
- `off` — releases the inhibitor. It also turns the display back on if the
  display is currently blanked. The next idle timeout or lid close can now
  suspend the machine normally. This is the command for "I'm going to bed,
  let it sleep."
- `status` — reports the inhibitor state (ON/OFF, with the holder PID if ON)
  and the display DPMS state (ON/OFF/UNKNOWN).
- `toggle` — flips whichever state it is currently in, for a fast one-shot
  invocation when the user just says "caffeine" with no direction. If it
  turns the inhibitor off, it also restores the display, same as `off`.
- `blank` — turns off every connected display via DPMS. It refuses and
  exits with an error if the inhibitor is not held, since a screen
  deliberately left off should not also be at risk of idle-suspend. A
  keypress wakes the display again through KWin's own input handling. No
  script call is needed for that.

Always report the resulting state back to the user after running a command.
The script's own output line is enough. Do not just say "done".

## Blanking the display

Blanking is always paired with the inhibitor, not a standalone action.

- "Caffeine on, blank screen" or "keep it awake and turn the screen off":
  run `on`, then `blank`, in that order.
- "Turn the screen off" with no mention of caffeine: check `status` first.
  If caffeine is already ON, run `blank` directly. If it is OFF, ask the
  user to confirm turning caffeine on first. Do not turn it on silently.
- "Blank the screen" said again later, while caffeine is still ON from
  before: run `blank` directly. It does not need `on` to be repeated.
- Blanking always covers every connected display. There is no per-output
  selection.
- Blanking does not lock the session. A keypress restores the previous
  unlocked desktop directly, the same as if the screen had never blanked.

## Notes

- No `sudo` is required. The inhibitor lock is a normal user-session D-Bus
  call to `systemd-logind`. Blanking is a normal user-session call to
  `kscreen-doctor`, which talks to KWin over D-Bus.
- Turning caffeine `off` does not force an immediate suspend. It only
  removes the block, so the machine sleeps on its normal idle timeout or lid
  action from that point on. It also restores the display if `blank` had
  turned it off.
- `kscreen-doctor` needs `WAYLAND_DISPLAY`, `XDG_RUNTIME_DIR`, and
  `DBUS_SESSION_BUS_ADDRESS` set to reach the compositor. The script
  defaults these to this machine's single KDE Wayland session
  (`wayland-0`, uid 1000's runtime dir and bus) if the calling shell does
  not already export them.
- If the user asks to check state without changing it ("is caffeine on?",
  "is the screen blanked?"), use `status` only.
- When invoking this script via the `bash` tool, pass
  `sandbox_permissions: "danger-full-access"` with a one-line justification.
  The default `workspace-write` sandbox only allows writes under the session
  workspace, but this script writes its PID file to `$XDG_RUNTIME_DIR`
  (`/run/user/<uid>`, outside any workspace) and talks to the real user
  D-Bus session and KWin compositor, none of which `workspace-write` grants.
  Every subcommand (`on`, `off`, `blank`, `toggle`) needs this. `status` also
  needs it to read the real inhibitor PID and DPMS state, though a failed
  read there degrades to an "unknown" report rather than erroring.


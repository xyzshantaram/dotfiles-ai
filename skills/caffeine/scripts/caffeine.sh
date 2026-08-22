#!/usr/bin/env bash
# Toggle a systemd-logind sleep/idle inhibitor, and optionally blank the
# display via KWin/KScreen DPMS. The inhibitor blocks suspend and
# idle-triggered suspend only. Blanking is a separate, explicit action: it
# does not run automatically on `on`, and `blank` refuses to run unless the
# inhibitor is already held, so a screen deliberately left off is always
# paired with a live "stay awake" request, not a bare display blank that
# idle-suspend could still interrupt.
set -euo pipefail

# A caller (e.g. a sandboxed shell) may not inherit the session bus vars
# kscreen-doctor needs. Default to the values a single KDE Wayland session
# uses on this machine, so kscreen-doctor still finds the compositor.
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=$XDG_RUNTIME_DIR/bus}"
export WAYLAND_DISPLAY="${WAYLAND_DISPLAY:-wayland-0}"

STATE_DIR="${XDG_RUNTIME_DIR:-/tmp}"
PID_FILE="$STATE_DIR/caffeine.pid"
WHO="caffeine-skill"

# Returns true when a live caffeine inhibitor exists. Uses the PID file
# first, then falls back to matching the inhibitor command line. This
# covers a missing PID file or a stale PID inside it.
inhibitor_alive() {
    [[ -n "$(all_inhibitor_pids)" ]]
}

# Prints the PID stored in the PID file, but only when that process is
# still alive. Prints nothing when the file is missing or the PID is
# dead. Always returns success so `set -e` does not stop the script.
recorded_pid() {
    local pid
    if [[ -f "$PID_FILE" ]]; then
        pid="$(cat "$PID_FILE" 2>/dev/null || true)"
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
        fi
    fi
    return 0
}

# Prints the PID of every live caffeine inhibitor, one per line. This
# adds a command-line match for a lock that lost its PID file. The
# --who marker is unique to this skill. Matching it cannot reach an
# unrelated inhibitor lock.
all_inhibitor_pids() {
    recorded_pid
    pgrep -f "systemd-inhibit .*--who=$WHO" 2>/dev/null || true
}

# Prints one live caffeine inhibitor PID for display in `status`.
live_inhibitor_pid() {
    all_inhibitor_pids | head -n1
}

# Prints "on", "off", or "unknown" (no kscreen-doctor, or it returned
# nothing). Reports "off" if any output is off, since this script always
# toggles every output together.
dpms_state() {
    command -v kscreen-doctor >/dev/null 2>&1 || { echo "unknown"; return; }
    local out
    out="$(kscreen-doctor --dpms show 2>/dev/null)" || { echo "unknown"; return; }
    [[ -z "$out" ]] && { echo "unknown"; return; }
    if [[ "$out" == *": off"* ]]; then
        echo "off"
    else
        echo "on"
    fi
}

# Waits (up to ~1s) for a DPMS state change issued via kscreen-doctor to be
# reflected back by --dpms show. KWin applies the change asynchronously, so
# querying state immediately after issuing it can read a stale value.
wait_dpms_state() {
    local want="$1" tries=0
    while [[ "$(dpms_state)" != "$want" && $tries -lt 10 ]]; do
        sleep 0.1
        tries=$((tries + 1))
    done
}

status() {
    local caff_state disp_state
    if inhibitor_alive; then
        caff_state="ON (pid $(live_inhibitor_pid))"
    else
        caff_state="OFF"
    fi
    case "$(dpms_state)" in
        on) disp_state="ON" ;;
        off) disp_state="OFF" ;;
        *) disp_state="UNKNOWN" ;;
    esac
    echo "caffeine: $caff_state, display: $disp_state"
}

on() {
    if inhibitor_alive; then
        status
        return 0
    fi
    systemd-inhibit --what=sleep:idle --who="$WHO" \
        --why="Keeping system awake on user request" --mode=block \
        sleep infinity &
    # Record the PID at spawn. Write to a temp file and move it into
    # place so a failure never leaves a half-written PID file. If the
    # write still fails, `off` finds the lock by its command line.
    printf '%s\n' "$!" >"$PID_FILE.tmp" 2>/dev/null &&
        mv "$PID_FILE.tmp" "$PID_FILE" 2>/dev/null || true
    disown
    status
}

off() {
    # Restore the display first. This must not be skipped just because
    # inhibitor-PID cleanup below fails (e.g. a read-only runtime dir), or
    # "caffeine off" could silently leave the screen dark.
    if [[ "$(dpms_state)" == "off" ]]; then
        kscreen-doctor --dpms on
        wait_dpms_state "on"
    fi
    local pids
    pids="$(all_inhibitor_pids)"
    if [[ -n "$pids" ]]; then
        # shellcheck disable=SC2086 # one PID per argument is intended
        kill $pids 2>/dev/null || true
    fi
    rm -f "$PID_FILE" 2>/dev/null || true
    status
}

blank() {
    if ! inhibitor_alive; then
        echo "caffeine is OFF. Turn it on first: caffeine.sh on" >&2
        exit 1
    fi
    if ! command -v kscreen-doctor >/dev/null 2>&1; then
        echo "kscreen-doctor not found. Cannot blank the display." >&2
        exit 1
    fi
    kscreen-doctor --dpms off
    wait_dpms_state "off"
    status
}

case "${1:-}" in
on | start) on ;;
off | stop) off ;;
status) status ;;
toggle)
    if inhibitor_alive; then off; else on; fi
    ;;
blank) blank ;;
*)
    echo "usage: caffeine.sh {on|off|status|toggle|blank}" >&2
    exit 1
    ;;
esac

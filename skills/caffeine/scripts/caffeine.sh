#!/usr/bin/env bash
# Toggle a systemd-logind sleep/idle inhibitor. Blocks suspend and
# idle-triggered suspend only; display blanking (DPMS/screensaver) is
# untouched, since that is handled by the desktop environment, not logind.
set -euo pipefail

STATE_DIR="${XDG_RUNTIME_DIR:-/tmp}"
PID_FILE="$STATE_DIR/caffeine.pid"
WHO="caffeine-skill"

is_on() {
    [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

status() {
    if is_on; then
        echo "caffeine: ON (pid $(cat "$PID_FILE"))"
    else
        echo "caffeine: OFF"
    fi
}

on() {
    if is_on; then
        status
        return 0
    fi
    rm -f "$PID_FILE"
    systemd-inhibit --what=sleep:idle --who="$WHO" \
        --why="Keeping system awake on user request" --mode=block \
        sleep infinity &
    disown
    echo $! >"$PID_FILE"
    status
}

off() {
    if [[ -f "$PID_FILE" ]]; then
        kill "$(cat "$PID_FILE")" 2>/dev/null || true
        rm -f "$PID_FILE"
    fi
    status
}

case "${1:-}" in
on | start) on ;;
off | stop) off ;;
status) status ;;
toggle)
    if is_on; then off; else on; fi
    ;;
*)
    echo "usage: caffeine.sh {on|off|status|toggle}" >&2
    exit 1
    ;;
esac

#!/usr/bin/env bash
# Push the local aidos repository, then pin sync.sh to its new HEAD.
#
# The pin must name a commit that exists on the remote, because pnpm fetches
# the plugin straight from GitHub. Pushing first is part of the operation, not
# a convenience: a pin to an unpushed commit fails at install time, on another
# machine, long after the mistake.
#
# Override the repository path with AIDOS_REPO.
set -euo pipefail

REPO="${AIDOS_REPO:-$HOME/repos/aidos}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SYNC="$HERE/sync.sh"

if [ ! -d "$REPO/.git" ]; then
	echo "pin-aidos: no git repository at $REPO" >&2
	echo "pin-aidos: set AIDOS_REPO to override the path" >&2
	exit 1
fi

if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
	echo "pin-aidos: WARNING: $REPO has uncommitted changes." >&2
	echo "pin-aidos: WARNING: those changes are NOT in the pin." >&2
fi

git -C "$REPO" push

head="$(git -C "$REPO" rev-parse HEAD)"
if [[ ! "$head" =~ ^[0-9a-f]{40}$ ]]; then
	echo "pin-aidos: rev-parse did not return a 40 character commit: $head" >&2
	exit 1
fi

# One expression reads the current pin and, later, proves the rewrite landed.
read_pin() {
	sed -n 's/.*aidos#\([0-9a-f]\{40\}\).*/\1/p' "$SYNC" | head -1
}

old="$(read_pin)"
if [ -z "$old" ]; then
	echo "pin-aidos: no aidos pin found in $SYNC" >&2
	exit 1
fi

if [ "$old" = "$head" ]; then
	echo "pin-aidos: already pinned to $head"
	exit 0
fi

sed -i "s/aidos#$old/aidos#$head/" "$SYNC"

new="$(read_pin)"
if [ "$new" != "$head" ]; then
	echo "pin-aidos: rewrite failed, $SYNC still reads $new" >&2
	exit 1
fi

echo "pin-aidos: $old -> $head"
echo "pin-aidos: sync.sh is edited but NOT committed."

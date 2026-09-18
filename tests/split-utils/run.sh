#!/usr/bin/env bash
# Diff the TS render output against frozen fixtures.
#
# The tests/split-utils/expected/ tree is frozen ground truth from the
# retired Python reference. This runner never writes to it. It renders
# tests/split-utils/actual/ with the skill's scripts/render-fixtures.ts
# and diffs the two trees.
#
# Usage: bash tests/split-utils/run.sh
# Exit 0 means all files match. Exit 1 means a file differs.

set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../../skills/split-utils"

FIXTURE="$HERE/fixtures/orders.json"
EXPECTED="$HERE/expected"
ACTUAL="$HERE/actual"

echo "== rendering with TS port"
(cd "$ROOT" && deno run --no-lock --allow-read --allow-write scripts/render-fixtures.ts \
  "$FIXTURE" "$ACTUAL")

echo "== diffing"
status=0
diff -ru "$EXPECTED" "$ACTUAL" || status=1
if [[ $status -eq 0 ]]; then
  echo "ALL MATCH"
else
  echo "MISMATCH — see diff above"
fi
exit $status

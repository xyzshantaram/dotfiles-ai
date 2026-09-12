#!/bin/sh
# Thin installer for wizardkit apps. Ensures Deno, then runs the real
# installer from JSR. Use it per app like this:
#   curl -fsSL https://example.com/my-wizard/install.sh | sh -s -- \
#     --app my-wizard --version 0.1.0 --base https://example.com/my-wizard
set -e
if ! command -v deno >/dev/null 2>&1; then
  curl -fsSL https://deno.land/install.sh | sh
  export PATH="$HOME/.deno/bin:$PATH"
fi
exec deno run --no-lock -A jsr:@sid/wizardkit/install "$@"

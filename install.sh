#!/usr/bin/env sh
# Install split-utils on macOS or Linux, then open the main menu.
# Usage: curl -fsSL https://raw.githubusercontent.com/YOURUSER/split-utils/main/install.sh | sh
# Before you publish, replace YOURUSER with the real GitHub name.
set -eu

# Point SPLIT_UTILS_REPO at a fork to install from another source.
REPO_URL="${SPLIT_UTILS_REPO:-https://github.com/YOURUSER/split-utils.git}"
# Point SPLIT_UTILS_DIR at another path to install somewhere else.
DEST_DIR="${SPLIT_UTILS_DIR:-$HOME/split-utils}"
# Point DENO_INSTALL at another path to cache Deno somewhere else.
DENO_INSTALL="${DENO_INSTALL:-$HOME/.deno}"

# Fail with a plain message when a tool misses.
need_tool() {
  # Check that the named tool runs.
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "split-utils needs $1 but cannot find it. Install $1 and run again." >&2
    exit 1
  fi
}

# curl fetches the installer and the repo archive.
need_tool curl

# Add Deno to PATH when it lives in the cache dir only.
if [ -x "$DENO_INSTALL/bin/deno" ]; then
  PATH="$DENO_INSTALL/bin:$PATH"
  export PATH
fi

# Install Deno into the cache dir when no copy exists.
if ! command -v deno >/dev/null 2>&1; then
  echo "Deno is missing. Installing it into $DENO_INSTALL."
  # The official installer writes to DENO_INSTALL and uses no sudo.
  curl -fsSL https://deno.land/install.sh | sh
  PATH="$DENO_INSTALL/bin:$PATH"
  export PATH
fi

# Show the Deno version so failures stay easy to report.
deno --version

# Refresh the repo when the target dir already holds a clone.
if [ -d "$DEST_DIR/.git" ]; then
  echo "Found an install at $DEST_DIR. Pulling the latest copy."
  git -C "$DEST_DIR" pull --ff-only
# Clone fresh when git exists and the target dir misses.
elif command -v git >/dev/null 2>&1; then
  echo "Cloning split-utils into $DEST_DIR."
  git clone "$REPO_URL" "$DEST_DIR"
# Fall back to a zip download when git misses.
else
  echo "Git is missing. Downloading split-utils into $DEST_DIR."
  # Build the archive URL from the repo URL by dropping .git.
  base="$(echo "$REPO_URL" | sed 's/\.git$//')"
  mkdir -p "$DEST_DIR"
  curl -fsSL "$base/archive/refs/heads/main.zip" -o "$DEST_DIR/repo.zip"
  need_tool unzip
  unzip -q -o "$DEST_DIR/repo.zip" -d "$DEST_DIR/tmp-unpack"
  cp -r "$DEST_DIR/tmp-unpack/"*/. "$DEST_DIR/"
  rm -rf "$DEST_DIR/tmp-unpack" "$DEST_DIR/repo.zip"
fi

# Run the main menu from the repo dir.
echo "Starting split-utils."
cd "$DEST_DIR"
exec deno task menu

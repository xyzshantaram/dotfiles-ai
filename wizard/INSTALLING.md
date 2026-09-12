# Installing wizards: scripts as apps

One app per script. The user installs Deno once (or the installer does it); every app after that is
one command. No fat binary per app.

## The one-line install

```sh
curl -fsSL https://example.com/my-wizard/install.sh | sh -s -- \
  --app my-wizard --version 0.1.0
```

The thin shell ensures Deno, then runs the wizardkit installer from JSR, which does three things:
`deno install -g` for the executable, fetch of the shared runtime binary (once per machine), and a
launcher shortcut pointed at `wizardkit-runtime --title "App" -- <wrapper>`. Reinstall the same line
to update. Try before installing with `deno x jsr:@<scope>/<app>/cli` where the app exposes one.

## Linux shortcut

The installer writes `<app>.desktop` with `Exec=` aimed at the runtime plus wrapper, and drops it in
`~/.local/share/applications`. Icons come from `assets/icon.png` in the app repo by convention.

## Build the binary

```sh
deno task compile
```

This runs `deno desktop --output` using the `desktop` block and writes a Linux `.desktop` shortcut
next to the binary. Output per platform:

| Platform | `--output` value            | Result                |
| -------- | --------------------------- | --------------------- |
| Linux    | `./dist/my-wizard`          | App dir with launcher |
| Linux    | `./dist/my-wizard.AppImage` | Single-file bundle    |
| Linux    | `./dist/my-wizard.deb`      | Debian/Ubuntu package |
| macOS    | `./dist/MyWizard.app`       | App bundle            |
| macOS    | `./dist/MyWizard.dmg`       | Disk image            |
| Windows  | `./dist/MyWizard.msi`       | Installer package     |

Set `desktop.app.identifier` to a real reverse-DNS id before release builds. macOS needs it for a
stable code identity.

## Linux shortcut

`compile.ts` writes `<Name>.desktop` pointing `Exec=` at the built binary. Install it for one user
with:

```sh
cp "My Wizard.desktop" ~/.local/share/applications/
```

## One-line installer (Linux and macOS)

Serve versioned binaries from a release page. The installer downloads the right one, drops the
shortcut, and exits. Template:

```sh
#!/bin/sh
# curl -fsSL https://example.com/my-wizard/install.sh | sh
set -e
VERSION="${VERSION:-0.1.0}"
OS="$(uname -s)"
case "$OS" in
  Linux) BIN="my-wizard-linux" ;;
  Darwin) BIN="my-wizard-macos" ;;
  *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac
DEST="${HOME}/.local/bin"
mkdir -p "$DEST"
curl -fsSL "https://example.com/my-wizard/${VERSION}/${BIN}" -o "${DEST}/my-wizard"
chmod +x "${DEST}/my-wizard"
echo "Installed my-wizard ${VERSION} to ${DEST}/my-wizard."
```

Keep it boring: fixed URLs, checksum file next to the binary when the audience needs it, no prompts,
no sudo.

## One-line installer (Windows)

```powershell
# irm https://example.com/my-wizard/install.ps1 | iex
$Version = $env:VERSION
if (-not $Version) { $Version = "0.1.0" }
$Dest = "$env:LOCALAPPDATA\my-wizard"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Invoke-WebRequest "https://example.com/my-wizard/$Version/my-wizard-windows.exe" -OutFile "$Dest\my-wizard.exe"
Write-Host "Installed my-wizard $Version to $Dest\my-wizard.exe."
```

## Checklist before release

- Real `identifier` and display name in the `desktop` block.
- Version bumped in `deno.json`.
- Binary launches with no console next to it.
- Shortcut starts the app from the launcher.
- Install script tested on a clean machine.

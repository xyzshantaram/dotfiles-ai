# Install split-utils on Windows, then open the main menu.
# Usage: irm https://raw.githubusercontent.com/YOURUSER/split-utils/main/install.ps1 | iex
# Before you publish, replace YOURUSER with the real GitHub name.
$ErrorActionPreference = 'Stop'

# Set SPLIT_UTILS_REPO to install from another source.
if ($env:SPLIT_UTILS_REPO) { $RepoUrl = $env:SPLIT_UTILS_REPO }
else { $RepoUrl = 'https://github.com/YOURUSER/split-utils.git' }
# Set SPLIT_UTILS_DIR to install to another path.
if ($env:SPLIT_UTILS_DIR) { $DestDir = $env:SPLIT_UTILS_DIR }
else { $DestDir = Join-Path $HOME 'split-utils' }
# Set DENO_INSTALL to cache Deno at another path.
if (-not $env:DENO_INSTALL) { $env:DENO_INSTALL = Join-Path $HOME '.deno' }

# Add the cached Deno to PATH for this session only.
$DenoBin = Join-Path $env:DENO_INSTALL 'bin'
if ($env:Path -notlike "*$DenoBin*") { $env:Path = "$DenoBin;$env:Path" }

# Install Deno into the cache dir when no copy exists.
if (-not (Get-Command deno -ErrorAction SilentlyContinue)) {
  Write-Host "Deno is missing. Installing it into $($env:DENO_INSTALL)."
  # The official installer writes to DENO_INSTALL and uses no admin rights.
  & { irm https://deno.land/install.ps1 | iex }
  if ($env:Path -notlike "*$DenoBin*") { $env:Path = "$DenoBin;$env:Path" }
}

# Show the Deno version so failures stay easy to report.
deno --version

# Refresh the repo when the target dir already holds a clone.
if (Test-Path (Join-Path $DestDir '.git')) {
  Write-Host "Found an install at $DestDir. Pulling the latest copy."
  git -C $DestDir pull --ff-only
}
# Clone fresh when git exists and the target dir misses.
elseif (Get-Command git -ErrorAction SilentlyContinue) {
  Write-Host "Cloning split-utils into $DestDir."
  git clone $RepoUrl $DestDir
}
# Fall back to a zip download when git misses.
else {
  Write-Host "Git is missing. Downloading split-utils into $DestDir."
  # Build the archive URL from the repo URL by dropping .git.
  $Base = $RepoUrl -replace '\.git$', ''
  $Zip = Join-Path $DestDir 'repo.zip'
  New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
  Invoke-WebRequest "$Base/archive/refs/heads/main.zip" -OutFile $Zip
  $Tmp = Join-Path $DestDir 'tmp-unpack'
  Expand-Archive $Zip -DestinationPath $Tmp -Force
  $Inner = Get-ChildItem $Tmp | Select-Object -First 1
  Copy-Item (Join-Path $Inner.FullName '*') $DestDir -Recurse -Force
  Remove-Item $Tmp, $Zip -Recurse -Force
}

# Start the browser app from the repo dir.
Write-Host 'Starting split-utils. Open the address it prints in a browser.'
Set-Location $DestDir
deno task start

#!/bin/sh
# Re-mirror vendored browser deps at pinned versions.
# Run it with: ./update.sh 3.11.0 1.2.0
# Mirrors Web Awesome dist plus shoelace-style animations dist plus
# htmx at its pinned version.
set -e
HTMX_VERSION="2.0.4"
WA_VERSION="${1:?Pass a Web Awesome version like 3.11.0}"
ANIM_VERSION="${2:?Pass an animations version like 1.2.0}"
OUT="$(dirname "$0")"
python3 - "$WA_VERSION" "$ANIM_VERSION" "$OUT" <<'EOF'
import json, sys, urllib.request, os
wa_version, anim_version, out = sys.argv[1], sys.argv[2], sys.argv[3]


def mirror(pkg, version, prefixes, dest):
    base = f"https://cdn.jsdelivr.net/npm/{pkg}@{version}"
    flat = f"https://data.jsdelivr.com/v1/packages/npm/{pkg}@{version}?structure=flat"
    data = json.load(urllib.request.urlopen(flat))
    for f in data["files"]:
        n = f["name"]
        if not (n.startswith(prefixes) or n in ("/dist/webawesome.loader.js",)):
            continue
        if not n.endswith((".js", ".css")):
            continue
        target = dest + n[len("/dist"):]
        os.makedirs(os.path.dirname(target), exist_ok=True)
        urllib.request.urlretrieve(base + n, target)


mirror("@awesome.me/webawesome", wa_version,
       ("/dist/components/", "/dist/styles/", "/dist/utilities/", "/dist/chunks/"),
       out + "/webawesome")
mirror("@shoelace-style/animations", anim_version, ("/dist/",), out + "/shoelace-style")
os.makedirs(out + "/htmx", exist_ok=True)
urllib.request.urlretrieve(
    f"https://cdn.jsdelivr.net/npm/htmx.org@{HTMX_VERSION}/dist/htmx.min.js",
    out + "/htmx/htmx.min.js")
for spec, dest in [
    ("lit@3.2.1", "lit"),
    ("@lit/context@1.1.6", "lit-context"),
    ("@lit/reactive-element@2.0.4", "lit-reactive-element"),
    ("lit-html@3.2.0", "lit-html"),
    ("lit-element@4.1.0", "lit-element"),
    ("@floating-ui/dom@1.6.13", "floating-ui-dom"),
    ("@floating-ui/core@1.8.0", "floating-ui-core"),
    ("@floating-ui/utils@0.2.12", "floating-ui-utils"),
    ("@ctrl/tinycolor@4.1.0", "tinycolor"),
    ("@shoelace-style/localize@3.2.3", "shoelace-localize"),
    ("composed-offset-position@0.0.6", "composed-offset-position"),
    ("nanoid@5.1.5", "nanoid"),
]:
    name, version = spec.rsplit("@", 1)
    base = f"https://cdn.jsdelivr.net/npm/{name}@{version}"
    flat = f"https://data.jsdelivr.com/v1/packages/npm/{name}@{version}?structure=flat"
    data = json.load(urllib.request.urlopen(flat))
    for f in data["files"]:
        n = f["name"]
        if not n.endswith(".js"):
            continue
        if "/node_modules/" in n or n.startswith(("/test", "/tests", "/demo")):
            continue
        target = out + "/" + dest + n
        os.makedirs(os.path.dirname(target), exist_ok=True)
        urllib.request.urlretrieve(base + n, target)
print("mirrored", wa_version, anim_version)
EOF
# DevTools source maps are dev-only weight: drop the references so
# browsers never request .map files we do not vendor.
find "$OUT" -name '*.js' -exec sed -i '/sourceMappingURL/d' {} +

#!/usr/bin/env python3
"""Declare the fixed MCP server roster into dsh-mcp-manager.

The script tries the HTTP API first, because a running plugin host owns the
state file and rewrites it from memory. A direct file edit while the host
runs gets reverted. When the API does not answer, the script edits the
state file directly as a fallback. The user must restart dsh web after a
fallback write.

The script upserts by name. It never edits a record it did not create, so
OAuth client ids and tokens survive every run.

The fallback is deliberately narrow. Only a refused connection proves that no
live host owns the state file. Any HTTP reply, even 403 from the remote-access
guard, means a server is listening, and the script then refuses to write and
says so instead.

Usage: python3 sync-mcp.py [--state PATH]
  --state PATH  offline state file path. Default: ~/.dsh/mcp-manager.json.
"""

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

API_TIMEOUT_SECONDS = 5

# --- Roster. A human edits this list. Each name becomes the mcp__<name>__
# --- tool prefix, so names are fixed.
ROSTER = [
    {
        "name": "swiggy-food",
        "type": "http",
        "url": "https://mcp.swiggy.com/food",
        "authMode": "oauth",
    },
    {
        "name": "swiggy-instamart",
        "type": "http",
        "url": "https://mcp.swiggy.com/im",
        "authMode": "oauth",
    },
    {
        "name": "zepto",
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://mcp.zepto.co.in/mcp"],
    },
    {
        "name": "blinkit",
        "type": "stdio",
        "command": "node",
        "args": [os.path.join(os.path.expanduser("~"), "installs", "blinkit-mcp", "dist", "index.js")],
    },
]

# Fields this script manages per transport type. The offline path updates
# only these keys on an existing record. It keeps every other key, such as
# id, oauth, and enabled, exactly as it was.
MANAGED_FIELDS = {
    "http": ["type", "url", "authMode", "headers", "headerEnv", "tokenEnv"],
    "stdio": ["type", "command", "args", "env", "cwd"],
}


def log(message):
    """Print one progress line, indented under the sync.sh step heading."""
    print("  " + message)


def api_base():
    """Return the HTTP API base URL, with an environment override."""
    return os.environ.get("DSH_WEB_ORIGIN", "http://127.0.0.1:3080").rstrip("/")


def new_id():
    """Return a server id: base64url of 8 random bytes, padding stripped."""
    return base64.urlsafe_b64encode(os.urandom(8)).decode().rstrip("=")


def build_record(entry):
    """Build a full state-file record for a roster entry."""
    record = {"id": new_id(), "name": entry["name"], "enabled": True}
    record.update({key: entry[key] for key in MANAGED_FIELDS[entry["type"]] if key in entry})
    return record


def build_post_body(entry):
    """Build a POST body for one roster entry."""
    body = {"name": entry["name"]}
    body.update({key: entry[key] for key in MANAGED_FIELDS[entry["type"]] if key in entry})
    return body


class HostDown(Exception):
    """Nothing answered on the API port, so no live host owns the state file."""


def fetch_existing(base):
    """Return a name to server-view map from the API.

    Raise HostDown only when nothing answered at all. Any HTTP reply, even an
    error page, proves a server is listening. The script must not edit the
    state file in that case, because a live plugin host rewrites the whole file
    from memory on its next save and would drop the edit.
    """
    try:
        response = urllib.request.urlopen(base + "/mcp-manager/api/servers", timeout=API_TIMEOUT_SECONDS)
    except urllib.error.HTTPError:
        raise
    except (urllib.error.URLError, OSError) as error:
        raise HostDown(error)
    with response:
        if response.status != 200:
            raise urllib.error.URLError("unexpected status %d" % response.status)
        data = json.load(response)
    return {server["name"]: server for server in data.get("servers", [])}


def post_server(base, entry):
    """Create one server over the API. Return True when it is present."""
    body = json.dumps(build_post_body(entry)).encode()
    request = urllib.request.Request(
        base + "/mcp-manager/api/servers",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=API_TIMEOUT_SECONDS) as response:
            if response.status == 201:
                return True
            raise urllib.error.URLError("unexpected status %d" % response.status)
    except urllib.error.HTTPError as error:
        if error.code == 409:
            return True
        raise


def put_server(base, server_id, entry):
    """Update one existing server over the API.

    The edit handler rebuilds the record from the body, so the body must carry
    every managed field. It keeps OAuth state for an http server that stays on
    the same issuer, and a stdio server holds no OAuth state to lose.
    """
    body = json.dumps(build_post_body(entry)).encode()
    request = urllib.request.Request(
        base + "/mcp-manager/api/servers/" + server_id,
        data=body,
        headers={"Content-Type": "application/json"},
        method="PUT",
    )
    with urllib.request.urlopen(request, timeout=API_TIMEOUT_SECONDS) as response:
        if response.status != 200:
            raise urllib.error.URLError("unexpected status %d" % response.status)


def drift(entry, view):
    """Return the managed field names whose live value differs from the roster.

    It compares only the fields the roster declares. A field the script does
    not manage never counts as drift.
    """
    if view.get("type") != entry["type"]:
        return ["type"]
    changed = []
    for key in MANAGED_FIELDS[entry["type"]]:
        if key == "type" or key not in entry:
            continue
        if view.get(key) != entry[key]:
            changed.append(key)
    return changed


def run_online(base, existing):
    """Declare the roster over the HTTP API. Return an exit code.

    The host answered the list request, so it owns the state file. Any failure
    from here on is a real error, not a reason to fall back. A state file write
    behind a live host is reverted on the host's next save.
    """
    for entry in ROSTER:
        name = entry["name"]
        view = existing.get(name)
        if view is None:
            post_server(base, entry)
            log("%s: added" % name)
            continue
        changed = drift(entry, view)
        if not changed:
            log("%s: already correct" % name)
            continue
        put_server(base, view["id"], entry)
        log("%s: updated (%s)" % (name, ", ".join(changed)))
    return 0


def run_offline(state_path):
    """Declare the roster by editing the state file. Return an exit code."""
    if os.path.exists(state_path):
        with open(state_path, "r", encoding="utf-8") as handle:
            try:
                state = json.load(handle)
            except json.JSONDecodeError:
                state = {}
    else:
        state = {}
    if not isinstance(state, dict):
        state = {}
    servers = state.get("servers")
    if not isinstance(servers, list):
        servers = []

    by_name = {}
    for index, server in enumerate(servers):
        if isinstance(server, dict) and isinstance(server.get("name"), str):
            by_name[server["name"]] = index

    for entry in ROSTER:
        name = entry["name"]
        managed = {key: entry[key] for key in MANAGED_FIELDS[entry["type"]] if key in entry}
        if name in by_name:
            servers[by_name[name]].update(managed)
            log("%s: updated in state file" % name)
        else:
            servers.append(build_record(entry))
            log("%s: added to state file" % name)

    state["servers"] = servers
    parent = os.path.dirname(state_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(state_path, "w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2)
    log("WARNING: the plugin host did not answer. Restart dsh web to load this change.")
    return 0


def main():
    parser = argparse.ArgumentParser(description="Declare MCP servers into dsh-mcp-manager.")
    parser.add_argument(
        "--state",
        default=os.path.join(os.path.expanduser("~"), ".dsh", "mcp-manager.json"),
        help="offline state file path. Default: ~/.dsh/mcp-manager.json",
    )
    args = parser.parse_args()
    base = api_base()
    try:
        existing = fetch_existing(base)
    except HostDown as error:
        log("nothing is listening on %s (%s). Using the state file." % (base, error))
        return run_offline(args.state)
    except Exception as error:
        log("WARNING: %s answered, but the roster API did not: %s" % (base, error))
        log("         The state file was NOT touched. A live plugin host owns it and")
        log("         would revert the write on its next save.")
        log("         Declare the servers in Settings -> MCP, or stop dsh web and")
        log("         run this script again.")
        return 0
    try:
        return run_online(base, existing)
    except Exception as error:
        log("ERROR: the plugin host rejected a server declaration: %s" % error)
        log("       Nothing was written to the state file, because the host owns it.")
        return 1


if __name__ == "__main__":
    sys.exit(main())

---
name: podman
description: Manage Podman and Docker containers, images, networks, and volumes through the podman MCP server. Use when the user asks to run, stop, remove, inspect, or view the logs of a container, or to list, pull, or build an image. Gates the podman MCP tools behind this skill.
whenToUse: The podman CLI itself is not available from a bash call in this sandbox. When the user asks to run, list, inspect, stop, remove, or otherwise manage a container or an image, load this skill and use the mcp__podman__* tools instead of a podman or docker shell command.
tools-gated:
  - mcp__podman__*
---

# podman

The `mcp__podman__*` tools reach a real Podman (or Docker) daemon through the
`manusa/podman-mcp-server` MCP server. They stay hidden until this skill
loads.

## The constraint that shapes everything

**The podman CLI is not usable from a bash call in this sandbox.** A guard
rule blocks or restricts direct `podman` invocations, and the sandbox's own
filesystem and process isolation does not line up with what podman needs to
talk to the daemon. Do not try `podman ...` in bash and do not suggest the
user run it there. Load this skill and use the MCP tools instead: they talk
to the daemon through its own API, not through a shell invocation, so they
work where the bare CLI does not.

## Tool inventory (13 tools, four resource types)

**Containers**

- `container_list` — running containers, or every container with the
  right flag.
- `container_inspect(name)` — low-level configuration and state for one
  container.
- `container_logs(name)` — that container's logs.
- `container_run(image, ...)` — start a new container from an image; takes
  environment variables, ports, and related run options.
- `container_stop(name)` — stop a running container.
- `container_remove(name)` — remove a container (`rm`).

**Images**

- `image_list` — locally available images.
- `image_pull(image)` — pull an image from a registry.
- `image_build(...)` — build an image from a Dockerfile.
- `image_push(image)` — push an image to a registry.
- `image_remove(image)` — remove a local image.

**Networks and volumes**

- `network_list` — configured networks.
- `volume_list` — configured volumes.

The exact parameter names come from each tool's own schema once this skill
unmasks them — read that schema before the first call on an unfamiliar tool
rather than guessing a field name.

## Using these tools

- Start with `container_list` (or `image_list`) to see what already exists
  before creating or removing anything, the same way you would run `docker
  ps` or `podman images` first on a real host.
- `container_run` starts a NEW container. It does not attach to or reuse an
  existing one. Check `container_list` first if the goal might already be
  running.
- `container_remove` and `image_remove` are destructive with no confirmation
  step of their own. Confirm the target name or id against a `list` result
  first, and say plainly what is about to be removed before calling it.
- A tool that fails because the daemon is unreachable, or because Docker was
  requested but only Podman is installed on the host (or the reverse), is an
  environment fact worth reporting to the user directly, not something to
  route around.

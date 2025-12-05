# Issue: Docker Desktop auto-update overwrites local CLI plugin binaries

## Repository
`docker/mcp-gateway` or `docker/for-win`

## Title
Dev Experience: Docker Desktop silently overwrites CLI plugin binaries during updates

## Description

When developing or testing modified versions of `docker-mcp`, Docker Desktop silently replaces the binary in `~/.docker/cli-plugins/` with the official version during auto-updates.

### Steps to Reproduce

1. Build a patched version of `docker-mcp` (e.g., testing PR #278 or #279)
2. Copy to `~/.docker/cli-plugins/docker-mcp.exe`
3. Verify: `docker mcp version` → shows `HEAD` or custom version
4. Wait for Docker Desktop auto-update (or restart)
5. Check again: `docker mcp version` → shows official version (e.g., `v0.28.0`)

### Expected Behavior

- Docker Desktop should NOT overwrite user-modified binaries in `~/.docker/cli-plugins/`
- OR provide a warning before overwriting
- OR provide a "Developer Mode" flag to disable auto-restore of plugins

### Actual Behavior

The patched binary is silently replaced with the official version from `C:\Program Files\Docker\cli-plugins\`. This breaks development workflows and forces developers to:
- Manually restore the binary after every Docker restart
- Use file locking mechanisms (e.g., `icacls` on Windows)
- Avoid using Docker Desktop entirely during plugin development

### Impact

This is a **critical DX issue** for anyone:
- Testing PRs before they're merged
- Developing custom MCP servers
- Building the plugin ecosystem Docker is trying to create

### Suggested Solutions

1. **Priority flag**: Check `~/.docker/cli-plugins/` before `C:\Program Files\Docker\cli-plugins\` (already works, but gets reset)
2. **Lock file**: If `~/.docker/cli-plugins/docker-mcp.lock` exists, don't overwrite
3. **Dev mode**: `docker config set plugins.dev-mode true` to disable auto-restore
4. **Version check**: Only overwrite if user version is OLDER than official version

### Environment

- Docker Desktop: 4.x (Windows)
- OS: Windows 11 + WSL2
- Plugin: docker-mcp

### Related

- PR #278: Fix tool name prefixing
- PR #279: Fix Claude client exclusion

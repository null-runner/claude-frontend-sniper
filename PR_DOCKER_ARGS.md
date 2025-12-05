# PR: feat: Add dockerArgs field to catalog schema

## Repository
`docker/mcp-gateway`

## Title
feat(catalog): Add dockerArgs field for custom Docker run arguments

## Description

This PR adds a `dockerArgs` field to the catalog schema, allowing MCP server authors to specify custom Docker run arguments.

### Motivation

Many advanced MCP servers require Docker options that aren't currently exposed:

| Use Case | Required Args |
|----------|---------------|
| Chrome DevTools (localhost access) | `--network host` |
| Local LLM inference | `--gpus all` |
| Audio processing | `--device /dev/snd` |
| Privileged operations | `--cap-add SYS_PTRACE` |
| Custom DNS | `--dns 8.8.8.8` |

Without this field, the Gateway is limited to "vanilla" containers, blocking many legitimate use cases.

### Proposed Schema Change

```yaml
# Before (current)
my-server:
  image: my-image:latest
  env:
    - name: FOO
      value: bar

# After (with dockerArgs)
my-server:
  image: my-image:latest
  dockerArgs:
    - "--network"
    - "host"
    - "--gpus"
    - "all"
  env:
    - name: FOO
      value: bar
```

### Implementation

In the gateway code that builds the `docker run` command:

```go
// Before
args := []string{"run", "--rm", "-i", ...}

// After
args := []string{"run", "--rm", "-i", ...}
if server.DockerArgs != nil {
    args = append(args, server.DockerArgs...)
}
```

### Security Considerations

1. **Allowlist approach**: Only allow specific safe arguments:
   - `--network` (host, bridge, none)
   - `--gpus`
   - `--device`
   - `--cap-add` / `--cap-drop`
   - `--dns`
   - `--shm-size`

2. **Blocklist dangerous args**:
   - `--privileged` (too broad)
   - `-v /:/host` (root filesystem access)
   - `--pid host` (process namespace escape)

3. **Documentation**: Clearly document security implications of each allowed arg.

### Alternatives Considered

1. **Pre-defined profiles** (e.g., `profile: gpu`): Less flexible, requires predicting all use cases
2. **Separate fields** (e.g., `network: host`): Doesn't scale, adds complexity
3. **External compose file**: Over-engineered for simple args

### Testing

- [ ] Unit tests for arg parsing
- [ ] Integration test with `--network host`
- [ ] Security test: blocked args are rejected
- [ ] Backward compatibility: servers without `dockerArgs` work unchanged

### Related Issues

- Enables Chrome DevTools servers to work without workarounds
- Unblocks GPU-accelerated MCP servers
- Requested by community (link to any existing issues)

# Upstream sources

The setup script downloads upstream repositories and dependencies into this directory.

Run `npm run setup` with Node.js 24.x, Git, and access to GitHub/npm. The installer checks out the commits in `upstreams.lock.json`, verifies and patches the source seams, installs each upstream's dependencies separately, and builds the integration bridges.

Expected after a successful installation:

```text
vendor/
  docs/                  mcp-feishu-doc source, LICENSE, node_modules, dist-fusion
  blocks/                Feishu-MCP source, LICENSE, node_modules, dist
  build-report.json      build status and source versions
```

Preserve local edits and the original LICENSE / NOTICE files when upgrading.

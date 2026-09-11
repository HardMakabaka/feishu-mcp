# Runtime upstream sources are installed here

This delivery does not bundle complete upstream repositories or node_modules.

Run `npm run setup` with Node.js 24.x, Git, and access to GitHub/npm. The installer checks out the commits in `upstreams.lock.json`, verifies and patches the source seams, installs each upstream's dependencies separately, and builds the integration bridges.

Expected after a successful installation:

```text
vendor/
  docs/                  mcp-feishu-doc source, LICENSE, node_modules, dist-fusion
  blocks/                Feishu-MCP source, LICENSE, node_modules, dist
  build-report.json      local build result, not a live-API certification
```

No upstream Git branches are pushed. Do not discard your local edits when upgrading. Preserve original LICENSE / NOTICE files.

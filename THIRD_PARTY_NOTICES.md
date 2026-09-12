# Third-party notices

This integration uses two separately sourced open-source projects:

1. **mcp-feishu-doc** — Hbin-Zhuang and contributors.
   Repository: https://github.com/Hbin-Zhuang/mcp-feishu-doc
   Pinned commit: `7b818807557e47dff6ab0869f9d961de4ca40088` (2.6.8).
   Upstream license identifier: **Apache-2.0**.

2. **Feishu-MCP** — cso1z and contributors.
   Repository: https://github.com/cso1z/Feishu-MCP
   Pinned commit: `a67232c11d3a8baecda23672161f6af50102f6e4` (0.3.3).
   Upstream license identifier: **MIT**.

The setup script downloads the upstream repositories into `vendor/docs` and `vendor/blocks`. Preserve their original LICENSE, NOTICE and attribution files when using or sharing copies.

Local changes add a shared OAuth access-token seam, a single-process MCP integration bridge, application configuration, and a knowledge workflow. Modified locations and original source hashes are documented in `docs/UPSTREAM_INTEGRATION.md` and `upstreams.lock.json`.

Package publication is disabled. This does not replace third-party licenses or alter the upstream authors' rights. Runtime dependencies have their own licenses, retained by the package installations. This project does not claim endorsement by Feishu, Lark, either upstream author, or the Model Context Protocol maintainers.

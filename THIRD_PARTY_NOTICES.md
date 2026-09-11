# Third-party notices

This private integration uses two separately sourced open-source projects:

1. **mcp-feishu-doc** — Hbin-Zhuang and contributors.
   Repository: https://github.com/Hbin-Zhuang/mcp-feishu-doc
   Pinned commit: `7b818807557e47dff6ab0869f9d961de4ca40088` (2.6.8).
   Upstream license identifier: **Apache-2.0**.

2. **Feishu-MCP** — cso1z and contributors.
   Repository: https://github.com/cso1z/Feishu-MCP
   Pinned commit: `a67232c11d3a8baecda23672161f6af50102f6e4` (0.3.3).
   Upstream license identifier: **MIT**.

Full upstream repositories, including their original LICENSE and any NOTICE or attribution files, are downloaded into `vendor/docs` and `vendor/blocks` by the setup script. They are **not bundled in this source-integration kit**. The script preserves upstream notices. Do not remove them when keeping or sharing local copies.

Local changes add a shared OAuth access-token seam, a single-process MCP integration bridge, private configuration, and a knowledge workflow. Modified locations and original source hashes are documented in `docs/UPSTREAM_INTEGRATION.md` and `upstreams.lock.json`.

The root package is marked private and does not publish itself. This setting is not a replacement for third-party licenses and does not alter the upstream authors' rights. Runtime dependencies have their own licenses, retained by the package installations. This project does not claim endorsement by Feishu, Lark, either upstream author, or the Model Context Protocol maintainers.

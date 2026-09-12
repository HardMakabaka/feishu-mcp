# 上游来源与源码接缝

## 固定来源

| 名称 | 来源 | commit | 版本 | 许可证 |
|---|---|---|---|---|
| docs | https://github.com/Hbin-Zhuang/mcp-feishu-doc | `7b818807557e47dff6ab0869f9d961de4ca40088` | 2.6.8 | Apache-2.0 |
| blocks | https://github.com/cso1z/Feishu-MCP | `a67232c11d3a8baecda23672161f6af50102f6e4` | 0.3.3 | MIT |

`npm run setup` 从上述仓库拉取固定提交。上游完整源码和依赖在安装时下载。

## 修改位置

### docs

目标：`src/services/feishu/core/FeishuService.ts`

原始 Git Blob SHA：`359bf6a1f2fc92c4957c3d63711fde154f73cf63`。

增加 `fusionGetAccessToken()`，复用 getAuth / ensureValidToken / Storage。并发取 Token 共用一个 Promise，并清除旧配置缓存，保持各入口的 Token 一致。

`overlays/docs-fusion-bridge.ts` 使用上游的 DI、ToolRegistry、FeishuService 和 SDK，并通过 useValue 注册同一个服务实例。初始化前直接关闭 OpenTelemetry runtime flag，避免 `z.coerce.boolean()` 将字符串 `false` 转换为 true。

允许使用 `FUSION_EXTRA_OAUTH_SCOPES` 扩展同一个用户 OAuth 授权，不暴露模型修改 App Secret / 切换应用的入口。

另一个补丁目标为 `src/services/feishu/providers/markdown-processor.provider.ts`，原始 Git Blob SHA 为 `d7cbae6eca91891ee543b1c1d56db14dcba99591`。Markdown 转换缓存键使用全文 SHA-256、工作目录和处理配置，相同输入继续命中缓存，等长修改或同目录文件分别处理。

### blocks

目标：`src/services/feishu/FeishuBaseApiService.ts`

原始 Git Blob SHA：`dbbf91cee1e12b25c38bd782733544df9188ed8b`。

增加 `setFusionAccessTokenProvider()`。基类 getAccessToken 优先调用注入的共享 Provider；未注入时使用上游原有认证逻辑。

`overlays/blocks-fusion-bridge.mjs` 使用实际编译后的 ModuleRegistry 和 FeishuApiService，将模块原生工具收集到统一入口；不启动原有 HTTP 或 stdio Server。

另一个补丁目标为 `src/services/baseService.ts`，原始 Git Blob SHA 为 `8f63caf13dd3496208669d06ce469711d9d947be`。桥接显式开启 `setFusionSharedOAuthMode(true)`：在上游 Token 失效及缺少授权分支进入旧缓存/授权链接生成逻辑前，返回通过 `kb_auth` 重新授权的提示；不生成包含 App Secret 的旧 OAuth state，也不自动重放失败写入。该模式默认关闭，保留独立上游原有行为；融合模式只使用 Docs 的授权存储。

## 依赖管理

两个上游使用不同的 Zod 版本、构建方式和工具注册接口，因此分别安装依赖，通过桥接统一 OAuth 和 MCP 入口。

## 安装和二开约束

- 首次应用补丁前校验目标文件的 Git Blob SHA，不匹配时停止。
- 已有 seam 标记的文件跳过补丁；后续本地修改由开发者维护。
- 发现 vendor HEAD 与固定提交不同会拒绝自动 reset；请备份并人工决定如何升级。
- 原始 LICENSE、README、测试和其他文件由 Git 保留。安装脚本不删除版权声明。
- Docs 先运行 tsc 检查，再用 tsup 输出桥接；Block 使用 tsc 与 tsc-alias。
- `vendor/build-report.json` 在安装、构建前先标记 installing/building；只有两个源码桥接都完成才标记 built。
- 运行时要求 built 标记；SDK 集成与账号测试单独记录。
- `test:integration` 使用当前安装的上游代码、SDK 和 Zod，先执行缓存及授权失败回归，再执行 stdio MCP 冒烟。测试使用模拟凭据和响应；安装流程也执行这两项。

测试范围和执行结果见 [验证记录](VALIDATION.md)。

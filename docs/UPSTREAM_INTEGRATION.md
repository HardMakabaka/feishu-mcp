# 上游来源与源码接缝

## 固定来源

| 名称 | 来源 | commit | 版本 | 许可证 |
|---|---|---|---|---|
| docs | https://github.com/Hbin-Zhuang/mcp-feishu-doc | `7b818807557e47dff6ab0869f9d961de4ca40088` | 2.6.8 | Apache-2.0 |
| blocks | https://github.com/cso1z/Feishu-MCP | `a67232c11d3a8baecda23672161f6af50102f6e4` | 0.3.3 | MIT |

上游源码于本次交付中通过 GitHub 连接读取并核对。完整仓库不在本交付压缩包中；安装时从上述 Git 源获取固定 commit。不得将下载脚本误称为已经随包附带全部第三方源码。

## 修改位置

### docs

目标：`src/services/feishu/core/FeishuService.ts`

原始 Git Blob SHA：`359bf6a1f2fc92c4957c3d63711fde154f73cf63`。

增加 `fusionGetAccessToken()`：继续使用原来的 getAuth / ensureValidToken / Storage，而不是建立第二套 OAuth 数据库。方法采用单飞 Promise 并清除旧配置缓存，避免跨入口刷新后拿到过时 Token。

`overlays/docs-fusion-bridge.ts` 在真实上游编译上下文中，复用 DI、ToolRegistry、FeishuService 和 SDK。将 DI 的服务注册替换成同一个 useValue 实例。初始化前显式关闭 OpenTelemetry runtime flag；不依赖字符串 `false` 在 `z.coerce.boolean()` 中的错误真值。

允许使用 `FUSION_EXTRA_OAUTH_SCOPES` 扩展同一个用户 OAuth 授权，不暴露模型修改 App Secret / 切换应用的入口。

### blocks

目标：`src/services/feishu/FeishuBaseApiService.ts`

原始 Git Blob SHA：`dbbf91cee1e12b25c38bd782733544df9188ed8b`。

增加 `setFusionAccessTokenProvider()`，在基类 getAccessToken 最前优先调用共享 Provider。未注入时仍保留上游原逻辑，因此补丁不会把该服务永久绑定到外部 Token。

`overlays/blocks-fusion-bridge.mjs` 使用实际编译后的 ModuleRegistry 和 FeishuApiService，将模块原生工具收集到统一入口；不启动原有 HTTP 或 stdio Server。

## 为什么不整仓合并为同一依赖树

上游使用不同 Zod 大版本、构建方式、配置/认证模型与工具注册接口。保留 vendor 边界可以复用原实现及其测试，同时用小型可审计接缝统一身份与工具入口。

这属于源码层集成，不是“所有源码重写为同一种风格”。业务共享点已实现，不要求用户自行补一个 FeishuGateway 才能开始对接。

## 安装和二开约束

- 首次补丁前按 Git Blob 规则验证目标原文，不匹配就失败，不猜测替换。
- 已有 seam 标记的文件视为已补丁，避免重复插入；用户修改过的文件不会被自动清空。这是幂等安装，不是对本地后续修改的完整性认证。
- 发现 vendor HEAD 与固定提交不同会拒绝自动 reset；请备份并人工决定如何升级。
- 原始 LICENSE、README、测试和其他文件由 Git 保留。安装脚本不删除版权声明。
- 构建 Docs 时真实 tsc 检查后，再用 tsup 输出桥接；Block 使用自己的 tsc 与 tsc-alias。
- `vendor/build-report.json` 在安装、构建前先标记 installing/building；只有两个源码桥接都完成才标记 built。
- 运行时要求 built 标记。它仅代表构建脚本记录，不代表账号测试通过，更不是防篡改签名。
- 只有本地执行 `test:integration`，才能验证当前解析的两套 SDK / Zod 确实协同工作。

本次不宣称已经运行上游全套测试，也未把上游 README 声称的能力等同于本机真实账号验证结果。

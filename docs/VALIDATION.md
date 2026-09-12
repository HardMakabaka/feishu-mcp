# 验证记录 · 2026-09-11

## 已执行

| 检查 | 结果 | 实际含义 |
|---|---|---|
| 根目录离线测试 | **86 / 86 通过；0 失败；0 跳过** | 覆盖新增本地逻辑、模拟 API 合约、源码补丁接缝及本机 OAuth 回调 HTTP |
| 自有 JavaScript 语法检查 | **32 / 32 通过** | `node --check`，不是 TypeScript 类型检查 |
| 执行环境 | Node v22.16.0；npm 10.9.2 | 完整融合运行时仍要求 Node 24.x |
| 上游核对 | 两个固定 commit、关键服务签名、工具注册方式和补丁目标 Blob SHA 已通过 GitHub 连接核对 | 不等于全部源码已经下载到交付包 |

原始结果：[offline-tests.tap](../validation/offline-tests.tap)、[syntax-checks.json](../validation/syntax-checks.json)、[report.json](../validation/report.json)。

离线覆盖重点：章节同级边界、标题歧义、混合样式、公式/提及拒绝、表格单元格文本、revision 和 Block 哈希冲突、预览无写入、同计划重复执行、竞争导入计划、失败不确定性、人工恢复核对、路径和符号链接、媒体预检查、原子存储、进程锁、本地回调 Host/state、分页和 GET 重试、写请求不自动重试、原生工具风险开关、单应用配置、关闭遥测及队列排空。

## 尚未执行

1. 两个上游完整仓库下载、npm 依赖安装、上游 TypeScript 类型检查和打包。
2. 加载真实 SDK / Zod / DI 后的统一 MCP 握手与全部工具注册。
3. 真实飞书用户 OAuth、自动刷新、权限、Wiki、文档和媒体读写。
4. 两个上游自带的完整测试套件。

本环境无法解析 GitHub/npm 下载地址，且没有用户飞书凭证；因此没有用上述离线测试代替真实集成测试，也没有生成伪造的完整构建成功记录。实际测试日志不会包含用户知识库或 Token。

## 本机后续验证

```sh
npm run setup
```

安装脚本会下载固定源码、注入补丁、安装两份依赖、编译、执行根离线测试，再执行 `test:integration`。全部成功后才产生 `vendor/validation-report.json` 的 passed 记录。`vendor/build-report.json` 只记录构建，不代表握手或账号验证。

授权后选择可丢弃测试文档，再执行 `npm run test:live`；默认只读。写入需要额外显式设置 `FEISHU_LIVE_ALLOW_WRITE=true` 和 `FEISHU_LIVE_EDIT_BLOCK`。真实环境的结果应另行追加到本报告，不得把本次离线通过改写为已联调成功。

## Windows 本机安装验证 · 2026-09-11

安装目录：`D:\AIWORK\project\feishu-mcp`。环境：Node v24.13.0、npm 11.6.2、Git 2.53.0.windows.1。

- `npm run setup` 已成功退出（exit 0）。首次 GitHub 直连失败；通过本机已有代理、仅对本次安装进程设置 Git 代理后成功，未修改系统或 Git 全局代理配置。
- 两个上游均检出 `upstreams.lock.json` 指定提交，校验并应用源码接缝，保留仓库和声明。Docs 安装 728 个包，Blocks 安装 639 个包；各自产生 `package-lock.json`。
- Docs 的 `tsc --noEmit` 与桥接打包、Blocks 的 `tsc` 与 `tsc-alias` 均通过。构建器提示未安装可选 `@swc/core`，后续运行时握手仍通过；未跳过 TypeScript 检查。
- 根目录离线测试 **86 / 86 通过，0 失败，0 跳过**。
- 真实 SDK + stdio 冒烟测试通过：**16 个 MCP 入口工具、15 个 Docs 原生工具、15 个 Blocks 原生工具**；原生危险写入被拒绝。测试使用临时数据目录和假凭证，没有飞书 HTTP 请求或真实 OAuth。
- `npm run config` 已生成无凭证的 `client-config.generated.json`。通过 `codex mcp add` 注册全局 `feishu-knowledge-private`，启动入口为本机 Node 与 `src/main.mjs`；因缺少飞书应用凭证，暂设 `enabled = false`。
- `npm run doctor` 检查 **6 / 8 通过**，exit 1 的两项原因仅为 App ID、App Secret 仍是模板占位值；构建文件、知识库示例目录、Node、Git、单实例锁检查通过。未进行真实账号授权、文档/Wiki/媒体联调或两个上游的完整测试套件。

安装日志：[install-setup.log](../validation/install-setup.log)；诊断日志：[install-doctor.log](../validation/install-doctor.log)。机器可读安装结果见 `vendor/validation-report.json`（`status: passed`、`liveFeishu: false`），构建结果见 `vendor/build-report.json`。此处的安装和本地握手成功不代表飞书账号端到端验证成功。

下一步：用户仅在本机 `.env` 填写 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`，确认开放平台回调地址为 `http://localhost:3010/oauth/feishu/callback`；在 MCP 未运行时执行 `npm run auth`。授权后将 Codex 对应配置设为 `enabled = true` 并重新加载客户端。不要将密钥或 Token 发到对话中。

### 应用凭证配置与首次授权尝试 · 2026-09-11

- 已仅在本机 `.env` 填入用户提供的应用凭证；未将凭证放进客户端配置或验证记录。
- 配置后 `npm run doctor` **8 / 8 通过，exit 0**；`validation/install-doctor.log` 已更新为本次配置后的最新结果。该检查不验证凭证真伪或账号权限。
- 已启动真实授权流程并访问飞书授权页面，页面返回 **错误码 20029：重定向 URL 有误**。待在对应应用开发者后台添加 `http://localhost:3010/oauth/feishu/callback`；后台页面当前需要用户登录。
- 尚未收到 OAuth 成功回调，未验证 Token 刷新或读取任何飞书文档。Codex MCP 仍保持 `enabled = false`，等待解决回调配置和账号授权。
- 等待用户登录期间已停止本次独占授权辅助进程，核验退出后仅清理其所属 `server.lock`；未留下等待授权的服务。完成后台配置后需重新启动授权，使用新生成的链接。

## 本机推送前复核 · 2026-09-11

- 执行环境：Windows；Node v24.13.0；npm 11.6.2。
- 执行命令：`npm test`，退出码 **0**；**86 / 86 通过，0 失败，0 跳过，0 取消**。
- 本次仅复核根目录离线测试，未修改核心源码；未执行完整构建、`test:integration` 或 `test:live`，不代表真实飞书 OAuth、文档或媒体读写验证通过。

## 账号授权、退出修复与启用 · 2026-09-11

- 用户补充回调地址后，授权页不再返回 20029。实际授权数据于本机落盘；仅核验 access token、refresh token 和用户信息的存在性，未输出凭证内容，也未重新交换已使用的授权码。
- 授权辅助进程关闭监听后仍有浏览器 TCP 预连接，导致退出等待。新增回归用例在修复前明确失败（500 ms 内不能关闭）；`oauth-server.mjs` 现在只销毁尚未收到 HTTP 请求的预连接，不强制中断正在处理的授权回调。新增活动回调测试证明关服仍等待回调完成并返回 HTTP 200。
- 随后的真实运行暴露第二个退出问题：stdio/HTTP 关闭后，上游未引用事件循环的日志工作线程仍在异步清理，Node 可提前结束并遗留进程锁。`main.mjs` 仅在关闭期间保留事件循环引用，完成队列排空、日志关闭和锁释放后移除。集成冒烟测试增加锁释放断言，在修复前失败、修复后通过；不再仅以握手成功判断整个进程生命周期成功。
- 旧授权进程经 PID、父 PID、创建时间、命令行和锁 nonce 核验后停止；失败验证进程已退出，其所属残留锁经核验后清理。保留现有 OAuth 数据，未停止其他 Node/MCP 服务。
- `npm test`：**88 / 88 通过，0 失败，0 跳过**；`npm run test:integration`：**16 个入口、15 个 Docs 原生工具、15 个 Blocks 原生工具，进程锁正常释放**。日志：[oauth-shutdown-tests.log](../validation/oauth-shutdown-tests.log)、[oauth-shutdown-smoke.log](../validation/oauth-shutdown-smoke.log)。本次未修改上游源码/桥接或跳过类型检查，使用已验证的上游构建。
- **真实只读连接验证通过**：复用本机持久化 OAuth，经 stdio MCP 调用 `kb_list_wikis` 成功，当前账号返回 **0 个可见 Wiki 空间**；未据此推断云文档数量。带一个未发送 HTTP 请求的 TCP 预连接时，MCP 关闭用时 **256 ms**，进程锁正常释放。机器可读证据：[live-connection.json](../validation/live-connection.json)。
- 已将全局 Codex 配置中的 `feishu-knowledge-private` 改为 `enabled = true`，保持本地 stdio 和两个原生写入开关关闭。测试辅助进程均已退出；重新加载 Codex 后由客户端启动服务。
- **未验证**：Token 到期刷新、具体文档/Wiki 节点/媒体读写、两个上游完整测试套件。没有进行任何远端文档写入或删除。历史 `vendor/validation-report.json` 的 `liveFeishu: false` 对应首次安装冒烟；本节与独立真实连接报告记录其后的账号验证，不覆盖历史事实。

实现选择参考 [Node.js HTTP 关闭接口文档](https://nodejs.org/api/http.html#servercloseallconnections)：没有采用会中断活动请求的 `closeAllConnections()`，而是以本机回归测试限定清理范围。

## 审计问题修复验证 · 2026-09-12

环境：Windows；Node v24.13.0；npm 11.6.2。保留了本节之前的 OAuth/退出修复及验证记录；未修改真实凭据、OAuth 数据或远端文档。

- **先红后绿**：修复前，定向核心测试为 33 通过 / 7 失败；新增的 4 个真实上游代码回归全部失败，分别复现旧 Markdown 缓存和三种旧授权路径。修复后对应测试全部通过。
- **`npm test`：98 / 98 通过，0 失败、0 跳过，exit 0**。覆盖目标 Wiki 缺失时保留已创建检查点/阻止重传/人工接管、写入确认版本与读回版本冲突、缺失确认版本、行内样式校验、布尔默认值兼容和历史计划回滚限制。
- **`npm run build`：exit 0**。两个上游 HEAD 仍为锁定提交；新增两个补丁目标按原始 Git Blob SHA 校验后应用。Docs 的真实 TypeScript 检查与桥接打包、Blocks 的 TypeScript 编译及别名处理均完成。仍有可选 `@swc/core` 未安装提示，未跳过类型检查。
- **`npm run test:integration`：exit 0**。新增上游回归 **4 / 4 通过**：等长正文修改不再命中旧缓存；原生只读 401、原生写入 401、缺少授权三条路径均不返回旧 OAuth state，独立 Token 缓存访问次数为 **0**，请求次数分别为 **1 / 1 / 0**（均为模拟请求）。随后 stdio SDK 冒烟确认 **16 个入口、15 个 Docs 工具、15 个 Blocks 工具**，进程锁正常释放。
- 本次使用现有依赖执行构建，没有重新运行安装或真实 OAuth。上游缓存回归在内存中编译并执行实际源码；Blocks 回归执行实际构建产物并替换 HTTP adapter。**未进行真实飞书账号读写、Token 刷新或文档端到端验证**。
- 固定上游源码、许可证和已有修改均保留；新补丁已进入安装脚本和 `upstreams.lock.json`。源码校验清单同步更新，根目录 ZIP 保留原始交付快照，未重新打包。

已启动的 MCP 进程需要重新加载，才会使用新的构建产物；本次没有擅自停止其他客户端持有的 MCP 进程。

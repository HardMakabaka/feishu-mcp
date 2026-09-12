# 验证记录

## 初始离线验证 · 2026-09-11

| 检查 | 结果 | 实际含义 |
|---|---|---|
| 根目录离线测试 | **86 / 86 通过；0 失败；0 跳过** | 覆盖新增本地逻辑、模拟 API 合约、源码补丁接缝及本机 OAuth 回调 HTTP |
| JavaScript 语法检查 | **32 / 32 通过** | `node --check` 语法检查 |
| 执行环境 | Node v22.16.0；npm 10.9.2 | 项目运行要求 Node 24.x |
| 上游核对 | 已通过 GitHub 核对固定 commit、关键服务签名、工具注册方式和补丁目标 Blob SHA | 源码版本与接口检查 |

原始结果：[offline-tests.tap](../validation/offline-tests.tap)、[syntax-checks.json](../validation/syntax-checks.json)、[report.json](../validation/report.json)。

离线覆盖重点：章节同级边界、标题歧义、混合样式、公式/提及拒绝、表格单元格文本、revision 和 Block 哈希冲突、预览无写入、同计划重复执行、竞争导入计划、失败不确定性、人工恢复核对、路径和符号链接、媒体预检查、原子存储、进程锁、本地回调 Host/state、分页和 GET 重试、写请求不自动重试、原生工具风险开关、单应用配置、关闭遥测及队列排空。

## 该阶段未执行

1. 两个上游完整仓库下载、npm 依赖安装、上游 TypeScript 类型检查和打包。
2. 加载真实 SDK / Zod / DI 后的统一 MCP 握手与全部工具注册。
3. 真实飞书用户 OAuth、自动刷新、权限、Wiki、文档和媒体读写。
4. 两个上游自带的完整测试套件。

初始环境无法解析 GitHub/npm 下载地址，且未配置飞书凭据，因此该阶段仅执行离线测试。

## 验证命令

```sh
npm run setup
```

安装脚本下载固定源码、应用补丁、安装依赖、编译并执行离线与集成测试。全部成功后将 `vendor/validation-report.json` 标记为 passed；`vendor/build-report.json` 单独记录构建结果。

授权后选择测试文档并执行 `npm run test:live`，默认只读。写入需同时设置 `FEISHU_LIVE_ALLOW_WRITE=true` 和 `FEISHU_LIVE_EDIT_BLOCK`。账号测试结果按执行时间单独记录。

## Windows 本机安装验证 · 2026-09-11

安装目录：`D:\AIWORK\project\feishu-mcp`。环境：Node v24.13.0、npm 11.6.2、Git 2.53.0.windows.1。

- `npm run setup` 已成功退出（exit 0）。首次 GitHub 直连失败；通过本机已有代理、仅对本次安装进程设置 Git 代理后成功，未修改系统或 Git 全局代理配置。
- 两个上游均检出 `upstreams.lock.json` 指定提交，校验并应用源码接缝，保留仓库和声明。Docs 安装 728 个包，Blocks 安装 639 个包；各自产生 `package-lock.json`。
- Docs 的 `tsc --noEmit` 与桥接打包、Blocks 的 `tsc` 与 `tsc-alias` 均通过。构建器提示未安装可选 `@swc/core`，后续运行时握手仍通过；未跳过 TypeScript 检查。
- 根目录离线测试 **86 / 86 通过，0 失败，0 跳过**。
- 真实 SDK + stdio 冒烟测试通过：**16 个 MCP 入口工具、15 个 Docs 原生工具、15 个 Blocks 原生工具**；原生危险写入被拒绝。测试使用临时数据目录和假凭证，没有飞书 HTTP 请求或真实 OAuth。
- `npm run config` 已生成无凭证的 `client-config.generated.json`。通过 `codex mcp add` 注册全局飞书 MCP 服务，启动入口为本机 Node 与 `src/main.mjs`；因缺少飞书应用凭证，暂设 `enabled = false`。
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
- 已将全局 Codex 配置中的飞书 MCP 服务改为 `enabled = true`，保持本地 stdio 和两个原生写入开关关闭。测试辅助进程均已退出；重新加载 Codex 后由客户端启动服务。
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

## 命名与文案调整验证 · 2026-09-12

- README、项目说明和工具提示统一使用中性名称。包名为 `feishu-knowledge-mcp`，MCP 握手名称和新配置生成器的服务名为 `feishu-knowledge`。
- `npm test`：**98 / 98 通过，exit 0**。`npm run test:integration`：**4 / 4 上游回归通过，exit 0**；stdio 冒烟新增服务名称断言，仍确认 16 个入口、15 个 Docs 工具、15 个 Blocks 工具及进程锁释放。
- 单账号身份键、OAuth 存储、回调限制、原生写入开关和禁止发布配置未变；没有改动客户端已有服务别名、真实账号或飞书文档。已有别名仍可使用，无需重新授权。
- 本次未修改上游运行逻辑，未重新构建上游；原始测试日志和交付 ZIP 保留历史记录，不重写为本次结果。源码校验清单已同步。

## 新建文档真实冒烟 · 2026-09-12 10:44～10:48（北京时间）

**结论：未全部通过。** 本次使用当前真实账号和现有构建，未改动核心源码，也未用离线测试替代端到端结果。

- 按用户要求新建独立测试文档：[Feishu MCP 冒烟测试 2026-09-12 10:44:23 984a956e](https://feishu.cn/docx/NAJhdIBxYoNxbrxCuPRcltesnhd)。通过 `docs__feishu_upload_markdown` 创建，媒体上传与远程下载全部关闭；未修改或复制课程大纲内容。
- `kb_read` 与 `blocks__get_feishu_document_info` 均读取成功：初始 revision **2**，共 **4 个 Block**，标题与测试段落符合预设内容。真实 MCP 握手名称为 `feishu-knowledge`。
- 仅针对该新文档和指定测试段落，通过本次子进程环境设置 `FEISHU_LIVE_DOCUMENT`、`FEISHU_LIVE_EDIT_BLOCK`、`FEISHU_LIVE_ALLOW_WRITE=true`，执行现有 **`npm run test:live`，exit 1**。原生写入只在创建文档的独立进程中临时允许，后续测试保持关闭；未修改 `.env` 或客户端的持久配置。
- 写入计划 `0c8a5272-d119-47a8-8372-03b1189b1668` 获得 API 确认 revision **3**，但紧接着的读回检查报 **`SNAPSHOT_CONFLICT`**，计划保留为 `needs_inspection`。测试脚本因此在写入断言处停止，**未执行其自动回滚步骤**。
- 没有重试该写入。随后独立只读核对 revision **3**：测试后缀确已写入，只有目标段落改变，其他 Block 无变化、无缺失，文本和行内样式与计划预期一致。
- 在上述核对后，为恢复本次测试内容另建反向文本计划 `e885e202-d813-45e1-9280-cefccc938223`，未把失败计划强行改为 applied。恢复请求获得 API 确认 revision **4**，即时复读同样报 `SNAPSHOT_CONFLICT`，第二份计划也保留为 `needs_inspection`，没有重放。
- 最终独立只读验证 revision **4**：**全部 4 个 Block 与初始测试快照深度相等**，包括文本、样式、ID 与结构，测试后缀已去除。测试文档保留，未删除任何文档；测试进程退出，单实例锁已释放，持久化原生写入开关未变。
- 可确认创建、两条读取路径及实际文本写入可用；**不能据此宣称自动写后校验/自动回滚链路通过**。版本冲突的具体根因仍待定位，本次没有放宽版本保护或修改现有门禁。

汇总证据：[live-smoke-20260912-984a956e.json](../validation/live-smoke-20260912-984a956e.json)。本机详细检查点与原始命令日志分别为 `.local/exports/smoke-new-document-984a956e.json`、`.local/exports/smoke-new-document-984a956e.log`；不含应用密钥或 OAuth Token。

## 写后版本可见性修复 · 2026-09-12 11:32（北京时间）

- 仅修改融合层 `FeishuApi` 与 `KnowledgeService` 的写后验证及对应测试；未修改上游源码、凭证或持久化写入开关。普通读取、预览和写前版本检查仍保持严格冲突检查。
- 写后快照以 API 确认版本为目标：低于目标仅等待 GET 读取，高于目标立即拒绝；内容始终按目标版本分页读取，最后再次核对版本，再执行原有文本/样式验证。前后元信息查询共享 **5000 ms 可见性预算**，最多 **4 次退避（200/400/800/1600 ms）**；该预算不包含正常 Block 分页耗时。元信息 HTTP 请求受剩余预算限制，不叠加底层自动重试。写请求不重试，超时或冲突仍持久化为 `needs_inspection`。
- 增加目标版本、读取阶段、观测版本序列、重试次数和元信息耗时记录；普通快照冲突也记录前后版本。历史失败计划不强行改为成功。
- 先红后绿：定向测试修复前 **38 通过 / 5 失败**；完成修复及补充超时测试后，`npm test` **106 / 106 通过**。覆盖前后读取滞后、固定版本内容读取、新版本并发拒绝、有限重试、慢请求中止、权限失败、确认版本传递及不重复写入；原有内容与样式不符保护测试仍通过。
- `npm run test:integration`：**4 / 4 上游回归通过**，MCP 握手/工具注册通过（16 个入口、15 个 Docs、15 个 Blocks），进程锁释放。
- 核验 PID **42296** 已退出且锁 nonce 未变后，仅删除该残留锁，没有停止其他进程。
- 在现有独立冒烟文档 `NAJhdIBxYoNxbrxCuPRcltesnhd` 先读取新的基线：revision **5**、**5 个 Block**（保留此前后来新增的内容）。随后 `npm run test:live` **exit 0**，写入 **5→6**、自动反向计划回滚 **6→7** 均为 `applied`。
- **真实捕获版本读取滞后**：回滚响应确认 revision **7** 后，写后元信息依次返回 **6、6、7**，末尾再读仍为 **7**；仅重试 GET **2 次**，元信息查询与等待合计 **1648 ms**，未重发写请求。这证明了本次修复处理的版本可见性滞后确实发生，但不定位到具体缓存或副本层。
- 最终独立复读 revision **7**，全部 **5 个 Block 与本轮开始前深度相等**；历史两份失败计划仍为 `needs_inspection`，测试文档保留，课程大纲未写入，进程锁已释放。

证据：[单元测试](../validation/write-visibility-tests.log)、[集成测试](../validation/write-visibility-integration.log)、[真实冒烟日志](../validation/write-visibility-live.log)、[真实版本观测与回滚结果](../validation/write-visibility-live.json)。这些真实文本测试不代表媒体或结构性回滚已验证。

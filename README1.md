# Feishu Knowledge MCP

飞书知识库 MCP 服务，支持 Markdown 目录导入、Wiki 管理和 Block 级编辑。

提供修改预览、版本检查、快照、增量发布和失败恢复，通过本地 stdio 接入 MCP 客户端。

## 1. 集成方式

| 来源 | 固定版本 | 用途 |
|---|---|---|
| `Hbin-Zhuang/mcp-feishu-doc` | 2.6.8 / `7b818807557e47dff6ab0869f9d961de4ca40088` | 复用原始 Markdown、Wiki、媒体、OAuth、搜索与文档生命周期服务，捕获其 15 个工具定义 |
| `cso1z/Feishu-MCP` | 0.3.3 / `a67232c11d3a8baecda23672161f6af50102f6e4` | 复用原始 Block、表格、图片、画板等模块；通过源码补丁共享前者的用户 Token |
| 集成层 | 0.2.0 | 单一 MCP 入口、知识库服务、版本保护、本地映射、快照、检查点、恢复检查、原生工具开关 |

两个上游服务在同一个 Node 进程中运行，共享 OAuth，并注册到同一个 MCP Server。依赖分别安装，保留各自的 Zod 版本和构建方式。

上游源码安装在 `vendor/docs` 和 `vendor/blocks`，保留原有仓库结构，支持后续修改。

## 2. 功能

| 能力 | 实现及范围 |
|---|---|
| 用户 OAuth / 刷新 / 持久化 | 复用文档上游；同一 Token 提供给两套服务；本机浏览器回调 |
| Markdown 目录入库 | 递归扫描、标题提取、Wiki 层级创建/复用、逐文件结果和映射 |
| 增量发布 | 原文不变则跳过；只有本地变化则新建版本；双端变化默认报冲突 |
| 精准文本编辑 | 指定 Block ID + 原文匹配；预览、快照、revision 检查、写后验证 |
| 章节内操作 | 按标题的同级 Block 范围定位；同名标题必须用 ID 消歧 |
| 表格补充 | 可通过安全工具修改单元格内的文本 Block；创建/结构修改走原生表格工具 |
| 追加 | 安全工具追加纯文本段落；富文本、图片、复杂结构走原生工具 |
| 图片 / 附件 / 画板 | 保留上游原生能力；目录导入媒体默认关闭，可显式开启本地媒体上传 |
| 查找 | 搜索本地缓存；通过原生工具搜索飞书文档 |
| 导出与回滚 | 完整 Block JSON 快照 + 辅助 Markdown 导出；只对已验证、未被后续修改的文本编辑自动生成回滚计划 |
| 失败恢复 | 不重放不确定计划；阻止同目的地新计划绕过；人工检查后接管已创建文档或确认未创建 |
| 原生完整工具 | `kb_native_catalog` / `kb_native_call`；可选逐个暴露。账号重配置工具在单用户模式中禁用 |

目录导入采用单向发布：更新时创建新版本，保留旧文档，不自动合并双端内容。需要保留链接的局部修改使用 Block 计划。原生 `feishu_update_document` 会删除并重建文档，由独立的危险操作开关控制。

## 3. 安装

### 环境

需要 **Node.js 24.x、npm 和 Git**。

首次安装需要访问 GitHub 和 npm，以下载上游源码及依赖，无需全局安装 pnpm。

```sh
cd feishu-mcp
npm run setup
```

安装流程：拉取固定提交 → 校验并应用源码补丁 → 分目录安装依赖 → 类型检查和构建 → 离线测试 → 上游回归与 MCP 握手测试。任一步骤失败都会停止安装；修复错误后重新执行 `npm run setup`。

上游源码版本由 `upstreams.lock.json` 固定。首次安装在两个 vendor 目录生成 `package-lock.json`，后续安装使用 `npm ci`；复现依赖版本时需保留这两份锁文件。安装流程使用 npm，不使用上游的 pnpm 锁文件。

### 配置飞书应用

在飞书开放平台创建应用，配置权限并发布。回调地址必须与 `.env` 一致，默认：

```text
http://localhost:3010/oauth/feishu/callback
```

固定文档上游请求的 OAuth scopes 为：

```text
contact:user.base:readonly docx:document drive:drive wiki:wiki offline_access
```

在飞书后台开通上述 API 权限，并确保授权用户具有目标文档和 Wiki 的访问或编辑权限。

安装后会复制 `.env.example` 为 `.env`。仅在本机编辑：

```dotenv
FEISHU_APP_ID=cli_你的应用ID
FEISHU_APP_SECRET=你的应用密钥
FEISHU_OAUTH_CALLBACK_URL=http://localhost:3010/oauth/feishu/callback

# 相对路径基于本工程目录；Windows 也可填 D:/Notes/Knowledge
KNOWLEDGE_ROOT=D:/Notes/Knowledge
FUSION_DATA_DIR=./.local

# 可先留空，授权后通过 kb_list_wikis 取得
FEISHU_WIKI_SPACE_ID=
FEISHU_WIKI_PARENT_NODE=
```

**不要把 `.env`、App Secret、Token 或 `.local/oauth` 发进模型对话。** MCP 客户端只配置启动程序路径，不配置明文密钥。

### 授权并接入本地客户端

在 MCP 尚未启动时执行：

```sh
npm run auth
```

终端输出授权链接，使用本机浏览器打开。成功后授权保存在本机，进程退出。若 MCP 已由客户端运行，则在对话中调用 `kb_auth`，不要再启动第二个 `npm run auth`。同一数据目录只允许一个服务进程。

生成通用 MCP JSON 启动配置：

```sh
npm run config
```

将生成的 `client-config.generated.json` 内容加入支持 `mcpServers` JSON 格式的本地客户端。文件含本机 Node 路径和本工程绝对路径，不含凭证。客户端通常直接启动 `node src/main.mjs`；不要用可能输出 npm 日志的 `npm start` 作为 stdio MCP 的协议入口。

服务使用本地 **stdio** 传输。客户端若采用其他配置格式，按其要求填写相同的启动命令和参数；项目未提供 HTTP MCP 接口。

## 4. 推荐工作流

### 第一次把知识库放到飞书

先用 `examples/knowledge` 或自己的小型测试目录，目标选择专用测试 Wiki 节点。

```text
1. kb_list_wikis / kb_list_wiki_nodes：确定目的地。
2. kb_plan_import：生成扫描、层级、创建/跳过/冲突计划。
3. 阅读返回的 items / summary，确认目录和媒体范围。
4. 明确批准后，kb_apply_plan({planId, confirmed:true})。
5. 检查 status、job.items、mediaWarnings 和 kb_list_mappings。
```

例如预览：

```json
{
  "path": "AI",
  "spaceId": "你的Wiki空间ID",
  "parentNodeToken": "测试父节点Token",
  "uploadMedia": false
}
```

`path` 必须在 `KNOWLEDGE_ROOT` 内。`AI/RAG.md` 会在所选目的地下建立/复用 `AI` 节点。Wiki 中的“目录”实际上使用可挂子节点的 Docx 节点表示。

### 修改表格单元格

调用 `kb_read` 获取单元格内段落的 Block ID，再生成修改计划：

```json
{
  "document": "https://你的租户.feishu.cn/docx/文档Token",
  "edits": [
    {
      "blockId": "从kb_read获得的段落ID",
      "expectedText": "原单元格文字",
      "newText": "补充后的文字"
    }
  ]
}
```

混合样式文本默认拒绝改写，可设置 `allowStyleLoss:true` 接受样式简化；含公式或提及的文本仍拒绝修改。通过 `section: {"headingBlockId":"标题ID"}` 限定章节范围。

### 后续本地文件和飞书都发生了变化

通过 Block 计划修改飞书文档后，映射标记为 `remoteEdited`，保留原同步基线。

- 只有远端变更：`skip_remote_changed`，保留远端，不回写本地。
- 只有本地变更：`new_version`，创建新文档并记录旧文档历史，原链接保留但不自动指向新文档。
- 双端变化：默认 `conflict`。确认要另存版本时，再生成 `allowDivergentVersion:true` 的新计划；它仍不会合并双方内容。

### 使用上游全部原生能力

用 `kb_native_catalog` 查询工具名和参数，再通过 `kb_native_call` 调用。工具名称带 `docs__` 或 `blocks__` 前缀，参数由所属上游的 Zod schema 校验。

```dotenv
# 显示每个原生工具的完整 MCP schema；会显著增加工具数量
FUSION_EXPOSE_NATIVE_TOOLS=true

# 才允许原生新增/修改（安全 kb_* 计划不依赖这个开关）
FUSION_ALLOW_NATIVE_WRITES=true

# 删除、整篇删除重建等还需要这个开关；建议保持 false
FUSION_ALLOW_NATIVE_DESTRUCTIVE=false
```

修改开关后重启 MCP。原生写入绕过计划层的版本检查、快照和回滚流程；原生文件工具不受 `KNOWLEDGE_ROOT` 路径限制，只处理可信输入。

默认加载 Block 上游的 document 模块。任务、日历等模块通过 `FUSION_BLOCK_MODULES` 启用，同时需要开通对应 API 权限，在 `FUSION_EXTRA_OAUTH_SCOPES` 添加 scope 并重新授权。

## 5. 工程目录

```text
src/
  main.mjs                    单入口 MCP、工具注册、生命周期
  config.mjs                  本机单应用配置
  core/
    feishu-api.mjs             Docx / Wiki HTTP 调用
    knowledge.mjs              入库、计划、冲突、恢复检查、映射
    blocks.mjs                 章节范围、文本变更、Markdown 辅助导出
    paths.mjs                  本地路径与媒体预检查
    storage.mjs                原子写入、快照、进程锁
  integration/
    catalog.mjs                原生工具收集/校验/风险开关
    oauth-server.mjs           仅本机 OAuth 回调
scripts/                      拉源码、补丁、构建、诊断、客户端配置
  patches.mjs                 上游源码校验与补丁
  setup.mjs / build.mjs
  doctor.mjs
  write-client-config.mjs
overlays/                     上游桥接代码
vendor/                       安装后才有 docs/ 和 blocks/ 源码与依赖
tests/                        离线测试；integration/ 为本地握手和账号实测
.local/                       运行后产生：OAuth、计划、映射、快照、日志
```

编排层使用可直接执行的 `.mjs`，两个上游保留 TypeScript。根目录离线测试可独立运行。

## 6. 诊断与验证

```sh
npm test                  # 根目录离线测试，不需要 npm 安装或飞书账号
npm run doctor            # 检查 Node、构建文件、配置、目录和进程锁；不访问账号
npm run build             # 依赖安装后，重新类型检查并构建两个源码桥接
npm run test:integration  # 上游回归、SDK 握手与工具注册，不访问飞书
npm run test:live         # 需要专门指定文档；默认只读
```

账号测试需在 `.env` 设置 `FEISHU_LIVE_DOCUMENT` 为测试文档 URL。默认只读；同时设置 `FEISHU_LIVE_ALLOW_WRITE=true` 和纯文本段落的 `FEISHU_LIVE_EDIT_BLOCK` 后，才会执行修改和反向恢复。失败时保留检查点，需人工核对文档。

各阶段测试结果见 [验证记录](docs/VALIDATION.md)。

导入 `needs_inspection`、文件锁、原生删除风险、备份边界见 [安全与限制](docs/SAFETY_AND_LIMITS.md)。

## 7. 运行与数据保护

项目使用本地 stdio 运行，未提供云部署步骤，也未启用遥测初始化。导入内容会上传飞书；模型读取到的文档还可能由你所用模型服务处理。

`.env` 与 `.local` 包含凭据和运行数据，需限制访问并备份。Token 使用未加密的文件存储；POSIX 推荐目录权限 700、文件权限 600，Windows 使用目录 ACL。

第三方出处与保留要求见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。所有来源与代码接缝均可检查，上游声明须保留。

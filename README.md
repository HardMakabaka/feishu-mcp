# Feishu Knowledge MCP · 本地个人融合版

一个 MCP 入口，整合飞书 Markdown/Wiki 工作流与 Block 精细编辑，并增加个人知识库的映射、预览、版本检查、快照和失败检查点。

**交付状态：v0.2.0 源码融合工程。** 这不是之前的空 HTTP 适配器骨架；真实 API 调用、两套上游的源码补丁、共用 OAuth 的运行时桥接、知识库工作流与测试均已提供。**但此压缩包不是离线成品：不含两个上游完整仓库、npm 依赖或预编译文件。** `npm run setup` 在你的电脑上拉取固定源码、校验、注入补丁、安装依赖、编译并执行 MCP 冒烟测试。

本次交付环境只运行了无需第三方依赖的离线测试，未完成上游安装、完整 TypeScript 编译、真实 SDK 握手或飞书账号联调。精确结果见 [验证记录](docs/VALIDATION.md)。不要把离线通过等同于可以无风险批量操作正式知识库。

## 1. 融合方式

| 来源 | 固定版本 | 本工程如何使用 |
|---|---|---|
| `Hbin-Zhuang/mcp-feishu-doc` | 2.6.8 / `7b818807557e47dff6ab0869f9d961de4ca40088` | 复用原始 Markdown、Wiki、媒体、OAuth、搜索与文档生命周期服务，捕获其 15 个工具定义 |
| `cso1z/Feishu-MCP` | 0.3.3 / `a67232c11d3a8baecda23672161f6af50102f6e4` | 复用原始 Block、表格、图片、画板等模块；通过源码补丁共享前者的用户 Token |
| 本工程新增 | 0.2.0 | 单一 MCP 入口、知识库服务、版本保护、本地映射、快照、检查点、恢复检查、原生工具开关 |

不是两个 MCP 子进程之间转发消息，也不是重新写一套假的上游 API：**同一个 Node 进程加载两个实际上游服务，注册到同一个 MCP Server。** 两个上游分别安装自己的依赖，以保留 Zod 3 / Zod 4 的边界。没有用自动大合并抹平两个仓库。

上游完整源码安装后位于 `vendor/docs`、`vendor/blocks`，仍可继续修改。安装脚本不会推送 Git、创建 GitHub 仓库或发布 npm 包。

## 2. 本版能力与边界

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
| 查找 | 本地缓存搜索；原生工具提供上游搜索，不把缓存搜索说成全库检索 |
| 导出与回滚 | 完整 Block JSON 快照 + 辅助 Markdown 导出；只对已验证、未被后续修改的文本编辑自动生成回滚计划 |
| 失败恢复 | 不重放不确定计划；阻止同目的地新计划绕过；人工检查后接管已创建文档或确认未创建 |
| 原生完整工具 | `kb_native_catalog` / `kb_native_call`；可选逐个暴露。账号重配置工具在单用户模式中禁用 |

**“目录同步”在本版是单向发布和版本保留，不是双向自动合并，也不是整篇 Markdown 无损原位重写。** 需要保留现有链接的局部修改应使用 Block 计划。原生 `feishu_update_document` 会删除旧文档并重建，因此属于高风险开关控制的操作，不作为日常同步路径。

## 3. 安装

### 环境

使用 **Node.js 24.x + npm + Git**。运行时明确检查 Node 24，因为 Block 上游的 package.json 要求 `^24.0.0`。根目录离线测试可在本次使用的 Node 22.16.0 上运行，但这不代表完整项目兼容 Node 22。

首次安装需访问 GitHub 和 npm。无需全局安装 pnpm；脚本绕过上游的 prepare 钩子，显式执行所需构建。

```sh
cd feishu-knowledge-mcp-fusion
npm run setup
```

脚本会依次：拉取固定提交 → 校验源文件 Git Blob SHA → 注入共享 OAuth 接口 → 分目录安装依赖 → 编译真实上游 → 运行离线测试 → 运行真实 SDK 的本地 MCP 握手测试。任何阶段出错会停止并返回非零退出码。**请保留完整报错；不要跳过失败的类型检查后直接操作正式文档。**

本次没有提供已解析的 npm lockfile：固定的是上游源码提交；首次成功安装会在两个 vendor 目录产生 `package-lock.json`。后续安装使用 `npm ci`。备份这些 lockfile 才能复现首次解析出的传递依赖。上游自带的 pnpm lockfile 会保留，但本安装流程不使用它。

### 配置飞书应用

在飞书开放平台创建自己使用的应用，并完成权限配置及应用发布/可用性设置。回调地址必须与 `.env` 完全一致，默认：

```text
http://localhost:3010/oauth/feishu/callback
```

固定文档上游请求的 OAuth scopes 为：

```text
contact:user.base:readonly docx:document drive:drive wiki:wiki offline_access
```

这些名称来自被固定的上游常量，不替代飞书后台的实际权限审批。拥有 API 权限也不意味着能编辑所有文档；授权用户仍需拥有目标文档和 Wiki 的相应访问/编辑权限。

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

不同客户端配置文件格式可能不同；生成文件不宣称是所有客户端的原生格式。这里提供的是本地 **stdio**，不是云端可直连的远程 MCP 地址。把本机服务暴露到公网不属于本版部署方式。

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

### 让 AI 补充知识表格中的某几个单元格

先 `kb_read` 获取真实 Block ID，不根据行号猜 ID。找到单元格内的段落，再生成计划：

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

复杂混合样式默认不做有损改写；可明确指定 `allowStyleLoss:true`，但这只代表接受样式简化，不代表允许公式或提及内容被悄悄破坏。章节限制可添加 `section: {"headingBlockId":"标题ID"}`。

### 后续本地文件和飞书都发生了变化

模型直接编辑飞书后，映射会标记 `remoteEdited`，不会把本地文件假装成已同步。

- 只有远端变更：`skip_remote_changed`，保留远端，不回写本地。
- 只有本地变更：`new_version`，创建新文档并记录旧文档历史，原链接保留但不自动指向新文档。
- 双端变化：默认 `conflict`。确认要另存版本时，再生成 `allowDivergentVersion:true` 的新计划；它仍不会合并双方内容。

### 使用上游全部原生能力

先 `kb_native_catalog` 搜索具体能力，查看真实工具名及参数摘要，再 `kb_native_call` 调用。名称带 `docs__` 或 `blocks__` 前缀，避免冲突。原生参数仍由所属上游自己的 Zod schema 校验。

```dotenv
# 显示每个原生工具的完整 MCP schema；会显著增加工具数量
FUSION_EXPOSE_NATIVE_TOOLS=true

# 才允许原生新增/修改（安全 kb_* 计划不依赖这个开关）
FUSION_ALLOW_NATIVE_WRITES=true

# 删除、整篇删除重建等还需要这个开关；建议保持 false
FUSION_ALLOW_NATIVE_DESTRUCTIVE=false
```

开关变化后重启 MCP。**原生写入不享受安全计划层的所有版本保护、备份和回滚承诺。** 原生文件工具也不受 `KNOWLEDGE_ROOT` 统一沙箱约束，只应处理可信本地输入。

默认只加载 Block 上游的 document 模块。任务/日历等非知识库能力可通过 `FUSION_BLOCK_MODULES` 显式启用；对应 API 权限需另行开通，并通过 `FUSION_EXTRA_OAUTH_SCOPES` 添加准确 scope 后重新授权。不要仅打开模块就假设权限已具备。

## 5. 工程目录

```text
src/
  main.mjs                    单入口 MCP、工具注册、生命周期
  config.mjs                  本机单应用配置
  core/
    feishu-api.mjs             真实 Docx / Wiki HTTP 调用
    knowledge.mjs              入库、计划、冲突、恢复检查、映射
    blocks.mjs                 章节范围、文本变更、Markdown 辅助导出
    paths.mjs                  本地路径与媒体预检查
    storage.mjs                原子写入、快照、进程锁
  integration/
    catalog.mjs                原生工具收集/校验/风险开关
    oauth-server.mjs           仅本机 OAuth 回调
scripts/                      拉源码、补丁、构建、诊断、客户端配置
  patches.mjs                 校验过的两个源码接缝
  setup.mjs / build.mjs
  doctor.mjs
  write-client-config.mjs
overlays/                     将被复制到真实上游的桥接代码
vendor/                       安装后才有 docs/ 和 blocks/ 源码与依赖
tests/                        离线测试；integration/ 为本地握手和账号实测
.local/                       运行后产生：OAuth、计划、映射、快照、日志
```

本工程编排层用可直接执行的 `.mjs`；两个上游仍保留 TypeScript。这样可以独立测试安全逻辑，不把“依赖无法安装”当作不做任何验证的理由。

## 6. 诊断与验证

```sh
npm test                  # 根目录离线测试，不需要 npm 安装或飞书账号
npm run doctor            # 检查 Node、构建文件、配置、目录和进程锁；不访问账号
npm run build             # 依赖安装后，重新类型检查并构建两个源码桥接
npm run test:integration  # 真实 SDK + stdio 握手/工具注册，不访问飞书
npm run test:live         # 需要专门指定文档；默认只读
```

账号实测前在 `.env` 配置 `FEISHU_LIVE_DOCUMENT` 为你选择的测试文档 URL。默认不写入。只有再明确设置 `FEISHU_LIVE_ALLOW_WRITE=true` 和一个纯文本段落的 `FEISHU_LIVE_EDIT_BLOCK`，测试才会修改该段落并尝试反向恢复。发生错误时请检查计划和文档；不能承诺总能恢复。

导入 `needs_inspection`、文件锁、原生删除风险、备份边界见 [安全与限制](docs/SAFETY_AND_LIMITS.md)。

## 7. 本地与隐私

`package.json` 设置 `private:true`，同时提供拒绝发布的钩子；没有云部署步骤，没有自动上传 Git，也没有启用遥测初始化。**本地运行不等于数据不出本机：** 导入内容会上传飞书；模型读取到的文档还可能由你所用模型服务处理。

`.env` 与 `.local` 必须由你自行保护和备份。本地 Token 存储不是操作系统钥匙串，也不宣称加密；POSIX 权限尽量设为目录 700、文件 600，Windows 仍依赖目录 ACL。不要让不可信程序或他人共享该数据目录。

第三方出处与保留要求见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。所有来源与代码接缝均可检查，不因个人使用而删除上游声明。

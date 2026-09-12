# 架构与数据语义

## 单进程源码融合

```text
本地 MCP 客户端
       │ stdio
       ▼
src/main.mjs ─── NativeCatalog ──────────────────────────┐
       │                                               │
       ▼                                               ▼
KnowledgeService                                两套原生工具 handler
   │              │                                    │
   ▼              ▼                                    ▼
FeishuApi      DocsBridge.uploadMarkdown          Docs / Blocks 服务
   │              │                                    │
   └──────────────┴──────────────┬─────────────────────┘
                                ▼
                Docs FeishuService.fusionGetAccessToken
                                │
                           本机 OAuth 存储
                                │
                           飞书 OpenAPI
```

两套原生工具复用同一个 `FeishuService` 实例，不在每次工具调用时构造独立缓存。Block 上游的 Base API 在认证入口调用共享 Token Provider。根入口只连接一个 stdio transport，没有额外 HTTP MCP 服务或第二个 MCP 子进程。

## 源码和依赖边界

`vendor/docs` 安装自己的 Zod 4 / SDK / DI；`vendor/blocks` 安装自己的 Zod 3 / SDK。Docs 桥接导出主 MCP Server 和 Zod 4，Block 桥接传回 Zod 3 的 schema 对象及原有 handler。NativeCatalog 复用上游 schema，负责工具名前缀、功能开关和单应用限制。

`kb_native_call` 使用原有 schema 执行 `parseAsync` 校验，目录查询返回参数摘要。开启 `FUSION_EXPOSE_NATIVE_TOOLS=true` 后，由 SDK 转换并注册完整 schema。

## 同步状态

映射键为 `scope:path`。`scope` 是规范化本地根目录、Wiki 空间、父节点的哈希，不跨目的地混用映射。

```json
{
  "path": "AI/RAG.md",
  "root": "/your/knowledge",
  "scope": "...",
  "documentId": "...",
  "wikiSpaceId": "...",
  "wikiNodeToken": "...",
  "parentNodeToken": "...",
  "contentHash": "sha256...",
  "baseRevisionId": 37,
  "lastObservedRevisionId": 38,
  "remoteEdited": true,
  "history": []
}
```

`contentHash + baseRevisionId` 是上次导入建立的共同基线。通过 Block 计划修改飞书后，只记录远端变化，保留基线用于后续冲突检测。

整篇发布采用 new-version；会改变当前映射对应的 documentId，旧链接不消失但不会自动跟随新版本。旧文档放在 history，内容仍保留在飞书。源文件删除、重命名不会自动删除/搬迁远端，避免目录误删传递到云端。

## 编辑计划

`planned → applying → acknowledged → applied`；写入后发生异常进入 `needs_inspection`。

1. 读取固定 revision 快照，读取结束再次检查文档 revision。
2. 按 ID 定位 Block；校验 expectedText 和格式约束。
3. 保存原始快照与可检查的修改计划。
4. 用户批准后，校验计划未过期、文档 revision 和 Block 内容哈希。
5. 先记录 applying，再发一次写请求。
6. 保存响应后重新读取验证；成功才标记 applied。

重复执行 applied 计划只返回已有结果。写入结果不确定时保留检查点，由用户核对远端状态，不自动回滚或重试；本地与飞书之间没有跨系统事务。

## 章节定位

章节按标题所在的 parent.children 序列定位，从标题后开始，到下一个同级或更高层级标题前结束，包含期间的嵌套标题。对章节内的表格等容器，继续遍历子节点以定位单元格段落。

标题重名时使用 headingBlockId 消歧。文本补丁只修改指定节点，不重建整个章节。

## 并发模型

一个本地数据目录只运行一个 MCP 进程。入站工具和 OAuth 回调串行执行，写服务内部也有串行队列。持久化采用临时文件、fsync、rename，文件损坏不会自动重置为空。

同一数据目录仅支持单机单进程写入，不支持共享盘上的多进程并发使用。

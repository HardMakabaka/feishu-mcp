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

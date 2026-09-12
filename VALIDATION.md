# 初始验证记录 · 2026-09-11

后续构建、集成和账号验证结果见 [验证记录](docs/VALIDATION.md)。

## 已执行

| 检查 | 结果 | 实际含义 |
|---|---|---|
| 根目录离线测试 | **86 / 86 通过；0 失败；0 跳过** | 覆盖新增本地逻辑、模拟 API 合约、源码补丁接缝及本机 OAuth 回调 HTTP |
| JavaScript 语法检查 | **32 / 32 通过** | `node --check` 语法检查 |
| 执行环境 | Node v22.16.0；npm 10.9.2 | 项目运行要求 Node 24.x |
| 上游核对 | 已通过 GitHub 核对固定 commit、关键服务签名、工具注册方式和补丁目标 Blob SHA | 源码版本与接口检查 |

原始结果：[offline-tests.tap](validation/offline-tests.tap)、[syntax-checks.json](validation/syntax-checks.json)、[report.json](validation/report.json)。

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

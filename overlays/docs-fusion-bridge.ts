/** Integration bridge for the pinned mcp-feishu-doc source. No second MCP process. */
import 'reflect-metadata';
import container, { composeContainer } from '@/container/index.js';
import { FeishuServiceToken } from '@/container/tokens.js';
import { FeishuService } from '@/services/feishu/index.js';
import { ToolRegistry } from '@/mcp-server/tools/tool-registration.js';
import { config as upstreamConfig } from '@/config/index.js';
import { FEISHU_CONFIG } from '@/services/feishu/constants.js';
import { logger } from '@/utils/internal/logger.js';
export { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
export { z } from 'zod';

export async function initializeDocs(collector: unknown) {
  // z.coerce.boolean() treats the string 'false' as true; force the runtime
  // flag off rather than relying solely on an environment string.
  upstreamConfig.openTelemetry.enabled = false;
  const extraScopes = (process.env.FUSION_EXTRA_OAUTH_SCOPES || '').split(/[ ,]+/).filter(Boolean);
  if (extraScopes.some(scope => !/^[A-Za-z0-9_.:]+$/.test(scope))) throw new Error('Invalid extra OAuth scope');
  FEISHU_CONFIG.SCOPES = [...new Set([...FEISHU_CONFIG.SCOPES.split(/ +/), ...extraScopes])].join(' ');
  composeContainer();
  await logger.initialize('warning', 'stdio');
  const service = container.resolve<FeishuService>(FeishuServiceToken);
  // Replace the upstream factory registration with a single instance so token
  // caches and refreshes are shared by native document tools and block tools.
  container.register(FeishuServiceToken, { useValue: service });
  await container.resolve(ToolRegistry).registerAll(collector as never);
  return {
    getAccessToken: () => service.fusionGetAccessToken(),
    authUrl: () => service.getAuthUrl(process.env.FEISHU_DEFAULT_APP_ID, process.env.FEISHU_OAUTH_CALLBACK_URL),
    authCallback: (code: string, state: string) => service.handleAuthCallback(code, state, process.env.FEISHU_DEFAULT_APP_ID),
    uploadMarkdown: (document: Parameters<FeishuService['uploadMarkdown']>[0], options: Parameters<FeishuService['uploadMarkdown']>[1]) =>
      service.uploadMarkdown(document, { ...options, ...(process.env.FEISHU_DEFAULT_APP_ID ? { appId: process.env.FEISHU_DEFAULT_APP_ID } : {}) }),
    close: () => logger.close(),
  };
}

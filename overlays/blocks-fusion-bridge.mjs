/** Integration bridge for pinned Feishu-MCP. Uses the source-injected token seam. */
import { ModuleRegistry } from './dist/modules/ModuleRegistry.js';
import { FeishuApiService } from './dist/services/feishuApiService.js';
import { setFusionAccessTokenProvider } from './dist/services/feishu/FeishuBaseApiService.js';
import { Config } from './dist/utils/config.js';
import { z } from 'zod';
export { z };
export function initializeBlocks(collector, tokenProvider, modules = ['document']) {
  setFusionAccessTokenProvider(tokenProvider);
  const config = Config.getInstance();
  config.feishu.authType = 'user';
  const service = FeishuApiService.getInstance();
  for (const module of ModuleRegistry.getEnabledModules(modules, 'user')) module.registerTools(collector, service);
  return { modules: ModuleRegistry.getEnabledModules(modules, 'user').map(m => m.id) };
}

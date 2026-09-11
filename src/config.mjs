import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { existsSync } from 'node:fs';
import { invariant } from './core/errors.mjs';
export const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function readConfig({loadEnv=true}={}) {
  if(loadEnv && existsSync(join(projectRoot,'.env')))process.loadEnvFile(join(projectRoot,'.env'));
  const env=process.env;
  const callback=new URL(env.FEISHU_OAUTH_CALLBACK_URL||'http://localhost:3010/oauth/feishu/callback');
  invariant(callback.protocol==='http:' && ['localhost','127.0.0.1'].includes(callback.hostname) && callback.pathname==='/oauth/feishu/callback' && !callback.search && !callback.hash && !callback.username && !callback.password,
    'INVALID_CALLBACK','OAuth callback must be a local http URL with the exact /oauth/feishu/callback path');
  invariant(callback.port && Number(callback.port)>=1024 && Number(callback.port)<=65535,
    'INVALID_CALLBACK_PORT','Set an explicit local OAuth callback port from 1024 to 65535');
  const appId=env.FEISHU_APP_ID||env.FEISHU_DEFAULT_APP_ID||'';
  const appSecret=env.FEISHU_APP_SECRET||env.FEISHU_DEFAULT_APP_SECRET||'';
  const dataDir=resolve(projectRoot,env.FUSION_DATA_DIR||'.local');
  const root=resolve(projectRoot,env.KNOWLEDGE_ROOT||'examples/knowledge');
  const modules=(env.FUSION_BLOCK_MODULES||'document').split(',').map(x=>x.trim()).filter(Boolean);
  invariant(modules.length>0 && modules.every(m=>['document','task','calendar','member','all'].includes(m)), 'INVALID_MODULES', 'Invalid FUSION_BLOCK_MODULES');
  const maxBytes=Number(env.FUSION_MAX_MARKDOWN_BYTES||10485760),planTtlMinutes=Number(env.FUSION_PLAN_TTL_MINUTES||30);
  invariant(Number.isSafeInteger(maxBytes)&&maxBytes>0&&Number.isFinite(planTtlMinutes)&&planTtlMinutes>0,'INVALID_LIMIT','Invalid size or plan TTL configuration');
  return {projectRoot,root,dataDir,appId,appSecret,callback:callback.toString(),callbackPort:Number(callback.port||80),
    spaceId:env.FEISHU_WIKI_SPACE_ID||'',parentNodeToken:env.FEISHU_WIKI_PARENT_NODE||'',modules,maxBytes,planTtlMinutes,
    allowNativeWrites:env.FUSION_ALLOW_NATIVE_WRITES==='true',allowNativeDestructive:env.FUSION_ALLOW_NATIVE_DESTRUCTIVE==='true',
    exposeNative:env.FUSION_EXPOSE_NATIVE_TOOLS==='true',smoke:env.FUSION_SMOKE_MODE==='true'};
}
export function applyUpstreamEnvironment(config){
  Object.assign(process.env,{
    FEISHU_APP_ID:config.appId,FEISHU_APP_SECRET:config.appSecret,
    FEISHU_DEFAULT_APP_ID:config.appId,FEISHU_DEFAULT_APP_SECRET:config.appSecret,
    FEISHU_OAUTH_CALLBACK_URL:config.callback,FEISHU_AUTH_TYPE:'user',FEISHU_USER_KEY:'local-personal',
    FEISHU_ENABLED_MODULES:config.modules.join(','),
    FEISHU_BASE_URL:'https://open.feishu.cn/open-apis',FEISHU_API_BASE_URL:'https://open.feishu.cn/open-apis',
    FEISHU_MAX_RETRIES:'0',
    MCP_TRANSPORT_TYPE:'stdio',MCP_HTTP_HOST:'127.0.0.1',MCP_AUTH_MODE:'none',
    MCP_LOG_LEVEL:'warning',LOG_LEVEL:'none',LOGS_DIR:join(config.dataDir,'logs'),
    STORAGE_PROVIDER_TYPE:'filesystem',STORAGE_FILESYSTEM_PATH:join(config.dataDir,'oauth'),
    OTEL_ENABLED:'',NO_COLOR:'1',FORCE_COLOR:'0',
    // dotenv 17 supports quiet mode. Some upstream modules log with console;
    // main redirects those calls to stderr before importing the upstreams.
    DOTENV_CONFIG_QUIET:'true'
  });
}

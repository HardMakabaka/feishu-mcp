// Real pinned upstream code, dummy credentials and a mocked HTTP adapter only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {root} from '../../scripts/common.mjs';
import {NativeCatalog} from '../../src/integration/catalog.mjs';

test('the real Markdown processor distinguishes equal-length edits and sibling files',async()=>{
 const require=createRequire(join(root,'vendor/docs/package.json'));require('reflect-metadata');
 const {build}=require('esbuild');
 const output=await build({entryPoints:[join(root,'vendor/docs/src/services/feishu/providers/markdown-processor.provider.ts')],
  bundle:true,write:false,platform:'node',format:'cjs',packages:'external',logLevel:'silent',tsconfig:join(root,'vendor/docs/tsconfig.json')});
 const module={exports:{}};new Function('require','module','exports',output.outputFiles[0].text)(require,module,module.exports);
 const processor=new module.exports.MarkdownProcessorProvider();
 const prefix='# Demo\n\n'+'x'.repeat(120)+'\n\n';const before=prefix+'amount=100',after=prefix+'amount=900';
 const options={removeFrontMatter:true,processImages:false,processAttachments:false};
 const first=processor.process(before,'/audit/knowledge',options);
 const changed=processor.process(after,'/audit/knowledge',options);
 assert.equal(before.length,after.length);assert.equal(before.slice(0,100),after.slice(0,100));
 assert(changed.content.includes('amount=900'),'An equal-length edit must not publish the old cached body');
 assert.notStrictEqual(first,changed);
 assert.strictEqual(processor.process(after,'/audit/knowledge',options),changed,'Identical input still uses the cache');
});

for(const scenario of ['read-401','write-401','missing-auth']){
 test(`shared OAuth never emits a legacy secret-bearing URL: ${scenario}`,async t=>{
  const originalEnv={...process.env},argv=[...process.argv],fetch=globalThis.fetch;
  t.after(()=>{for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
   Object.assign(process.env,originalEnv);process.argv.splice(0,process.argv.length,...argv);globalThis.fetch=fetch;});
  Object.assign(process.env,{FEISHU_APP_ID:'cli_audit_dummy',FEISHU_APP_SECRET:'AUDIT_DUMMY_SECRET_NOT_REAL',
   FEISHU_DEFAULT_APP_ID:'cli_audit_dummy',FEISHU_DEFAULT_APP_SECRET:'AUDIT_DUMMY_SECRET_NOT_REAL',
   FEISHU_AUTH_TYPE:'user',FEISHU_USER_KEY:'audit-only',LOG_LEVEL:'none',DOTENV_CONFIG_QUIET:'true'});
  process.argv.push('--stdio');globalThis.fetch=async()=>{throw new Error('Real HTTP is forbidden in this regression test');};
  const {Config}=await import('../../vendor/blocks/dist/utils/config.js');const oldConfig=Config.instance;
  Config.instance={server:{port:3333},feishu:{appId:'cli_audit_dummy',appSecret:'AUDIT_DUMMY_SECRET_NOT_REAL',
   authType:'user',userKey:'audit-only',requireUserKey:false,baseUrl:'https://open.feishu.cn/open-apis',
   authBaseUrl:'https://accounts.feishu.cn'},features:{enabledModules:['document']}};
  t.after(()=>{Config.instance=oldConfig;});
  const {TokenCacheManager}=await import('../../vendor/blocks/dist/utils/auth/tokenCacheManager.js');
  const getInstance=TokenCacheManager.getInstance;let legacyCacheCalls=0;
  TokenCacheManager.getInstance=()=>{legacyCacheCalls++;return{checkUserTokenStatus:()=>({canRefresh:false,isExpired:true}),removeUserToken:()=>{}};};
  t.after(()=>{TokenCacheManager.getInstance=getInstance;});
  const {default:axios,AxiosError}=await import('../../vendor/blocks/node_modules/axios/index.js');
  const adapter=axios.defaults.adapter;let requests=0;
  axios.defaults.adapter=async config=>{requests++;throw new AxiosError('synthetic expired user token','ERR_BAD_REQUEST',config,{},
   {status:401,statusText:'Unauthorized',headers:{},config,data:{code:99991677,msg:'audit synthetic expired token'}});};
  t.after(()=>{axios.defaults.adapter=adapter;});
  const {AuthRequiredError}=await import('../../vendor/blocks/dist/utils/error.js');
  const {initializeBlocks,z}=await import('../../vendor/blocks/fusion-bridge.mjs');
  const catalog=new NativeCatalog({appId:'cli_audit_dummy',allowWrites:scenario==='write-401'});
  initializeBlocks(catalog.collector('blocks',z),async()=>{
   if(scenario==='missing-auth')throw new AuthRequiredError('user','Audit requires authorization');
   return'AUDIT_DUMMY_TOKEN_NOT_REAL';
  },['document']);
  const write=scenario==='write-401';
  const result=await catalog.call(write?'blocks__create_feishu_document':'blocks__get_feishu_document_info',
   write?{title:'Audit only',folderToken:'AuditFolder123'}:{documentId:'AuditDocument123',documentType:'document'});
  const text=result.content.map(c=>c.text||'').join('\n');
  assert(!text.includes('state='),'No legacy OAuth URL or encoded App Secret may reach the model');
  assert(!text.includes('AUDIT_DUMMY_SECRET_NOT_REAL'));
  assert.match(text,/kb_auth/);assert.equal(legacyCacheCalls,0,'Blocks must not access its independent token cache');
  assert.equal(requests,scenario==='missing-auth'?0:1,'Do not automatically repeat a failed write');
 });
}

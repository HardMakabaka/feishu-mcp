import test from 'node:test';
import assert from 'node:assert/strict';
import {patchSource,gitBlobHash} from '../scripts/patches.mjs';
import {NativeCatalog,isNativeReadOnly,isNativeDestructive} from '../src/integration/catalog.mjs';
import {SerialQueue} from '../src/core/primitives.mjs';
const z={object:shape=>({shape,parse:args=>args,parseAsync:async args=>{for(const key of Object.keys(shape))if(!(key in args))throw new Error('required field missing');return args;}})};

test('docs token seam is injected once and is idempotent',()=>{
 const source='export class FeishuService implements IFeishuService {\n}';const patched=patchSource('docs',source,gitBlobHash(source));
 assert(patched.includes('fusionGetAccessToken'));assert(patched.includes('ensureValidToken'));
 assert.equal(patchSource('docs',patched,gitBlobHash(source)),patched);
});
test('block seam delegates before legacy token and scope logic',()=>{
 const source='export abstract class FeishuBaseApiService extends BaseApiService {\n  protected async getAccessToken(userKey?: string): Promise<string> {\n    LEGACY();\n  }\n}';
 const p=patchSource('blocks',source,gitBlobHash(source));assert(p.indexOf('if (fusionAccessTokenProvider)')<p.indexOf('LEGACY()'));assert(p.includes('setFusionAccessTokenProvider'));
});
test('changed upstream checksum or anchor refuses an automatic patch',()=>{
 assert.throws(()=>patchSource('docs','changed','bad'),/checksum mismatch/);
 assert.throws(()=>patchSource('docs','changed'),/Source contract changed/);
});
test('Markdown cache seam is checksum-guarded and idempotent',()=>{
 const path='src/services/feishu/providers/markdown-processor.provider.ts';
 const source="import { injectable } from 'tsyringe';\n// 使用内容长度和前100字符作为快速哈希\nreturn `${content.length}:${content.substring(0, 100)}:${baseDirectory}:${configStr}`;";
 const patched=patchSource('docs',source,gitBlobHash(source),path);
 assert(patched.includes("createHash('sha256').update(content).digest('hex')"));assert(!patched.includes('content.substring(0, 100)'));
 assert.equal(patchSource('docs',patched,gitBlobHash(source),path),patched);
 assert.throws(()=>patchSource('docs',source+'changed',gitBlobHash(source),path),/checksum mismatch/);
});
test('shared OAuth failure seam guards both legacy authentication branches without deleting them',()=>{
 const path='src/services/baseService.ts';
 const source='export abstract class BaseApiService {\nif (error instanceof AuthRequiredError) { LEGACY_AUTH(); }\nif (error instanceof AxiosError && error.response && tokenError.has(Number(error.response.data?.code))) { LEGACY_CACHE(); }\n}';
 const patched=patchSource('blocks',source,gitBlobHash(source),path);
 assert(patched.includes('let fusionSharedOAuthMode = false;'));assert(patched.includes('setFusionSharedOAuthMode'));
 assert.equal(patched.match(/if \(fusionSharedOAuthMode\) throw new Error\(fusionAuthFailure\)/g).length,2);
 assert(patched.indexOf('throw new Error(fusionAuthFailure)')<patched.indexOf('LEGACY_AUTH()'));
 assert(patched.lastIndexOf('throw new Error(fusionAuthFailure)')<patched.indexOf('LEGACY_CACHE()'));
 assert.equal(patchSource('blocks',patched,gitBlobHash(source),path),patched);
 assert.throws(()=>patchSource('blocks',source+'changed',gitBlobHash(source),path),/checksum mismatch/);
});
test('both upstream tool registration styles share one catalog',async()=>{
 const c=new NativeCatalog();c.collector('docs',z).registerTool('feishu_get_document',{inputSchema:z.object({documentId:{}}),description:'read'},async()=>({ok:true}));
 c.collector('blocks',z).tool('get_feishu_document_blocks','read',{documentId:{}},async()=>({ok:true}));
 assert.equal(c.list().length,2);assert.deepEqual(await c.call('docs__feishu_get_document',{documentId:'a'}),{ok:true});
 assert.deepEqual(await c.call('blocks__get_feishu_document_blocks',{documentId:'a'}),{ok:true});
});
test('native writes are blocked before input validation or handler execution',async()=>{
 const c=new NativeCatalog();let invoked=false;c.collector('blocks',z).tool('delete_feishu_document_blocks','delete',{documentId:{}},async()=>{invoked=true;});
 await assert.rejects(()=>c.call('blocks__delete_feishu_document_blocks',{}),e=>e.code==='NATIVE_WRITES_DISABLED');assert.equal(invoked,false);
});
test('native delete needs a separate destructive opt-in',async()=>{
 const c=new NativeCatalog({allowWrites:true});c.collector('blocks',z).tool('delete_feishu_document_blocks','delete',{},async()=>({}));
 await assert.rejects(()=>c.call('blocks__delete_feishu_document_blocks',{}),e=>e.code==='NATIVE_DESTRUCTIVE_DISABLED');
});
test('original destructive document recreation is correctly classified',()=>{
 assert.equal(isNativeDestructive('feishu_update_document'),true);assert.equal(isNativeReadOnly('feishu_update_document'),false);assert.equal(isNativeReadOnly('feishu_search_documents'),true);
});
test('enabling both native switches permits deliberate native writes',async()=>{
 const c=new NativeCatalog({allowWrites:true,allowDestructive:true});c.collector('blocks',z).tool('delete_feishu_document_blocks','delete',{},async()=>({done:true}));assert.deepEqual(await c.call('blocks__delete_feishu_document_blocks',{}),{done:true});
});
test('single-account instance rejects model-driven credential reconfiguration',async()=>{
 const c=new NativeCatalog({allowWrites:true,allowDestructive:true});c.collector('docs',z).tool('feishu_add_app','config',{},async()=>({}));await assert.rejects(()=>c.call('docs__feishu_add_app',{}),e=>e.code==='NATIVE_ADMIN_DISABLED');
});
test('failed operations do not poison the serial queue',async()=>{
 const q=new SerialQueue();await assert.rejects(()=>q.run(async()=>{throw new Error('fail');}));assert.equal(await q.run(async()=>42),42);
});

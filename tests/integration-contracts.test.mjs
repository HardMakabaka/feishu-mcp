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
test('personal instance rejects model-driven credential reconfiguration',async()=>{
 const c=new NativeCatalog({allowWrites:true,allowDestructive:true});c.collector('docs',z).tool('feishu_add_app','config',{},async()=>({}));await assert.rejects(()=>c.call('docs__feishu_add_app',{}),e=>e.code==='NATIVE_ADMIN_DISABLED');
});
test('failed operations do not poison the serial queue',async()=>{
 const q=new SerialQueue();await assert.rejects(()=>q.run(async()=>{throw new Error('fail');}));assert.equal(await q.run(async()=>42),42);
});

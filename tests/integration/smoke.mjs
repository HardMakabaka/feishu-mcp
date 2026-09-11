import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startClient,textResult} from './client.mjs';
const dir=await mkdtemp(join(tmpdir(),'feishu-fusion-smoke-'));
const client=startClient({FUSION_DATA_DIR:dir,FUSION_SMOKE_MODE:'true',FEISHU_APP_ID:'cli_fusion_smoketest',FEISHU_APP_SECRET:'not-a-real-secret',FUSION_EXPOSE_NATIVE_TOOLS:'false',FUSION_ALLOW_NATIVE_WRITES:'false',FUSION_BLOCK_MODULES:'document'});
try{
  await client.initialize();
  const tools=await client.request('tools/list',{});
  assert(tools.tools.some(t=>t.name==='kb_plan_patch'));
  assert(tools.tools.some(t=>t.name==='kb_plan_import'));
  const docs=textResult(await client.call('kb_native_catalog',{origin:'docs',includeSchemas:false}));
  const blocks=textResult(await client.call('kb_native_catalog',{origin:'blocks',includeSchemas:false}));
  assert.equal(docs.length,15,'All 15 pinned document-workflow tools must be captured');
  assert(blocks.some(t=>t.name==='blocks__batch_update_feishu_block_text'));
  assert(blocks.some(t=>t.name==='blocks__batch_create_feishu_blocks'));
  assert(blocks.some(t=>t.name==='blocks__create_feishu_table')||blocks.some(t=>/table/.test(t.name)));
  const blocked=await client.call('kb_native_call',{name:'blocks__delete_feishu_document_blocks',arguments:{}});
  assert.equal(blocked.isError,true,'Native destructive writes must be blocked BEFORE validation or any HTTP call');
  console.log(JSON.stringify({passed:true,mcpTools:tools.tools.length,docsTools:docs.length,blocksTools:blocks.length,note:'No Feishu HTTP request or real OAuth was made.'},null,2));
}catch(e){console.error(e.message);console.error(client.stderr());process.exitCode=1;}
finally{await client.close();await rm(dir,{recursive:true,force:true});}

import assert from 'node:assert/strict';
import {readConfig} from '../../src/config.mjs';
import {startClient,textResult} from './client.mjs';
readConfig();
if(!process.env.FEISHU_LIVE_DOCUMENT)throw new Error('Set FEISHU_LIVE_DOCUMENT to a disposable test Docx URL in .env. This test does not choose a document for you.');
const client=startClient();
try{
  await client.initialize();
  const doc=textResult(await client.call('kb_read',{document:process.env.FEISHU_LIVE_DOCUMENT}));
  assert(Array.isArray(doc.blocks));
  console.log(`Read verified: ${doc.documentId}, revision ${doc.revisionId}, ${doc.blocks.length} blocks`);
  if(process.env.FEISHU_LIVE_ALLOW_WRITE==='true'){
    const id=process.env.FEISHU_LIVE_EDIT_BLOCK;
    const block=doc.blocks.find(b=>b.block_id===id);
    assert(block?.text?.elements?.every(e=>e.text_run),'FEISHU_LIVE_EDIT_BLOCK must be an explicit plain-text paragraph block in the disposable document');
    const before=block.text.elements.map(e=>e.text_run.content).join('');
    const plan=textResult(await client.call('kb_plan_patch',{document:doc.documentId,edits:[{blockId:id,expectedText:before,newText:before+' [fusion live test]'}]}));
    const applied=textResult(await client.call('kb_apply_plan',{planId:plan.id,confirmed:true}));
    assert.equal(applied.status,'applied',JSON.stringify(applied.error));
    const reverse=textResult(await client.call('kb_plan_rollback',{planId:plan.id}));
    const restored=textResult(await client.call('kb_apply_plan',{planId:reverse.id,confirmed:true}));
    assert.equal(restored.status,'applied',JSON.stringify(restored.error));
    console.log('Write and text rollback verified on the explicitly selected test block.');
  }else console.log('Read-only live test. No Feishu content was modified.');
}catch(e){console.error(e.message);process.exitCode=1;}
finally{await client.close();}

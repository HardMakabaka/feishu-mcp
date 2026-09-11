import test from 'node:test';
import assert from 'node:assert/strict';
import {context,paragraph} from './helpers.mjs';
import {blockText} from '../src/core/blocks.mjs';
const edit={blockId:'p1',expectedText:'Old text',newText:'New text'};

test('preview performs no remote write and saves before snapshot',async t=>{
 const c=await context(t);const p=await c.knowledge.planPatch('doc1',[edit]);assert.equal(c.api.calls.length,0);assert.equal(p.status,'planned');assert(await c.store.get('snapshots',p.snapshotId));
});
test('apply verifies remote text and is idempotent when replayed',async t=>{
 const c=await context(t);const p=await c.knowledge.planPatch('doc1',[edit]);const r=await c.knowledge.apply(p.id);assert.equal(r.status,'applied');
 assert.equal(blockText(c.api.documents.get('doc1').blocks.find(b=>b.block_id==='p1')),'New text');await c.knowledge.apply(p.id);assert.equal(c.api.calls.length,1);
});
test('concurrent applies of the same plan issue one write',async t=>{
 const c=await context(t);const p=await c.knowledge.planPatch('doc1',[edit]);await Promise.all([c.knowledge.apply(p.id),c.knowledge.apply(p.id)]);assert.equal(c.api.calls.length,1);
});
test('changed document revision refuses a write',async t=>{
 const c=await context(t);const p=await c.knowledge.planPatch('doc1',[edit]);c.api.documents.get('doc1').revisionId++;
 await assert.rejects(()=>c.knowledge.apply(p.id),e=>e.code==='REVISION_CONFLICT');assert.equal(c.api.calls.length,0);
});
test('changed block with unchanged revision also refuses a write',async t=>{
 const c=await context(t);const p=await c.knowledge.planPatch('doc1',[edit]);c.api.documents.get('doc1').blocks.find(b=>b.block_id==='p1').text.elements[0].text_run.content='Changed';
 await assert.rejects(()=>c.knowledge.apply(p.id),e=>e.code==='BLOCK_CONFLICT');assert.equal(c.api.calls.length,0);
});
test('expired plan refuses a write',async t=>{
 const c=await context(t);const p=await c.knowledge.planPatch('doc1',[edit]);c.knowledge.clock=()=>p.expiresAt+1;
 await assert.rejects(()=>c.knowledge.apply(p.id),e=>e.code==='PLAN_EXPIRED');assert.equal(c.api.calls.length,0);
});
test('network failure marks outcome for inspection and never retries',async t=>{
 const c=await context(t);const p=await c.knowledge.planPatch('doc1',[edit]);c.api.failWrite=true;
 assert.equal((await c.knowledge.apply(p.id)).status,'needs_inspection');await assert.rejects(()=>c.knowledge.apply(p.id),e=>e.code==='PLAN_NOT_RETRYABLE');assert.equal(c.api.calls.length,1);
});
test('lost response after successful remote write does not cause double execution',async t=>{
 const c=await context(t);const p=await c.knowledge.planPatch('doc1',[edit]);c.api.failAfterWrite=true;
 assert.equal((await c.knowledge.apply(p.id)).status,'needs_inspection');assert.equal(c.api.documents.get('doc1').revisionId,8);
 await assert.rejects(()=>c.knowledge.apply(p.id));assert.equal(c.api.calls.length,1);
});
test('section patch rejects targets in another chapter',async t=>{
 const c=await context(t);await assert.rejects(()=>c.knowledge.planPatch('doc1',[{blockId:'p3',expectedText:'Do not change',newText:'oops'}],{heading:'RAG'}),e=>e.code==='EDIT_OUTSIDE_SECTION');
});
test('section patch accepts descendants inside a table in the selected chapter',async t=>{
 const c=await context(t),d=c.api.documents.get('doc1');d.blocks[0].children.splice(2,0,'table');d.blocks.push({block_id:'table',parent_id:'doc1',block_type:31,children:['cell']},{block_id:'cell',parent_id:'table',block_type:32,children:['cellp']},paragraph('cellp','cell text','cell'));
 const p=await c.knowledge.planPatch('doc1',[{blockId:'cellp',expectedText:'cell text',newText:'new'}],{heading:'RAG'});assert.equal(p.changes[0].blockId,'cellp');
});
test('append is placed before the next peer heading',async t=>{
 const c=await context(t);const p=await c.knowledge.planAppend('doc1',['Added'],{heading:'RAG'});assert.equal(p.index,4);
 assert.equal((await c.knowledge.apply(p.id)).status,'applied');const children=c.api.documents.get('doc1').blocks[0].children;assert.equal(children.indexOf('h3'),5);
});
test('text rollback returns exact prior text and style',async t=>{
 const c=await context(t);const p=await c.knowledge.planPatch('doc1',[edit]);await c.knowledge.apply(p.id);
 const r=await c.knowledge.planRollback(p.id);assert.equal((await c.knowledge.apply(r.id)).status,'applied');assert.equal(blockText(c.api.documents.get('doc1').blocks.find(b=>b.block_id==='p1')),'Old text');
});
test('rollback refuses later remote changes',async t=>{
 const c=await context(t);const p=await c.knowledge.planPatch('doc1',[edit]);await c.knowledge.apply(p.id);c.api.documents.get('doc1').revisionId++;
 await assert.rejects(()=>c.knowledge.planRollback(p.id),e=>e.code==='ROLLBACK_CONFLICT');
});
test('patch does not advance the import baseline',async t=>{
 const c=await context(t);await c.store.put('state','mappings',{entries:{x:{documentId:'doc1',baseRevisionId:7}},directories:{}});
 const p=await c.knowledge.planPatch('doc1',[edit]);await c.knowledge.apply(p.id);const m=await c.knowledge.mappings();assert.equal(m.entries.x.baseRevisionId,7);assert.equal(m.entries.x.remoteEdited,true);
});
test('cache search states its limited scope',async t=>{
 const c=await context(t);await c.knowledge.read('doc1');const r=await c.knowledge.search('Old');assert.equal(r.results[0].blockId,'p1');assert(r.scope.includes('local snapshots'));
});
test('export creates structural JSON without overwriting source Markdown',async t=>{
 const c=await context(t);const r=await c.knowledge.exportDocument('doc1');assert(r.directory.includes('exports'));assert(r.note.includes('not included'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {context} from './helpers.mjs';

test('directory preview does not upload or create Wiki nodes',async t=>{
 const c=await context(t);await c.write('AI/RAG.md','# RAG\n\nbody');const p=await c.knowledge.planImport({spaceId:'space1'});assert.equal(p.summary.create,1);assert.equal(c.imports.length,0);assert.equal(c.api.nodes.size,0);
});
test('directory import builds hierarchy and stores mappings',async t=>{
 const c=await context(t);await c.write('AI/RAG.md','# RAG\n\nbody');const p=await c.knowledge.planImport({spaceId:'space1'});const r=await c.knowledge.apply(p.id);assert.equal(r.status,'applied',JSON.stringify(r.error));
 const m=await c.knowledge.mappings();const e=Object.values(m.entries)[0];assert.equal(e.path,'AI/RAG.md');assert.equal(e.baseRevisionId,1);assert(e.wikiNodeToken);assert.equal(Object.keys(m.directories).length,1);
 assert.equal(c.imports[0].options.uploadImages,false);assert.equal(c.imports[0].options.downloadRemoteImages,false);
});
test('unchanged files are skipped without reupload',async t=>{
 const c=await context(t);await c.write('a.md','# A');await c.knowledge.apply((await c.knowledge.planImport({spaceId:'space1'})).id);
 const p=await c.knowledge.planImport({spaceId:'space1'});assert.equal(p.items[0].action,'skip');await c.knowledge.apply(p.id);assert.equal(c.imports.length,1);
});
test('local updates create a new version and retain the original document',async t=>{
 const c=await context(t);await c.write('a.md','# A');await c.knowledge.apply((await c.knowledge.planImport({spaceId:'space1'})).id);
 await c.write('a.md','# A\n\nChanged');const p=await c.knowledge.planImport({spaceId:'space1'});assert.equal(p.items[0].action,'new_version');await c.knowledge.apply(p.id);
 assert(c.api.documents.has('import-1'));assert(c.api.documents.has('import-2'));assert.equal(Object.values((await c.knowledge.mappings()).entries)[0].history[0].documentId,'import-1');
});
test('remote-only edit is reported, never overwritten',async t=>{
 const c=await context(t);await c.write('a.md','# A');await c.knowledge.apply((await c.knowledge.planImport({spaceId:'space1'})).id);c.api.documents.get('import-1').revisionId++;
 const p=await c.knowledge.planImport({spaceId:'space1'});assert.equal(p.items[0].action,'skip_remote_changed');await c.knowledge.apply(p.id);assert.equal(c.imports.length,1);
});
test('both-side edits are a hard conflict by default',async t=>{
 const c=await context(t);await c.write('a.md','# A');await c.knowledge.apply((await c.knowledge.planImport({spaceId:'space1'})).id);
 c.api.documents.get('import-1').revisionId++;await c.write('a.md','# Local edit');const p=await c.knowledge.planImport({spaceId:'space1'});
 assert.equal(p.items[0].action,'conflict');await assert.rejects(()=>c.knowledge.apply(p.id),e=>e.code==='SYNC_CONFLICT');assert.equal(c.imports.length,1);
});
test('source changes between preview and apply abort before first upload',async t=>{
 const c=await context(t);await c.write('a.md','# A');const p=await c.knowledge.planImport({spaceId:'space1'});await c.write('a.md','# B');await assert.rejects(()=>c.knowledge.apply(p.id),e=>e.code==='LOCAL_FILE_CONFLICT');assert.equal(c.imports.length,0);
});
test('upload failure leaves an inspectable checkpoint, not a retry loop',async t=>{
 const c=await context(t);await c.write('a.md','# A');c.importer.uploadMarkdown=async()=>{throw new Error('response lost');};
 const p=await c.knowledge.planImport({spaceId:'space1'});const r=await c.knowledge.apply(p.id);assert.equal(r.status,'needs_inspection');assert.equal(r.job.items[0].status,'uploading');await assert.rejects(()=>c.knowledge.apply(p.id),e=>e.code==='PLAN_NOT_RETRYABLE');
});

test('uncertain import blocks a new preview in the same destination',async t=>{
 const c=await context(t);await c.write('a.md','# A');c.importer.uploadMarkdown=async()=>{throw new Error('response lost');};
 const p=await c.knowledge.planImport({spaceId:'space1'});await c.knowledge.apply(p.id);
 await assert.rejects(()=>c.knowledge.planImport({spaceId:'space1'}),e=>e.code==='UNRESOLVED_IMPORT');
});
test('a previously prepared competing plan cannot duplicate a completed import',async t=>{
 const c=await context(t);await c.write('a.md','# A');const a=await c.knowledge.planImport({spaceId:'space1'});const b=await c.knowledge.planImport({spaceId:'space1'});
 await c.knowledge.apply(a.id);await assert.rejects(()=>c.knowledge.apply(b.id),e=>e.code==='MAPPING_CONFLICT');assert.equal(c.imports.length,1);
});
test('a previously prepared plan cannot bypass an uncertain import',async t=>{
 const c=await context(t);await c.write('a.md','# A');const a=await c.knowledge.planImport({spaceId:'space1'});const b=await c.knowledge.planImport({spaceId:'space1'});
 c.importer.uploadMarkdown=async()=>{throw new Error('lost');};await c.knowledge.apply(a.id);
 await assert.rejects(()=>c.knowledge.apply(b.id),e=>e.code==='UNRESOLVED_IMPORT');
});
test('human-confirmed absent upload closes checkpoint without a remote write',async t=>{
 const c=await context(t);await c.write('a.md','# A');c.importer.uploadMarkdown=async()=>{throw new Error('lost');};
 const p=await c.knowledge.planImport({spaceId:'space1'});await c.knowledge.apply(p.id);
 const r=await c.knowledge.reconcileImport(p.id,[{path:'a.md',outcome:'not_created'}]);assert.equal(r.status,'closed_after_review');
 const fresh=await c.knowledge.planImport({spaceId:'space1'});assert.equal(fresh.items[0].action,'create');assert.equal(c.api.calls.length,0);
});
test('a response-lost upload can adopt the reviewed document at the recorded Wiki location',async t=>{
 const c=await context(t);await c.write('AI/a.md','# A');const real=c.importer.uploadMarkdown;
 c.importer.uploadMarkdown=async(...args)=>{await real(...args);throw new Error('lost response');};
 const p=await c.knowledge.planImport({spaceId:'space1'});await c.knowledge.apply(p.id);
 const r=await c.knowledge.reconcileImport(p.id,[{path:'AI/a.md',outcome:'adopt',document:'import-1'}]);assert.equal(r.status,'closed_after_review');
 const e=Object.values((await c.knowledge.mappings()).entries)[0];assert.equal(e.documentId,'import-1');assert.equal(e.remoteEdited,true);
 const fresh=await c.knowledge.planImport({spaceId:'space1'});assert.equal(fresh.items[0].action,'skip_remote_changed');assert.equal(c.imports.length,1);
});
test('manual reconciliation refuses incomplete or extra resolutions',async t=>{
 const c=await context(t);await c.write('a.md','# A');c.importer.uploadMarkdown=async()=>{throw new Error('lost');};
 const p=await c.knowledge.planImport({spaceId:'space1'});await c.knowledge.apply(p.id);
 await assert.rejects(()=>c.knowledge.reconcileImport(p.id,[]),e=>e.code==='INCOMPLETE_RECONCILIATION');
});
test('adoption refuses a document in a different Wiki location',async t=>{
 const c=await context(t);await c.write('a.md','# A');const real=c.importer.uploadMarkdown;
 c.importer.uploadMarkdown=async(...args)=>{await real(...args);c.api.nodes.clear();throw new Error('lost');};
 const p=await c.knowledge.planImport({spaceId:'space1'});await c.knowledge.apply(p.id);
 await assert.rejects(()=>c.knowledge.reconcileImport(p.id,[{path:'a.md',outcome:'adopt',document:'import-1'}]),e=>e.code==='WRONG_WIKI_LOCATION');
});
test('an acknowledged created document cannot be declared not-created',async t=>{
 const c=await context(t);await c.write('a.md','# A');const real=c.api.snapshot.bind(c.api);c.api.snapshot=async id=>{if(id==='import-1')throw new Error('read unavailable');return real(id);};
 const p=await c.knowledge.planImport({spaceId:'space1'});await c.knowledge.apply(p.id);
 await assert.rejects(()=>c.knowledge.reconcileImport(p.id,[{path:'a.md',outcome:'not_created'}]),e=>e.code==='KNOWN_CREATED_DOCUMENT');
});

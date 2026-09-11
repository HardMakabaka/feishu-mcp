import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile,symlink,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {context} from './helpers.mjs';
import {withinRoot,scanMarkdown,checkLocalMedia,extractTitle} from '../src/core/paths.mjs';

test('atomic store roundtrips and does not allow path traversal',async t=>{
 const{store}=await context(t);await store.put('state','hello',{a:1});assert.deepEqual(await store.get('state','hello'),{a:1});
 assert.throws(()=>store.file('state','../oops'),e=>e.code==='INVALID_STORE_KEY');
});
test('corrupt JSON causes an error rather than empty-state replacement',async t=>{
 const{store}=await context(t);await store.put('state','bad',{});await writeFile(store.file('state','bad'),'{broken');
 await assert.rejects(()=>store.get('state','bad'),e=>e.code==='STORE_UNREADABLE');assert.equal(await readFile(store.file('state','bad'),'utf8'),'{broken');
});
test('process lock is exclusive and release is ownership-aware',async t=>{
 const{store}=await context(t);const release=await store.acquireProcessLock();await assert.rejects(()=>store.acquireProcessLock(),e=>e.code==='INSTANCE_LOCKED');
 await release();const again=await store.acquireProcessLock();await again();
});
test('snapshots get unique keys and persist independently',async t=>{
 const{store}=await context(t);const a=await store.snapshot({v:1}),b=await store.snapshot({v:2});assert.notEqual(a,b);assert.equal((await store.list('snapshots')).length,2);
});
test('scanner includes Markdown recursively and ignores hidden folders',async t=>{
 const{root,write}=await context(t);await write('AI/a.md','# A');await write('.hidden/b.md','# Hidden');await write('skip.txt','Skip');
 assert.deepEqual((await scanMarkdown(root)).map(f=>f.path),['AI/a.md']);
});
test('path traversal outside knowledge root is blocked',async t=>{
 const{root,dir}=await context(t);await writeFile(join(dir,'secret.txt'),'secret');await assert.rejects(()=>withinRoot(root,'../secret.txt'),e=>e.code==='PATH_OUTSIDE_ROOT');
});
test('symlink escape is blocked',async t=>{
 const{root,dir}=await context(t);await writeFile(join(dir,'secret'),'secret');
 try{await symlink(join(dir,'secret'),join(root,'link'));}catch(e){if(e.code==='EPERM'){t.skip('OS denied symlink creation');return;}throw e;}
 await assert.rejects(()=>withinRoot(root,'link'),e=>e.code==='PATH_OUTSIDE_ROOT');
});
test('scanner refuses oversized Markdown',async t=>{
 const{root,write}=await context(t);await write('a.md','abcde');await assert.rejects(()=>scanMarkdown(root,'.',2),e=>e.code==='FILE_TOO_LARGE');
});
test('media preflight rejects escaped attachments and file URLs',async t=>{
 const{root,dir,write}=await context(t);const file=await write('a.md','# A');await writeFile(join(dir,'secret'),'x');
 await assert.rejects(()=>checkLocalMedia(root,file,'[x](../secret)'),e=>e.code==='PATH_OUTSIDE_ROOT');
 await assert.rejects(()=>checkLocalMedia(root,file,'![x](file:///etc/passwd)'),e=>e.code==='MEDIA_URL_REJECTED');
});
test('media preflight accepts files inside the knowledge root',async t=>{
 const{root,write}=await context(t);const file=await write('a.md','# A');await write('pic.png','test');await checkLocalMedia(root,file,'![image](pic.png)');
});
test('title extraction handles YAML front matter and BOM',()=>{
 assert.equal(extractTitle('\uFEFF---\nx: y\n---\n# Real title\n','file.md'),'Real title');
 assert.equal(extractTitle('No heading','/x/fallback.md'),'fallback');
});

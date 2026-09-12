import test from 'node:test';
import assert from 'node:assert/strict';
import {FeishuApi,parseDocumentRef} from '../src/core/feishu-api.mjs';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const api=fetchImpl=>new FeishuApi({tokenProvider:async()=>'secret-token',fetchImpl,sleepImpl:async()=>{}});

test('document references resolve only Feishu docx/wiki URLs',()=>{
 assert.deepEqual(parseDocumentRef('https://tenant.feishu.cn/wiki/abc?x=y'),{type:'wiki',token:'abc'});
 assert.deepEqual(parseDocumentRef('wiki:abc'),{type:'wiki',token:'abc'});
 assert.throws(()=>parseDocumentRef('https://evil.example/docx/abc'),e=>e.code==='INVALID_DOCUMENT_HOST');
 assert.throws(()=>parseDocumentRef('../abc'),e=>e.code==='INVALID_DOCUMENT_TOKEN');
});
test('GET retries transient HTTP failures with a finite attempt count',async()=>{
 let n=0;const a=api(async()=>++n<3?json({code:1},503):json({code:0,data:{ok:true}}));assert.deepEqual(await a.request('GET','/test'),{ok:true});assert.equal(n,3);
});
test('GET network retries are bounded',async()=>{
 let n=0;const a=api(async()=>{n++;throw new TypeError('network');});await assert.rejects(()=>a.request('GET','/test'),e=>e.code==='NETWORK_ERROR');assert.equal(n,3);
});
test('write network errors are never automatically retried',async()=>{
 let n=0;const a=api(async()=>{n++;throw new TypeError('network');});await assert.rejects(()=>a.request('POST','/test',{body:{x:1}}),e=>e.code==='WRITE_OUTCOME_UNKNOWN');assert.equal(n,1);
});
test('write 429 is not retried',async()=>{
 let n=0;const a=api(async()=>{n++;return json({code:999,msg:'rate limited'},429);});await assert.rejects(()=>a.request('PATCH','/test',{body:{}}),e=>e.code==='FEISHU_API_ERROR');assert.equal(n,1);
});
test('write malformed response is treated as unknown outcome',async()=>{
 const a=api(async()=>new Response('not json'));await assert.rejects(()=>a.request('POST','/test',{body:{}}),e=>e.code==='WRITE_OUTCOME_UNKNOWN');
});
test('Feishu non-zero code fails even when HTTP status is 200',async()=>{
 const a=api(async()=>json({code:123,msg:'permission denied'}));await assert.rejects(()=>a.request('GET','/test'),e=>e.code==='FEISHU_API_ERROR'&&e.details.code===123);
});
test('safe batch patch includes the expected document revision',async()=>{
 let captured;const a=api(async(url,options)=>{captured={url:String(url),options};return json({code:0,data:{document_revision_id:8}});});
 await a.patchText('doc1',7,[{blockId:'b',afterElements:[{text_run:{content:'n'}}]}]);
 assert(captured.url.includes('document_revision_id=7'));assert.equal(captured.options.headers.Authorization,'Bearer secret-token');assert.equal(captured.options.redirect,'error');
 assert.equal(JSON.parse(captured.options.body).requests[0].block_id,'b');
});
test('snapshot fetches all pages at a fixed revision',async()=>{
 const seen=[];const a=api(async url=>{
  seen.push(String(url));if(url.pathname.endsWith('/blocks'))return url.searchParams.get('page_token')?json({code:0,data:{items:[{block_id:'b'}],has_more:false}}):json({code:0,data:{items:[{block_id:'a'}],has_more:true,page_token:'p2'}});
  return json({code:0,data:{document:{document_id:'doc1',title:'t',revision_id:7}}});
 });
 const s=await a.snapshot('doc1');assert.equal(s.blocks.length,2);assert(seen.filter(u=>u.includes('/blocks')).every(u=>u.includes('document_revision_id=7')));
});
test('snapshot rejects a revision change between pages and final metadata read',async()=>{
 let metadata=0;const a=api(async url=>url.pathname.endsWith('/blocks')?json({code:0,data:{items:[],has_more:false}}):json({code:0,data:{document:{document_id:'doc1',revision_id:++metadata===1?7:8}}}));
 await assert.rejects(()=>a.snapshot('doc1'),e=>e.code==='SNAPSHOT_CONFLICT');
});
test('pagination loops are detected',async()=>{
 const a=api(async url=>url.pathname.endsWith('/blocks')?json({code:0,data:{items:[],has_more:true,page_token:'same'}}):json({code:0,data:{document:{document_id:'doc1',revision_id:7}}}));
 await assert.rejects(()=>a.snapshot('doc1'),e=>e.code==='PAGINATION_LOOP');
});
test('missing revision is not silently replaced with -1',async()=>{
 const a=api(async()=>json({code:0,data:{document:{document_id:'doc1'}}}));await assert.rejects(()=>a.meta('doc1'),e=>e.code==='REVISION_UNAVAILABLE');
});
test('Wiki non-docx objects are rejected',async()=>{
 const a=api(async()=>json({code:0,data:{node:{obj_type:'sheet',obj_token:'sheet'}}}));await assert.rejects(()=>a.resolveDocument('wiki:abc'),e=>e.code==='NOT_DOCX');
});
test('request errors do not include the authorization header',async()=>{
 const a=api(async()=>{throw new Error('network');});try{await a.request('POST','/test');}catch(e){assert(!JSON.stringify(e.details).includes('secret-token'));}
});

function visibilityApi(revisions){
 const delays=[],queries=[];let reads=0;
 const a=new FeishuApi({tokenProvider:async()=>'secret-token',sleepImpl:async ms=>{delays.push(ms);},fetchImpl:async(url,options)=>{
  assert.equal(options.method,'GET');queries.push(String(url));
  if(url.pathname.endsWith('/blocks'))return json({code:0,data:{items:[{block_id:'p'}],has_more:false}});
  return json({code:0,data:{document:{document_id:'doc1',revision_id:revisions[Math.min(reads++,revisions.length-1)]}}});
 }});return{a,delays,queries,reads:()=>reads};
}
test('post-write snapshot waits for the acknowledged revision and pins block reads',async()=>{
 const c=visibilityApi([7,7,8,8]);const s=await c.a.snapshot('doc1',{expectedRevision:8});
 assert.equal(s.revisionId,8);assert.deepEqual(c.delays,[200,400]);
 assert(c.queries.filter(q=>q.includes('/blocks')).every(q=>q.includes('document_revision_id=8')));
 assert.equal(s.verification.expectedRevision,8);assert.equal(s.verification.retries,2);
});
test('post-write final metadata can lag without rereading or rewriting blocks',async()=>{
 const c=visibilityApi([8,7,8]);const s=await c.a.snapshot('doc1',{expectedRevision:8});
 assert.equal(s.revisionId,8);assert.equal(c.queries.filter(q=>q.includes('/blocks')).length,1);assert.deepEqual(c.delays,[200]);
});
test('post-write snapshots reject a newer revision before or after reading blocks',async()=>{
 for(const revisions of [[9],[7,9],[8,9]]){
  const c=visibilityApi(revisions);await assert.rejects(()=>c.a.snapshot('doc1',{expectedRevision:8}),e=>e.code==='POST_WRITE_REVISION_CONFLICT'&&e.details.expectedRevision===8&&e.details.observations.at(-1).revisionId===9);
 }
});
test('post-write visibility timeout is bounded and includes observed revisions',async()=>{
 const c=visibilityApi([7]);await assert.rejects(()=>c.a.snapshot('doc1',{expectedRevision:8}),e=>e.code==='WRITE_VISIBILITY_TIMEOUT'&&e.details.retries===4&&e.details.observations.length===5);
 assert.equal(c.reads(),5);assert.deepEqual(c.delays,[200,400,800,1600]);assert(!c.queries.some(q=>q.includes('/blocks')));
});
test('post-write visibility does not retry permission failures',async()=>{
 let calls=0;const a=api(async()=>{calls++;return json({code:999,msg:'permission denied'},403);});
 await assert.rejects(()=>a.snapshot('doc1',{expectedRevision:8}),e=>e.code==='FEISHU_API_ERROR');assert.equal(calls,1);
});

test('visibility budget aborts a slow metadata GET without transport retries',async()=>{
 let calls=0,aborted=false;
 const a=api(async(url,{signal})=>{calls++;return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>resolve(json({code:0,data:{document:{document_id:'doc1',revision_id:7}}})),1000);
  signal.addEventListener('abort',()=>{aborted=true;clearTimeout(timer);reject(signal.reason);},{once:true});
 });});
 await assert.rejects(()=>a.waitForRevision('doc1',8,{remainingMs:25,retries:0,observations:[]},'before_blocks'),e=>e.code==='WRITE_VISIBILITY_TIMEOUT');
 assert.equal(calls,1);assert.equal(aborted,true);
});

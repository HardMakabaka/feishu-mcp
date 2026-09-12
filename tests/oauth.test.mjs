import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createConnection} from 'node:net';
import {once} from 'node:events';
import {startOAuthServer} from '../src/integration/oauth-server.mjs';
async function freePort(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}
function get(port,path,headers={}){return new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port,path,headers},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,text,headers:res.headers}));});req.on('error',reject);req.end();});}
test('OAuth callback passes code/state to the shared service and returns no credentials',async t=>{
 const port=await freePort();let received;const s=await startOAuthServer({port,onCallback:async(code,state)=>{received={code,state};return{success:true};}});t.after(()=>s.close());
 const r=await get(port,'/oauth/feishu/callback?code=privatecode&state=randomstate');assert.equal(r.status,200);assert.deepEqual(received,{code:'privatecode',state:'randomstate'});assert(!r.text.includes('privatecode'));assert.equal(r.headers['cache-control'],'no-store');
});
test('OAuth rejects unexpected Host headers before handling credentials',async t=>{
 const port=await freePort();let called=false;const s=await startOAuthServer({port,onCallback:async()=>{called=true;return{success:true};}});t.after(()=>s.close());
 const r=await get(port,'/oauth/feishu/callback?code=x&state=y',{Host:'attacker.example'});assert.equal(r.status,400);assert.equal(called,false);
});
test('OAuth missing state fails without leaking code',async t=>{
 const port=await freePort();let called=false;const s=await startOAuthServer({port,onCallback:async()=>{called=true;return{success:true};}});t.after(()=>s.close());
 const r=await get(port,'/oauth/feishu/callback?code=secret');assert.equal(r.status,400);assert.equal(called,false);assert(!r.text.includes('secret'));
});
test('OAuth never echoes an upstream error payload',async t=>{
 const port=await freePort();const s=await startOAuthServer({port,onCallback:async()=>{throw new Error('token=VERY_SECRET');}});t.after(()=>s.close());
 const r=await get(port,'/oauth/feishu/callback?code=x&state=y');assert.equal(r.status,400);assert(!r.text.includes('VERY_SECRET'));
});

test('OAuth shutdown closes browser preconnections without an HTTP request',async()=>{
 const port=await freePort();const s=await startOAuthServer({port,onCallback:async()=>({success:true})});
 const socket=createConnection({host:'127.0.0.1',port});let closing,timer;
 try{
  await once(socket,'connect');await new Promise(resolve=>setImmediate(resolve));
  closing=s.close();
  const closed=await Promise.race([closing.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),500);})]);
  assert.equal(closed,true,'Shutdown must not wait for a browser preconnection to disconnect');
 }finally{clearTimeout(timer);socket.destroy();await(closing||s.close());}
});

test('OAuth shutdown lets an active authorization callback finish',async()=>{
 const port=await freePort();const entered=Promise.withResolvers(),finish=Promise.withResolvers();
 const s=await startOAuthServer({port,onCallback:async()=>{entered.resolve();await finish.promise;return{success:true};}});
 const response=get(port,'/oauth/feishu/callback?code=x&state=y',{Connection:'close'});let closing;
 try{
  await entered.promise;let closed=false;closing=s.close().then(()=>{closed=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(closed,false);
  finish.resolve();assert.equal((await response).status,200);await closing;
 }finally{finish.resolve();await response;await(closing||s.close());}
});

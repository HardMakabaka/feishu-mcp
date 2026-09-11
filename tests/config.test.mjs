import test from 'node:test';
import assert from 'node:assert/strict';
import {readConfig,applyUpstreamEnvironment} from '../src/config.mjs';
import {SerialQueue} from '../src/core/primitives.mjs';
function env(t,values){const old={...process.env};t.after(()=>{for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);});Object.assign(process.env,values);}
test('local callback requires an explicit unprivileged port',t=>{
 env(t,{FEISHU_OAUTH_CALLBACK_URL:'http://localhost/oauth/feishu/callback'});
 assert.throws(()=>readConfig({loadEnv:false}),e=>e.code==='INVALID_CALLBACK_PORT');
});
test('a public callback is refused by the local-only configuration',t=>{
 env(t,{FEISHU_OAUTH_CALLBACK_URL:'http://example.com:3010/oauth/feishu/callback'});
 assert.throws(()=>readConfig({loadEnv:false}),e=>e.code==='INVALID_CALLBACK');
});
test('upstream environment is local, single-app, no generic retries or telemetry truthy string',t=>{
 env(t,{FEISHU_OAUTH_CALLBACK_URL:'http://localhost:3010/oauth/feishu/callback',FEISHU_APP_ID:'cli_test',FEISHU_APP_SECRET:'local-test-secret'});
 const c=readConfig({loadEnv:false});applyUpstreamEnvironment(c);
 assert.equal(process.env.FEISHU_DEFAULT_APP_ID,'cli_test');assert.equal(process.env.MCP_TRANSPORT_TYPE,'stdio');
 assert.equal(Boolean(process.env.OTEL_ENABLED),false);assert.equal(process.env.FEISHU_MAX_RETRIES,'0');
 assert.equal(process.env.FEISHU_API_BASE_URL,'https://open.feishu.cn/open-apis');
 assert(process.env.STORAGE_FILESYSTEM_PATH.startsWith(c.dataDir));
});
test('invalid module names fail before loading upstreams',t=>{
 env(t,{FEISHU_OAUTH_CALLBACK_URL:'http://localhost:3010/oauth/feishu/callback',FUSION_BLOCK_MODULES:'document,unknown'});
 assert.throws(()=>readConfig({loadEnv:false}),e=>e.code==='INVALID_MODULES');
});
test('queue drain waits for in-flight work to persist before releasing a process lock',async()=>{
 const q=new SerialQueue();let release;let complete=false;
 q.run(()=>new Promise(resolve=>{release=()=>{complete=true;resolve();};}));
 await Promise.resolve();const drained=q.drain();assert.equal(complete,false);release();await drained;assert.equal(complete,true);
});

import { access,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readConfig } from '../src/config.mjs';
import { run } from './common.mjs';
const config=readConfig();
const checks=[];
checks.push({check:'Node.js 24.x',ok:process.versions.node.startsWith('24.'),details:process.version});
try{checks.push({check:'Git',ok:true,details:await run('git',['--version'],config.projectRoot,{capture:true})});}catch{checks.push({check:'Git',ok:false});}
for(const relative of ['vendor/docs/dist-fusion/bridge.js','vendor/blocks/fusion-bridge.mjs']){
  try{await access(join(config.projectRoot,relative));checks.push({check:relative,ok:true});}catch{checks.push({check:relative,ok:false});}
}
checks.push({check:'App ID configured',ok:Boolean(config.appId&&!config.appId.includes('replace'))});
checks.push({check:'App Secret configured',ok:Boolean(config.appSecret&&!config.appSecret.includes('replace'))});
try{await access(config.root);checks.push({check:'Knowledge root',ok:true,details:config.root});}catch{checks.push({check:'Knowledge root',ok:false,details:config.root});}
try{const lock=JSON.parse(await readFile(join(config.dataDir,'server.lock'),'utf8'));checks.push({check:'Single-instance lock',ok:false,details:`Lock exists for PID ${lock.pid}. Stop the other instance, or verify it is stale before manually removing it.`});}catch(e){checks.push({check:'Single-instance lock',ok:e.code==='ENOENT'});}
console.log(JSON.stringify({checks,callback:config.callback,nativeWrites:config.allowNativeWrites,nativeDestructive:config.allowNativeDestructive,note:'Offline checks only. This command does not validate the Feishu account or API permissions.'},null,2));
if(checks.some(c=>!c.ok))process.exitCode=1;

import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {join} from 'node:path';
import {root} from '../../scripts/common.mjs';
export function startClient(env={}){
  const child=spawn(process.execPath,[join(root,'src/main.mjs')],{cwd:root,env:{...process.env,...env},stdio:['pipe','pipe','pipe']});
  let stderr='',counter=0;const pending=new Map();
  child.stderr.on('data',b=>stderr+=b.toString());
  const lines=createInterface({input:child.stdout});
  const fail=e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(e);}pending.clear();};
  lines.on('line',line=>{
    let response;try{response=JSON.parse(line);}catch{fail(new Error(`Non-JSON stdout: ${line}`));return;}
    if(response.id!==undefined){const p=pending.get(response.id);if(p){clearTimeout(p.timer);pending.delete(response.id);response.error?p.reject(new Error(JSON.stringify(response.error))):p.resolve(response.result);}}
  });
  child.on('error',fail);child.on('exit',code=>fail(new Error(`MCP child exited ${code}: ${stderr}`)));
  function request(method,params){
    const id=++counter;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Timeout: ${method}\n${stderr}`));},120000);
      pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
    });
  }
  return {request,call:(name,args={})=>request('tools/call',{name,arguments:args}),
    initialize:async()=>{await request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'fusion-integration-test',version:'0.2.0'}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');},
    close:async()=>{child.stdin.end();await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});},
    stderr:()=>stderr};
}
export function textResult(result){if(result.isError)throw new Error(result.content?.map(c=>c.text).join('\n'));return JSON.parse(result.content.find(c=>c.type==='text').text);}

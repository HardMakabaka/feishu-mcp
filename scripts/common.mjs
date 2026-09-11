import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const npmCommand=process.platform==='win32'?'npm.cmd':'npm';
export async function loadLock(){return JSON.parse(await readFile(join(root,'upstreams.lock.json'),'utf8'));}
export function run(command,args,cwd=root,{capture=false}={}) {
  return new Promise((resolvePromise,reject)=>{
    const child=spawn(command,args,{cwd,stdio:capture?['ignore','pipe','pipe']:'inherit',
      shell:process.platform==='win32' && /\.(cmd|bat)$/i.test(command),windowsHide:true,
      env:{...process.env,HUSKY:'0',NO_COLOR:'1'}});
    let stdout='',stderr='';
    child.stdout?.on('data',chunk=>stdout+=chunk);child.stderr?.on('data',chunk=>stderr+=chunk);
    child.on('error',reject);child.on('exit',(code,signal)=>{
      if(code===0)resolvePromise(stdout.trim());
      else reject(new Error(`${command} ${args.join(' ')} failed (${code ?? signal})${capture?`: ${stderr}`:''}`));
    });
  });
}
export function checkRuntime(){
  const major=Number(process.versions.node.split('.')[0]);
  if(major!==24)throw new Error(`Use Node.js 24.x for the fused upstreams; current runtime is ${process.version}. Offline core tests also run on Node 22.`);
}

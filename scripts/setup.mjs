import { mkdir, readFile, writeFile, copyFile, access, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { root, run, loadLock, npmCommand, checkRuntime } from './common.mjs';
import { patchSource } from './patches.mjs';

async function exists(path){try{await access(path);return true;}catch{return false;}}
async function setup(){
  checkRuntime(); await run('git',['--version']);
  const lock=await loadLock();await mkdir(join(root,'vendor'),{recursive:true});
  await writeFile(join(root,'vendor/validation-report.json'),JSON.stringify({status:'not_verified',startedAt:new Date().toISOString()}));
  await writeFile(join(root,'vendor/build-report.json'),JSON.stringify({status:'installing',startedAt:new Date().toISOString()}));
  for(const [name,upstream] of Object.entries(lock.upstreams)) {
    const dir=join(root,'vendor',name);
    if(!await exists(join(dir,'.git'))) {
      await mkdir(dir,{recursive:true});
      // A failed prior initialization is resumed; existing files are never erased.
      await run('git',['init'],dir);
      await run('git',['config','core.autocrlf','false'],dir);
      await run('git',['config','core.eol','lf'],dir);
      await run('git',['remote','add','origin',upstream.repository],dir);
    }
    const origin=await run('git',['remote','get-url','origin'],dir,{capture:true});
    if(origin!==upstream.repository)throw new Error(`Unexpected Git origin in ${dir}; refusing to overwrite.`);
    let head='';try{head=await run('git',['rev-parse','HEAD'],dir,{capture:true});}catch{}
    if(head && head!==upstream.commit)throw new Error(`${dir} is on another commit. Back up your edits and resolve it manually; setup will not reset a repository.`);
    if(!head) {
      await run('git',['-c','core.autocrlf=false','fetch','--depth=1','origin',upstream.commit],dir);
      await run('git',['-c','core.autocrlf=false','checkout','--detach','FETCH_HEAD'],dir);
    }
    for(const [relative,blob]of Object.entries(upstream.patchTargets)) {
      const file=join(dir,relative);const original=await readFile(file,'utf8');
      await writeFile(file,patchSource(name,original,blob,relative),'utf8');
    }
    const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));
    if(pkg.version!==upstream.version)throw new Error(`Unexpected upstream version in ${name}`);
    // Avoid upstream prepare hooks (which assume pnpm). Execute only explicit builds.
    const hasLock=await exists(join(dir,'package-lock.json'));
    await run(npmCommand,[hasLock?'ci':'install','--ignore-scripts','--no-audit','--no-fund'],dir);
    if(name==='docs') await run(npmCommand,['rebuild','esbuild','--ignore-scripts=false'],dir);
  }
  if(!await exists(join(root,'.env')))await copyFile(join(root,'.env.example'),join(root,'.env'));
  if(process.platform!=='win32')await chmod(join(root,'.env'),0o600);
  await run(process.execPath,['scripts/build.mjs']);
  await run(process.execPath,['scripts/test.mjs']);
  await run(process.execPath,['--test','tests/integration/upstream-regressions.test.mjs']);
  await run(process.execPath,['tests/integration/smoke.mjs']);
  await writeFile(join(root,'vendor/validation-report.json'),JSON.stringify({status:'passed',verifiedAt:new Date().toISOString(),node:process.version,build:true,offlineTests:true,mcpSmoke:true,liveFeishu:false},null,2));
  console.error('\nSource integration installed. Edit .env, then run: npm run auth');
}
setup().catch(e=>{console.error(`SETUP FAILED: ${e.message}\nSetup did not finish. See vendor/build-report.json for the build stage; a build record alone does not mean the MCP smoke test passed. Fix the error and rerun setup.`);process.exitCode=1;});

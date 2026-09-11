import { copyFile, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root,run,loadLock,checkRuntime } from './common.mjs';
export async function build(){
  checkRuntime();const lock=await loadLock();
  await mkdir(join(root,'vendor'),{recursive:true});
  await writeFile(join(root,'vendor/build-report.json'),JSON.stringify({status:'building',startedAt:new Date().toISOString()}));
  const docs=join(root,'vendor','docs'),blocks=join(root,'vendor','blocks');
  for(const [name,upstream] of Object.entries(lock.upstreams)) {
    const dir=join(root,'vendor',name);
    const head=await run('git',['rev-parse','HEAD'],dir,{capture:true});
    if(head!==upstream.commit)throw new Error(`${name} source commit does not match upstreams.lock.json`);
    for(const relative of Object.keys(upstream.patchTargets)) {
      if(!(await readFile(join(dir,relative),'utf8')).includes('FUSION_SOURCE_SEAM_V1'))throw new Error(`Run setup first: ${name} token seam is missing`);
    }
  }
  await copyFile(join(root,'overlays/docs-fusion-bridge.ts'),join(docs,'src/fusion-bridge.ts'));
  await mkdir(join(docs,'.fusion'),{recursive:true});
  await writeFile(join(docs,'.fusion/build.mjs'),`import {build} from 'tsup';\nawait build({config:false,entry:{bridge:'src/fusion-bridge.ts'},format:['esm'],target:'node24',platform:'node',outDir:'dist-fusion',clean:true,dts:false,splitting:false,sourcemap:true,shims:true,tsconfig:'tsconfig.json',external:['pino','pino-pretty']});\n`);
  // Check actual source, not just whether a bundler emitted JavaScript.
  await run(process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],docs);
  await run(process.execPath,['.fusion/build.mjs'],docs);
  await run(process.execPath,['node_modules/typescript/bin/tsc'],blocks);
  await run(process.execPath,['node_modules/tsc-alias/dist/bin/index.js'],blocks);
  await copyFile(join(root,'overlays/blocks-fusion-bridge.mjs'),join(blocks,'fusion-bridge.mjs'));
  await writeFile(join(root,'vendor/build-report.json'),JSON.stringify({status:'built',builtAt:new Date().toISOString(),node:process.version,upstreams:lock.upstreams},null,2));
  console.error('Both source bridges built. Runtime smoke test is a separate verification step.');
}
build().catch(e=>{console.error(`BUILD FAILED: ${e.message}`);process.exitCode=1;});

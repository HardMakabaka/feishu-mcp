import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {root,run} from './common.mjs';
const files=(await readdir(join(root,'tests'))).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>join('tests',f));
if(!files.length)throw new Error('No tests found');
try{await run(process.execPath,['--test',...files]);}catch{process.exitCode=1;}

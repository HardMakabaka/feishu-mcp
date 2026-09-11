import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { root } from './common.mjs';
const config={mcpServers:{'feishu-knowledge-private':{command:process.execPath,args:[join(root,'src/main.mjs')]}}};
const file=join(root,'client-config.generated.json');
await writeFile(file,JSON.stringify(config,null,2)+'\n');
console.log(file);
console.log('Import this snippet into a client that supports mcpServers JSON. Credentials remain in this project’s .env.');

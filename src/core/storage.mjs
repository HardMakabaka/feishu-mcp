import { mkdir, open, readFile, rename, readdir, rm, stat, chmod } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { invariant, FusionError } from './errors.mjs';

export async function atomicJSON(file, data) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temp, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await handle.sync();
    await handle.close(); handle = undefined;
    await rename(temp, file);
  } finally {
    await handle?.close();
    await rm(temp, { force: true });
  }
}

export class LocalStore {
  constructor(root) { this.root = root; }
  file(kind, id) {
    invariant(['plans','snapshots','jobs','state','exports'].includes(kind), 'INVALID_STORE_KIND', 'Invalid store kind');
    invariant(/^[a-zA-Z0-9_-]{1,180}$/.test(id), 'INVALID_STORE_KEY', 'Invalid store key');
    return join(this.root, kind, `${id}.json`);
  }
  async put(kind, id, value) { await atomicJSON(this.file(kind, id), value); return value; }
  async get(kind, id, fallback = null) {
    try { return JSON.parse(await readFile(this.file(kind, id), 'utf8')); }
    catch (e) {
      if (e.code === 'ENOENT') return fallback;
      throw new FusionError('STORE_UNREADABLE', `Cannot read ${kind}/${id}; data was not replaced.`, { cause: e.message });
    }
  }
  async list(kind) {
    let names;
    try { names = await readdir(join(this.root, kind)); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    const result = [];
    for (const name of names.filter(n => n.endsWith('.json')).sort()) result.push(await this.get(kind, name.slice(0, -5)));
    return result;
  }
  async snapshot(snapshot, label = 'before') {
    const id = `${Date.now()}-${label}-${randomUUID()}`;
    await this.put('snapshots', id, snapshot);
    return id;
  }
  async acquireProcessLock() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if(process.platform!=='win32')await chmod(this.root,0o700);
    const file = join(this.root, 'server.lock');
    const nonce = randomUUID();
    try {
      const handle = await open(file, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), nonce, createdAt: new Date().toISOString() }));
      await handle.close();
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      let owner;
      try { owner = JSON.parse(await readFile(file, 'utf8')); } catch { owner = {}; }
      throw new FusionError('INSTANCE_LOCKED', 'This data directory already has a server.lock. Stop the other instance first. If it crashed, inspect and remove the stale lock manually.', { file, pid: owner.pid, host: owner.host });
    }
    return async () => {
      try {
        const owner = JSON.parse(await readFile(file, 'utf8'));
        if (owner.nonce === nonce) await rm(file);
      } catch (e) { if (e.code !== 'ENOENT') throw e; }
    };
  }
}

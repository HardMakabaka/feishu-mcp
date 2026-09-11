import { realpath, lstat, readdir, readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join, extname, dirname } from 'node:path';
import { invariant } from './errors.mjs';
import { hash } from './primitives.mjs';

export async function withinRoot(root, path = '.') {
  const rootReal = await realpath(root);
  const candidate = await realpath(resolve(rootReal, path));
  const rel = relative(rootReal, candidate);
  invariant(rel === '' || (!rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && rel !== '..' && !isAbsolute(rel)),
    'PATH_OUTSIDE_ROOT', 'Path or symlink escapes KNOWLEDGE_ROOT', { path });
  return candidate;
}
export async function scanMarkdown(root, path = '.', maxBytes = 10 * 1024 * 1024) {
  const base = await withinRoot(root, path);
  const entries = [];
  async function visit(file) {
    const info = await lstat(file);
    // Skip symlinks entirely, including links pointing to files under the root.
    if (info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      for (const child of (await readdir(file)).sort()) {
        if (child.startsWith('.') || ['node_modules','vendor'].includes(child)) continue;
        await visit(join(file, child));
      }
    } else if (info.isFile() && ['.md','.markdown'].includes(extname(file).toLowerCase())) {
      invariant(info.size <= maxBytes, 'FILE_TOO_LARGE', 'Markdown file exceeds configured limit', { file, bytes: info.size });
      const content = await readFile(file, 'utf8');
      entries.push({ path: relative(await realpath(root), file).split('\\').join('/'), absolutePath: file,
        content, contentHash: hash(content), title: extractTitle(content, file) });
    }
  }
  await visit(base);
  return entries;
}
export function extractTitle(content, file) {
  const stripped = content.replace(/^\uFEFF/, '').replace(/^---\r?\n[\s\S]*?\r?\n---\s*\r?\n/, '');
  return stripped.match(/^#\s+(.+)$/m)?.[1]?.trim() || file.split(/[\\/]/).at(-1).replace(/\.(md|markdown)$/i, '');
}
export async function checkLocalMedia(root, markdownPath, content) {
  // This is a conservative preflight, not an HTML or Markdown sandbox.
  // Native tools remain trusted-local and bypass this check by design.
  invariant(!/\b(?:file|data):/i.test(content), 'MEDIA_URL_REJECTED', 'file: and data: media are not allowed in directory imports');
  const targets = new Set();
  for (const m of content.matchAll(/!?\[[^\]\n]*\]\(<?([^\s)>]+)>?(?:\s+["'][^\n]*["'])?\)/g)) targets.add(m[1]);
  for (const m of content.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) targets.add(m[1]);
  for (const m of content.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) targets.add(m[1]);
  for (const m of content.matchAll(/^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm)) targets.add(m[1]);
  for (let target of targets) {
    target = target.split('#')[0].split('?')[0];
    if (!target || /^https?:\/\//i.test(target) || /^mailto:/i.test(target)) continue;
    invariant(!/^[a-z][a-z0-9+.-]*:/i.test(target), 'MEDIA_URL_REJECTED', 'Unsupported media scheme', { target });
    try { target = decodeURIComponent(target); } catch { throw new Error('Invalid encoded media path'); }
    await withinRoot(root, resolve(dirname(markdownPath), target));
  }
}

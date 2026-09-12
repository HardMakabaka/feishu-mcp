import { createHash } from 'node:crypto';
export function gitBlobHash(text) {
  const bytes=Buffer.from(text);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
const docsAddition = `
  // FUSION_SOURCE_SEAM_V1: shared OAuth, added by the fusion project.
  private fusionTokenPromise: Promise<string> | null = null;
  public async fusionGetAccessToken(): Promise<string> {
    if (this.fusionTokenPromise) return this.fusionTokenPromise;
    this.fusionTokenPromise = (async () => {
      this.ensureProviders();
      const ctx = this.createContext('fusion.accessToken');
      this.clearCache();
      const appId = FEISHU_CONFIG.DEFAULT_APP_ID || (await this.getDefaultAppId(ctx));
      if (!appId) throw new Error('No Feishu application configured');
      const auth = await this.getAuth(appId, ctx);
      if (!auth) throw new Error('Feishu authorization required. Run kb_auth first.');
      const valid = await this.ensureValidToken(auth, ctx);
      return valid.accessToken;
    })();
    try { return await this.fusionTokenPromise; }
    finally { this.fusionTokenPromise = null; }
  }
`;
const blocksAddition = `
// FUSION_SOURCE_SEAM_V1: token ownership is delegated to the document workflow.
let fusionAccessTokenProvider: (() => Promise<string>) | undefined;
export function setFusionAccessTokenProvider(provider: () => Promise<string>): void {
  fusionAccessTokenProvider = provider;
}

`;
const blocksAuthAddition = `
// FUSION_SOURCE_SEAM_V1: shared OAuth failures must not use the legacy token cache or secret-bearing state.
let fusionSharedOAuthMode = false;
export function setFusionSharedOAuthMode(enabled: boolean): void {
  fusionSharedOAuthMode = enabled;
}
const fusionAuthFailure = 'Shared Feishu authorization failed. Use kb_auth to authorize through the local Docs OAuth callback.';

`;
function replaceExactly(source, marker, replacement) {
  if (source.split(marker).length !== 2) throw new Error(`Source contract changed: expected one occurrence of ${marker}`);
  return source.replace(marker,replacement);
}
export function patchSource(name, source, expectedHash, relativePath) {
  if (source.includes('FUSION_SOURCE_SEAM_V1')) return source;
  if (expectedHash && gitBlobHash(source)!==expectedHash) throw new Error(`Upstream source checksum mismatch (${name}). Refusing to guess a patch.`);
  if(name==='docs' && relativePath==='src/services/feishu/providers/markdown-processor.provider.ts') {
    let result=replaceExactly(source,"import { injectable } from 'tsyringe';",
      "// FUSION_SOURCE_SEAM_V1: cache the complete Markdown input, not its prefix and length.\nimport { createHash } from 'node:crypto';\nimport { injectable } from 'tsyringe';");
    result=replaceExactly(result,'// 使用内容长度和前100字符作为快速哈希','// Use a full-content digest so equal-length edits and sibling files cannot share stale output.');
    return replaceExactly(result,'return `${content.length}:${content.substring(0, 100)}:${baseDirectory}:${configStr}`;',
      "return `${createHash('sha256').update(content).digest('hex')}:${baseDirectory}:${configStr}`;");
  }
  if(name==='blocks' && relativePath==='src/services/baseService.ts') {
    const marker='export abstract class BaseApiService {';
    let result=replaceExactly(source,marker,blocksAuthAddition+marker);
    for(const branch of [
      'if (error instanceof AuthRequiredError) {',
      'if (error instanceof AxiosError && error.response && tokenError.has(Number(error.response.data?.code))) {'
    ])result=replaceExactly(result,branch,branch+'\n        if (fusionSharedOAuthMode) throw new Error(fusionAuthFailure);');
    return result;
  }
  if(name==='docs') {
    const marker='export class FeishuService implements IFeishuService {';
    return replaceExactly(source,marker,marker+docsAddition);
  }
  if(name==='blocks') {
    let result=replaceExactly(source,'export abstract class FeishuBaseApiService extends BaseApiService {',
      blocksAddition+'export abstract class FeishuBaseApiService extends BaseApiService {');
    const marker='  protected async getAccessToken(userKey?: string): Promise<string> {';
    return replaceExactly(result,marker,marker+'\n    if (fusionAccessTokenProvider) return fusionAccessTokenProvider();');
  }
  throw new Error(`Unknown upstream ${name}`);
}

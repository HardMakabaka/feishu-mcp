import { createHash } from 'node:crypto';
export function gitBlobHash(text) {
  const bytes=Buffer.from(text);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}
const docsAddition = `
  // FUSION_SOURCE_SEAM_V1: shared personal OAuth, added by the local fusion project.
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
function replaceExactly(source, marker, replacement) {
  if (source.split(marker).length !== 2) throw new Error(`Source contract changed: expected one occurrence of ${marker}`);
  return source.replace(marker,replacement);
}
export function patchSource(name, source, expectedHash) {
  if (source.includes('FUSION_SOURCE_SEAM_V1')) return source;
  if (expectedHash && gitBlobHash(source)!==expectedHash) throw new Error(`Upstream source checksum mismatch (${name}). Refusing to guess a patch.`);
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

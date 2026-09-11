import { FusionError, invariant } from './errors.mjs';
import { sleep } from './primitives.mjs';

const API_BASE = 'https://open.feishu.cn/open-apis';
export function parseDocumentRef(input) {
  invariant(typeof input === 'string' && input.length > 0 && input.length < 2048, 'INVALID_DOCUMENT', 'Provide a document ID, wiki:token, or Feishu document URL');
  if (/^https:\/\//.test(input)) {
    const url = new URL(input);
    invariant(url.hostname === 'feishu.cn' || url.hostname.endsWith('.feishu.cn'), 'INVALID_DOCUMENT_HOST', 'Only Feishu document URLs are supported by this integration');
    const m = url.pathname.match(/^\/(docx|wiki)\/([A-Za-z0-9_-]+)(?:\/|$)/);
    invariant(m, 'UNSUPPORTED_DOCUMENT_URL', 'Only /docx/ and /wiki/ URLs are supported');
    return { type: m[1], token: m[2] };
  }
  const wiki = input.startsWith('wiki:');
  const token = wiki ? input.slice(5) : input;
  invariant(/^[A-Za-z0-9_-]{1,160}$/.test(token), 'INVALID_DOCUMENT_TOKEN', 'Invalid document token');
  return { type: wiki ? 'wiki' : 'docx', token };
}

export class FeishuApi {
  constructor({ tokenProvider, fetchImpl = globalThis.fetch, timeoutMs = 30000, sleepImpl = sleep }) {
    this.tokenProvider = tokenProvider; this.fetch = fetchImpl; this.timeoutMs = timeoutMs; this.sleep = sleepImpl;
  }
  async request(method, path, { query = {}, body } = {}) {
    invariant(path.startsWith('/') && !path.startsWith('//') && !path.includes('..'), 'INVALID_API_PATH', 'Invalid API path');
    const url = new URL(API_BASE + path);
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    const readOnly = method === 'GET';
    for (let attempt = 0; ; attempt++) {
      const token = await this.tokenProvider();
      let response;
      try {
        response = await this.fetch(url, {
          method, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
          headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        });
      } catch (e) {
        if (readOnly && attempt < 2) { await this.sleep(300 * 2 ** attempt); continue; }
        throw new FusionError(readOnly ? 'NETWORK_ERROR' : 'WRITE_OUTCOME_UNKNOWN',
          readOnly ? 'Feishu request failed' : 'The write may have reached Feishu. Inspect the document before retrying.', { method, path, cause: e.name });
      }
      if (readOnly && (response.status === 429 || response.status >= 500) && attempt < 2) {
        await this.sleep(Math.min(5000, Number(response.headers.get('retry-after') || 0) * 1000 || 500 * 2 ** attempt)); continue;
      }
      let json;
      try { json = await response.json(); } catch {
        throw new FusionError(readOnly ? 'INVALID_API_RESPONSE' : 'WRITE_OUTCOME_UNKNOWN', 'Feishu returned a non-JSON response', { method, path, status: response.status });
      }
      if (!response.ok || json.code !== 0) {
        // No automatic retry for any write, including rate limits and token expiry.
        throw new FusionError('FEISHU_API_ERROR', String(json.msg || `HTTP ${response.status}`).slice(0, 500),
          { method, path, status: response.status, code: json.code, logId: response.headers.get('x-tt-logid') });
      }
      return json.data ?? {};
    }
  }
  async resolveDocument(input) {
    const ref = parseDocumentRef(input);
    if (ref.type === 'docx') return { documentId: ref.token };
    const data = await this.request('GET', '/wiki/v2/spaces/get_node', { query: { token: ref.token } });
    invariant(data.node?.obj_type === 'docx', 'NOT_DOCX', 'The Wiki node is not a Docx document');
    invariant(data.node.obj_token, 'INVALID_API_RESPONSE', 'Wiki node has no document token');
    return { documentId: data.node.obj_token, wikiNodeToken: ref.token, wikiSpaceId: data.node.space_id };
  }
  async meta(documentId) {
    const data = await this.request('GET', `/docx/v1/documents/${encodeURIComponent(documentId)}`);
    const doc = data.document;
    const revision = Number(doc?.revision_id);
    invariant(doc && Number.isSafeInteger(revision) && revision >= 0, 'REVISION_UNAVAILABLE', 'Feishu did not return a valid revision; refusing an unguarded edit');
    return { documentId: doc.document_id || documentId, title: doc.title || '', revisionId: revision };
  }
  async snapshot(input) {
    const resolved = await this.resolveDocument(input);
    const meta = await this.meta(resolved.documentId);
    const blocks = []; let pageToken; const seen = new Set();
    do {
      const data = await this.request('GET', `/docx/v1/documents/${encodeURIComponent(resolved.documentId)}/blocks`, {
        query: { page_size: 500, page_token: pageToken, document_revision_id: meta.revisionId }
      });
      invariant(Array.isArray(data.items), 'INVALID_API_RESPONSE', 'Document blocks response has no items array');
      blocks.push(...data.items);
      invariant(blocks.length <= 100000, 'DOCUMENT_TOO_LARGE', 'Document exceeded the local snapshot limit');
      if (!data.has_more) break;
      invariant(data.page_token && !seen.has(data.page_token), 'PAGINATION_LOOP', 'Feishu pagination did not advance');
      seen.add(data.page_token); pageToken = data.page_token;
    } while (true);
    const after = await this.meta(resolved.documentId);
    invariant(after.revisionId === meta.revisionId, 'SNAPSHOT_CONFLICT', 'Document changed while being read. Read it again.');
    return { ...resolved, ...meta, blocks, fetchedAt: new Date().toISOString() };
  }
  async patchText(documentId, revisionId, edits) {
    return this.request('PATCH', `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/batch_update`, {
      query: { document_revision_id: revisionId },
      body: { requests: edits.map(e => ({ block_id: e.blockId, update_text_elements: { elements: e.afterElements } })) }
    });
  }
  async insertParagraphs(documentId, revisionId, parentId, index, paragraphs) {
    return this.request('POST', `/docx/v1/documents/${encodeURIComponent(documentId)}/blocks/${encodeURIComponent(parentId)}/children`, {
      query: { document_revision_id: revisionId },
      body: { index, children: paragraphs.map(content => ({ block_type: 2, text: { elements: [{ text_run: { content } }] } })) }
    });
  }
  async listWikis() {
    const items = []; let pageToken; const seen = new Set();
    do {
      const data = await this.request('GET', '/wiki/v2/spaces', { query: { page_size: 50, page_token: pageToken } });
      items.push(...(data.items || []));
      if (!data.has_more) break;
      invariant(data.page_token && !seen.has(data.page_token), 'PAGINATION_LOOP', 'Wiki pagination did not advance');
      seen.add(data.page_token); pageToken = data.page_token;
    } while (true);
    return items;
  }
  async listWikiNodes(spaceId, parentNodeToken) {
    const items = []; let pageToken; const seen = new Set();
    do {
      const data = await this.request('GET', `/wiki/v2/spaces/${encodeURIComponent(spaceId)}/nodes`, {
        query: { parent_node_token: parentNodeToken, page_size: 50, page_token: pageToken }
      });
      items.push(...(data.items || []));
      if (!data.has_more) break;
      invariant(data.page_token && !seen.has(data.page_token), 'PAGINATION_LOOP', 'Wiki nodes pagination did not advance');
      seen.add(data.page_token); pageToken = data.page_token;
    } while (true);
    return items;
  }
  async createWikiNode(spaceId, parentNodeToken, title) {
    const data = await this.request('POST', `/wiki/v2/spaces/${encodeURIComponent(spaceId)}/nodes`, {
      body: { obj_type: 'docx', node_type: 'origin', title, ...(parentNodeToken ? { parent_node_token: parentNodeToken } : {}) }
    });
    invariant(data.node?.node_token, 'WRITE_OUTCOME_UNKNOWN', 'Wiki node creation returned no node token; do not create it again blindly');
    return data.node;
  }
}

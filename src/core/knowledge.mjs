import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, basename, resolve } from 'node:path';
import { invariant, errorResult } from './errors.mjs';
import { clone, hash, SerialQueue } from './primitives.mjs';
import { outline, sectionRange, prepareTextEdits, blockText, asPlainMarkdown } from './blocks.mjs';
import { scanMarkdown, withinRoot, checkLocalMedia } from './paths.mjs';

export class KnowledgeService {
  constructor({ api, importer, store, root, maxBytes = 10485760, planTtlMinutes = 30, clock = () => Date.now() }) {
    Object.assign(this, { api, importer, store, root, maxBytes, planTtlMinutes, clock });
    this.writeQueue = new SerialQueue();
  }
  async mappings() { return await this.store.get('state', 'mappings', { schemaVersion: 1, entries: {}, directories: {} }); }
  async read(document, { includeBlocks = true } = {}) {
    const snapshot = await this.api.snapshot(document);
    await this.store.put('state', `cache-${hash(snapshot.documentId).slice(0,24)}`, snapshot);
    return { ...snapshot, ...(includeBlocks ? {} : { blocks: undefined }), outline: outline(snapshot.blocks) };
  }
  async search(query, limit = 20) {
    invariant(typeof query === 'string' && query.trim(), 'EMPTY_QUERY', 'Search query cannot be empty');
    invariant(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'INVALID_LIMIT', 'limit must be 1–100');
    const q = query.toLocaleLowerCase(); const results = [];
    const cache = await this.store.list('state');
    for (const item of cache) {
      if (!item?.documentId || !Array.isArray(item.blocks)) continue;
      const titleMatch = item.title.toLocaleLowerCase().includes(q);
      for (const b of item.blocks) {
        const text = blockText(b); const i = text.toLocaleLowerCase().indexOf(q);
        if (i >= 0) results.push({ documentId: item.documentId, title: item.title, blockId: b.block_id, revisionId: item.revisionId,
          snippet: text.slice(Math.max(0,i-60),i+240), score: titleMatch ? 2 : 1, cachedAt: item.fetchedAt });
      }
      if (titleMatch && !results.some(r => r.documentId === item.documentId)) results.push({ documentId: item.documentId, title: item.title, score: 1, cachedAt: item.fetchedAt });
    }
    return { scope: 'local snapshots only; not a complete Feishu search', query,
      results: results.sort((a,b) => b.score-a.score).slice(0,limit) };
  }
  async persistPlan(plan) {
    const id = randomUUID();
    const full = { id, version: 1, status: 'planned', createdAt: this.clock(), expiresAt: this.clock() + this.planTtlMinutes * 60000, ...plan };
    await this.store.put('plans', id, full);
    return full;
  }
  async planPatch(document, edits, section) {
    const snapshot = await this.api.snapshot(document);
    if (section) {
      const range = sectionRange(snapshot.blocks, section);
      const byId = new Map(snapshot.blocks.map(b=>[b.block_id,b])); const allowed = new Set();
      function walk(id) { if (allowed.has(id)) return; allowed.add(id); for (const child of byId.get(id)?.children || []) walk(child); }
      for (const id of range.bodyIds) walk(id);
      invariant(edits.every(e => allowed.has(e.blockId)), 'EDIT_OUTSIDE_SECTION', 'One or more edits fall outside the selected section');
    }
    const changes = prepareTextEdits(snapshot, edits);
    const snapshotId = await this.store.snapshot(snapshot);
    return this.persistPlan({ type: 'text_patch', documentId: snapshot.documentId, title: snapshot.title,
      revisionId: snapshot.revisionId, snapshotId, changes,
      preview: changes.map(e => ({ blockId: e.blockId, before: e.beforeText, after: e.afterText, styleLoss: e.styleLoss })) });
  }
  async planAppend(document, paragraphs, section) {
    invariant(Array.isArray(paragraphs) && paragraphs.length > 0 && paragraphs.length <= 50 && paragraphs.every(p=>typeof p==='string' && p.length<=50000),
      'INVALID_PARAGRAPHS', 'Provide 1–50 plain-text paragraphs, each at most 50,000 characters');
    const snapshot = await this.api.snapshot(document);
    let parentId, index;
    if (section) { const range = sectionRange(snapshot.blocks, section); parentId = range.parentId; index = range.end; }
    else {
      const root = snapshot.blocks.find(b=>b.block_type===1);
      invariant(root, 'DOCUMENT_ROOT_MISSING', 'Document has no page block');
      parentId = root.block_id; index = (root.children || []).length;
    }
    return this.persistPlan({ type:'append', documentId:snapshot.documentId, title:snapshot.title, revisionId:snapshot.revisionId,
      snapshotId:await this.store.snapshot(snapshot), parentId, index, paragraphs, preview:{parentId,index,paragraphs} });
  }
  async planRollback(planId) {
    const original = await this.store.get('plans', planId);
    invariant(original?.type==='text_patch' && original.status==='applied', 'NOT_REVERSIBLE', 'Only verified text patches can be rolled back automatically');
    const snapshot = await this.api.snapshot(original.documentId);
    invariant(snapshot.revisionId===original.appliedRevisionId, 'ROLLBACK_CONFLICT', 'Document changed after the patch; automatic rollback is refused');
    const byId = new Map(snapshot.blocks.map(b=>[b.block_id,b]));
    const changes = original.changes.map(e=> {
      const current=byId.get(e.blockId); invariant(current, 'BLOCK_MISSING', 'A patched block no longer exists');
      invariant(blockText(current)===e.afterText, 'ROLLBACK_CONFLICT', 'A patched block no longer matches the applied text');
      return { blockId:e.blockId, beforeHash:hash(current), beforeText:e.afterText, afterText:e.beforeText,
        beforeElements:clone(e.afterElements), afterElements:clone(e.beforeElements), styleLoss:false };
    });
    return this.persistPlan({type:'text_patch', documentId:snapshot.documentId, title:snapshot.title, revisionId:snapshot.revisionId,
      snapshotId:await this.store.snapshot(snapshot,'rollback'), changes, rollbackOf:planId,
      preview:changes.map(e=>({blockId:e.blockId,before:e.beforeText,after:e.afterText}))});
  }
  async apply(planId) { return this.writeQueue.run(()=>this.#apply(planId)); }
  async #apply(planId) {
    const plan=await this.store.get('plans',planId);
    invariant(plan, 'PLAN_NOT_FOUND', 'Plan not found');
    if (plan.status==='applied') return plan;
    invariant(plan.status==='planned', 'PLAN_NOT_RETRYABLE', 'Plan has already started or failed. Inspect it and the remote document; it will not be automatically repeated.', {status:plan.status});
    invariant(plan.expiresAt>=this.clock(), 'PLAN_EXPIRED', 'Plan expired. Read the document and prepare a fresh plan');
    if(plan.type==='directory_import') return this.#applyImport(plan);
    const current=await this.api.snapshot(plan.documentId);
    invariant(current.revisionId===plan.revisionId, 'REVISION_CONFLICT', 'Document changed after the preview. No write was sent.', {expected:plan.revisionId,actual:current.revisionId});
    if(plan.type==='text_patch') {
      const byId=new Map(current.blocks.map(b=>[b.block_id,b]));
      invariant(plan.changes.every(e=>hash(byId.get(e.blockId) ?? null)===e.beforeHash), 'BLOCK_CONFLICT', 'Block contents changed; no write was sent');
    }
    plan.status='applying'; plan.startedAt=this.clock();
    await this.store.put('plans',plan.id,plan);
    try {
      const result=plan.type==='text_patch'
        ? await this.api.patchText(plan.documentId,plan.revisionId,plan.changes)
        : await this.api.insertParagraphs(plan.documentId,plan.revisionId,plan.parentId,plan.index,plan.paragraphs);
      plan.apiResult=result;
      // Save the acknowledgement before the verification read.
      plan.status='acknowledged'; await this.store.put('plans',plan.id,plan);
      const after=await this.api.snapshot(plan.documentId);
      if(plan.type==='text_patch') {
        const byId=new Map(after.blocks.map(b=>[b.block_id,b]));
        invariant(plan.changes.every(e=>blockText(byId.get(e.blockId)||{})===e.afterText), 'POST_WRITE_MISMATCH', 'Feishu acknowledged the request but the verification text differs');
      } else {
        const children=result.children;
        invariant(Array.isArray(children) && children.length===plan.paragraphs.length, 'POST_WRITE_MISMATCH', 'Insertion response did not identify every created block');
        const byId=new Map(after.blocks.map(b=>[b.block_id,b]));
        invariant(children.every((b,i)=>blockText(byId.get(b.block_id)||{})===plan.paragraphs[i]), 'POST_WRITE_MISMATCH', 'Inserted blocks could not be verified');
        plan.createdBlockIds=children.map(b=>b.block_id);
      }
      plan.status='applied'; plan.appliedRevisionId=after.revisionId; plan.finishedAt=this.clock();
      plan.afterSnapshotId=await this.store.snapshot(after,'after');
      await this.store.put('state',`cache-${hash(after.documentId).slice(0,24)}`,after);
      const mappings=await this.mappings();
      for(const entry of Object.values(mappings.entries)) if(entry.documentId===plan.documentId) {
        entry.remoteEdited=true; entry.lastObservedRevisionId=after.revisionId;
        // Do NOT advance the import baseline: a later push must notice remote edits.
      }
      await this.store.put('state','mappings',mappings);
      await this.store.put('plans',plan.id,plan); return plan;
    } catch(e) {
      plan.status='needs_inspection'; plan.error=errorResult(e);
      await this.store.put('plans',plan.id,plan); return plan;
    }
  }
  async planImport({path='.',spaceId,parentNodeToken='',uploadMedia=false,allowDivergentVersion=false}) {
    invariant(typeof spaceId==='string' && /^[A-Za-z0-9_-]+$/.test(spaceId), 'MISSING_WIKI_SPACE', 'Choose a Wiki space ID first');
    const root=await withinRoot(this.root);
    const files=await scanMarkdown(root,path,this.maxBytes);
    invariant(files.length>0,'NO_MARKDOWN_FILES','No Markdown files found');
    const mappings=await this.mappings();
    const scope=hash(`${root}|${spaceId}|${parentNodeToken}`).slice(0,24);
    await this.assertNoUnresolvedImport(scope);
    const items=[];
    for(const file of files) {
      if(uploadMedia) await checkLocalMedia(root,file.absolutePath,file.content);
      const key=`${scope}:${file.path}`; const old=mappings.entries[key];
      let action='create', remoteRevisionId;
      if(old) {
        const meta=await this.api.meta(old.documentId); remoteRevisionId=meta.revisionId;
        const localChanged=file.contentHash!==old.contentHash;
        const remoteChanged=remoteRevisionId!==old.baseRevisionId || old.remoteEdited;
        action=!localChanged ? (remoteChanged?'skip_remote_changed':'skip')
          : remoteChanged && !allowDivergentVersion ? 'conflict' : 'new_version';
      }
      items.push({path:file.path,title:file.title,contentHash:file.contentHash,key,action,
        ...(old?{previous:clone(old),remoteRevisionId}:{})});
    }
    return this.persistPlan({type:'directory_import',root,scope,spaceId,parentNodeToken,uploadMedia,
      strategy:'new-version; existing remote documents are never deleted or overwritten by this importer',
      allowDivergentVersion,items,summary:items.reduce((a,i)=>(a[i.action]=(a[i.action]||0)+1,a),{})});
  }
  async #applyImport(plan) {
    await this.assertNoUnresolvedImport(plan.scope, plan.id);
    const currentMappings=await this.mappings();
    for (const item of plan.items) {
      invariant(hash(currentMappings.entries[item.key] ?? null)===hash(item.previous ?? null),
        'MAPPING_CONFLICT','Another import changed the mapping after this preview. Prepare a fresh plan.',{path:item.path});
    }
    invariant(!plan.items.some(i=>i.action==='conflict'),'SYNC_CONFLICT','Local and remote versions diverged. Resolve manually, or create a separate version with an explicit new plan');
    // All deterministic preflight checks happen before the first remote write.
    for(const item of plan.items) {
      const path=await withinRoot(plan.root,item.path);
      const text=await readFile(path,'utf8');
      invariant(hash(text)===item.contentHash,'LOCAL_FILE_CONFLICT','A source file changed after planning',{path:item.path});
      if(plan.uploadMedia) await checkLocalMedia(plan.root,path,text);
      if(item.previous && ['create','new_version'].includes(item.action)) {
        const meta=await this.api.meta(item.previous.documentId);
        invariant(meta.revisionId===item.remoteRevisionId,'REVISION_CONFLICT','A mapped remote document changed after planning',{path:item.path});
      }
    }
    plan.status='applying'; plan.startedAt=this.clock(); plan.job={directories:[],items:[]};
    await this.store.put('plans',plan.id,plan);
    const mappings=await this.mappings();
    const save=()=>this.store.put('plans',plan.id,plan);
    try {
      for(const item of plan.items) {
        if(item.action.startsWith('skip')) {plan.job.items.push({path:item.path,status:item.action});continue;}
        const file=await withinRoot(plan.root,item.path);
        const content=await readFile(file,'utf8');
        invariant(hash(content)===item.contentHash,'LOCAL_FILE_CONFLICT','Source changed during import',{path:item.path});
        const jobItem={path:item.path,status:'preparing'}; plan.job.items.push(jobItem); await save();
        let parent=plan.parentNodeToken;
        const parts=item.path.split('/').slice(0,-1); let cumulative='';
        for(const part of parts) {
          cumulative+=`${part}/`;const dirKey=`${plan.scope}:${cumulative}`;
          const cached=mappings.directories[dirKey];
          // Verify against the current tree instead of trusting a stale cached token.
          const nodes=await this.api.listWikiNodes(plan.spaceId,parent);
          const named=nodes.filter(n=>n.title===part && n.obj_type==='docx');
          let node=cached?nodes.find(n=>n.node_token===cached.nodeToken):undefined;
          if(!node) {
            invariant(named.length<=1,'AMBIGUOUS_WIKI_DIRECTORY','Multiple Wiki nodes have the same folder name',{part,parent});
            node=named[0];
          }
          if(!node) {
            const dirJob={parent,title:part,status:'creating'};plan.job.directories.push(dirJob);await save();
            node=await this.api.createWikiNode(plan.spaceId,parent,part);
            dirJob.status='created';dirJob.nodeToken=node.node_token;await save();
          }
          parent=node.node_token;mappings.directories[dirKey]={nodeToken:parent};
          await this.store.put('state','mappings',mappings);
        }
        jobItem.parentNodeToken=parent;jobItem.status='uploading';await save();
        const result=await this.importer.uploadMarkdown({title:item.title,content,filePath:file,workingDirectory:dirname(file)}, {
          targetType:'wiki',targetId:plan.spaceId,...(parent?{parentNodeToken:parent}:{}),
          uploadImages:plan.uploadMedia,uploadAttachments:plan.uploadMedia,
          downloadRemoteImages:false,downloadRemoteAttachments:false,removeFrontMatter:true
        });
        invariant(result?.success && result.documentId,'UPLOAD_FAILED','The upstream did not confirm document creation',{result});
        jobItem.documentId=result.documentId;jobItem.url=result.url;jobItem.status='created';await save();
        const snapshot=await this.api.snapshot(result.documentId);
        const nodes=await this.api.listWikiNodes(plan.spaceId,parent);
        const node=nodes.find(n=>n.obj_token===result.documentId);
        const history=item.previous?[...(item.previous.history||[]),{documentId:item.previous.documentId,url:item.previous.url,contentHash:item.previous.contentHash}]:[];
        mappings.entries[item.key]={path:item.path,root:plan.root,scope:plan.scope,title:item.title,documentId:result.documentId,
          url:result.url,wikiSpaceId:plan.spaceId,wikiNodeToken:node?.node_token,parentNodeToken:parent,
          contentHash:item.contentHash,baseRevisionId:snapshot.revisionId,lastObservedRevisionId:snapshot.revisionId,
          remoteEdited:false,history,importedAt:new Date(this.clock()).toISOString()};
        await this.store.put('state','mappings',mappings);
        await this.store.put('state',`cache-${hash(snapshot.documentId).slice(0,24)}`,snapshot);
        jobItem.status='verified';jobItem.revisionId=snapshot.revisionId;
        if(result.mediaUploadFailures?.length) jobItem.mediaWarnings=result.mediaUploadFailures;
        await save();
      }
      plan.status='applied';plan.finishedAt=this.clock();await save();return plan;
    }catch(e){
      plan.status='needs_inspection';plan.error=errorResult(e);await save();return plan;
    }
  }
  async assertNoUnresolvedImport(scope, exceptId) {
    const pending=(await this.store.list('plans')).filter(p=>p?.type==='directory_import' && p.scope===scope
      && p.id!==exceptId && ['applying','acknowledged','needs_inspection'].includes(p.status));
    invariant(pending.length===0,'UNRESOLVED_IMPORT',
      'An earlier import has an uncertain outcome. Inspect and reconcile it before creating or applying another import in this destination.',
      {plans:pending.map(p=>({id:p.id,status:p.status}))});
  }
  async reconcileImport(planId,resolutions) {
    return this.writeQueue.run(async()=>{
      const plan=await this.store.get('plans',planId);
      invariant(plan?.type==='directory_import','NOT_IMPORT_PLAN','Only directory import plans can be reconciled');
      if(plan.status==='closed_after_review')return plan;
      invariant(['applying','acknowledged','needs_inspection'].includes(plan.status),'NOT_UNCERTAIN_IMPORT','This import does not need manual reconciliation');
      invariant(Array.isArray(resolutions),'INVALID_RESOLUTIONS','Provide a resolution for every uncertain upload');
      const uncertain=(plan.job?.items||[]).filter(i=>['uploading','created'].includes(i.status));
      const byPath=new Map(resolutions.map(r=>[r.path,r]));
      invariant(byPath.size===resolutions.length && byPath.size===uncertain.length && uncertain.every(i=>byPath.has(i.path)),
        'INCOMPLETE_RECONCILIATION','Resolve exactly the uploading/created items shown in kb_inspect_plan. Verify Wiki directory creations as well.',
        {paths:uncertain.map(i=>i.path)});
      const mappings=await this.mappings(); const adopted=[];
      for(const job of uncertain){
        const resolution=byPath.get(job.path);const item=plan.items.find(i=>i.path===job.path);
        invariant(item,'INVALID_CHECKPOINT','The checkpoint does not match the original import plan');
        invariant(['adopt','not_created'].includes(resolution.outcome),'INVALID_RESOLUTION','outcome must be adopt or not_created');
        if(resolution.outcome==='not_created'){
          invariant(!job.documentId,'KNOWN_CREATED_DOCUMENT','Feishu already returned a document ID. Adopt that document after reviewing it; do not declare it absent.');
          continue; // Human-verified absence; an API cannot prove a lost create never happened.
        }
        invariant(typeof resolution.document==='string' && resolution.document,'DOCUMENT_REQUIRED','Adoption requires the reviewed document URL or ID');
        const {documentId}=await this.api.resolveDocument(resolution.document);
        invariant(!job.documentId || documentId===job.documentId,'DOCUMENT_MISMATCH','Use the document identified in the import checkpoint');
        invariant(documentId!==item.previous?.documentId,'OLD_DOCUMENT_ADOPTION','Do not adopt the old version as the newly uploaded document');
        invariant(!Object.entries(mappings.entries).some(([key,value])=>key!==item.key && value.documentId===documentId),
          'DOCUMENT_ALREADY_MAPPED','This document is already mapped to another local file');
        const snapshot=await this.api.snapshot(documentId);
        invariant(snapshot?.documentId===documentId,'DOCUMENT_UNAVAILABLE','The reviewed document cannot be read');
        const nodes=await this.api.listWikiNodes(plan.spaceId,job.parentNodeToken||'');
        const node=nodes.find(n=>n.obj_token===documentId && n.obj_type==='docx');
        invariant(node,'WRONG_WIKI_LOCATION','The reviewed document is not under the Wiki parent recorded before uploading');
        adopted.push({item,job,snapshot,node});
      }
      // Resolve all remote reads before updating local mappings. Never write remotely here.
      plan.mappingBackupId=await this.store.snapshot(mappings,'before-reconcile');
      for(const {item,job,snapshot,node} of adopted){
        const history=item.previous?[...(item.previous.history||[]),{documentId:item.previous.documentId,url:item.previous.url,contentHash:item.previous.contentHash}]:[];
        mappings.entries[item.key]={path:item.path,root:plan.root,scope:plan.scope,title:snapshot.title,documentId:snapshot.documentId,
          ...(job.url?{url:job.url}:{}),wikiSpaceId:plan.spaceId,wikiNodeToken:node.node_token,parentNodeToken:job.parentNodeToken||'',
          contentHash:item.contentHash,baseRevisionId:snapshot.revisionId,lastObservedRevisionId:snapshot.revisionId,
          remoteEdited:true,reconciled:true,history,importedAt:new Date(this.clock()).toISOString()};
        await this.store.put('state',`cache-${hash(snapshot.documentId).slice(0,24)}`,snapshot);
      }
      await this.store.put('state','mappings',mappings);
      plan.status='closed_after_review';plan.reviewedAt=this.clock();plan.resolutions=clone(resolutions);
      plan.reviewNote='Only local checkpoints/mappings changed. not_created relies on explicit human inspection; adopted documents remain marked remote-edited. Uncertain directory creation is rechecked by name on the next import.';
      await this.store.put('plans',plan.id,plan);return plan;
    });
  }
  async exportDocument(document) {
    const snapshot=await this.api.snapshot(document);
    const id=await this.store.snapshot(snapshot,'export');
    const folder=join(this.store.root,'exports',id);await mkdir(folder,{recursive:true,mode:0o700});
    await writeFile(join(folder,'snapshot.json'),JSON.stringify(snapshot,null,2),{mode:0o600});
    await writeFile(join(folder,'content.md'),asPlainMarkdown(snapshot),{mode:0o600});
    return {directory:folder,revisionId:snapshot.revisionId,note:'JSON preserves block structure; Markdown is a convenience text export. Media bytes are not included.'};
  }
}

import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {LocalStore} from '../src/core/storage.mjs';
import {KnowledgeService} from '../src/core/knowledge.mjs';
import {clone} from '../src/core/primitives.mjs';
export function paragraph(id,text,parent='doc1',style={}){return{block_id:id,parent_id:parent,block_type:2,text:{elements:[{text_run:{content:text,text_element_style:style}}]}};}
export function heading(id,text,level=2,parent='doc1'){return{block_id:id,parent_id:parent,block_type:level+2,[`heading${level}`]:{elements:[{text_run:{content:text}}]}};}
export function fixture(){return{documentId:'doc1',title:'Knowledge',revisionId:7,fetchedAt:'2026-09-11',blocks:[
 {block_id:'doc1',block_type:1,children:['h1','p1','h2','p2','h3','p3']},heading('h1','RAG'),paragraph('p1','Old text'),heading('h2','Chunk',3),paragraph('p2','Nested text'),heading('h3','Next'),paragraph('p3','Do not change')
]};}
export class FakeApi{
 constructor(){this.documents=new Map([['doc1',fixture()]]);this.calls=[];this.nodes=new Map();this.nextId=0;}
 async resolveDocument(id){return{documentId:id};}
 async meta(id){const d=this.documents.get(id);if(!d)throw new Error('Document not found');return{documentId:id,title:d.title,revisionId:d.revisionId};}
 async snapshot(id){return clone(this.documents.get(id));}
 async patchText(id,revision,edits){
  this.calls.push({method:'patch',id,revision,edits});const doc=this.documents.get(id);
  if(doc.revisionId!==revision)throw new Error('revision rejected');
  if(this.failWrite)throw new Error('network failure');
  for(const e of edits){const b=doc.blocks.find(b=>b.block_id===e.blockId);const key=Object.keys(b).find(k=>b[k]?.elements);b[key].elements=clone(e.afterElements);}
  doc.revisionId++;
  if(this.failAfterWrite)throw new Error('response lost');
  return{document_revision_id:doc.revisionId};
 }
 async insertParagraphs(id,revision,parent,index,texts){
  this.calls.push({method:'append',id,revision,parent,index});const doc=this.documents.get(id);
  if(doc.revisionId!==revision)throw new Error('revision rejected');
  const children=texts.map((s,i)=>paragraph(`inserted-${++this.nextId}`,s,parent));
  doc.blocks.push(...children);doc.blocks.find(b=>b.block_id===parent).children.splice(index,0,...children.map(b=>b.block_id));doc.revisionId++;
  return{children,document_revision_id:doc.revisionId};
 }
 async listWikiNodes(space,parent=''){return clone(this.nodes.get(`${space}:${parent}`)||[]);}
 async createWikiNode(space,parent='',title){const n={node_token:`node-${++this.nextId}`,title,obj_type:'docx'};const key=`${space}:${parent}`;this.nodes.set(key,[...(this.nodes.get(key)||[]),n]);return n;}
}
export async function context(t){
 const dir=await mkdtemp(join(tmpdir(),'fusion-unit-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const root=join(dir,'knowledge');await mkdir(root);const store=new LocalStore(join(dir,'data'));const api=new FakeApi();
 const imports=[];
 const importer={async uploadMarkdown(document,options){
  imports.push({document,options});const id=`import-${imports.length}`;
  api.documents.set(id,{documentId:id,title:document.title,revisionId:1,blocks:[{block_id:id,block_type:1,children:[`${id}-p`]},paragraph(`${id}-p`,document.content,id)]});
  const key=`${options.targetId}:${options.parentNodeToken||''}`;api.nodes.set(key,[...(api.nodes.get(key)||[]),{node_token:`wiki-${id}`,obj_token:id,obj_type:'docx',title:document.title}]);
  return{success:true,documentId:id,title:document.title,url:`https://example.feishu.cn/docx/${id}`};
 }};
 const knowledge=new KnowledgeService({api,store,root,importer});
 return{dir,root,store,api,knowledge,importer,imports,write:async(path,content)=>{const full=join(root,path);await mkdir(join(full,'..'),{recursive:true});await writeFile(full,content);return full;}};
}

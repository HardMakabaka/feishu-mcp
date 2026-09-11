import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,heading,paragraph} from './helpers.mjs';
import {sectionRange,outline,prepareTextEdits,blockText,asPlainMarkdown} from '../src/core/blocks.mjs';

test('section ends at next same-level heading and contains nested subsections',()=>{
 const r=sectionRange(fixture().blocks,{heading:'RAG'});assert.deepEqual(r.bodyIds,['p1','h2','p2']);assert.equal(r.parentId,'doc1');assert.equal(r.end,4);
});
test('subsection range stops before its parent-level sibling',()=>assert.deepEqual(sectionRange(fixture().blocks,{heading:'Chunk'}).bodyIds,['p2']));
test('duplicate headings require an explicit block ID',()=>{
 const s=fixture();s.blocks.push(heading('duplicate','RAG'));s.blocks[0].children.push('duplicate');
 assert.throws(()=>sectionRange(s.blocks,{heading:'RAG'}),e=>e.code==='SECTION_AMBIGUOUS');
 assert.equal(sectionRange(s.blocks,{headingBlockId:'h1'}).headingBlockId,'h1');
});
test('outline is based on tree order, not input array order',()=>{
 const b=fixture().blocks.reverse();assert.deepEqual(outline(b).map(h=>h.blockId),['h1','h2','h3']);
});
test('text edit preserves uniform inline style',()=>{
 const s=fixture();s.blocks[2].text.elements[0].text_run.text_element_style={bold:true};
 const change=prepareTextEdits(s,[{blockId:'p1',expectedText:'Old text',newText:'New'}])[0];
 assert.deepEqual(change.afterElements[0].text_run.text_element_style,{bold:true});
});
test('mixed inline styles are rejected unless explicitly allowed',()=>{
 const s=fixture();s.blocks[2].text.elements.push({text_run:{content:' more',text_element_style:{bold:true}}});
 const edit={blockId:'p1',expectedText:'Old text more',newText:'New'};
 assert.throws(()=>prepareTextEdits(s,[edit]),e=>e.code==='STYLE_LOSS_REQUIRES_OPT_IN');
 assert.equal(prepareTextEdits(s,[{...edit,allowStyleLoss:true}])[0].styleLoss,true);
});
test('formula-containing blocks are never flattened by a plain-text patch',()=>{
 const s=fixture();s.blocks[2].text.elements=[{equation:{content:'x^2'}}];
 assert.throws(()=>prepareTextEdits(s,[{blockId:'p1',expectedText:'x^2',newText:'x'}]),e=>e.code==='RICH_ELEMENT_REQUIRES_NATIVE_TOOL');
});
test('wrong text and duplicate target IDs are rejected',()=>{
 assert.throws(()=>prepareTextEdits(fixture(),[{blockId:'p1',expectedText:'wrong',newText:'n'}]),e=>e.code==='TEXT_CONFLICT');
 const e={blockId:'p1',expectedText:'Old text',newText:'n'};assert.throws(()=>prepareTextEdits(fixture(),[e,e]),e=>e.code==='DUPLICATE_BLOCK');
});
test('table cell paragraph can be targeted without editing the table container',()=>{
 const s=fixture();s.blocks.push({block_id:'table',block_type:31,table:{property:{row_size:1,column_size:1}}},paragraph('cellp','value','cell'));
 assert.equal(prepareTextEdits(s,[{blockId:'cellp',expectedText:'value',newText:'new'}])[0].blockId,'cellp');
 assert.throws(()=>prepareTextEdits(s,[{blockId:'table',expectedText:'',newText:'new'}]),e=>e.code==='NOT_TEXT_BLOCK');
});
test('plain export includes content and headings without duplicating children',()=>{
 const text=asPlainMarkdown(fixture());assert(text.includes('## RAG'));assert.equal(text.match(/Old text/g).length,1);
});

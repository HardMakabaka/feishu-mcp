import { invariant } from './errors.mjs';
import { isDeepStrictEqual } from 'node:util';
import { clone, hash } from './primitives.mjs';

export function textPayload(block) {
  for (const [key, value] of Object.entries(block)) {
    if (value && typeof value === 'object' && Array.isArray(value.elements)) return { key, value };
  }
  return null;
}
export function blockText(block) {
  const payload = textPayload(block);
  return payload?.value.elements.map(e => e.text_run?.content ?? e.equation?.content ?? (e.mention_user ? '[mention]' : e.mention_doc ? '[document]' : '')).join('') ?? '';
}
export function textElementsEqual(actual, expected) {
  if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
  // Feishu may spell out false inline-style defaults that the request omitted.
  // Compare all other fields (including links, colors and element order) exactly.
  const normalize = elements => elements.map(element => !element.text_run ? element : {
    ...element, text_run: { ...element.text_run, text_element_style: {
      bold:false, italic:false, strikethrough:false, underline:false, inline_code:false,
      ...element.text_run.text_element_style
    } }
  });
  return isDeepStrictEqual(normalize(actual), normalize(expected));
}
export function headingLevel(block) {
  for (let level = 1; level <= 9; level++) if (block[`heading${level}`]) return level;
  return 0;
}
export function outline(blocks) {
  const byId = new Map(blocks.map(b => [b.block_id, b]));
  const roots = blocks.filter(b => b.block_type === 1);
  const ordered = [];
  const visited = new Set();
  const walk = b => {
    if (!b || visited.has(b.block_id)) return;
    visited.add(b.block_id); ordered.push(b);
    for (const id of b.children ?? []) walk(byId.get(id));
  };
  for (const root of roots) walk(root);
  for (const b of blocks) walk(b);
  return ordered.filter(b => headingLevel(b)).map(b => ({
    blockId: b.block_id, parentId: b.parent_id, level: headingLevel(b), title: blockText(b)
  }));
}
export function sectionRange(blocks, { headingBlockId, heading }) {
  const candidates = blocks.filter(b => headingBlockId ? b.block_id === headingBlockId : headingLevel(b) && blockText(b) === heading);
  invariant(candidates.length === 1 && headingLevel(candidates[0]), 'SECTION_AMBIGUOUS',
    'Section heading is absent or ambiguous. Use the exact headingBlockId from kb_read.',
    { matches: candidates.map(b => ({ blockId: b.block_id, title: blockText(b) })) });
  const selected = candidates[0];
  const byId = new Map(blocks.map(b => [b.block_id, b]));
  const parent = byId.get(selected.parent_id);
  invariant(parent?.children?.includes(selected.block_id), 'BLOCK_STRUCTURE_UNSUPPORTED', 'Parent child order is missing');
  const start = parent.children.indexOf(selected.block_id);
  let end = parent.children.length;
  for (let i = start + 1; i < parent.children.length; i++) {
    const candidate = byId.get(parent.children[i]);
    const level = candidate ? headingLevel(candidate) : 0;
    if (level && level <= headingLevel(selected)) { end = i; break; }
  }
  // Headings and their following paragraphs are siblings, not heading.children.
  return { headingBlockId: selected.block_id, parentId: selected.parent_id, start, end,
    bodyIds: parent.children.slice(start + 1, end), title: blockText(selected) };
}

export function prepareTextEdits(snapshot, edits) {
  invariant(Array.isArray(edits) && edits.length > 0 && edits.length <= 50, 'INVALID_EDIT_COUNT', 'Provide 1–50 block edits');
  const byId = new Map(snapshot.blocks.map(b => [b.block_id, b]));
  const seen = new Set();
  return edits.map(edit => {
    invariant(typeof edit.blockId === 'string' && !seen.has(edit.blockId), 'DUPLICATE_BLOCK', 'Each block may be edited once per plan');
    seen.add(edit.blockId);
    const block = byId.get(edit.blockId);
    invariant(block, 'BLOCK_NOT_FOUND', 'Block does not belong to this document snapshot', { blockId: edit.blockId });
    const payload = textPayload(block);
    invariant(payload, 'NOT_TEXT_BLOCK', 'Target is not a text-bearing block. For tables, use the paragraph block inside the cell.');
    invariant(typeof edit.newText === 'string', 'INVALID_TEXT', 'newText must be a string');
    invariant(edit.newText.length <= 50000, 'TEXT_TOO_LONG', 'Text is too long for one safe edit');
    const currentText = blockText(block);
    invariant(typeof edit.expectedText === 'string' && edit.expectedText === currentText, 'TEXT_CONFLICT',
      'expectedText does not match the current block text', { blockId: edit.blockId, actual: currentText });
    const elements = clone(payload.value.elements);
    invariant(elements.every(e => e.text_run), 'RICH_ELEMENT_REQUIRES_NATIVE_TOOL',
      'This block contains formulas or mentions; safe plain-text patch refuses to replace them');
    const distinctStyles = new Set(elements.map(e => JSON.stringify(e.text_run.text_element_style ?? {})));
    invariant(distinctStyles.size <= 1 || edit.allowStyleLoss === true, 'STYLE_LOSS_REQUIRES_OPT_IN',
      'This block has mixed inline styles. Use a native styled edit, or explicitly allowStyleLoss');
    const firstStyle = elements[0]?.text_run?.text_element_style ?? {};
    const afterElements = [{ text_run: { content: edit.newText, text_element_style: firstStyle } }];
    return { blockId: edit.blockId, beforeHash: hash(block), beforeText: currentText, afterText: edit.newText,
      beforeElements: elements, afterElements, styleLoss: distinctStyles.size > 1 };
  });
}
export function asPlainMarkdown(snapshot) {
  // Convenience export only. snapshot.json is the lossless structural backup.
  const byId = new Map(snapshot.blocks.map(b => [b.block_id, b]));
  const visited = new Set(); const result = [];
  function visit(block) {
    if (!block || visited.has(block.block_id)) return;
    visited.add(block.block_id);
    const text = blockText(block); const level = headingLevel(block);
    if (level) result.push(`${'#'.repeat(level)} ${text}`);
    else if (block.block_type === 14) result.push(`\`\`\`\n${text}\n\`\`\``);
    else if (text) result.push(text);
    else if (block.block_type === 27) result.push(`[image token: ${block.image?.token ?? 'unknown'}]`);
    else if (block.block_type === 31) result.push('[table: see structural JSON backup]');
    for (const id of block.children ?? []) visit(byId.get(id));
  }
  for (const block of snapshot.blocks.filter(b => b.block_type === 1)) visit(block);
  for (const block of snapshot.blocks) visit(block);
  return result.join('\n\n') + '\n';
}

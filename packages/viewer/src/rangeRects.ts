/**
 * Client rects of the parts of text nodes under `root` that `range` covers. Unlike
 * `range.getClientRects()`, this excludes element boxes (e.g. fully covered spans or the text
 * layer's full-page `endOfContent` helper).
 */
export function textNodeRects(range: Range, root: Node): DOMRect[] {
  const rects: DOMRect[] = [];
  // The root's own document, so this also works inside iframes (e.g. the Zotero reader).
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const part = doc.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    const text = node as Text;
    part.selectNodeContents(text);
    if (text === range.startContainer) part.setStart(text, range.startOffset);
    if (text === range.endContainer) part.setEnd(text, range.endOffset);
    if (part.collapsed) continue;
    rects.push(...part.getClientRects());
  }
  return rects;
}

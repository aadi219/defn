const TEXT_NODE = 3;
/** `NodeFilter.SHOW_TEXT`; `NodeFilter` itself isn't a global in sandboxes such as Zotero's. */
const SHOW_TEXT = 0x4;

/**
 * Client rects of the parts of text nodes under `root` that `range` covers. Unlike
 * `range.getClientRects()`, this excludes element boxes (e.g. fully covered spans or the text
 * layer's full-page `endOfContent` helper).
 */
export function textNodeRects(range: Range, root: Node): DOMRect[] {
  const rects: DOMRect[] = [];
  // The root's own document, so this also works inside iframes (e.g. the Zotero reader).
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, SHOW_TEXT);
  const part = doc.createRange();
  const { startContainer, endContainer } = range;
  // Start at the range's own text node instead of walking the whole layer for every match.
  const node0 =
    startContainer.nodeType === TEXT_NODE && root.contains(startContainer)
      ? (walker.currentNode = startContainer)
      : walker.nextNode();
  for (let node = node0; node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    const text = node as Text;
    part.selectNodeContents(text);
    if (text === startContainer) part.setStart(text, range.startOffset);
    if (text === endContainer) part.setEnd(text, range.endOffset);
    if (!part.collapsed) rects.push(...part.getClientRects());
    if (text === endContainer) break;
  }
  return rects;
}

/** A rectangle in CSS px relative to a page element's top-left corner. */
export interface PageCssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Converts a viewport (client) rect to page-relative CSS px. */
export function clientRectToPage(rect: DOMRectReadOnly, pageEl: HTMLElement): PageCssRect {
  const page = pageEl.getBoundingClientRect();
  return {
    left: rect.left - page.left,
    top: rect.top - page.top,
    width: rect.width,
    height: rect.height,
  };
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GAP = 6;
const PAD = 8;

/**
 * Where to put a popover of `size` next to `anchor` (both in client px) inside a viewport:
 * below the anchor, or above if it doesn't fit below, clamped to the viewport edges.
 */
export function placePopover(
  anchor: Box,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const below = anchor.top + anchor.height + GAP;
  const above = anchor.top - GAP - size.height;
  const fitsBelow = below + size.height <= viewport.height - PAD;
  const top = fitsBelow || above < PAD ? below : above;
  const maxLeft = Math.max(PAD, viewport.width - PAD - size.width);
  return {
    left: Math.min(Math.max(PAD, anchor.left), maxLeft),
    top: Math.max(PAD, Math.min(top, viewport.height - PAD - size.height)),
  };
}

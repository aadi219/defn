/** Pinned definitions for one document (PLAN.md §7.4). */
export interface StackState {
  /** Pinned definition ids, in card order (top to bottom). */
  ids: string[];
  /** The same ids in the order they were pinned, for the breadcrumb. */
  trail: string[];
}

export const EMPTY_STACK: StackState = { ids: [], trail: [] };

const insertAt = (ids: readonly string[], at: number, id: string) => [
  ...ids.slice(0, at),
  id,
  ...ids.slice(at),
];

/**
 * Pins a definition directly below `after` (if pinned), else at the bottom. Pinning an already
 * pinned definition leaves the stack unchanged.
 */
export function pin(state: StackState, id: string, after?: string): StackState {
  if (state.ids.includes(id)) return state;
  const at = after === undefined ? -1 : state.ids.indexOf(after);
  const ids = at === -1 ? [...state.ids, id] : insertAt(state.ids, at + 1, id);
  return { ids, trail: [...state.trail, id] };
}

export function unpin(state: StackState, id: string): StackState {
  if (!state.ids.includes(id)) return state;
  return { ids: state.ids.filter((x) => x !== id), trail: state.trail.filter((x) => x !== id) };
}

/** Moves a card up (`delta` < 0) or down, clamped to the ends of the stack. */
export function move(state: StackState, id: string, delta: number): StackState {
  const from = state.ids.indexOf(id);
  const to = Math.max(0, Math.min(state.ids.length - 1, from + delta));
  if (from === -1 || from === to) return state;
  const ids = insertAt(
    state.ids.filter((x) => x !== id),
    to,
    id,
  );
  return { ...state, ids };
}

/** Parses persisted stack JSON, falling back to an empty stack on anything malformed. */
export function parseStack(json: string | null): StackState {
  if (!json) return EMPTY_STACK;
  try {
    const value: unknown = JSON.parse(json);
    if (typeof value !== "object" || value === null) return EMPTY_STACK;
    const { ids, trail } = value as Record<string, unknown>;
    const strings = (x: unknown) =>
      Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === "string"))] : [];
    const cleanIds = strings(ids);
    const pinned = new Set(cleanIds);
    const cleanTrail = strings(trail).filter((id) => pinned.has(id));
    // Ids missing from the trail (e.g. older data) are appended in card order.
    for (const id of cleanIds) if (!cleanTrail.includes(id)) cleanTrail.push(id);
    return { ids: cleanIds, trail: cleanTrail };
  } catch {
    return EMPTY_STACK;
  }
}

import type { Definition, DefinitionKind, Term } from "@deflink/core";

/** Zotero's annotation palette, so mirrored highlights look native. */
export const KIND_COLORS: Record<DefinitionKind, string> = {
  definition: "#ffd400",
  theorem: "#2ea8e5",
  lemma: "#2ea8e5",
  proposition: "#2ea8e5",
  corollary: "#2ea8e5",
  notation: "#a28ae5",
  other: "#aaaaaa",
};

/**
 * The `Zotero.Annotations.saveFromJSON` payload mirroring a definition as a highlight (PLAN.md
 * §M9): tag `deflink:<kind>`, comment `term: <label>`. Position, page label and sort index come
 * from the reader's own selection annotation, so the highlight sorts and renders like any other.
 */
export function highlightJSON(
  key: string,
  definition: Definition,
  term: Term,
  selection: ZoteroReaderAnnotation,
): Record<string, unknown> {
  return {
    key,
    type: "highlight",
    text: definition.text,
    comment: `term: ${term.label}`,
    color: KIND_COLORS[definition.kind],
    ...(selection.pageLabel ? { pageLabel: selection.pageLabel } : {}),
    ...(selection.sortIndex ? { sortIndex: selection.sortIndex } : {}),
    position: selection.position,
    tags: [{ name: `deflink:${definition.kind}` }],
  };
}

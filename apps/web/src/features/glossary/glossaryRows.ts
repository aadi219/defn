import type { Definition, DocumentRecord, Term } from "@defn/core";

export interface GlossaryRow {
  term: Term;
  definitionCount: number;
  /** "Global", "This document", or the scoped document's title. */
  scopeLabel: string;
  /** Folded label, aliases and definition texts, for search. */
  searchText: string;
}

export type SortKey = "label" | "definitions" | "updated";

const fold = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");

export function scopeLabel(
  term: Term,
  documents: ReadonlyMap<string, DocumentRecord>,
  currentDocId?: string,
): string {
  if (term.scope.type === "global") return "Global";
  if (term.scope.docId === currentDocId) return "This document";
  return documents.get(term.scope.docId)?.title ?? "Unknown document";
}

/** One row per term (PLAN.md §7.5), with its definition count and searchable text. */
export function buildRows(
  terms: readonly Term[],
  definitions: readonly Definition[],
  documents: ReadonlyMap<string, DocumentRecord>,
  currentDocId?: string,
): GlossaryRow[] {
  const byTerm = new Map<string, Definition[]>();
  for (const d of definitions) byTerm.set(d.termId, [...(byTerm.get(d.termId) ?? []), d]);
  return terms.map((term) => {
    const defs = byTerm.get(term.id) ?? [];
    return {
      term,
      definitionCount: defs.length,
      scopeLabel: scopeLabel(term, documents, currentDocId),
      searchText: fold([term.label, ...term.aliases, ...defs.map((d) => d.text)].join("\n")),
    };
  });
}

/** Rows matching every word of `query` (in label, aliases or definition text). */
export function filterRows(
  rows: readonly GlossaryRow[],
  query: string,
  options: { orphanedOnly?: boolean } = {},
): GlossaryRow[] {
  const words = fold(query).split(" ").filter(Boolean);
  return rows.filter(
    (r) =>
      (!options.orphanedOnly || r.definitionCount === 0) &&
      words.every((w) => r.searchText.includes(w)),
  );
}

export function sortRows(
  rows: readonly GlossaryRow[],
  key: SortKey,
  direction: "asc" | "desc",
): GlossaryRow[] {
  const byLabel = (a: GlossaryRow, b: GlossaryRow) =>
    a.term.label.localeCompare(b.term.label, undefined, { sensitivity: "base", numeric: true });
  const compare = {
    label: byLabel,
    definitions: (a: GlossaryRow, b: GlossaryRow) => a.definitionCount - b.definitionCount,
    updated: (a: GlossaryRow, b: GlossaryRow) => a.term.updatedAt - b.term.updatedAt,
  }[key];
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * compare(a, b) || byLabel(a, b));
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildMatcherForDocument,
  type Definition,
  type Suppression,
  type Term,
} from "@defn/core";
import { pdfRectToCss } from "@defn/viewer";
import type { PageTextEntry } from "../../pdf/usePageTexts";
import { computeOccurrences } from "@defn/viewer";
import { filterOccurrences, firstDefinitionPages, type PageOccurrences } from "@defn/viewer";

/** Linking a page above this many ms is logged in dev builds (PLAN.md §11 budget). */
const SLOW_LINK_MS = 30;

export interface LinkingOptions {
  docId: string;
  terms: Term[];
  /** Definitions in this document. */
  definitions: Definition[];
  suppressions: Suppression[];
  inflection?: boolean;
  onlyAfterFirstDefinition?: boolean;
}

/**
 * Computes linked occurrences for rendered pages. Call `linkPage` when a page's text layer
 * renders; all live pages are re-linked when terms, definitions or suppressions change.
 */
export function useLinking(options: LinkingOptions, liveEntries: () => PageTextEntry[]) {
  const { docId, terms, definitions, suppressions } = options;
  const inflection = options.inflection ?? true;
  const onlyAfterFirst = options.onlyAfterFirstDefinition ?? false;
  const [byPage, setByPage] = useState<ReadonlyMap<number, PageOccurrences>>(new Map());

  const matcher = useMemo(
    () => buildMatcherForDocument(terms, docId, { inflection }),
    [terms, docId, inflection],
  );
  const termsById = useMemo(() => new Map(terms.map((t) => [t.id, t])), [terms]);
  const firstPages = useMemo(
    () => (onlyAfterFirst ? firstDefinitionPages(definitions) : undefined),
    [definitions, onlyAfterFirst],
  );

  const link = useCallback(
    (entry: PageTextEntry): PageOccurrences => {
      const t0 = performance.now();
      const page = entry.pageText.page;
      const found = computeOccurrences(entry.pageText, entry.pageEl, matcher);
      const occurrences = filterOccurrences(found, {
        page,
        terms: termsById,
        suppressions: suppressions.filter((s) => s.page === page),
        definitionRegions: definitions
          .filter((d) => d.page === page)
          .map((d) => ({
            termId: d.termId,
            rects: d.rects.map((r) => pdfRectToCss(r, entry.viewport)),
          })),
        ...(firstPages ? { firstDefinitionPage: firstPages } : {}),
      });
      const ms = performance.now() - t0;
      if (import.meta.env.DEV && ms > SLOW_LINK_MS) {
        console.debug(`Linking page ${page} took ${ms.toFixed(1)} ms`);
      }
      return { page, scale: entry.scale, occurrences };
    },
    [matcher, termsById, suppressions, definitions, firstPages],
  );

  const linkRef = useRef(link);
  const linkPage = useCallback((entry: PageTextEntry) => {
    const result = linkRef.current(entry);
    setByPage((prev) => new Map(prev).set(result.page, result));
  }, []);

  // Re-link every rendered page when the inputs change.
  useEffect(() => {
    linkRef.current = link;
    const results = liveEntries().map(link);
    // Syncing with the DOM (text layer layout), which React does not track.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setByPage(new Map(results.map((r) => [r.page, r])));
  }, [link, liveEntries]);

  return { byPage, linkPage, matcher };
}

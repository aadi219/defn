import { memo } from "react";
import type { Occurrence } from "@defn/viewer";

/** Dotted underline under every rect of every linked occurrence on a page (PLAN.md §7.2). */
export const OccurrenceUnderlines = memo(function OccurrenceUnderlines(props: {
  occurrences: readonly Occurrence[];
}) {
  return (
    <>
      {props.occurrences.flatMap((occ) =>
        occ.rects.map((r, i) => (
          <div
            key={`${occ.termId}-${occ.start}-${i}`}
            className="occurrence-underline"
            data-term-id={occ.termId}
            style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
          />
        )),
      )}
    </>
  );
});

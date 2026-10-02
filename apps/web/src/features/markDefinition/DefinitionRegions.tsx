import { memo } from "react";
import type { Definition } from "@deflink/core";
import { pdfRectToCss, type PointConverter } from "../../pdf/coords";

/** Faint tint over the regions of saved definitions on one page (PLAN.md §7.2 step 4). */
export const DefinitionRegions = memo(function DefinitionRegions(props: {
  definitions: readonly Definition[];
  viewport: PointConverter;
}) {
  const { definitions, viewport } = props;
  return (
    <>
      {definitions.flatMap((d) =>
        d.rects.map((rect, i) => {
          const r = pdfRectToCss(rect, viewport);
          return (
            <div
              key={`${d.id}-${i}`}
              className={`definition-region kind-${d.kind}`}
              data-definition-id={d.id}
              style={{ left: r.left, top: r.top, width: r.width, height: r.height }}
            />
          );
        }),
      )}
    </>
  );
});

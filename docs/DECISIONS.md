# Decisions log

Running log of deviations from `PLAN.md` and design decisions made during implementation.

## M0

- **pnpm via corepack.** pnpm is not installed globally; the root `package.json` pins
  `packageManager: pnpm@12.8.1` and commands run as `corepack pnpm …` (or plain `pnpm` after
  `corepack enable`).
- **Extra dev dependencies** beyond §2, needed to wire the listed tools together:
  `typescript-eslint`, `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-config-prettier`,
  `globals` (ESLint flat config), `@vitejs/plugin-react` (Vite + React), `tsx` (runs
  `scripts/make-fixtures.ts`), `@types/react`, `@types/react-dom`, `@types/node`.
- **TypeScript pinned to `~6.0`.** TS 7.0 is out, but `typescript-eslint@8` only supports `<6.1`.
- **`allowBuilds: esbuild`** in `pnpm-workspace.yaml`: pnpm 12 blocks dependency build scripts by
  default, and Vite needs esbuild's postinstall.
- **Root `typecheck`** also typechecks `scripts/`, which has its own tsconfig.

## Resolved ambiguities (agreed with user before M1)

1. **Folded/cased alignment.** Case folding lowercases per character and only when the result is
   length-preserving, so the folded and cased normalized strings always have equal length and
   aligned token offsets. Suppression offsets therefore refer to either string equivalently.
2. **Offset round-trip test** only checks substrings whose endpoints lie on clean boundaries
   (where `toRaw` strictly increases), since slices inside an expanded ligature can't round-trip.
3. **Scope precedence.** When a document-scoped and a global term share a surface form, the
   document-scoped term wins.
4. **Collision rule.** Two terms in the same scope collide if their folded forms are equal,
   unless both are case-sensitive and their cased forms differ.
5. **Inflection** is a matcher option (default on), exposed in settings later.
6. **"Best definition"** for nested chips: earliest definition in the current document, else the
   most recently created one.
7. **Popover "Edit"** reopens the mark-definition dialog in edit mode (term + definition).
8. **Import merge** compares folded surface forms unless both terms are case-sensitive.

## M1

- **`normRangeToRaw(n, raw, start, end)`** (not in the plan) maps a normalized range back to raw.
  Its end is placed just after the raw character of normalized char `end - 1`, rather than at
  `toRaw[end]`, so characters removed after a match (e.g. a line-break hyphen) are excluded.
- **`Crop<B = unknown>`** is generic over the binary payload so `model.ts` needs no DOM `Blob`
  type; the web app uses `Crop<Blob>`.
- **`Pattern.priority`** (optional) breaks ties between identical token sequences; termIndex gives
  document-scoped terms priority 1 and global terms 0. An exact pattern beats an inflected variant
  of the same priority. On equal match length, the case-sensitive trie still wins (§5.4).
- **Inflection follows §5.4 literally** (+s, +es, −trailing s), so e.g. `classes` does not match
  `class`. Smarter singularization can come later.
- **Matcher alignment.** `find()` aligns folded and cased tokens by start offset rather than array
  index, which is robust even if the two tokenizations ever differ.
- **Extra termIndex helpers:** `surfaceForms`, `patternTokens`, `isInScope`, `matchText` (normalize
  both ways + tokenize + match), and `createMatcherCache` (single-entry memo keyed on the terms
  array identity, docId and inflection option).
- **Performance tests** live in `*.perf.test.ts`, run in `pnpm check`, and are excluded from
  `pnpm --filter @deflink/core coverage` because instrumentation skews timings. They take the best
  of 5 runs after a warm-up to avoid flakiness. Measured: match ~1 ms (budget 50), rebuild ~10 ms
  (budget 20), after adding an ASCII fast path to `normalize` and lazy trie child maps.

## M2

- **pdfjs-dist pinned to exactly 6.3.289.** API differences from older docs: `page.render` takes
  `canvas` (not `canvasContext`); `PDFDocumentProxy` has no `destroy()`, use
  `pdf.loadingTask.destroy()`.
- **PDF.js runtime assets** (cmaps, standard fonts, wasm decoders, ICC profiles) are served under
  `/pdfjs/` by a small inline Vite plugin in `apps/web/vite.config.ts` (dev middleware + copy on
  build) instead of adding `vite-plugin-static-copy`. Standard fonts are needed because the
  fixtures use non-embedded standard 14 fonts.
- **Text layer CSS** is copied from `pdfjs-dist/web/pdf_viewer.css` into
  `src/pdf/textLayer.css` rather than importing the whole viewer stylesheet. The `selecting`
  class and `endOfContent` element from PDF.js's viewer are replicated for stable selection.
- **Lazy rendering uses scroll math, not IntersectionObserver.** All page sizes are read up front,
  so the visible range is a binary search over page offsets (`src/pdf/layout.ts`, unit-tested).
  Pages within ±2 of the visible range render; pages beyond ±5 are unmounted, releasing their
  canvas (§11).
- **Zoom/re-render** draws into a fresh canvas and text layer and swaps them in when done, so the
  old bitmap stays (scaled) until the new one is ready. Canvas size is capped at 16 MP.
- **Keyboard:** ←/→ and j/k page, Home/End, +/− zoom, 0 fit width; Page Up/Down/Space scroll the
  focused viewer. (D, P, G, U are reserved for later milestones.)
- **Fixtures:** `pnpm fixtures` also generates `long.pdf` (300 pages, ~2.3 MB, gitignored like the
  other generated PDFs) for manually checking lazy rendering.
- **Web unit tests:** `apps/web` now has Vitest for pure modules (`src/**/*.test.ts`). Config files
  are typechecked by a separate `tsconfig.node.json` with Node types.
- **PageText separators come from text-item geometry**, not DOM bounding boxes: baseline `y`,
  `x + width` and font height from each item's transform, plus `hasEOL` (which PDF.js also sets
  on empty items, so the flag is carried over them). `TextLayer.textDivs[i]` renders the i-th
  non-marker item, so segments map 1:1 to span text nodes without measuring the DOM. The pure
  join (`joinItems`) and `rawOffsetToDom` are unit-tested.
- **No-text-layer detection** runs once on load over the first three pages' `getTextContent()`
  (same join + `raw.trim().length > 20` rule), independent of which pages are rendered, and is
  stored in `DocumentRecord.hasTextLayer`.
- **Dev aids:** a "Segments" toolbar toggle (dev builds only) outlines every segment in alternating
  colours, and `__deflink.pageText(n)` in the console returns a rendered page's PageText.
- **Known limitation:** "\n" normalizes to a space, so a match can still bridge two columns when a
  PDF's content order interleaves them line by line. Revisit if it shows up in practice.

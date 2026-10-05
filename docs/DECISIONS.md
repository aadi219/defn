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

## M3

- **Collision rule lives in core** (`collisions.ts`): surfaces compare by normalized token keys
  (so "well-defined" == "well defined"), within the same scope, per decision 4.
  `saveNewDefinition` re-checks inside its Dexie transaction and throws `TermCollisionError`.
- **No `dexie-react-hooks`.** `state/store.tsx` is a context + `useReducer` holding all terms and
  the current document's definitions, with an explicit `reload()` after writes. It is mounted with
  `key={docId}`.
- **Coordinates:** PDF.js 6 has no `convertToViewportRectangle`; `coords.ts` converts corners with
  `convertToPdfPoint` / `convertToViewportPoint` and normalizes. The viewer keeps each page's
  scale-1 `PageViewport` and clones it per scale, exposed via `PdfViewerHandle.getViewport`.
- **Selection rects** come from the selected text nodes only (clipped to the range), not
  `range.getClientRects()`, which also returns element boxes (e.g. the full-page `endOfContent`
  helper while selecting). They are then merged per line (§6.1).
- **Crops render only the region**: the page is rendered at scale 2 into a canvas the size of the
  crop with a translate transform, instead of rendering the full page and copying (§6.3 step 2's
  canvas reuse is unnecessary). Falls back to scale 1.5 over 300 KB.
  **`Crop.width/height` are the display size at 100% zoom** (pixels ÷ render scale).
- **Context menu** captures the selection when it opens, since clicking the menu item can clear
  it. Global single-key shortcuts are ignored while typing or while a modal `<dialog>` is open
  (`util/keys.ts`).
- **Dialog** is a native `<dialog>` (`showModal`) for focus trapping and Esc. The term field
  starts empty in M3 (suggestions arrive in M6). Collisions are detected as you type; Save is
  disabled and replaced by "Add as another definition of X" / "Rename".
- **Overlays:** `PdfPage` renders React overlay content (definition regions) in `.overlay-layer`;
  the dev segment outlines moved to a separate `.debug-host` that React never renders into.

## M4

- **Linking pipeline** (`features/linking`): `computeOccurrences` (match → `normRangeToRaw` →
  `rawOffsetToDom` → text-node rects, merged per line) then `filterOccurrences` (own definition
  region by rect intersection, suppressions by term + normalized start offset, optional "only after
  first definition" for document-scoped terms). Filtering and hit testing are pure and tested.
- **Occurrences are tagged with the scale** they were laid out at; underlines and hit testing only
  use them when that equals the page's current scale, so nothing is misaligned between a zoom and
  the text layer re-render (which triggers re-linking, §7.2).
- **`useLinking` re-links all live pages in an effect** when terms, definitions or suppressions
  change; the `set-state-in-effect` lint rule is disabled on that line because the source is DOM
  layout, which React doesn't track.
- **Underlines and regions are React overlay content**; definition regions flash after Go to source.
- **Hover:** one rAF-throttled `pointermove` listener on the document view, skipped while a button
  is held (drag-selecting). 300 ms open delay, 200 ms close delay, Esc closes, click (≤ 4 px travel,
  no selection) opens immediately; clicking elsewhere closes.
- **Popover** uses Floating UI with a virtual reference (page rect + occurrence rect, with the page
  as `contextElement` so `autoUpdate` follows scrolling), `strategy: "fixed"`, flip/shift/size.
  It loads all definitions of the term from IndexedDB on open; crops load per card as object URLs
  revoked on unmount. "Go to source" is disabled for definitions in other documents (opening other
  files needs the M8 recent-documents work).
- **Deferred:** the popover's **Pin** button arrives with the stack in M5, and **Edit** with the
  glossary editing flows in M7.

## M5

- **`bestDefinition` / `compareByPosition` live in core.** "Earliest" (decision 6) means by page,
  then by the top of the region. The popover lists this document's definitions in the same order,
  so its first card is the one Pin and `G` act on.
- **Stack state** (`features/stack/stackState.ts`, pure and tested) is `{ ids, trail }`: card order
  plus pin order for the breadcrumb. Both are persisted per document in localStorage
  (`deflink:stack:<docId>`), a small extension of "just the list of definition IDs" since the
  breadcrumb order can't be derived from card order. Malformed data falls back to an empty stack.
  Pinning an already pinned definition doesn't duplicate it; the card scrolls into view and flashes.
- **Pinned definitions can come from other documents** (global terms), so the panel loads them by
  id from IndexedDB, and unpins ids whose definitions no longer exist.
- **Panel:** closed by default and opened automatically on the first pin; a toolbar toggle shows
  the pin count. Open state and width (260–720 px, drag or arrow keys on the left-edge handle) are
  stored once for all documents in `deflink:stackPanel`.
- **Nested chips** use the document's linking matcher (`useLinking` returns it), so chips follow the
  same scope and inflection rules as underlines. A chip pins the term's best definition directly
  below its card; if that definition is already pinned, its card is highlighted instead.
- **Breadcrumb** shows the pin order (`trail`) once two or more cards are pinned; clicking a crumb
  scrolls to that card and highlights it.

## M6

- **Font style** comes from each text item's `fontName`, stored on its `Segment`; at capture time
  `page.commonObjs` resolves it to the font, and a font is italic/bold if its name says so (the §6.4
  list plus LaTeX's `CMTI`/`CMSL`/`CMBX`, but not math italic `CMMI`) or PDF.js's `italic`/`bold`
  flags are set. If any selected segment's font can't be resolved, no runs are passed (§6.4).
- **Runs are merged by style**, with separators attached to the preceding run. Heuristic 1 skips
  styled runs that are headings ("**Definition 1.1.**") or a single letter (italic variables).
- **Patterns, in order:** `Definition n (T)` (parentheses required, otherwise it would swallow the
  following sentence), `we say … is T if`, `we call … a T if`, `is called T`, `a T is a …`, then
  the plan's broad `we (say|call) … T (is|if)`. Deviations from §6.4: `is called` takes the term
  *after* the phrase ("such a space is called compact"), and the two narrower we-say/we-call
  patterns run first because the plan's form returns the subject ("space") rather than the term.
- **Confidence:** styled runs and the explicit patterns are `high`; `a T is a …` and the broad
  we-say/we-call form are `low`, and the dialog shows "Guessed from the wording. Check it before
  saving." until the field is edited. Suggestions are always prefilled and selected.

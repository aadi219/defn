# DefLink

Mark a passage in a PDF as the **definition** (or theorem, lemma, notation…) of a term, and every
other occurrence of that term becomes hoverable to show it. See `PLAN.md` for the design and
`docs/DECISIONS.md` for how it was implemented.

## Development

Requires Node and pnpm 12 via corepack (`corepack enable`).

```sh
pnpm install
pnpm dev        # web app at http://localhost:5173
pnpm check      # typecheck + lint + unit tests
pnpm fixtures   # generate the test PDFs into apps/web/e2e/fixtures
```

## Zotero plugin (Zotero 8–9)

```sh
pnpm --filter @deflink/zotero build   # → apps/zotero/dist/deflink-0.1.0.xpi
```

In Zotero: **Tools → Plugins → ⚙ → Install Plugin From File…** and choose the `.xpi`.

- Select text in a PDF and click **Mark as definition** in the selection popup. The definition is
  also saved as a Zotero highlight tagged `deflink:<kind>` with the comment `term: <label>`.
- Occurrences of known terms get a dotted underline; hover (or click) one for its definition, with
  **Go to source** and **Don't link here**.
- Data lives in `<Zotero data directory>/deflink/` (`store.json` plus `crops/*.png`). It is separate
  from the web app's browser storage.
- Debug messages are prefixed `DefLink:` (Help → Debug Output Logging).

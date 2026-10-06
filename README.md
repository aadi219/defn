# Defn

A couple of times that I've been reading through textbooks or papers, I'll come across a phrase, question, or new term that
uses a definition provided a few pages or chapters ago. Then, since the PDFs aren't always indexed or organized, I'll have
to scroll through pages or ctrl+F to find the definition which is just a little tedious.

I decided to use this opportunity to experiment a little with Claude and how comfortable I can become in giving it
autonomy to implement a small project. So I'll disclaim to any users that this project contained a decent amount of AI-Assistance.

It runs as a web app and as a Zotero plugin.

## Features

- **Mark a definition:** select text and press `D` (or right-click → *Mark as definition*). Choose
  the term, aliases, kind, an optional label such as "Def 2.3", and whether it applies to this
  document or to all of them.
- **Hover to recall:** a popover shows the definition as it appears on the page, with *Pin*,
  *Go to source* and *Don't link here*.
- **Stack panel:** pinned definitions stay in a side panel while you read. Terms inside them are
  linked too.
- **Glossary:** search, edit, merge and delete terms.
- **Your data stays local:** it is kept in the browser (IndexedDB) and can be exported or imported
  as JSON. A document is identified by the hash of its contents, so renaming or moving the file
  keeps its definitions.

## Getting started

Requires Node and pnpm 12 via corepack (`corepack enable`).

```sh
pnpm install
pnpm dev        # web app at http://localhost:5173
pnpm check      # typecheck + lint + unit tests
pnpm fixtures   # generate the test PDFs into apps/web/e2e/fixtures
```

## Zotero plugin (Zotero 8–9)

```sh
pnpm --filter @defn/zotero build   # → apps/zotero/dist/defn-0.1.0.xpi
```

In Zotero: **Tools → Plugins → ⚙ → Install Plugin From File…** and choose the `.xpi`.

- Select text in a PDF and click **Mark as definition** in the selection popup. The definition is
  also saved as a Zotero highlight tagged `defn:<kind>` with the comment `term: <label>`.
- Hover over (or click) an underlined term to see its definition.
- Data lives in `<Zotero data directory>/defn/`, separate from the web app's storage.
- Debug messages are prefixed `Defn:` (Help → Debug Output Logging).

## Project layout

| Path              | Contents                                               |
| ----------------- | ------------------------------------------------------ |
| `packages/core`   | Data model, term matching, export format (no DOM)      |
| `packages/viewer` | PDF.js-independent text and linking helpers            |
| `apps/web`        | React web app                                          |
| `apps/zotero`     | Zotero plugin                                          |

See `PLAN.md` for the design and `docs/DECISIONS.md` for how it was implemented.

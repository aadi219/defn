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

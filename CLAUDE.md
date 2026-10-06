# Defn — agent notes

- `PLAN.md` is the source of truth. Log deviations and design decisions in `docs/DECISIONS.md`.
- Work one milestone at a time, in small increments, and report back for review after each step.
- `pnpm check` must be green before a commit (pnpm 12 via corepack).
- **Do not run Playwright / e2e tests.** Ask the user to test features in the browser and report back.
- **Commits:** one line, `type: brief description` (Conventional Commit types: feat, fix, chore,
  test, refactor, docs, …). No body or trailers. Commit after each reviewed increment.

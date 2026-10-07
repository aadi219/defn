# Changelog

All notable changes to Defn are recorded here. Versions follow [Semantic Versioning](https://semver.org);
while the version is 0.x, minor releases may include breaking changes.

## [0.1.0] - 2026-10-07

First release.

### Web app

- Mark a selection as the definition of a term (`D` or right-click), with aliases, kind, label and
  document or global scope, with a term suggested from the wording.
- Every other occurrence of a term is underlined; hover or click for a popover with the definition
  as it appears on the page, _Pin_, _Go to source_ and _Don't link here_.
- Stack panel for pinned definitions, glossary to search, edit, merge and delete terms.
- Local storage in IndexedDB, with JSON export and import.

### Zotero plugin (Zotero 8–9)

- _Mark as definition_ in the reader's text selection popup; definitions are mirrored as Zotero
  highlights tagged `defn:<kind>`.
- Term occurrences are underlined in the reader, with a hover popover.
- Tools → _Defn: Clear All Data…_.
- Updates are delivered through GitHub Releases.

[0.1.0]: https://github.com/aadi219/defn/releases/tag/v0.1.0

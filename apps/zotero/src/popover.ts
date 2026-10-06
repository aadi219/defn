import { compareByPosition, type Definition, type Term } from "@deflink/core";
import { ensureStyle, h } from "./dom";
import { KIND_LABELS } from "./markDialog";
import { placePopover, type Box } from "./placement";
import type { DefLinkStore } from "./store";

const CSS = `
.deflink-popover { position: fixed; z-index: 10000; max-width: 520px; min-width: 240px;
  max-height: 70vh; overflow: auto; background: #fff; color: #222; border: 1px solid #ccc;
  border-radius: 8px; box-shadow: 0 8px 28px rgb(0 0 0 / 0.2); padding: 0.5rem 0.65rem;
  font: 13px system-ui, sans-serif; }
.deflink-popover header { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.35rem; }
.deflink-popover .badge { font-size: 11px; text-transform: uppercase; padding: 0 0.35rem;
  border-radius: 4px; background: #fff1c2; color: #6b4e00; }
.deflink-popover .def + .def { border-top: 1px solid #ddd; margin-top: 0.4rem; padding-top: 0.4rem; }
.deflink-popover img { display: block; max-width: 100%; background: #fff; }
.deflink-popover .text { margin: 0; color: #444; }
.deflink-popover .source { color: #666; font-size: 12px; margin-top: 0.2rem; }
.deflink-popover .actions { display: flex; gap: 0.4rem; margin-top: 0.5rem; }
.deflink-popover button { font: inherit; }
.deflink-popover :focus-visible { outline: 2px solid #2f5bd3; outline-offset: 1px; }
`;

export interface PopoverActions {
  goToSource(definition: Definition): void;
  dontLinkHere(): void;
}

/**
 * Hover / click popover for a linked occurrence in the Zotero reader (PLAN.md §7.3, reduced):
 * term, kind, label, crop (or text), source, Go to source and Don't link here.
 */
export class DefinitionPopover {
  readonly el: HTMLElement;
  private objectUrls: string[] = [];

  constructor(
    private readonly doc: Document,
    private readonly store: DefLinkStore,
    term: Term,
    docId: string,
    anchor: Box,
    actions: PopoverActions,
  ) {
    ensureStyle(doc, "deflink-popover-style", CSS);
    const all = store.definitionsForTerm(term.id);
    const current = all.filter((d) => d.docId === docId).sort(compareByPosition);
    const other = all.filter((d) => d.docId !== docId).sort((a, b) => b.createdAt - a.createdAt);
    const primary = current[0] ?? other[0];

    this.el = h(
      doc,
      "div",
      { className: "deflink-popover", role: "dialog", "aria-label": `Definition of ${term.label}` },
      h(
        doc,
        "header",
        {},
        h(doc, "strong", {}, term.label),
        primary && h(doc, "span", { className: "badge" }, KIND_LABELS[primary.kind]),
        primary?.label && h(doc, "span", { className: "source" }, primary.label),
      ),
      ...(all.length === 0
        ? [h(doc, "p", { className: "text" }, "This term has no definitions.")]
        : []),
      ...[...current, ...other].map((d) => this.card(d, d.docId === docId, actions)),
      h(
        doc,
        "div",
        { className: "actions" },
        h(
          doc,
          "button",
          {
            type: "button",
            disabled: !current[0],
            title: current[0] ? undefined : "The definition is in another document",
            onClick: () => current[0] && actions.goToSource(current[0]),
          },
          "Go to source",
        ),
        h(
          doc,
          "button",
          { type: "button", onClick: () => actions.dontLinkHere() },
          "Don't link here",
        ),
      ),
    );
    (doc.body ?? doc.documentElement).append(this.el);
    this.place(anchor);
  }

  private card(d: Definition, inThisDocument: boolean, actions: PopoverActions): HTMLElement {
    const { doc } = this;
    const crop = this.store.crop(d.cropId);
    const body = h(doc, "p", { className: "text" }, d.text);
    if (crop && crop.width > 0) {
      void this.store
        .readCrop(d.cropId)
        .then((bytes) => {
          const win = doc.defaultView;
          if (!win || !this.el.isConnected) return;
          const url = win.URL.createObjectURL(
            new win.Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/png" }),
          );
          this.objectUrls.push(url);
          const img = h(doc, "img", { alt: d.text, src: url });
          img.style.width = `${crop.width}px`;
          body.replaceWith(img);
        })
        .catch(() => {});
    }
    const source = inThisDocument
      ? `this document, p. ${d.page}`
      : `${this.store.documentTitle(d.docId) ?? "another document"}, p. ${d.page}`;
    return h(
      doc,
      "section",
      { className: "def" },
      body,
      h(
        doc,
        "div",
        { className: "source" },
        inThisDocument
          ? h(
              doc,
              "a",
              {
                href: "#",
                onClick: (e: Event) => {
                  e.preventDefault();
                  actions.goToSource(d);
                },
              },
              source,
            )
          : source,
      ),
    );
  }

  /** Positions the popover next to an anchor rect in client px. */
  place(anchor: Box) {
    const win = this.doc.defaultView;
    if (!win) return;
    const { width, height } = this.el.getBoundingClientRect();
    const { left, top } = placePopover(
      anchor,
      { width, height },
      {
        width: win.innerWidth,
        height: win.innerHeight,
      },
    );
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  contains(node: Node | null): boolean {
    return !!node && this.el.contains(node);
  }

  remove() {
    const win = this.doc.defaultView;
    for (const url of this.objectUrls) win?.URL.revokeObjectURL(url);
    this.objectUrls = [];
    this.el.remove();
  }
}

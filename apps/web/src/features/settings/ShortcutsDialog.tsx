import { Modal } from "../../components/Modal";

const SHORTCUTS: { group: string; keys: { keys: string[]; action: string }[] }[] = [
  {
    group: "Definitions",
    keys: [
      { keys: ["D"], action: "Mark the selected text as a definition" },
      { keys: ["P"], action: "Pin the open popover’s definition" },
      { keys: ["G"], action: "Go to the open popover’s definition" },
      { keys: ["Esc"], action: "Close the popover, menu or dialog" },
    ],
  },
  {
    group: "Reading",
    keys: [
      { keys: ["←", "→"], action: "Previous / next page" },
      { keys: ["j", "k"], action: "Next / previous page" },
      { keys: ["Home", "End"], action: "First / last page" },
      { keys: ["+", "−"], action: "Zoom in / out" },
      { keys: ["0"], action: "Fit width" },
      { keys: ["U"], action: "Show or hide underlines" },
    ],
  },
  { group: "Help", keys: [{ keys: ["?"], action: "Show this list" }] },
];

/** Keyboard shortcut reference (`?`, PLAN.md §M8). */
export function ShortcutsDialog({ onClose }: { onClose(): void }) {
  return (
    <Modal title="Keyboard shortcuts" className="shortcuts-dialog" onCancel={onClose}>
      {SHORTCUTS.map(({ group, keys }) => (
        <section key={group}>
          <h3>{group}</h3>
          <dl className="shortcut-list">
            {keys.map(({ keys: k, action }) => (
              <div key={action}>
                <dt>
                  {k.map((key) => (
                    <kbd key={key}>{key}</kbd>
                  ))}
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <div className="dialog-actions">
        <button type="button" className="primary" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { Modal } from "../../components/Modal";
import { DEFAULT_SETTINGS, useSettings } from "../../state/settings";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Linking and display preferences, plus storage usage (PLAN.md §M8, §12). */
export function SettingsDialog({ onClose }: { onClose(): void }) {
  const { settings, update } = useSettings();
  const [usage, setUsage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    navigator.storage
      ?.estimate()
      .then(({ usage: used, quota }) => {
        if (cancelled || used === undefined) return;
        setUsage(
          quota ? `${formatBytes(used)} of ${formatBytes(quota)} available` : formatBytes(used),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Modal title="Settings" className="settings-dialog" onCancel={onClose}>
      <fieldset className="settings-group">
        <legend>Linking</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.inflection}
            onChange={(e) => update({ inflection: e.target.checked })}
          />
          Match plural and singular forms (“compact spaces” links “compact space”)
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.onlyAfterFirstDefinition}
            onChange={(e) => update({ onlyAfterFirstDefinition: e.target.checked })}
          />
          Only link a document’s terms after the page where they are first defined
        </label>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Display</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.showUnderlines}
            onChange={(e) => update({ showUnderlines: e.target.checked })}
          />
          Show underlines <kbd>U</kbd>
        </label>
        <label className="checkbox">
          <input
            type="color"
            value={settings.underlineColor}
            onChange={(e) => update({ underlineColor: e.target.value })}
          />
          Underline colour
          {settings.underlineColor !== DEFAULT_SETTINGS.underlineColor && (
            <button
              type="button"
              className="link-button"
              onClick={() => update({ underlineColor: DEFAULT_SETTINGS.underlineColor })}
            >
              Reset
            </button>
          )}
        </label>
      </fieldset>

      <fieldset className="settings-group">
        <legend>Storage</legend>
        <p className="muted">
          {usage ? `This browser stores ${usage} for DefLink.` : "Storage usage is unavailable."}{" "}
          Use Data ▾ → Export all… to back up.
        </p>
      </fieldset>

      <div className="dialog-actions">
        <button type="button" className="primary" onClick={onClose} autoFocus>
          Done
        </button>
      </div>
    </Modal>
  );
}

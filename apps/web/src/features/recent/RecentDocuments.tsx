import { useEffect, useState } from "react";
import { forgetRecentDocument, listRecentDocuments, type RecentDocument } from "../../store/repo";

const RECENT_LIMIT = 10;
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Recently opened documents on the start screen (PLAN.md §M8). */
export function RecentDocuments(props: {
  /** Whether stored file handles can be reopened directly (Chromium). */
  handlesSupported: boolean;
  onOpen(recent: RecentDocument): void;
}) {
  const { handlesSupported, onOpen } = props;
  const [recent, setRecent] = useState<RecentDocument[] | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listRecentDocuments(RECENT_LIMIT)
      .then((list) => {
        if (!cancelled) setRecent(list);
      })
      .catch((err: unknown) => console.error("Failed to load recent documents", err));
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (!recent || recent.length === 0) return null;
  return (
    <section className="recent" aria-labelledby="recent-title">
      <h2 id="recent-title">Recent</h2>
      <ul>
        {recent.map((r) => {
          const { document: d } = r;
          const direct = handlesSupported && r.handle !== undefined;
          return (
            <li key={d.id}>
              <button
                type="button"
                className="recent-open"
                onClick={() => onOpen(r)}
                title={direct ? `Open ${d.fileName}` : `Choose ${d.fileName} again to open it`}
              >
                <span className="recent-title">{d.title}</span>
                <span className="recent-meta">
                  {d.fileName} · {dateFormat.format(d.lastOpenedAt)} · {r.definitionCount}{" "}
                  {r.definitionCount === 1 ? "definition" : "definitions"}
                  {!direct && " · choose file again"}
                </span>
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${d.title} from recent documents`}
                title="Remove from list (definitions are kept)"
                onClick={() =>
                  void forgetRecentDocument(d.id)
                    .then(() => setVersion((v) => v + 1))
                    .catch((err: unknown) => console.error(err))
                }
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

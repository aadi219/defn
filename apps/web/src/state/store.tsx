import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Definition, Suppression, Term } from "@deflink/core";
import { listDefinitionsForDoc, listSuppressionsForDoc, listTerms } from "../store/repo";

/** Mount with `key={docId}` so each document starts from a fresh state. */
interface State {
  /** All terms (every scope); filter with `isInScope` where needed. */
  terms: Term[];
  /** Definitions located in the current document. */
  definitions: Definition[];
  /** "Don't link here" entries for the current document. */
  suppressions: Suppression[];
}

type Action = { type: "loaded" } & State;

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case "loaded":
      return {
        terms: action.terms,
        definitions: action.definitions,
        suppressions: action.suppressions,
      };
  }
}

interface StoreValue extends State {
  docId: string | null;
  /** Re-reads terms and the current document's definitions from IndexedDB. */
  reload(): Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider(props: { docId: string | null; children: ReactNode }) {
  const { docId, children } = props;
  const [state, dispatch] = useReducer(reducer, { terms: [], definitions: [], suppressions: [] });

  const reload = useCallback(async () => {
    const [terms, definitions, suppressions] = await Promise.all([
      listTerms(),
      docId ? listDefinitionsForDoc(docId) : Promise.resolve([]),
      docId ? listSuppressionsForDoc(docId) : Promise.resolve([]),
    ]);
    dispatch({ type: "loaded", terms, definitions, suppressions });
  }, [docId]);

  useEffect(() => {
    reload().catch((err: unknown) => console.error("Failed to load store", err));
  }, [reload]);

  const value = useMemo(() => ({ ...state, docId, reload }), [state, docId, reload]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error("useStore must be used inside StoreProvider");
  return value;
}

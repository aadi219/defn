import { useEffect, useState } from "react";
import { parseStack, type StackState } from "./stackState";

const PANEL_KEY = "deflink:stackPanel";
export const PANEL_MIN_WIDTH = 260;
export const PANEL_MAX_WIDTH = 720;
const PANEL_DEFAULT_WIDTH = 360;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`Could not save ${key}`, err);
  }
}

/** The pinned stack for a document, persisted in localStorage (PLAN.md §7.4). */
export function useStack(docId: string) {
  const key = `deflink:stack:${docId}`;
  const [state, setState] = useState<StackState>(() => parseStack(read(key)));
  useEffect(() => write(key, JSON.stringify(state)), [key, state]);
  return [state, setState] as const;
}

export interface PanelPrefs {
  open: boolean;
  width: number;
}

export const clampPanelWidth = (w: number) =>
  Math.round(Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, w)));

/** Whether the stack panel is open and its width; shared across documents. */
export function usePanelPrefs() {
  const [prefs, setPrefs] = useState<PanelPrefs>(() => {
    try {
      const v = JSON.parse(read(PANEL_KEY) ?? "{}") as Partial<PanelPrefs>;
      return {
        open: v.open === true,
        width: clampPanelWidth(typeof v.width === "number" ? v.width : PANEL_DEFAULT_WIDTH),
      };
    } catch {
      return { open: false, width: PANEL_DEFAULT_WIDTH };
    }
  });
  useEffect(() => write(PANEL_KEY, JSON.stringify(prefs)), [prefs]);
  return [prefs, setPrefs] as const;
}

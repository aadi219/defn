/**
 * File System Access API helpers (Chromium only), used to reopen recent documents without
 * re-selecting the file (PLAN.md §M8). Other browsers fall back to the file input.
 */

type PermissionState = "granted" | "denied" | "prompt";

/** The parts of FileSystemFileHandle used here; the permission methods are not in lib.dom yet. */
export interface PdfFileHandle extends FileSystemFileHandle {
  queryPermission?(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(options: { mode: "read" }): Promise<PermissionState>;
}

interface OpenFilePickerWindow {
  showOpenFilePicker?(options: {
    types: { description: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption?: boolean;
    multiple?: boolean;
  }): Promise<PdfFileHandle[]>;
}

interface HandleItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}

export function canUseFileHandles(): boolean {
  return typeof (window as OpenFilePickerWindow).showOpenFilePicker === "function";
}

/**
 * Shows the native PDF picker. Returns null if the user cancels; throws if the API is missing
 * (check `canUseFileHandles` first).
 */
export async function pickPdfWithHandle(): Promise<{ file: File; handle: PdfFileHandle } | null> {
  const picker = (window as OpenFilePickerWindow).showOpenFilePicker;
  if (!picker) throw new Error("File System Access API is not available");
  try {
    const [handle] = await picker.call(window, {
      types: [{ description: "PDF documents", accept: { "application/pdf": [".pdf"] } }],
      multiple: false,
    });
    return handle ? { file: await handle.getFile(), handle } : null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }
}

/** The handle of a dropped file, where the browser provides one. */
export async function handleFromDrop(
  item: DataTransferItem | undefined,
): Promise<PdfFileHandle | null> {
  const get = (item as HandleItem | undefined)?.getAsFileSystemHandle;
  if (!item || !get) return null;
  try {
    const handle = await get.call(item);
    return handle?.kind === "file" ? (handle as PdfFileHandle) : null;
  } catch {
    return null;
  }
}

/**
 * Reads the file behind a stored handle, asking for permission if needed (call from a user
 * gesture). Returns null if permission is refused or the file is gone.
 */
export async function fileFromHandle(handle: PdfFileHandle): Promise<File | null> {
  try {
    const state = (await handle.requestPermission?.({ mode: "read" })) ?? "granted";
    if (state !== "granted") return null;
    return await handle.getFile();
  } catch {
    return null;
  }
}

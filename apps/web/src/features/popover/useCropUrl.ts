import { useEffect, useState } from "react";
import { getCrop } from "../../store/repo";

/** Object URL for a stored crop, revoked when the crop changes or the caller unmounts. */
export function useCropUrl(cropId: string): { url: string; width: number } | null {
  const [state, setState] = useState<{ cropId: string; url: string; width: number } | null>(null);
  useEffect(() => {
    let url: string | undefined;
    let cancelled = false;
    getCrop(cropId)
      .then((crop) => {
        if (cancelled || !crop) return;
        url = URL.createObjectURL(crop.blob);
        setState({ cropId, url, width: crop.width });
      })
      .catch((err: unknown) => console.error("Failed to load crop", err));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [cropId]);
  return state?.cropId === cropId ? state : null;
}

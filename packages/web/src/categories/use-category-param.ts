import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

const PARAM = "category";

/**
 * The category a Settings count link names, read once for Filter. The URL
 * then drops it in place, so a reload never brings back a stale filter.
 */
export function useCategoryParam(): string | null {
  const [searchParams, setSearchParams] = useSearchParams();
  const [initial] = useState(() => searchParams.get(PARAM));
  useEffect(() => {
    if (!searchParams.has(PARAM)) return;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(PARAM);
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);
  return initial;
}

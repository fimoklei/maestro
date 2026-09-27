import { useEffect, useState } from "react";

// Whether an element is narrower than `px`, kept current by a ResizeObserver.
export function useNarrowerThan(px: number) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (element === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setNarrow(entry.contentRect.width < px);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, px]);
  return { ref: setElement, narrow };
}

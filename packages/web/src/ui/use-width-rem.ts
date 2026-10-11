import { type RefObject, useLayoutEffect, useState } from "react";

/** The width of the element `find` returns from `ref`'s, in rem, kept current; null until measured. */
export function useWidthRem<E extends Element>(
  ref: RefObject<E | null>,
  find: (element: E) => Element | null | undefined,
): number | null {
  const [width, setWidth] = useState<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `find` is read once, on mount
  useLayoutEffect(() => {
    const target = ref.current === null ? null : find(ref.current);
    if (target == null) return;
    const rem =
      parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const report = (px: number) => setWidth(px > 0 ? px / rem : null);
    report(target.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) report(entry.contentRect.width);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

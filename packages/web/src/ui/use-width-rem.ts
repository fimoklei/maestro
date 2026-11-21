import { type RefObject, useLayoutEffect, useRef, useState } from "react";

const remOf = (px: number) =>
  px / (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);

/** The width of the element `find` returns from `ref`'s, in rem, kept current; null until measured. */
export function useWidthRem<E extends Element>(
  ref: RefObject<E | null>,
  find: (element: E) => Element | null | undefined,
): number | null {
  const [width, setWidth] = useState<number | null>(null);
  const target = useRef<Element | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `find` is read once, on mount
  useLayoutEffect(() => {
    target.current = ref.current === null ? null : (find(ref.current) ?? null);
    const element = target.current;
    if (element === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry === undefined) return;
      // The border box, as `getBoundingClientRect` below measures it.
      const px =
        entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
      setWidth(px > 0 ? remOf(px) : null);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  // A render that resizes the element, such as one that opens a detail pane
  // beside a table, is measured before the browser paints; the resize report
  // comes a frame later, too late for that frame (#1931).
  useLayoutEffect(() => {
    const px = target.current?.getBoundingClientRect().width ?? 0;
    if (px === 0) return;
    const rem = remOf(px);
    if (rem !== width) setWidth(rem);
  });
  return width;
}

import { useCallback, useEffect, useRef, useState } from "react";

const SHOW_AFTER_MS = 1300;
const HOLD_MS = 500;

export function useReadSkeleton(reading: boolean): {
  visible: boolean;
  /** The reader pressed Re-read: show the skeleton now, not after 1.3 s. */
  press: () => void;
} {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  const show = useCallback(() => {
    shownAt.current = Date.now();
    setVisible(true);
  }, []);

  useEffect(() => {
    if (reading && !visible) {
      const timer = setTimeout(show, SHOW_AFTER_MS);
      return () => clearTimeout(timer);
    }
    if (!reading && visible) {
      const remaining = shownAt.current + HOLD_MS - Date.now();
      if (remaining <= 0) {
        setVisible(false);
        return;
      }
      const timer = setTimeout(() => setVisible(false), remaining);
      return () => clearTimeout(timer);
    }
  }, [reading, visible, show]);

  return { visible, press: show };
}

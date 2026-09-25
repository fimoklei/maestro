import { useEffect, useState } from "react";

// Half the finest step a freshness line shows ("1 min ago").
const TICK_MS = 30_000;

// The current time, renewed on an interval so a "read … ago" reading ticks
// without a re-read (design-principles: the freshness line ticks).
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

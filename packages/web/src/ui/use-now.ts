import { useEffect, useState } from "react";

// Half the finest step a freshness line shows ("1 min ago").
const TICK_MS = 30_000;

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

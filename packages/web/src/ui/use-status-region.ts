import { useEffect, useState } from "react";

// The screen's one status region: the read's announcement, overruled by a
// write's busy label and done sentence. A write cleared to "" stays silent.
export function useStatusRegion(
  read: string,
): readonly [string, (write: string) => void] {
  const [write, setWrite] = useState<string | null>(null);
  // A newer read outranks an earlier write.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires on each new read
  useEffect(() => setWrite(null), [read]);
  return [write ?? read, setWrite];
}

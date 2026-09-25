import type { ReactNode } from "react";

// A version, tag, path, ref or hash: the one thing Geist Mono sets.
export function MachineValue({ children }: { children: ReactNode }) {
  return <span className="font-mono">{children}</span>;
}

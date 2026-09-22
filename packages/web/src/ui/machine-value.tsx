import type { ReactNode } from "react";

// A version, tag, path, ref or hash — the one thing Geist Mono sets, at the
// size of the slot it sits in (ADR-0033 §6).
export function MachineValue({ children }: { children: ReactNode }) {
  return <span className="font-mono">{children}</span>;
}

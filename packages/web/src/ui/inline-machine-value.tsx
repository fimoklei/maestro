import type { ReactNode } from "react";
import { MachineValue } from "./machine-value";

// A machine value inside running text, tinted so it reads as something to type or copy.
export function InlineMachineValue({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-chip bg-gray-3 px-tight">
      <MachineValue>{children}</MachineValue>
    </span>
  );
}

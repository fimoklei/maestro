import { FirstRunGate } from "./first-run-gate";

// The connect gate is its own frame (#991): no sidebar and no panel, so
// nothing competes with the one action that screen offers (ADR-0015).
export function GateShell() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-gray-1 p-page">
      <FirstRunGate />
    </div>
  );
}

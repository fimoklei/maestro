import { Logo } from "../ui/logo";
import { FirstRunGate } from "./first-run-gate";

// The connect gate is its own frame (#991, #995): the mark in a 48px row, then
// one block. No sidebar and no panel: nothing is connected, so a frame would
// offer screens that cannot open (ADR-0015).
export function GateShell() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-gray-1">
      <header className="flex h-12 shrink-0 items-center px-panel">
        <Logo />
      </header>
      <main className="flex min-h-0 flex-1 flex-col px-panel pt-page pb-page">
        <FirstRunGate />
      </main>
    </div>
  );
}

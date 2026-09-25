import { Logo } from "../ui/logo";
import { FirstRunGate } from "./first-run-gate";

// No sidebar: nothing is connected, so it would offer screens that cannot open.
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

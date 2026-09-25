import { FirstRunGate } from "./first-run-gate";
import { NarrowBar } from "./narrow-bar";
import { Sidebar } from "./sidebar";

// The content panel is drawn by each screen; below 1024px the sidebar folds
// into a 48px bar.
export function AppShell() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-2 sidebar:flex-row">
      <NarrowBar className="sidebar:hidden" />
      <Sidebar className="max-sidebar:hidden" />
      {/* The panel's own border makes the seam. */}
      <main className="min-h-0 min-w-0 grow p-inline pt-0 sidebar:pt-inline sidebar:pl-0">
        <FirstRunGate />
      </main>
    </div>
  );
}

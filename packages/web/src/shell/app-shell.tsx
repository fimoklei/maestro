import { FirstRunGate } from "./first-run-gate";
import { NarrowBar } from "./narrow-bar";
import { Sidebar } from "./sidebar";

// The frame every connected screen sits in (#991): a 244px sidebar on the page
// ground beside the content panel, which the screen itself draws. Below 1024px
// the sidebar folds into a 48px bar.
export function AppShell() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-2 sidebar:flex-row">
      <NarrowBar className="sidebar:hidden" />
      <Sidebar className="max-sidebar:hidden" />
      {/* The panel's own border makes the seam, so the main region only holds
          it away from the window edge. */}
      <main className="min-h-0 min-w-0 grow p-inline pt-0 sidebar:pt-inline sidebar:pl-0">
        <FirstRunGate />
      </main>
    </div>
  );
}

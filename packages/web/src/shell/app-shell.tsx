import { FirstRunGate } from "./first-run-gate";
import { Sidebar } from "./sidebar";
import { StatusBar } from "./status-bar";

// The cockpit layout: a top status bar over a sidebar (view nav + Targets +
// inline register) beside the routed main region.
export function AppShell() {
  return (
    <div className="flex h-screen flex-col bg-canvas text-fg">
      <StatusBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        {/* Size container: the inventory's table frame bounds itself to this
            region's height, sized by the flex row, never its contents. */}
        <main className="@container-[size] min-w-0 flex-1 overflow-auto p-6">
          <FirstRunGate />
        </main>
      </div>
    </div>
  );
}

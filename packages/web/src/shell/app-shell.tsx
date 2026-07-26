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
        {/* A size container, so a view can bound something to the height of the
            scrolling region — the inventory's table frame needs it, and CSS has
            no other name for it. The region is sized by the flex row around it,
            never by its contents, so size containment costs nothing. */}
        <main className="@container-[size] min-w-0 flex-1 overflow-auto p-6">
          <FirstRunGate />
        </main>
      </div>
    </div>
  );
}

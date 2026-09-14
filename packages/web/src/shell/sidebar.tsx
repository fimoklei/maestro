import { useLocation, useNavigate } from "react-router";
import { cn } from "../ui/cn";
import { NavItem } from "../ui/nav-item";
import { SidebarRegister } from "./sidebar-register";
import { TargetsList } from "./targets-list";
import { useFirstRun } from "./use-first-run";

// On a first run the sidebar goes inert: nav dimmed, Targets reads its empty
// state,
// register affordance hidden — nothing to deploy yet. Also hidden on the gate
// routes themselves: `+ repo` appearing mid-confirmation would compete with it.

// Two groups, because the two jobs are different: Consume is what you deploy
// from, Author is the harness you write. Keeping Harness out of Consume is what
// stops authoring state competing with Inventory (ADR-0021, #516).
const NAV_GROUPS = [
  {
    label: "Consume",
    items: [
      { to: "/", label: "Deploy-state", icon: "⇶" },
      { to: "/inventory", label: "Inventory", icon: "▤" },
    ],
  },
  {
    label: "Author",
    items: [{ to: "/harness", label: "Harness", icon: "✎" }],
  },
] as const;

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const firstRun = useFirstRun();
  const onGate = pathname === "/welcome" || pathname.startsWith("/welcome/");

  return (
    <aside
      aria-label="Navigation and targets"
      className={cn(
        "flex w-64 shrink-0 flex-col gap-0.5 overflow-y-auto border-line border-r p-2.5",
        onGate && "max-md:hidden",
      )}
    >
      {NAV_GROUPS.map((group, index) => (
        <div key={group.label}>
          <div className={cn("m-label mb-1.5 px-3", index > 0 && "mt-5")}>
            {group.label}
          </div>
          <nav aria-label={group.label} className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <NavItem
                key={item.to}
                icon={item.icon}
                label={item.label}
                active={pathname === item.to}
                disabled={firstRun}
                onClick={firstRun ? undefined : () => navigate(item.to)}
              />
            ))}
          </nav>
        </div>
      ))}
      <div className="m-label mt-5 mb-1.5 px-3">Targets</div>
      {firstRun ? (
        <p className="px-3 font-mono text-dim text-tag">
          No targets yet. Select Connect Inventory to read the connected
          Harness.
        </p>
      ) : (
        <>
          <TargetsList />
          {onGate ? null : (
            <div className="mt-2.5 px-3">
              <SidebarRegister />
            </div>
          )}
        </>
      )}
    </aside>
  );
}

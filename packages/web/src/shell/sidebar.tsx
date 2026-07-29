import { useLocation, useNavigate } from "react-router";
import { NavItem } from "../ui/nav-item";
import { SidebarRegister } from "./sidebar-register";
import { TargetsList } from "./targets-list";
import { useFirstRun } from "./use-first-run";

// On a first run the sidebar goes inert: nav dimmed, Targets reads "none yet",
// register affordance hidden — nothing to deploy yet. Also hidden on the gate
// routes themselves: `+ repo` appearing mid-confirmation would compete with it.
const NAV_ITEMS = [
  { to: "/", label: "Deploy-state", icon: "⇶" },
  { to: "/inventory", label: "Inventory", icon: "▤" },
] as const;

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const firstRun = useFirstRun();
  const onGate = pathname === "/welcome" || pathname.startsWith("/welcome/");

  return (
    <aside
      aria-label="Sidebar"
      className="flex w-64 shrink-0 flex-col gap-0.5 overflow-y-auto border-line border-r p-2.5"
    >
      <nav aria-label="Views" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
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
      <div className="m-label mt-5 mb-1.5 px-3">Targets</div>
      {firstRun ? (
        <p className="px-3 font-mono text-dim text-tag">none yet</p>
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

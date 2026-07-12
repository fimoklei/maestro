import { useLocation, useNavigate } from "react-router-dom";
import { NavItem } from "../ui/nav-item";
import { SidebarRegister } from "./sidebar-register";
import { TargetsList } from "./targets-list";
import { useFirstRun } from "./use-first-run";

// Sidebar view navigation. NavItem stays presentational (a button); routing is
// wired here via the router's navigate/location so the active view is driven by
// the URL, not local state. On a first run (design f1-empty) the sidebar goes
// inert: nav is dimmed and unclickable (there is nothing behind it yet but the
// wizard, which the gate already enforces), Targets reads "none yet" instead of
// the real list, and the register affordance disappears — registering a repo
// before an inventory exists has nothing to deploy. The register affordance
// also stays hidden on the wizard routes themselves: the wizard's register
// step (issue #97) renders the same form as its main card, and mounting it
// twice would duplicate the input's id (broken labelling) and compete with
// the step it is teaching.
const NAV_ITEMS = [
  { to: "/", label: "Deploy-state", icon: "⇶" },
  { to: "/inventory", label: "Inventory", icon: "▤" },
] as const;

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const firstRun = useFirstRun();
  const onWizard = pathname === "/welcome" || pathname.startsWith("/welcome/");

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-0.5 overflow-y-auto border-line border-r p-2.5">
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
          {onWizard ? null : (
            <div className="mt-2.5 px-3">
              <SidebarRegister />
            </div>
          )}
        </>
      )}
    </aside>
  );
}

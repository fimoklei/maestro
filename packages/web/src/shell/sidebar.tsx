import { useLocation, useNavigate } from "react-router-dom";
import { NavItem } from "../ui/nav-item";
import { SidebarRegister } from "./sidebar-register";
import { TargetsList } from "./targets-list";

// Sidebar view navigation. NavItem stays presentational (a button); routing is
// wired here via the router's navigate/location so the active view is driven by
// the URL, not local state. The Targets list and inline register affordance are
// added in their own cycles below the nav.
const NAV_ITEMS = [
  { to: "/", label: "Deploy-state", icon: "⇶" },
  { to: "/inventory", label: "Inventory", icon: "▤" },
  { to: "/connect", label: "Connect", icon: "⚙" },
] as const;

export function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-0.5 overflow-y-auto border-line border-r p-2.5">
      <nav aria-label="Views" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.to}
            icon={item.icon}
            label={item.label}
            active={pathname === item.to}
            onClick={() => navigate(item.to)}
          />
        ))}
      </nav>
      <div className="m-label mt-5 mb-1.5 px-3">Targets</div>
      <TargetsList />
      <div className="mt-2.5 px-3">
        <SidebarRegister />
      </div>
    </aside>
  );
}

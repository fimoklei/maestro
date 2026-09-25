import { useLocation, useNavigate } from "react-router";
import { cn } from "../ui/cn";
import { Logo } from "../ui/logo";
import { NavItem } from "../ui/nav-item";
import { HarnessButton } from "./harness-button";
import { SCREEN_GROUPS } from "./screens";
import { useSidebarCounters } from "./use-sidebar-counters";

// Two groups: what you deploy from, and *Author*, the harness you write (#516).

export function Sidebar({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const counters = useSidebarCounters();

  return (
    <aside
      aria-label="Navigation"
      className={cn(
        "flex w-[244px] shrink-0 flex-col gap-panel overflow-y-auto px-cell py-panel",
        className,
      )}
    >
      <Logo className="px-inline" />
      <HarnessButton />
      {SCREEN_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-tight">
          {group.headed ? (
            <div className="px-inline text-gray-11 text-meta">
              {group.label}
            </div>
          ) : null}
          <nav aria-label={group.label} className="flex flex-col gap-[2px]">
            {group.items.map((item) => (
              <NavItem
                key={item.to}
                icon={item.icon}
                label={item.label}
                counter={counters[item.to] ?? null}
                active={pathname === item.to}
                onClick={() => navigate(item.to)}
              />
            ))}
          </nav>
        </div>
      ))}
    </aside>
  );
}

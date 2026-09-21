import { useLocation, useNavigate } from "react-router";
import { cn } from "../ui/cn";
import { Logo } from "../ui/logo";
import { NavItem } from "../ui/nav-item";
import { HarnessButton } from "./harness-button";
import { SCREEN_GROUPS } from "./screens";

// The sidebar (#991): the product mark, the Harness button and its menu, then
// the screens. Two groups, because the two jobs are different: the first block
// is what you deploy from, *Author* is the harness you write (ADR-0021, #516).

export function Sidebar({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

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

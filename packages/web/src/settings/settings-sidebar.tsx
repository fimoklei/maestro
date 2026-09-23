import { ChevronLeft } from "lucide-react";
import { cn } from "../ui/cn";
import { NavItem } from "../ui/nav-item";
import { BACK_TO_APP, PERSONAL, SETTINGS } from "./settings-copy";
import type { SettingsPage } from "./settings-pages";

// Inside Settings the cockpit's sidebar is replaced, not extended (#995):
// Back to app, then the pages under the heading Personal. Presentational: the
// frame owns the router.

export function SettingsSidebar({
  pages,
  active,
  onNavigate,
  onBack,
  className,
}: {
  pages: readonly SettingsPage[];
  /** The open page's path. */
  active: string;
  onNavigate: (to: string) => void;
  onBack: () => void;
  className?: string;
}) {
  return (
    <aside
      aria-label={SETTINGS}
      className={cn(
        "flex w-[244px] shrink-0 flex-col gap-tight overflow-y-auto p-inline",
        className,
      )}
    >
      <NavItem
        icon={<ChevronLeft size={16} strokeWidth={1.5} />}
        label={BACK_TO_APP}
        onClick={onBack}
      />
      <div className="mt-inline flex flex-col gap-tight">
        <div className="flex h-control-row items-center px-inline text-gray-11 text-meta">
          {PERSONAL}
        </div>
        <nav aria-label={PERSONAL} className="flex flex-col gap-[2px]">
          {pages.map((page) => (
            <NavItem
              key={page.to}
              label={page.label}
              active={page.to === active}
              onClick={() => onNavigate(page.to)}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}

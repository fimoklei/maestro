import { ChevronLeft } from "lucide-react";
import { cn } from "../ui/cn";
import { Icon } from "../ui/icon";
import { NavItem } from "../ui/nav-item";
import { BACK_TO_APP, PERSONAL, SETTINGS } from "./settings-copy";
import type { SettingsPage, SettingsPageSignal } from "./settings-pages";

// Inside Settings the cockpit's sidebar is replaced, not extended (#995):
// Back to app, then the pages under the heading Personal. Presentational: the
// frame owns the router.

export function SettingsSidebar({
  pages,
  active,
  signal,
  onNavigate,
  onBack,
  className,
}: {
  pages: readonly SettingsPage[];
  signal: SettingsPageSignal;
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
        icon={<Icon of={ChevronLeft} />}
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
              signal={signal?.to === page.to ? signal.text : null}
              onClick={() => onNavigate(page.to)}
            />
          ))}
        </nav>
      </div>
    </aside>
  );
}

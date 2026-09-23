import { ChevronLeft, Menu } from "lucide-react";
import { ActionsMenu } from "../ui/actions-menu";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { BACK_TO_APP } from "./settings-copy";
import type { SettingsPage } from "./settings-pages";

// Below 1024px the Settings sidebar folds into this 48px bar (#995): Back to
// app left, one menu button right carrying the pages the sidebar lists.
export function SettingsNarrowBar({
  pages,
  onNavigate,
  onBack,
  className,
}: {
  pages: readonly SettingsPage[];
  onNavigate: (to: string) => void;
  onBack: () => void;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-inline px-cell",
        className,
      )}
    >
      <Button variant="quiet" onClick={onBack}>
        <ChevronLeft aria-hidden="true" size={16} strokeWidth={1.5} />
        {BACK_TO_APP}
      </Button>
      <div className="ml-auto">
        <ActionsMenu
          label="Menu"
          items={pages.map((page) => ({
            label: page.label,
            onSelect: () => onNavigate(page.to),
          }))}
          trigger={
            <Button size="icon" variant="quiet">
              <Menu aria-hidden="true" size={16} strokeWidth={1.5} />
            </Button>
          }
        />
      </div>
    </header>
  );
}

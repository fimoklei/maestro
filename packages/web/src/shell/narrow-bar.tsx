import { Menu } from "lucide-react";
import { useNavigate } from "react-router";
import { ActionsMenu } from "../ui/actions-menu";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Logo } from "../ui/logo";
import { SCREENS, SETTINGS } from "./screens";
import { useHarnessSummary } from "./use-harness-summary";

// Below 1024px the sidebar folds into this 48px bar (#991): the mark and the
// Harness name left, one menu button right. The menu carries the same screens
// the sidebar lists, so nothing is reachable only at a wide window.

export function NarrowBar({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { path, label, meta } = useHarnessSummary();

  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-inline px-panel",
        className,
      )}
    >
      <Logo />
      {path === null ? null : (
        // The same two facts the sidebar's Harness button names, so the narrow
        // window loses nothing the wide one shows.
        <span className="flex min-w-0 flex-col">
          <span
            title={path}
            className="truncate font-medium font-ui text-gray-12 text-row"
          >
            {label}
          </span>
          {meta === null ? null : (
            <span className="truncate font-mono text-gray-11 text-meta">
              {meta}
            </span>
          )}
        </span>
      )}
      <div className="ml-auto">
        <ActionsMenu
          label="Menu"
          // One menu for both, so Settings joins the screens here
          // rather than sitting behind a second trigger.
          items={[...SCREENS, SETTINGS].map((screen) => ({
            label: screen.label,
            onSelect: () => navigate(screen.to),
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

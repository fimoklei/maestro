import { ChevronDown } from "lucide-react";
import { useNavigate } from "react-router";
import { ActionsMenu } from "../ui/actions-menu";
import { cn } from "../ui/cn";
import { HOVER_TRANSITION } from "../ui/hover-transition";
import { SETTINGS } from "./screens";
import { useHarnessSummary } from "./use-harness-summary";

// The sidebar's Harness button (#991): what you are steering, without opening
// a screen. It names the connected Harness, its release and its skill count,
// and opens the menu that holds Settings.

const MENU_LABEL = "Harness menu";

export function HarnessButton() {
  const navigate = useNavigate();
  const { path, label, meta } = useHarnessSummary();

  return (
    <ActionsMenu
      label={MENU_LABEL}
      fitTrigger
      items={[
        {
          label: SETTINGS.label,
          onSelect: () => navigate(SETTINGS.to),
        },
      ]}
      trigger={
        <button
          type="button"
          className={cn(
            "flex h-12 w-full items-center gap-inline rounded-control border border-transparent px-inline text-left",
            HOVER_TRANSITION,
            "cursor-pointer hover:border-gray-7 hover:bg-gray-3",
            "data-[state=open]:border-gray-7 data-[state=open]:bg-gray-3",
          )}
        >
          <span className="flex min-w-0 grow flex-col">
            <span
              className="truncate font-medium font-ui text-gray-12 text-row"
              title={path ?? undefined}
            >
              {label}
            </span>
            {meta === null ? null : (
              <span className="truncate font-mono text-gray-11 text-meta">
                {meta}
              </span>
            )}
          </span>
          <ChevronDown
            aria-hidden="true"
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-gray-11"
          />
        </button>
      }
    />
  );
}

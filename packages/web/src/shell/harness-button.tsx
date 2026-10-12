import { ChevronsUpDown } from "lucide-react";
import { useNavigate } from "react-router";
import { ActionsMenu } from "../ui/actions-menu";
import { cn } from "../ui/cn";
import { HOVER_TRANSITION } from "../ui/hover-transition";
import { Icon } from "../ui/icon";
import { PhraseText } from "../ui/phrase-text";
import { SETTINGS } from "./screens";
import { harnessInitial } from "./target-name";
import { useHarnessSummary } from "./use-harness-summary";

// Opens the menu that holds Settings.

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
            "flex h-11 w-full items-center gap-inline rounded-control border border-edge bg-gray-1 px-inline text-left",
            HOVER_TRANSITION,
            "cursor-pointer hover:border-gray-7 hover:bg-gray-3",
            "data-[state=open]:border-gray-7 data-[state=open]:bg-gray-3",
          )}
        >
          {path === null ? null : (
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-control bg-gray-12 font-semibold font-ui text-gray-1 text-meta"
            >
              {harnessInitial(path)}
            </span>
          )}
          <span className="flex min-w-0 grow flex-col">
            <span
              className="truncate font-medium font-ui text-gray-12 text-row"
              title={path ?? undefined}
            >
              {label}
            </span>
            {meta === null ? null : (
              <span className="truncate font-ui text-gray-11 text-meta">
                <PhraseText copy={meta} />
              </span>
            )}
          </span>
          <Icon of={ChevronsUpDown} className="shrink-0 text-gray-11" />
        </button>
      }
    />
  );
}

import { FileText, LayoutList, Pencil, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import { SETTINGS as SETTINGS_NAME } from "../settings/settings-copy";
import { HARNESS_LOCATION_PAGE } from "../settings/settings-pages";

// The cockpit's screens, in the order the sidebar lists them (#991). One
// owner, because the sidebar and the narrow bar both navigate by it and a
// second copy would drift (LEARNINGS.md · duplicated-invariant-drifts).

const ICON = { size: 16, strokeWidth: 1.5 } as const;

export interface Screen {
  to: string;
  /** The screen name, from CONTEXT.md. */
  label: string;
  icon: ReactNode;
}

export const SCREEN_GROUPS: ReadonlyArray<{
  /** The group's accessible name; only a headed group shows it on screen. */
  label: string;
  headed: boolean;
  items: readonly Screen[];
}> = [
  {
    label: "Screens",
    headed: false,
    items: [
      { to: "/", label: "Deploy-state", icon: <LayoutList {...ICON} /> },
      { to: "/inventory", label: "Inventory", icon: <Table2 {...ICON} /> },
      {
        to: "/repositories",
        label: "Repositories",
        icon: <FileText {...ICON} />,
      },
    ],
  },
  {
    label: "Author",
    headed: true,
    items: [{ to: "/harness", label: "Harness", icon: <Pencil {...ICON} /> }],
  },
];

export const SCREENS: readonly Screen[] = SCREEN_GROUPS.flatMap(
  (group) => group.items,
);

// Not a screen in the sidebar: it sits in the Harness button's menu and opens
// on its first page (#995). The narrow bar has one menu for both, so it names
// it there.
export const SETTINGS = { to: HARNESS_LOCATION_PAGE.to, label: SETTINGS_NAME };

import { FileText, LayoutList, Pencil, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import { SETTINGS as SETTINGS_NAME } from "../settings/settings-copy";
import { HARNESS_LOCATION_PAGE } from "../settings/settings-pages";
import { Icon } from "../ui/icon";

// In sidebar order; the sidebar and narrow bar both navigate by this one list.

export interface Screen {
  to: string;
  /** The screen name. */
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
      { to: "/", label: "Deploy-state", icon: <Icon of={LayoutList} /> },
      { to: "/inventory", label: "Inventory", icon: <Icon of={Table2} /> },
      {
        to: "/repositories",
        label: "Repositories",
        icon: <Icon of={FileText} />,
      },
    ],
  },
  {
    label: "Author",
    headed: true,
    items: [{ to: "/harness", label: "Harness", icon: <Icon of={Pencil} /> }],
  },
];

export const SCREENS: readonly Screen[] = SCREEN_GROUPS.flatMap(
  (group) => group.items,
);

// Not in the sidebar list: it opens from the Harness button's menu (#995).
export const SETTINGS = { to: HARNESS_LOCATION_PAGE.to, label: SETTINGS_NAME };

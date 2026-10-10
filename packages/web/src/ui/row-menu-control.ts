import { createContext } from "react";

/** The id of the column that holds a row's ⋮ menu. */
export const ACTIONS_COLUMN_ID = "actions";

/** How a grid drives its rows' ⋮ menus: null outside a grid, where ⋮ is its own. */
export type RowMenuControl = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Takes focus back to the grid when the keyboard opened the menu. */
  restoreFocus: () => boolean;
};

export const RowMenuControlContext = createContext<RowMenuControl | null>(null);

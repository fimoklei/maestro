import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "../ui/icon";

// The Inventory views, in sidebar order. Each names one primitive type of the
// Inventory. A view holds no screen, so the sidebar, routes and landings read
// this list without importing a screen.

export interface InventoryView {
  /** The primitive type the view shows. */
  type: "skill";
  /** The path segment after `/inventory/`. */
  segment: string;
  /** The view's name, as its screen and sidebar entry show it. */
  name: string;
  icon: ReactNode;
}

export const INVENTORY_VIEWS: readonly [InventoryView, ...InventoryView[]] = [
  {
    type: "skill",
    segment: "skills",
    name: "Skills",
    icon: <Icon of={Sparkles} />,
  },
];

/** Where a bare `/inventory`, an unknown segment or a new connection lands. */
export const FIRST_INVENTORY_VIEW = INVENTORY_VIEWS[0];

/** The route the connect gate and the fallback open. */
export const FIRST_INVENTORY_PATH = `/inventory/${FIRST_INVENTORY_VIEW.segment}`;

/** The route of the view that shows a primitive type. */
export function inventoryPathFor(type: InventoryView["type"]): string {
  const view = INVENTORY_VIEWS.find((each) => each.type === type);
  if (view === undefined) {
    throw new Error(`No Inventory view shows ${type}`);
  }
  return `/inventory/${view.segment}`;
}

import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "../ui/icon";
import type { Primitive } from "./use-inventory";

// The Inventory views. Each names one primitive type of the Inventory. A view
// holds no screen, so the sidebar, routes and landings read this list without
// importing a screen.

export interface InventoryView {
  /** The primitive type the view shows. */
  type: Primitive["type"];
  /** The path segment after `/inventory/`. */
  segment: string;
  /** The view's name, as its screen and sidebar entry show it. */
  name: string;
  icon: ReactNode;
}

// Keyed by the wire type, so a new type fails to compile until it has a view.
// In sidebar order.
const VIEW_OF: { [T in Primitive["type"]]: InventoryView & { type: T } } = {
  skill: {
    type: "skill",
    segment: "skills",
    name: "Skills",
    icon: <Icon of={Sparkles} />,
  },
};

export const INVENTORY_VIEWS: readonly InventoryView[] = Object.values(VIEW_OF);

/** Where a bare `/inventory`, an unknown segment or a new connection lands. */
export const FIRST_INVENTORY_VIEW: InventoryView = VIEW_OF.skill;

/** The route of the view that shows a primitive type. */
export const inventoryPathFor = (type: Primitive["type"]): string =>
  `/inventory/${VIEW_OF[type].segment}`;

/** The route the connect gate and the fallback open. */
export const FIRST_INVENTORY_PATH = inventoryPathFor(FIRST_INVENTORY_VIEW.type);

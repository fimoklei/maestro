import type { InventoryPrimitive } from "@maestro/core";
import { MessageSquare, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "../ui/icon";

// The Inventory views. Each names one primitive type of the Inventory. A view
// holds no screen, so the sidebar, routes and landings read this list without
// importing a screen.

export interface InventoryView {
  /** The primitive type the view shows. */
  type: InventoryPrimitive["type"];
  /** The path segment after `/inventory/`. */
  segment: string;
  /** The view's name, as its screen and sidebar entry show it. */
  name: string;
  icon: ReactNode;
}

// Keyed by the wire type, so a new type fails to compile until it has a view.
// In sidebar order.
const VIEW_OF: {
  [T in InventoryPrimitive["type"]]: InventoryView & { type: T };
} = {
  skill: {
    type: "skill",
    segment: "skills",
    name: "Skills",
    icon: <Icon of={Sparkles} />,
  },
  prompt: {
    type: "prompt",
    segment: "prompts",
    name: "Prompts",
    icon: <Icon of={MessageSquare} />,
  },
};

export const INVENTORY_VIEWS: readonly InventoryView[] = Object.values(VIEW_OF);

/** Where a bare `/inventory`, an unknown segment or a new connection lands. */
export const FIRST_INVENTORY_VIEW: InventoryView = VIEW_OF.skill;

/** The route of the view that shows a primitive type. */
export const inventoryPathFor = (type: InventoryPrimitive["type"]): string =>
  `/inventory/${VIEW_OF[type].segment}`;

/** The route the connect gate and the fallback open. */
export const FIRST_INVENTORY_PATH = inventoryPathFor(FIRST_INVENTORY_VIEW.type);

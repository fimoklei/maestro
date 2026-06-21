import { InventoryPanel } from "./inventory-panel";

// The Inventory view: browse the central inventory and deploy to a target. The
// styled pass lands in a later slice (4b); for now it routes the existing panel
// so nothing working disappears behind the new shell.
export function InventoryView() {
  return <InventoryPanel />;
}

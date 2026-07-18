import { InventoryPanel } from "./inventory-panel";

// The Inventory view: browse the central inventory and deploy to a target. It
// routes the existing panel so nothing working disappears behind the new shell.
export function InventoryView() {
  return <InventoryPanel />;
}

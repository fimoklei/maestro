import type { LucideIcon } from "lucide-react";
import { Button } from "./button";
import { Icon } from "./icon";

// Band 1's one collapse rule (#1456): an action beside the primary shows its
// icon alone below 1024px and keeps its label as its name; the primary keeps
// its words at every width.
export function BandAction({
  icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      variant="quiet"
      onClick={onClick}
      className="max-lg:w-8 max-lg:justify-center max-lg:px-0"
    >
      <Icon of={icon} className="lg:hidden" />
      <span className="max-lg:sr-only">{label}</span>
    </Button>
  );
}

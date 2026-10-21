import { ChevronDown, type LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { Icon } from "./icon";

// Band 1's one collapse rule (#1456): an action beside the primary shows its
// icon alone below 1024px and keeps its label as its name; the primary keeps
// its words at every width.
export function BandAction({
  icon,
  label,
  menu = false,
  ...rest
}: Omit<ButtonProps, "children" | "variant" | "size"> & {
  icon: LucideIcon;
  label: string;
  /** Opens a menu: a chevron follows the label. Rest props come from the menu's trigger. */
  menu?: boolean;
}) {
  return (
    <Button
      variant="quiet"
      className="max-lg:w-8 max-lg:justify-center max-lg:px-0"
      {...rest}
    >
      <Icon of={icon} className="lg:hidden" />
      <span className="max-lg:sr-only">{label}</span>
      {menu ? (
        <Icon of={ChevronDown} className="text-gray-11 max-lg:hidden" />
      ) : null}
    </Button>
  );
}

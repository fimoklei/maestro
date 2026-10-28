import { Link } from "react-router";
import { cn } from "../ui/cn";
import { Logo } from "../ui/logo";
import { LOGO_LINK } from "./sidebar-copy";

export function LogoLink({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label={LOGO_LINK}
      className={cn("rounded-control", className)}
    >
      <Logo />
    </Link>
  );
}

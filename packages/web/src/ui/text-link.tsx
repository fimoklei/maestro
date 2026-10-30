import type { ReactNode } from "react";
import { Link, type To } from "react-router";
import { cn } from "./cn";
import { FOCUS_RING } from "./focus-ring";

// A link to another cockpit screen, set in link blue inside text.
export function TextLink({
  to,
  state,
  label,
  children,
}: {
  to: To;
  state?: unknown;
  /** The accessible name, where the words alone do not say where it leads. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to}
      state={state}
      aria-label={label}
      className={cn(
        "rounded-control text-blue-11 no-underline underline-offset-2 hover:underline",
        FOCUS_RING,
      )}
    >
      {children}
    </Link>
  );
}

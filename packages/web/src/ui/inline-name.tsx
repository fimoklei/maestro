import type { ReactNode } from "react";

// A skill, repo, target or bundle named inside a sentence: weight and ink set
// it apart, never mono. `b` draws attention without adding importance.
export function InlineName({ children }: { children: ReactNode }) {
  return <b className="font-medium text-gray-12">{children}</b>;
}

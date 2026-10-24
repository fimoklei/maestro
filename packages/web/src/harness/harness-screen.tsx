import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import type { HarnessArrival } from "./harness-route";
import { HarnessView } from "./harness-view";

// Import local edits names the one skill it landed (#1249); an Inventory pane
// names the Pending release row its change waits in. A write's result is said
// once: dropped from the history entry, a reload or a return does not replay it.
export function HarnessScreen() {
  const { pathname, state } = useLocation();
  const navigate = useNavigate();
  const arrival = state as HarnessArrival | null;
  const written = arrival?.written ?? null;
  useEffect(() => {
    if (written === null) return;
    navigate(pathname, {
      replace: true,
      state: { openPrimitive: arrival?.openPrimitive },
    });
  }, [written, arrival, navigate, pathname]);
  return (
    <HarnessView
      openPrimitive={arrival?.openPrimitive ?? null}
      written={written}
    />
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useInventoryConfig } from "../inventory/use-inventory";
import { ConnectInventoryPanel } from "../shell/connect-inventory-panel";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";
import { ConnectSuccessView } from "./connect-success-view";

// The connect gate's second screen (ADR-0015): shares ConnectInventoryPanel
// with Settings' re-point (PRD #93), but lands on an explicit "Continue" so
// the reassurance beat stays on screen long enough to read (ADR-0021).
export function ConnectView() {
  const config = useInventoryConfig();
  const navigate = useNavigate();
  const [hasConnected, setHasConnected] = useState(false);
  // Keyed off this session's own connect, so a mid-flow success still shows
  // its confirmation rather than being yanked to "/" (first-run-gate.tsx).
  const blocked =
    !hasConnected && (config.isPending || config.data?.inventoryPath);

  useEffect(() => {
    if (blocked && config.isSuccess) {
      navigate("/", { replace: true });
    }
  }, [blocked, config.isSuccess, navigate]);

  if (blocked) {
    return <p className="text-dim text-tag">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        level={1}
        className="flex-wrap"
        title="Connect central inventory"
        meta="a local Harness clone or GitHub URL"
      />
      <Card padded className="max-w-lg">
        <p className="mb-3 text-dim text-tag">
          A private Harness works when each teammate has their own Git and APM
          access.
        </p>
        <ConnectInventoryPanel
          onSuccess={() => setHasConnected(true)}
          renderSuccess={(result) => {
            return (
              <ConnectSuccessView
                outcome={result.outcome}
                primitiveCount={result.primitiveCount}
                inventoryPath={result.inventoryPath}
                onContinue={() =>
                  navigate(
                    result.outcome === "scaffolded" ? "/harness" : "/inventory",
                  )
                }
              />
            );
          }}
        />
      </Card>
    </div>
  );
}

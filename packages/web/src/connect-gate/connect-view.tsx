import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useInventoryConfig } from "../inventory/use-inventory";
import { ConnectInventoryPanel } from "../shell/connect-inventory-panel";
import { SourceLabel } from "../shell/source-label";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";

// The connect gate's second screen (ADR-0015): shares ConnectInventoryPanel
// with Settings' re-point (PRD #93), but lands on an explicit "Continue" so
// the read-only promise stays on screen long enough to read.
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
        title="Connect central inventory"
        meta="the path of a local agent-harness clone"
      />
      <Card padded className="max-w-lg">
        <ConnectInventoryPanel
          onSuccess={() => setHasConnected(true)}
          renderSuccess={(result) => {
            // A scaffold lands on the Harness, where its first skill gets
            // authored; every other route lands on the read-only Inventory
            // (#556).
            const scaffolded = result.outcome === "scaffolded";
            return (
              <div className="flex flex-col gap-3">
                <p className="text-green-ink text-tag">
                  {scaffolded
                    ? "✓ Harness scaffolded and pushed · ready for its first skill"
                    : `✓ ${result.primitiveCount} primitives found · read-only, never writes back`}
                </p>
                {/* Shared with the Settings steady state so the two can't drift apart (#211). */}
                <SourceLabel path={result.inventoryPath} />
                <div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() =>
                      navigate(scaffolded ? "/harness" : "/inventory")
                    }
                  >
                    {scaffolded
                      ? "Continue to harness →"
                      : "Continue to inventory →"}
                  </Button>
                </div>
              </div>
            );
          }}
        />
      </Card>
    </div>
  );
}

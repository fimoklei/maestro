import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInventoryConfig } from "../inventory/use-inventory";
import { ConnectInventoryPanel } from "../shell/connect-inventory-panel";
import { SourceLabel } from "../shell/source-label";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";

// The connect gate's second and final screen (ADR-0015): the shared
// ConnectInventoryPanel the Settings re-point screen uses (PRD #93), but landing
// differently — a visible confirmation with the primitive count and the
// read-only promise, then an explicit continue onto Inventory, rather than
// Settings' silent navigate. That confirmation is this screen's renderSuccess
// slot; the shared plumbing (form, browse, connect mutation) lives in the panel.
// The explicit "Continue" (rather than auto-navigating the instant the mutation
// resolves) is deliberate: the confirmation is where the read-only promise
// lives, so it must stay on screen long enough to read. Landing on Inventory
// rather than Deploy-state is also deliberate — the connected primitives carry
// their own `deploy →` actions, and a deploy is possible immediately because
// global targets exist without any registration (ADR-0011).
export function ConnectView() {
  const config = useInventoryConfig();
  const navigate = useNavigate();
  const [hasConnected, setHasConnected] = useState(false);
  // Blocks a deep link/bookmark into this screen by an already-configured user
  // (the gate only guards /welcome itself, not this nested route — see
  // first-run-gate.tsx). Keyed off *this session's own* connect, not just
  // "configured", so a connect that succeeds mid-flow (unconfigured ->
  // configured, right here, via the panel's cache seed) still shows its
  // confirmation instead of being yanked to "/" the instant the config re-fetch
  // catches up. While config is still pending we don't yet know which case this
  // is, so this also stays true — the panel must not flash into view before the
  // answer arrives. This guard decides whether the panel mounts at all, so it
  // stays here rather than inside the shared panel.
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
          renderSuccess={(result) => (
            <div className="flex flex-col gap-3">
              <p className="text-green-ink text-tag">
                ✓ {result.primitiveCount} primitives found · read-only, never
                writes back
              </p>
              {/* Name the connected source here, on the surface that confirms
                  it, so it is identifiable beyond its basename without opening
                  the source view (#211). Shared with the Settings steady state
                  so the two can't drift apart again. */}
              <SourceLabel path={result.inventoryPath} />
              <div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate("/inventory")}
                >
                  Continue to inventory →
                </Button>
              </div>
            </div>
          )}
        />
      </Card>
    </div>
  );
}

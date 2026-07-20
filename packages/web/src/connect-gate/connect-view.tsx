import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  connectErrorMessage,
  isNoUsableOriginError,
} from "../inventory/connect-error-message";
import { useConnectInventory } from "../inventory/use-connect-inventory";
import { useInventoryConfig } from "../inventory/use-inventory";
import { BrowseDialog } from "../shell/browse-dialog";
import { ConnectInventoryForm } from "../shell/connect-inventory-form";
import { useBrowsePicker } from "../shell/use-browse-picker";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { SectionHeader } from "../ui/section-header";

// The connect gate's second and final screen (ADR-0015): the same shared
// ConnectInventoryForm the Settings re-point screen uses (PRD #93), but landing
// differently — a visible confirmation with the primitive count and the
// read-only promise, then an explicit continue onto Inventory, rather than
// Settings' silent navigate. The explicit "Continue" (rather than
// auto-navigating the instant the mutation resolves) is deliberate: the
// confirmation is where the read-only promise lives, so it must stay on screen
// long enough to read. Landing on Inventory rather than Deploy-state is also
// deliberate — the connected primitives carry their own `deploy →` actions, and
// a deploy is possible immediately because global targets exist without any
// registration (ADR-0011).
export function ConnectView() {
  const connect = useConnectInventory();
  const config = useInventoryConfig();
  const navigate = useNavigate();
  const [path, setPath] = useState("");
  // Connect mode confirms exactly one path; the list shape is the dialog's.
  const browse = useBrowsePicker(([selected]) => setPath(selected ?? ""));
  // Blocks a deep link/bookmark into this screen by an already-configured user
  // (the gate only guards /welcome itself, not this nested route — see
  // first-run-gate.tsx). Keyed off *this component's own* mutation, not just
  // "configured", so a connect that succeeds mid-flow (unconfigured ->
  // configured, right here) still shows its confirmation instead of being
  // yanked to "/" the instant the config re-fetch catches up. While config is
  // still pending we don't yet know which case this is, so this also stays
  // true — the form must not flash into view before the answer arrives.
  const blocked =
    !connect.isSuccess && (config.isPending || config.data?.inventoryPath);

  useEffect(() => {
    if (blocked && config.isSuccess) {
      navigate("/", { replace: true });
    }
  }, [blocked, config.isSuccess, navigate]);

  function handleSubmit(submittedPath: string) {
    connect.mutate(submittedPath);
  }

  const error = connectErrorMessage(connect.error);

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
        {connect.isSuccess ? (
          <div className="flex flex-col gap-3">
            <p className="text-green-ink text-tag">
              ✓ {connect.data.primitiveCount} primitives found · read-only,
              never writes back
            </p>
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
        ) : (
          <ConnectInventoryForm
            path={path}
            onPathChange={setPath}
            onSubmit={handleSubmit}
            error={error}
            noUsableOrigin={isNoUsableOriginError(connect.error)}
            isPending={connect.isPending}
            onBrowse={browse.openBrowse}
          />
        )}
      </Card>
      {browse.open ? (
        <BrowseDialog
          mode="connect"
          onSelect={browse.selectBrowse}
          onClose={browse.closeBrowse}
        />
      ) : null}
    </div>
  );
}

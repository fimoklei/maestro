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
import { WizardProgress } from "./wizard-progress";

// The wizard's connect step (issue #96, design f1-connect-path): the same
// shared ConnectInventoryForm the Settings re-point screen uses (PRD #93), but
// landing differently — a visible confirmation with the primitive count, then
// an explicit continue onto Deploy-state, rather than Settings' silent
// navigate-to-Inventory. The explicit "Continue" (rather than auto-navigating
// the instant the mutation resolves) is deliberate: the confirmation is the
// acceptance-criterion payload ("shows the primitive count"), so it must stay
// on screen long enough to read, not flash past on the way to the register
// step (issue #97), the wizard's second and final screen.
export function WizardConnectView() {
  const connect = useConnectInventory();
  const config = useInventoryConfig();
  const navigate = useNavigate();
  const [path, setPath] = useState("");
  const browse = useBrowsePicker(setPath);
  // Blocks a deep link/bookmark into this step by an already-configured user
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
        title="Connect central inventory"
        meta="step 1 of 3 · point Maestro at a local inventory folder"
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
                onClick={() => navigate("/welcome/repos")}
              >
                Continue to register repos →
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
      <WizardProgress activeStep={1} />
      {browse.open ? (
        <BrowseDialog
          onSelect={browse.selectBrowse}
          onClose={browse.closeBrowse}
        />
      ) : null}
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { connectErrorMessage } from "../inventory/connect-error-message";
import { useConnectInventory } from "../inventory/use-connect-inventory";
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
// on screen long enough to read, not flash past on the way to "/". Register
// (step 2) does not exist yet (issue #96 builds the connect step only), so
// continuing skips straight to landing.
export function WizardConnectView() {
  const connect = useConnectInventory();
  const navigate = useNavigate();
  const [path, setPath] = useState("");
  const browse = useBrowsePicker(setPath);

  function handleSubmit(submittedPath: string) {
    connect.mutate(submittedPath);
  }

  const error = connectErrorMessage(connect.error);

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
              <Button variant="primary" size="sm" onClick={() => navigate("/")}>
                Continue to Deploy-state →
              </Button>
            </div>
          </div>
        ) : (
          <ConnectInventoryForm
            path={path}
            onPathChange={setPath}
            onSubmit={handleSubmit}
            error={error}
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

import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";
import { WizardProgress } from "./wizard-progress";

// The first-run wizard's welcome step (issue #96, design f1-empty): the inert
// cockpit greets an unconfigured user with one action — connect the inventory —
// instead of a dead-end "not configured" panel. The sidebar's own inert
// rendering (dimmed nav, "none yet" targets) lives in shell/sidebar.tsx, driven
// by the same useFirstRun signal, so this view only owns the main-region copy.
export function WelcomeView() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex max-w-md flex-col items-center gap-2.5">
        <h2 className="m-0 font-semibold font-ui text-fg text-title">
          Connect your central inventory
        </h2>
        <p className="m-0 text-body text-muted">
          The cockpit is empty until it knows your inventory. Maestro reads
          primitives from your <span className="font-mono">agent-harness</span>{" "}
          clone — point it there to begin.
        </p>
        <Button
          variant="primary"
          size="lg"
          className="mt-1"
          onClick={() => navigate("/welcome/connect")}
        >
          Connect inventory →
        </Button>
      </div>
      <WizardProgress activeStep={1} />
    </div>
  );
}

import { useNavigate } from "react-router";
import { Button } from "../ui/button";

// The connect gate's first screen (ADR-0015). <h1> is hand-rolled rather than
// SectionHeader: SectionHeader's left-aligned row + meta slot fights this
// screen's centred-hero layout. Only the title's type classes are shared.
export function WelcomeView() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex max-w-md flex-col items-center gap-2.5">
        <span aria-hidden="true" className="connect-gate-rule" />
        <h1 className="connect-gate-title m-0 font-semibold font-ui text-fg text-title">
          Central inventory not connected
        </h1>
        <p className="connect-gate-body m-0 text-body text-muted">
          Maestro reads primitives from a local Harness clone or a GitHub
          repository. The cockpit stays empty until it has one.
        </p>
        <Button
          variant="primary"
          size="lg"
          className="connect-gate-cta mt-1"
          onClick={() => navigate("/welcome/connect")}
        >
          Connect inventory →
        </Button>
      </div>
    </div>
  );
}

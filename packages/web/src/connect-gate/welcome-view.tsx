import { useNavigate } from "react-router-dom";
import { Button } from "../ui/button";

// The connect gate's first of two screens (ADR-0015). A fresh install has no
// inventory source, so the cockpit has nothing to show; this screen states that
// and offers the single action that resolves it. The sidebar's own inert
// rendering (dimmed nav, "none yet" targets) lives in shell/sidebar.tsx, driven
// by the same useFirstRun signal, so this view only owns the main-region copy.
// The <h1> is hand-rolled rather than reusing SectionHeader (as the gate's
// connect screen does) because this screen is a centred hero: SectionHeader
// lays its title out as a left-aligned row with a meta slot and a spacer,
// which fights the centring. Only the title's type classes are shared.
export function WelcomeView() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex max-w-md flex-col items-center gap-2.5">
        <h1 className="m-0 font-semibold font-ui text-fg text-title">
          Central inventory not connected
        </h1>
        <p className="m-0 text-body text-muted">
          Maestro reads primitives from a local{" "}
          <span className="font-mono">agent-harness</span> clone. The cockpit
          stays empty until it has one.
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
    </div>
  );
}

import { useNavigate } from "react-router";
import { Button } from "../ui/button";

// The connect gate's first screen (ADR-0015). <h1> is hand-rolled rather than
// SectionHeader: SectionHeader's left-aligned row + meta slot fights this
// screen's centred-hero layout. Only the title's type classes are shared.
export function WelcomeView() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="flex max-w-[28rem] flex-col items-center gap-cell">
        <span aria-hidden="true" className="connect-gate-rule" />
        <h1 className="connect-gate-title m-0 font-semibold font-ui text-gray-12 text-title tracking-title">
          Inventory not connected
        </h1>
        <p className="connect-gate-body m-0 font-ui text-gray-11 text-prose">
          Maestro reads skills, hooks and MCP servers from a Harness clone or
          GitHub repository. The cockpit stays empty until one is connected.
        </p>
        <Button
          variant="primary"
          className="connect-gate-cta mt-tight"
          onClick={() => navigate("/welcome/connect")}
        >
          Connect Inventory
        </Button>
      </div>
    </div>
  );
}

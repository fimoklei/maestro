import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { LOADING_INVENTORY_CONNECTION } from "../inventory/inventory-copy";
import { useInventoryConfig } from "../inventory/use-inventory";
import { Card } from "../ui/card";
import { ConnectFlow } from "./connect-flow";
import { ConnectSuccessView } from "./connect-success-view";

// Lands on an explicit "Continue" so the confirmation stays long enough to read.
export function ConnectView() {
  const config = useInventoryConfig();
  const navigate = useNavigate();
  const [hasConnected, setHasConnected] = useState(false);
  // Keyed off this session's own connect, so a mid-flow success still shows
  // its confirmation rather than being yanked to "/" by the first-run gate.
  const blocked =
    !hasConnected && (config.isPending || config.data?.inventoryPath);

  useEffect(() => {
    if (blocked && config.isSuccess) {
      navigate("/", { replace: true });
    }
  }, [blocked, config.isSuccess, navigate]);

  if (blocked) {
    return <p className="sr-only">{LOADING_INVENTORY_CONNECTION}</p>;
  }

  return (
    // Top-aligned, at most 640px, fluid below that (#995).
    <div className="mx-auto flex w-full max-w-[40rem] flex-col gap-panel">
      <div className="flex flex-col gap-tight">
        <h1 className="m-0 font-semibold font-ui text-gray-12 text-title tracking-title">
          Inventory connection
        </h1>
        <p className="m-0 font-ui text-gray-11 text-prose">
          A private Harness works only when every teammate has their own GitHub
          and APM access.
        </p>
      </div>
      <Card padded>
        <ConnectFlow
          onSuccess={() => setHasConnected(true)}
          renderSuccess={(result) => (
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
          )}
        />
      </Card>
    </div>
  );
}

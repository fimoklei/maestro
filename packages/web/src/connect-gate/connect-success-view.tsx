import type { ConnectOutcome } from "@maestro/core";
import { primitiveCountLabel } from "../shell/primitive-count-label";
import { SourceLabel } from "../shell/source-label";
import { Button } from "../ui/button";

export type ConnectSuccessViewProps = {
  outcome: ConnectOutcome;
  primitiveCount: number;
  inventoryPath: string;
  onContinue: () => void;
};

type CompletionCopy = {
  title: string;
  detail: string;
  continueLabel: string;
};

function completionCopy(
  outcome: ConnectOutcome,
  primitiveCount: number,
): CompletionCopy {
  const count = primitiveCountLabel(primitiveCount);

  switch (outcome) {
    case "found":
      return {
        title: `✓ ${count} found`,
        detail: "Deploys never write back to this Harness.",
        continueLabel: "Continue to Inventory",
      };
    case "joined":
      return {
        title: `✓ Harness joined · ${count} found`,
        detail: "The cloned Harness is ready in Inventory.",
        continueLabel: "Continue to Inventory",
      };
    case "scaffolded":
      return {
        title: "✓ Harness scaffolded · The Harness is empty",
        detail:
          "The skill-check workflow is advisory. It only becomes a gate if the team makes it a required check.",
        continueLabel: "Continue to Harness",
      };
  }
}

export function ConnectSuccessView({
  outcome,
  primitiveCount,
  inventoryPath,
  onContinue,
}: ConnectSuccessViewProps) {
  const copy = completionCopy(outcome, primitiveCount);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-green-ink text-tag">{copy.title}</p>
        <p className="m-0 text-fg-2 text-tag">{copy.detail}</p>
      </div>
      <SourceLabel path={inventoryPath} />
      <div>
        <Button variant="primary" size="sm" onClick={onContinue}>
          {copy.continueLabel}
        </Button>
      </div>
    </div>
  );
}

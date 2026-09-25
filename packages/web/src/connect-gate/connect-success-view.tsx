import type { ConnectOutcome } from "@maestro/core";
import { primitiveCountLabel } from "../shell/primitive-count-label";
import { targetLabel } from "../shell/target-label";
import { Button } from "../ui/button";
import { Fact } from "../ui/fact";
import { Notice } from "../ui/notice";

export type ConnectSuccessViewProps = {
  outcome: ConnectOutcome;
  // Null where the released count could not be read (#841).
  primitiveCount: number | null;
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
  primitiveCount: number | null,
): CompletionCopy {
  // An unread count is left out of the sentence rather than shown as zero.
  const found =
    primitiveCount === null
      ? "Harness found"
      : `${primitiveCountLabel(primitiveCount)} found`;

  switch (outcome) {
    case "found":
      return {
        title: found,
        detail: "Deploys never write back to this Harness.",
        continueLabel: "Continue to Inventory",
      };
    case "joined":
      return {
        title: `Harness connected · ${found}`,
        detail: "The cloned Harness is ready in Inventory.",
        continueLabel: "Continue to Inventory",
      };
    case "scaffolded":
      return {
        title: "Harness created. It has no skills yet.",
        detail:
          "Skill checks do not block releases unless the team makes them required.",
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
    // No auto-navigate: the outcome has its own continue button.
    <div className="flex flex-col gap-cell">
      <Notice
        trigger="user-action"
        notice={{ level: "success", label: copy.title, message: copy.detail }}
      />
      {/* The distinguishing tail, with the whole path on hover (#211). */}
      <dl className="m-0">
        <Fact
          label="Local folder"
          value={targetLabel(inventoryPath)}
          title={inventoryPath}
        />
      </dl>
      <div>
        <Button variant="primary" onClick={onContinue}>
          {copy.continueLabel}
        </Button>
      </div>
    </div>
  );
}

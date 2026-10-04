import type { ConnectOutcome } from "@maestro/core";
import { targetLabel } from "../shell/target-label";
import { Button } from "../ui/button";
import { Fact } from "../ui/fact";
import { Notice } from "../ui/notice";
import {
  CONNECTED_TITLE,
  CONTINUE_TO_HARNESS,
  CONTINUE_TO_INVENTORY,
  CREATED_TITLE,
  connectedMessage,
  NO_SKILLS_YET,
  PRIVATE_HARNESS_ACCESS,
} from "./connect-gate-copy";

export type ConnectSuccessViewProps = {
  outcome: ConnectOutcome;
  // Null where the released count could not be read (#841).
  primitiveCount: number | null;
  inventoryPath: string;
  onContinue: () => void;
};

type CompletionCopy = {
  title: string;
  message: string;
  detail?: string;
  continueLabel: string;
};

function completionCopy(
  outcome: ConnectOutcome,
  primitiveCount: number | null,
): CompletionCopy {
  switch (outcome) {
    case "found":
      return {
        title: CONNECTED_TITLE,
        message: connectedMessage(primitiveCount),
        continueLabel: CONTINUE_TO_INVENTORY,
      };
    case "joined":
      // Only a clone can be someone else's private repository.
      return {
        title: CONNECTED_TITLE,
        message: connectedMessage(primitiveCount),
        detail: PRIVATE_HARNESS_ACCESS,
        continueLabel: CONTINUE_TO_INVENTORY,
      };
    case "scaffolded":
      return {
        title: CREATED_TITLE,
        message: NO_SKILLS_YET,
        continueLabel: CONTINUE_TO_HARNESS,
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
        notice={{
          level: "success",
          label: copy.title,
          message: copy.message,
          detail: copy.detail,
        }}
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

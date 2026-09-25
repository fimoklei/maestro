import { doneSentence } from "../ui/busy-copy";
import type { RemoveDialogTarget } from "./remove-ledger-rows";
import { toolNameList } from "./tool-labels";

export type RemovedSkill = {
  name: string;
  version: string | undefined;
  // As the server resolved it: the detected tool set can differ from what was
  // confirmed. A repo goes by the table's name, never its absolute path (#1119).
  target:
    | Exclude<RemoveDialogTarget, { kind: "repo" }>
    | { kind: "repo"; name: string };
};

export function removalAnnouncement({
  name,
  version,
  target,
}: RemovedSkill): string {
  const scope =
    target.kind === "repo"
      ? target.name
      : // The detected set can be empty.
        toolNameList(target.tools) || "every detected tool";
  return doneSentence(
    "remove",
    `${name} ${version ?? "(version unknown)"} from ${scope}`,
  );
}

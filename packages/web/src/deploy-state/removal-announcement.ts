import type { RemoveDialogTarget } from "./remove-ledger-rows";
import { toolNameList } from "./tool-presentation";

type RemovedSkill = {
  name: string;
  version: string | undefined;
  // As the server resolved it: the detected tool set can differ from what was
  // confirmed. A repo goes by the table's name, never its absolute path (#1119).
  target:
    | Exclude<RemoveDialogTarget, { kind: "repo" }>
    | { kind: "repo"; name: string };
};

/** What a landed removal's done sentence names. */
export function removedName({ name, version, target }: RemovedSkill): string {
  const scope =
    target.kind === "repo"
      ? target.name
      : // The detected set can be empty.
        toolNameList(target.tools) || "every detected tool";
  return `${name} ${version ?? "(version unknown)"} from ${scope}`;
}

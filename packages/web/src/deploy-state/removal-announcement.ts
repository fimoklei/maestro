import { machine, named, namedList, type Phrase, phrase } from "../ui/phrase";
import type { RemoveDialogTarget } from "./remove-ledger-rows";
import { toolDisplayName } from "./tool-presentation";

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
export function removedName({ name, version, target }: RemovedSkill): Phrase {
  const scope =
    target.kind === "repo"
      ? named(target.name)
      : // The detected set can be empty.
        target.tools.length === 0
        ? "every detected tool"
        : namedList(target.tools.map(toolDisplayName));
  const release =
    version === undefined ? "(version unknown)" : machine(version);
  return phrase`${named(name)} ${release} from ${scope}`;
}

// An ImportSkill with no harness connected: nothing is ever copied.
import { ImportSkill } from "@maestro/core";

const unreachable = (): never => {
  throw new Error("stub import port was reached");
};

export function stubImport(): ImportSkill {
  return new ImportSkill({
    resolveRoot: async () => undefined,
    homeRoot: unreachable,
    fs: {
      realpath: unreachable,
      isDirectory: unreachable,
      exists: unreachable,
      readFile: unreachable,
      writeFile: unreachable,
      ensureDir: unreachable,
      listRawEntries: unreachable,
    },
    facts: { describe: unreachable },
    copy: { copy: unreachable },
    git: { readFacts: unreachable, readMovementTrees: unreachable },
    deployedTargets: async () => [],
  });
}

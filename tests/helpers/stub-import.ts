// Both import use-cases with no harness connected: nothing is ever copied.
import { ImportLocalEdits, ImportSkill, InFlightLocks } from "@maestro/core";

const unreachable = (): never => {
  throw new Error("stub import port was reached");
};

export function stubImports(): {
  importSkill: ImportSkill;
  importLocalEdits: ImportLocalEdits;
} {
  const importSkill = new ImportSkill({
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
  return {
    importSkill,
    importLocalEdits: new ImportLocalEdits({
      registry: { resolveRegistered: async () => undefined },
      deployState: { read: unreachable, readGlobal: unreachable },
      content: { classify: unreachable },
      tree: {
        listRawEntries: unreachable,
        readFile: unreachable,
        describe: unreachable,
      },
      globalRoot: unreachable,
      home: unreachable,
      importSkill,
      resolveRoot: async () => undefined,
      locks: new InFlightLocks(),
    }),
  };
}

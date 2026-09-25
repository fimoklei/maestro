// An UpdateTarget whose every port refuses, so a stray call never prices.
import { InFlightLocks, UpdateTarget } from "@maestro/core";
import { stubSelectionWriter } from "./stub-deploy";

export const stubUpdate = () =>
  new UpdateTarget({
    registry: { isRegistered: async () => false },
    git: { readTags: async () => null, readSkillTreesAtTag: async () => null },
    resolveRoot: async () => undefined,
    harnessOrigin: async () => null,
    toolPresence: { detectGlobalTools: async () => [] },
    copyGuard: {
      check: async () => ({ findings: [], digest: null }),
      admits: () => ({ ok: true }),
    },
    selection: stubSelectionWriter(),
    deployedContent: { classify: async () => "unreadable" },
    canonicalPath: async (path) => path,
    locks: new InFlightLocks(),
  });

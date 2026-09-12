// Shared test helper: an UpdateTarget that prices nothing, for tests that
// exercise other routes but must satisfy createApp's update dependency. Every
// port refuses, so a stray call answers with a refusal rather than pretending
// to have priced an update.
import { InFlightLocks, UpdateTarget } from "@maestro/core";
import { stubSelectionWriter } from "./stub-deploy";

export const stubUpdate = () =>
  new UpdateTarget({
    registry: { isRegistered: async () => false },
    git: { readTags: async () => null, readSkillTreesAtTag: async () => null },
    resolveRoot: async () => undefined,
    harnessOrigin: async () => null,
    // No tool detected: a stray global call refuses rather than claiming a
    // scope this stub never had.
    toolPresence: { detectGlobalTools: async () => [] },
    copyGuard: {
      check: async () => ({ findings: [], digest: null }),
      admits: () => ({ ok: true }),
    },
    // The write side refuses too: nothing here may reach a real target.
    selection: stubSelectionWriter(),
    deployedContent: { classify: async () => "unreadable" },
    canonicalPath: async (path) => path,
    locks: new InFlightLocks(),
  });

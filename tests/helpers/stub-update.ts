// Shared test helper: an UpdateTarget that prices nothing, for tests that
// exercise other routes but must satisfy createApp's update dependency. Every
// port refuses, so a stray call answers with a refusal rather than pretending
// to have priced an update.
import { UpdateTarget } from "@maestro/core";

export const stubUpdate = () =>
  new UpdateTarget({
    registry: { isRegistered: async () => false },
    targetSelection: {
      read: async () => ({ ok: false, reason: "not-deployed" }),
    },
    git: { readTags: async () => null, readSkillTreesAtTag: async () => null },
    resolveRoot: async () => undefined,
    harnessOrigin: async () => null,
    // No tool detected: a stray global call refuses rather than claiming a
    // scope this stub never had.
    toolPresence: { detectGlobalTools: async () => [] },
    copyGuard: {
      check: async () => ({ findings: [] }),
      admits: () => ({ ok: true }),
    },
  });

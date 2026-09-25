// Shared test helper: the deploy-state reader for tests that exercise other
// routes but must satisfy createApp's reader dependency, which requires tool
// presence because the app also serves the global route (#187). Detection
// throws rather than reporting an empty machine: a test that reaches the global
// route through this helper is asserting against a fiction, and an empty
// `{ tools: [], skipped: [] }` would let it pass vacuously — the same silent
// pass #187 exists to close. Tests that do assert the global route wire a real
// ToolPresenceAdapter (or their own fake) against their sandbox home instead.
import {
  type DeployStateExtras,
  type FileSystemPort,
  GlobalDeployStateReader,
} from "@maestro/core";

export const stubDeployState = (deps: {
  fs: FileSystemPort;
  githubPage?: DeployStateExtras["githubPage"];
}) =>
  new GlobalDeployStateReader({
    fs: deps.fs,
    githubPage: deps.githubPage,
    toolPresence: {
      detectGlobalTools: async () => {
        throw new Error(
          "stubDeployState: the global deploy-state route is not under test here",
        );
      },
    },
  });

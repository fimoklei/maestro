// Detection throws rather than reporting an empty machine, so a test reaching
// the global route through this stub cannot pass vacuously (#187).
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

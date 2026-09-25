// Detection throws rather than reporting an empty machine, so a test reaching
// the global route through this stub cannot pass vacuously (#187).
import { type FileSystemPort, GlobalDeployStateReader } from "@maestro/core";

export const stubDeployState = (deps: { fs: FileSystemPort }) =>
  new GlobalDeployStateReader({
    fs: deps.fs,
    toolPresence: {
      detectGlobalTools: async () => {
        throw new Error(
          "stubDeployState: the global deploy-state route is not under test here",
        );
      },
    },
  });

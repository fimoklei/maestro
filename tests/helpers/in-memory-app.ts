// The production composition over an in-memory outside world. A test passes
// the ports its route reaches; every other port answers "nothing there".
import { composeUseCases, type UseCasePorts } from "@maestro/core";
import { createApp } from "@maestro/server";
import { InMemoryCopyTree } from "../../packages/core/src/filesystem/copy-tree-fs.fake";
import { InMemoryHarnessGit } from "../../packages/core/src/harness/harness-git.fake";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { unavailableHarnessReview } from "./stub-review";

// A port no route of the test may reach: any method call throws, except the
// methods a test answers.
export const unreachable = <Port>(
  name: string,
  answers: Partial<Port> = {},
): Port =>
  // Every property is a throwing method, so it satisfies any method-only port;
  // `then` stays undefined so awaiting the port itself does not call it.
  new Proxy(answers, {
    get: (target, method) =>
      method in target
        ? Reflect.get(target, method)
        : method === "then"
          ? undefined
          : () => {
              throw new Error(`${name}.${String(method)} was reached`);
            },
  }) as Port;

export type Overrides = Partial<Omit<UseCasePorts, "git">> & {
  git?: Partial<UseCasePorts["git"]>;
};

export const inMemoryPorts = ({
  git,
  ...overrides
}: Overrides): UseCasePorts => ({
  env: { HOME: "/home", MAESTRO_HOME: "/maestro-home" },
  home: () => "/home",
  fs: new InMemoryFileSystem(),
  copyTree: new InMemoryCopyTree(),
  toolPresence: { detectGlobalTools: async () => [] },
  deployedCleanup: unreachable("deployedCleanup"),
  apm: unreachable("apm"),
  git: {
    harness: new InMemoryHarnessGit(),
    inventory: () => unreachable("inventoryGit"),
    clone: unreachable("clone"),
    scaffold: unreachable("scaffoldGit"),
    originUrl: async () => null,
    defaultBranch: async () => null,
    isRepositoryRoot: async () => false,
    probeHead: async () => "unknown",
    githubPage: async () => null,
    ...git,
  },
  gh: unavailableHarnessReview(),
  folderChooser: null,
  ...overrides,
});

// Tests construct the origin/host guard disabled; production always enables it.
export const inMemoryApp = (overrides: Overrides = {}) =>
  createApp({
    ...composeUseCases(inMemoryPorts(overrides)),
    enforceOriginHost: false,
  });

import { describe, expect, it } from "vitest";
import { ConfigStore } from "../registry/config-store";
import { TargetOperationStore } from "./target-operation";

function store() {
  const files = new Map<string, string>();
  const fs = {
    readFile: async (path: string) => files.get(path) ?? null,
    writeFile: async (path: string, contents: string) => {
      files.set(path, contents);
    },
  };
  const make = () =>
    new TargetOperationStore({
      store: new ConfigStore({
        fs: fs as never,
        configPath: () => "/home/.maestro/config.json",
      }),
    });
  return { make, files };
}

const operation = {
  key: "/repo",
  target: { kind: "repo", repoPath: "/repo" } as const,
  harness: "fimoklei/agent-harness",
  kind: "deploy" as const,
  release: "v0.6.0",
  previous: ["prototype"],
  desired: ["prototype", "review"],
  tools: null,
};

describe("TargetOperationStore", () => {
  it("has no operation on a target nothing was started on", async () => {
    expect(await store().make().read("/repo")).toBeNull();
  });

  it("keeps the desired release and selection across a restart", async () => {
    const { make } = store();
    await make().begin(operation);
    expect(await make().read("/repo")).toMatchObject({
      kind: "deploy",
      release: "v0.6.0",
      desired: ["prototype", "review"],
      previous: ["prototype"],
    });
  });

  it("stamps when the operation began", async () => {
    const { make } = store();
    await make().begin(operation);
    const record = await make().read("/repo");
    expect(Date.parse(record?.startedAt ?? "")).not.toBeNaN();
  });

  it("clears the operation once it is verified", async () => {
    const { make } = store();
    await make().begin(operation);
    await make().clear("/repo");
    expect(await make().read("/repo")).toBeNull();
  });

  it("keeps one operation per target", async () => {
    const { make } = store();
    await make().begin(operation);
    await make().begin({
      ...operation,
      key: "global",
      target: { kind: "global" },
    });
    expect(await make().read("/repo")).toMatchObject({ key: "/repo" });
    expect(await make().read("global")).toMatchObject({ key: "global" });
  });

  it("replaces the record when the same target starts another operation", async () => {
    const { make } = store();
    await make().begin(operation);
    await make().begin({ ...operation, kind: "remove", desired: [] });
    expect(await make().read("/repo")).toMatchObject({
      kind: "remove",
      desired: [],
    });
  });

  it("reads a record it cannot parse as no operation rather than failing the config", async () => {
    const { make, files } = store();
    files.set(
      "/home/.maestro/config.json",
      JSON.stringify({ repos: [], targetOperations: "broken" }),
    );
    expect(await make().read("/repo")).toBeNull();
  });
});

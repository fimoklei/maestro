import { describe, expect, it } from "vitest";
import type { DeployedPrimitive } from "../deploy-state/use-deploy-state";
import { driftViewModel } from "./drift-view-model";
import type { DriftResponse } from "./use-drift";

const query = (state: {
  data?: DriftResponse;
  isError?: boolean;
}): { data: DriftResponse | undefined; isError: boolean } => ({
  data: state.data,
  isError: state.isError ?? false,
});

const ran = (behind: BehindEntry[]) =>
  driftViewModel(query({ data: { behind } }));

type BehindEntry = Extract<
  DriftResponse,
  { behind: unknown }
>["behind"][number];

const pair = (name: string): BehindEntry => ({
  name,
  current: "v1.0.0",
  latest: "v1.1.0",
  reading: "behind",
});

// Same release, content unchanged between the two tags.
const laggingPin = (name: string): BehindEntry => ({
  ...pair(name),
  reading: "older-tag",
});

const noLongerReleased = (name: string): BehindEntry => ({
  ...pair(name),
  reading: "no-longer-released",
});

const deployedNames = (names: string[]) =>
  ({ status: "ready", names, skippedCount: 0, attentionCount: 0 }) as const;

const deployedPrimitives = (names: string[]): DeployedPrimitive[] =>
  names.map((name) => ({ type: "skill", name, version: "v0.5.1" }));

describe("driftViewModel — query mapping", () => {
  it("maps a ran check so a behind skill reads behind", () => {
    expect(ran([pair("tdd")]).skillStatus("tdd")).toBe("behind");
  });

  it("maps a skill that only lags a tag to its own reading", () => {
    expect(ran([laggingPin("tdd")]).skillStatus("tdd")).toBe("older-tag");
  });

  it("maps an empty behind set to a ran check, not unknown", () => {
    expect(ran([]).skillStatus("tdd")).toBe("up-to-date");
  });

  it("maps no data yet to pending", () => {
    expect(driftViewModel(query({ data: undefined })).skillStatus("tdd")).toBe(
      "pending",
    );
  });

  it("maps a request error to unknown", () => {
    expect(driftViewModel(query({ isError: true })).skillStatus("tdd")).toBe(
      "unknown",
    );
  });

  it("maps a check that could not run ({ ok: false }) to unknown", () => {
    expect(
      driftViewModel(query({ data: { ok: false } })).skillStatus("tdd"),
    ).toBe("unknown");
  });

  it("maps a reachability failure (reason: unverified) to its own state", () => {
    expect(
      driftViewModel(
        query({ data: { ok: false, reason: "unverified" } }),
      ).skillStatus("tdd"),
    ).toBe("unverified");
  });

  it("never derives up-to-date from a check that could not run (J04)", () => {
    expect(
      driftViewModel(query({ data: { ok: false } })).skillStatus("tdd"),
    ).not.toBe("up-to-date");
  });
});

describe("driftViewModel — skillStatus", () => {
  it("reports a deployed skill not in the behind set as up-to-date", () => {
    expect(ran([pair("diagnose")]).skillStatus("tdd")).toBe("up-to-date");
  });

  it("never derives up-to-date from an unverified check (J04)", () => {
    expect(
      driftViewModel(
        query({ data: { ok: false, reason: "unverified" } }),
      ).skillStatus("tdd"),
    ).not.toBe("up-to-date");
  });
});

describe("driftViewModel — latest", () => {
  it("returns the latest tag for a behind skill", () => {
    expect(
      ran([
        { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
      ]).latest("tdd"),
    ).toBe("v0.5.1");
  });

  it("returns undefined for a skill that is not behind", () => {
    expect(ran([pair("diagnose")]).latest("tdd")).toBeUndefined();
  });

  it("returns undefined when the check could not run", () => {
    expect(
      driftViewModel(query({ data: { ok: false } })).latest("tdd"),
    ).toBeUndefined();
  });
});

describe("driftViewModel — targetIndicator", () => {
  it("reports drift when a deployed skill is behind", () => {
    expect(ran([pair("tdd")]).targetIndicator(deployedNames(["tdd"]))).toBe(
      "drift",
    );
  });

  it("reads a target with a no-longer-released skill as attention ahead of behind", () => {
    const drift = ran([pair("tdd"), noLongerReleased("workflow-commit")]);
    const deployed = deployedNames(["tdd", "workflow-commit"]);

    expect(drift.targetIndicator(deployed)).toBe("attention");
    expect(drift.driftCount(deployed)).toBe(0);
  });

  it("does not report drift for an orphan-behind primitive", () => {
    expect(ran([pair("foo")]).targetIndicator(deployedNames(["tdd"]))).toBe(
      "ok",
    );
  });

  it("reports ok when the check ran and nothing deployed is behind", () => {
    expect(ran([]).targetIndicator(deployedNames(["tdd"]))).toBe("ok");
  });

  it("reports unknown when the drift check could not run", () => {
    expect(
      driftViewModel(query({ data: { ok: false } })).targetIndicator(
        deployedNames(["tdd"]),
      ),
    ).toBe("unknown");
  });

  it("reports pending while the drift check is in flight", () => {
    expect(
      driftViewModel(query({ data: undefined })).targetIndicator(
        deployedNames(["tdd"]),
      ),
    ).toBe("pending");
  });

  it("reports unverified when apm could not reach the source", () => {
    expect(
      driftViewModel(
        query({ data: { ok: false, reason: "unverified" } }),
      ).targetIndicator(deployedNames(["tdd"])),
    ).toBe("unverified");
  });

  it("reports empty for a confirmed-empty target even when the drift check failed", () => {
    expect(
      driftViewModel(query({ data: { ok: false } })).targetIndicator(
        deployedNames([]),
      ),
    ).toBe("empty");
  });

  it("reports empty for a confirmed-empty target while the drift check is in flight", () => {
    expect(
      driftViewModel(query({ data: undefined })).targetIndicator(
        deployedNames([]),
      ),
    ).toBe("empty");
  });

  it("reports empty for a confirmed-empty target even when the check names an orphan-behind", () => {
    expect(ran([pair("foo")]).targetIndicator(deployedNames([]))).toBe("empty");
  });

  it("does not report empty for a target that has only skipped, unsupported primitives", () => {
    expect(
      ran([]).targetIndicator({
        status: "ready",
        names: [],
        skippedCount: 1,
        attentionCount: 0,
      }),
    ).toBe("ok");
  });

  it("stays pending when deploy-state is still loading, even with a behind entry", () => {
    expect(ran([pair("tdd")]).targetIndicator({ status: "pending" })).toBe(
      "pending",
    );
  });

  it("does not claim empty until deploy-state is confirmed, even with a clean check", () => {
    expect(ran([]).targetIndicator({ status: "pending" })).toBe("pending");
  });

  it("reports unknown when deploy-state could not be read, never silently ok", () => {
    expect(ran([pair("tdd")]).targetIndicator({ status: "unknown" })).toBe(
      "unknown",
    );
  });
});

describe("driftViewModel — orphanBehind", () => {
  it("leaves out a name that only lags a tag", () => {
    expect(ran([laggingPin("foo"), pair("bar")]).orphanBehind([])).toEqual([
      "bar",
    ]);
  });
});

describe("driftViewModel — driftCount", () => {
  it("counts the deployed skills that are behind", () => {
    expect(
      ran([pair("tdd"), pair("diagnose")]).driftCount(
        deployedNames(["tdd", "diagnose"]),
      ),
    ).toBe(2);
  });

  it("excludes an orphan-behind (behind but not deployed here) from the count", () => {
    expect(
      ran([pair("tdd"), pair("foo")]).driftCount(deployedNames(["tdd"])),
    ).toBe(1);
  });

  it("is zero when the check ran and nothing deployed is behind", () => {
    expect(ran([]).driftCount(deployedNames(["tdd"]))).toBe(0);
  });

  it("excludes a skill that only lags a tag from the count", () => {
    expect(
      ran([pair("tdd"), laggingPin("diagnose")]).driftCount(
        deployedNames(["tdd", "diagnose"]),
      ),
    ).toBe(1);
  });

  it("is zero for a confirmed-empty target", () => {
    expect(ran([pair("tdd")]).driftCount(deployedNames([]))).toBe(0);
  });

  it("reads a target holding nothing but lagging pins as ok", () => {
    expect(
      ran([laggingPin("tdd")]).targetIndicator(deployedNames(["tdd"])),
    ).toBe("ok");
  });

  it.each(["unknown", "unverified"] as const)(
    "is zero when the drift check could not run (%s), never a misleading absent-as-synced",
    (reason) => {
      const vm =
        reason === "unverified"
          ? driftViewModel(query({ data: { ok: false, reason: "unverified" } }))
          : driftViewModel(query({ data: { ok: false } }));
      expect(vm.driftCount(deployedNames(["tdd"]))).toBe(0);
    },
  );

  it("is zero while the drift check is in flight", () => {
    expect(
      driftViewModel(query({ data: undefined })).driftCount(
        deployedNames(["tdd"]),
      ),
    ).toBe(0);
  });

  it("is zero while deploy-state is still loading", () => {
    expect(ran([pair("tdd")]).driftCount({ status: "pending" })).toBe(0);
  });

  it("is zero when deploy-state could not be read", () => {
    expect(ran([pair("tdd")]).driftCount({ status: "unknown" })).toBe(0);
  });

  it("is positive exactly when the target indicator reads drift", () => {
    const drifting = ran([pair("tdd")]);
    expect(drifting.driftCount(deployedNames(["tdd"]))).toBeGreaterThan(0);
    expect(drifting.targetIndicator(deployedNames(["tdd"]))).toBe("drift");

    const clean = ran([pair("foo")]);
    expect(clean.driftCount(deployedNames(["tdd"]))).toBe(0);
    expect(clean.targetIndicator(deployedNames(["tdd"]))).toBe("ok");
  });

  it("narrows the count to one tool through forTool", () => {
    const global = ran([pair("tdd")]);
    expect(global.forTool(["tdd"]).driftCount(deployedNames(["tdd"]))).toBe(1);
    expect(global.forTool([]).driftCount(deployedNames([]))).toBe(0);
  });
});

describe("driftViewModel — orphanBehind", () => {
  it("surfaces behind names that are not deployed in the repo", () => {
    expect(ran([pair("tdd"), pair("foo")]).orphanBehind(["tdd"])).toEqual([
      "foo",
    ]);
  });

  it("is empty when every behind name is a deployed skill", () => {
    expect(ran([pair("tdd")]).orphanBehind(["tdd"])).toEqual([]);
  });

  it("is empty when the check has not produced a behind set", () => {
    expect(
      driftViewModel(query({ data: { ok: false } })).orphanBehind(["tdd"]),
    ).toEqual([]);
    expect(
      driftViewModel(query({ data: undefined })).orphanBehind(["tdd"]),
    ).toEqual([]);
  });
});

describe("driftViewModel — syncedState", () => {
  it("reports synced when the skill is deployed and its version is up-to-date", () => {
    expect(ran([]).syncedState(deployedPrimitives(["tdd"]), "tdd")).toBe(
      "synced",
    );
  });

  it("reports not-synced when the skill is not deployed", () => {
    expect(ran([]).syncedState(deployedPrimitives([]), "tdd")).toBe(
      "not-synced",
    );
  });

  it("reports not-synced when the deployed skill is behind", () => {
    expect(
      ran([
        { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
      ]).syncedState(deployedPrimitives(["tdd"]), "tdd"),
    ).toBe("not-synced");
  });

  it.each(["unknown", "unverified"] as const)(
    "reports not-synced until drift is proven up-to-date (%s)",
    (reason) => {
      const vm =
        reason === "unverified"
          ? driftViewModel(query({ data: { ok: false, reason: "unverified" } }))
          : driftViewModel(query({ data: { ok: false } }));
      expect(vm.syncedState(deployedPrimitives(["tdd"]), "tdd")).toBe(
        "not-synced",
      );
    },
  );

  it("reports not-synced while the drift check is still pending", () => {
    expect(
      driftViewModel(query({ data: undefined })).syncedState(
        deployedPrimitives(["tdd"]),
        "tdd",
      ),
    ).toBe("not-synced");
  });

  it("reports not-synced before deploy-state has resolved", () => {
    expect(ran([]).syncedState(undefined, "tdd")).toBe("not-synced");
  });
});

describe("driftViewModel — forTool (per-tool slice of the global check)", () => {
  it("keeps a behind skill deployed on this tool", () => {
    const global = ran([
      { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
    ]);
    expect(
      global.forTool(["tdd"]).targetIndicator(deployedNames(["tdd"])),
    ).toBe("drift");
  });

  it("drops a behind skill that belongs to another tool", () => {
    const global = ran([
      { name: "tdd", current: "v0.5.0", latest: "v0.5.1", reading: "behind" },
    ]);
    expect(global.forTool([]).targetIndicator(deployedNames([]))).toBe("empty");
    expect(global.forTool([]).skillStatus("tdd")).toBe("up-to-date");
  });

  it("passes a check that could not run through unchanged", () => {
    const global = driftViewModel(query({ data: { ok: false } }));
    expect(global.forTool(["tdd"]).skillStatus("tdd")).toBe("unknown");
  });
});

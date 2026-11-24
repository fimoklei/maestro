import type { ReleaseHead } from "@maestro/core";
import { describe, expect, it } from "vitest";
import { globalReading, repoReadings } from "./target-readings";

const head = (release: string, latestRelease: string | null): ReleaseHead => ({
  release,
  latestRelease,
  changed: null,
  changedSkills: [],
  selection: [],
  selected: 0,
  comparedAt: "2026-11-24T10:00:00Z",
});

const answered = <T>(data: T) => ({ data, isError: false });

describe("repoReadings", () => {
  it("reads a missing folder as Folder missing, never behind or failed, whatever its read answered", () => {
    expect(
      repoReadings(
        [{ path: "/work/gone", status: "folder-missing" }],
        [{ data: undefined, isError: true }],
      ),
    ).toEqual([
      {
        id: "repo:/work/gone",
        name: "/work/gone",
        state: "folder-missing",
        behind: false,
      },
    ]);
  });

  it("reads a failed read of an existing folder as failed, keeping what its last answer said", () => {
    expect(
      repoReadings(
        [{ path: "/work/a", status: "ready" }],
        [{ data: { releaseHead: head("v1", "v2") }, isError: true }],
      ),
    ).toEqual([
      {
        id: "repo:/work/a",
        name: "/work/a",
        state: "read-failed",
        behind: true,
      },
    ]);
  });

  it("reads a target still waiting for its read as loading", () => {
    expect(
      repoReadings(
        [{ path: "/work/a", status: "ready" }],
        [{ data: undefined, isError: false }],
      ),
    ).toEqual([
      { id: "repo:/work/a", name: "/work/a", state: "loading", behind: false },
    ]);
  });

  it("reads behind only where a newer release exists and nothing unfinished stands", () => {
    const readings = repoReadings(
      ["/work/a", "/work/b", "/work/c", "/work/d"].map((path) => ({
        path,
        status: "ready" as const,
      })),
      [
        answered({ releaseHead: head("v1", "v2") }),
        answered({ releaseHead: head("v2", "v2") }),
        answered({
          releaseHead: head("v1", "v2"),
          pendingOperation: { kind: "update" },
        }),
        answered({ releaseHead: head("v1", null) }),
      ],
    );
    expect(readings.map(({ state, behind }) => [state, behind])).toEqual([
      ["read", true],
      ["read", false],
      ["read", false],
      ["read", false],
    ]);
  });
});

describe("globalReading", () => {
  const global = (detectedTools: string[], latest: string) => ({
    detectedTools,
    releaseHead: head("v1", latest),
  });

  it("reads Global behind while a tool is detected and a newer release exists", () => {
    expect(globalReading(answered(global(["claude"], "v2")))).toEqual({
      id: "global",
      name: "Global",
      state: "read",
      behind: true,
    });
  });

  it("never reads Global behind while no tool is detected", () => {
    expect(globalReading(answered(global([], "v2"))).behind).toBe(false);
  });

  it("reads Global failed or loading as its read stands", () => {
    expect(globalReading({ data: undefined, isError: true }).state).toBe(
      "read-failed",
    );
    expect(globalReading({ data: undefined, isError: false }).state).toBe(
      "loading",
    );
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { readLastFolder, writeLastFolder } from "./browse-last-folder";

afterEach(() => {
  window.localStorage.clear();
});

describe("browse-last-folder", () => {
  it("returns null when nothing has been remembered for a mode", () => {
    expect(readLastFolder("connect")).toBeNull();
  });

  it("reads back a folder written for the same mode", () => {
    writeLastFolder("connect", "/home/me/dev");
    expect(readLastFolder("connect")).toBe("/home/me/dev");
  });

  it("keeps connect and import memories independent", () => {
    writeLastFolder("connect", "/home/me/dev");
    writeLastFolder("import-source", "/home/me/repos");

    expect(readLastFolder("connect")).toBe("/home/me/dev");
    expect(readLastFolder("import-source")).toBe("/home/me/repos");
  });

  it("overwrites a mode's previous memory rather than accumulating", () => {
    writeLastFolder("connect", "/home/me/dev");
    writeLastFolder("connect", "/home/me/dev/nested");

    expect(readLastFolder("connect")).toBe("/home/me/dev/nested");
  });
});

import { describe, expect, it } from "vitest";
import { MacosFolderChooser } from "./macos-folder-chooser";
import { platformFolderChooser } from "./platform-folder-chooser";
import { WindowsFolderChooser } from "./windows-folder-chooser";

describe("platformFolderChooser", () => {
  it("picks the macOS helper on macOS", () => {
    expect(platformFolderChooser("darwin")).toBeInstanceOf(MacosFolderChooser);
  });

  it("picks the Windows helper on Windows", () => {
    expect(platformFolderChooser("win32")).toBeInstanceOf(WindowsFolderChooser);
  });

  it("has no chooser on any other platform", () => {
    expect(platformFolderChooser("linux")).toBeNull();
  });
});

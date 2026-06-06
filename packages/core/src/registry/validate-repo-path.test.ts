import { describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "./file-system.fake";
import { validateRepoPath } from "./repo-path";

// validateRepoPath layers the filesystem checks on top of the pure
// normalization. Driven here against an in-memory FileSystemPort fake — no
// real disk (that path is exercised in tests/integration).
describe("validateRepoPath", () => {
  it("returns the canonical realpath for an existing directory", async () => {
    const fs = new InMemoryFileSystem({
      directories: { "/Users/me/project": "/Users/me/project" },
    });

    await expect(
      validateRepoPath("  /Users/me/project  ", fs),
    ).resolves.toEqual({
      ok: true,
      path: "/Users/me/project",
    });
  });

  it("rejects a path that does not exist as not-found", async () => {
    const fs = new InMemoryFileSystem();

    await expect(validateRepoPath("/Users/me/missing", fs)).resolves.toEqual({
      ok: false,
      error: "not-found",
    });
  });

  it("rejects a path that exists but is a file as not-a-directory", async () => {
    const fs = new InMemoryFileSystem({
      files: { "/Users/me/notes.txt": "hello" },
    });

    await expect(validateRepoPath("/Users/me/notes.txt", fs)).resolves.toEqual({
      ok: false,
      error: "not-a-directory",
    });
  });
});

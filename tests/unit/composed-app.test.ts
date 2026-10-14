import { describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryApp } from "../helpers/in-memory-app";

// The production composition over in-memory adapters, driven through HTTP.
describe("composed app over in-memory adapters", () => {
  it("registers a repository and lists it back", async () => {
    const app = inMemoryApp({
      fs: new InMemoryFileSystem({
        directories: { "/work/app": "/work/app" },
        files: { "/work/app/.git": "gitdir: elsewhere" },
      }),
    });

    const registered = await app.request("/api/registry/repos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "/work/app" }),
    });
    const listed = await app.request("/api/registry/repos");

    expect(registered.status).toBe(201);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({
      repos: [{ path: "/work/app", status: "ready" }],
    });
  });
});

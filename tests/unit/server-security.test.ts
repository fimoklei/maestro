import { composeUseCases } from "@maestro/core";
import { createApp } from "@maestro/server";
import { describe, expect, it } from "vitest";
import { InMemoryFileSystem } from "../../packages/core/src/registry/file-system.fake";
import { inMemoryPorts } from "../helpers/in-memory-app";

// The Origin/Host guard enabled, as in production: it blocks a malicious
// site POSTing to localhost (DNS rebinding, CSRF).
const LOCAL_HOST = "127.0.0.1:3000";
const LOCAL_ORIGIN = "http://127.0.0.1:3000";

describe("write-route Origin/Host guard", () => {
  const dir = "/work/app";

  const makeApp = () =>
    createApp({
      ...composeUseCases(
        inMemoryPorts({
          fs: new InMemoryFileSystem({
            directories: { [dir]: dir },
            files: { [`${dir}/.git`]: "gitdir: elsewhere" },
          }),
        }),
      ),
      enforceOriginHost: true,
    });

  function post(headers: Record<string, string>) {
    return makeApp().request("/api/registry/repos", {
      method: "POST",
      headers,
      body: JSON.stringify({ path: dir }),
    });
  }

  it("rejects a write from a foreign Origin", async () => {
    const res = await post({
      "content-type": "application/json",
      host: LOCAL_HOST,
      origin: "http://evil.example.com",
    });

    expect(res.status).toBe(403);
  });

  it("rejects a write with no Origin header", async () => {
    const res = await post({
      "content-type": "application/json",
      host: LOCAL_HOST,
    });

    expect(res.status).toBe(403);
  });

  it("rejects a write that is not application/json", async () => {
    const res = await post({
      "content-type": "text/plain",
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
    });

    expect(res.status).toBe(415);
  });

  it.each([
    ["DELETE", "/api/registry/repos"],
    ["POST", "/api/registry/repos/check"],
  ])("rejects a foreign Origin on %s %s", async (method, path) => {
    const res = await makeApp().request(path, {
      method,
      headers: {
        "content-type": "application/json",
        host: LOCAL_HOST,
        origin: "http://evil.example.com",
      },
      body: JSON.stringify({ path: dir }),
    });

    expect(res.status).toBe(403);
  });

  it("guards a write to any route, not only the registry path", async () => {
    const res = await makeApp().request("/api/not-a-route-yet", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: LOCAL_HOST,
        origin: "http://evil.example.com",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(403);
  });

  it("rejects a connect from a foreign Origin", async () => {
    const res = await makeApp().request("/api/inventory/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: LOCAL_HOST,
        origin: "http://evil.example.com",
      },
      body: JSON.stringify({ path: dir }),
    });

    expect(res.status).toBe(403);
  });

  it("allows a write from an allowlisted Host and same Origin", async () => {
    const res = await post({
      "content-type": "application/json",
      host: LOCAL_HOST,
      origin: LOCAL_ORIGIN,
    });

    expect(res.status).toBe(201);
  });
});

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "@maestro/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The default `app` must resolve MAESTRO_HOME when a request arrives, not freeze
// it at import time. Otherwise any test or tool importing { app } and POSTing
// would write to the real ~/.maestro regardless of a sandbox set later. Here we
// set MAESTRO_HOME after the module is already imported and prove the write
// lands in the sandbox (see .claude/rules/security.md).
const LOCAL = {
  "content-type": "application/json",
  host: "127.0.0.1:3000",
  origin: "http://127.0.0.1:3000",
};

describe("default app config home", () => {
  let dir: string;
  const previousHome = process.env.MAESTRO_HOME;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "maestro-home-"));
    process.env.MAESTRO_HOME = dir;
  });

  afterEach(async () => {
    process.env.MAESTRO_HOME = previousHome;
    await rm(dir, { recursive: true, force: true });
  });

  it("writes to the MAESTRO_HOME set after import, not a frozen path", async () => {
    const res = await app.request("/api/registry/repos", {
      method: "POST",
      headers: LOCAL,
      body: JSON.stringify({ path: dir }),
    });

    expect(res.status).toBe(201);
    const written = await readFile(join(dir, "config.json"), "utf8");
    expect(JSON.parse(written).repos).toHaveLength(1);
  });
});

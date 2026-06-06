import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError, requestJson } from "./http";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestJson", () => {
  it("throws an HttpError carrying the server message on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ message: "Path must be an absolute path." }),
            { status: 400, headers: { "content-type": "application/json" } },
          ),
      ),
    );

    let caught: HttpError | undefined;
    try {
      await requestJson("/api/registry/repos");
    } catch (error) {
      caught = error as HttpError;
    }

    expect(caught).toBeInstanceOf(HttpError);
    expect(caught?.status).toBe(400);
    expect(caught?.message).toBe("Path must be an absolute path.");
  });
});

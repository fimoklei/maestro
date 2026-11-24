import { describe, expect, it } from "vitest";
import { requestFailure } from "../../scripts/lib/request-failure.mjs";

describe("requestFailure", () => {
  it("names the request and the socket error behind a failed fetch", () => {
    const failed = new TypeError("fetch failed", {
      cause: Object.assign(new Error("other side closed"), {
        code: "UND_ERR_SOCKET",
      }),
    });

    expect(requestFailure("GET", "/api/drift/global", failed).message).toBe(
      "GET /api/drift/global got no answer from the cockpit: UND_ERR_SOCKET, other side closed",
    );
  });

  it("falls back to the error's own message when it has no cause", () => {
    expect(
      requestFailure("POST", "/api/deploy/bulk", new Error("aborted")).message,
    ).toBe("POST /api/deploy/bulk got no answer from the cockpit: aborted");
  });
});

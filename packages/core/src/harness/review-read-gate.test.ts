import { describe, expect, it } from "vitest";
import type {
  HarnessReviewPort,
  HarnessReviewRead,
  ReviewWriteOutcome,
} from "./harness-review-port";
import { ReviewReadGate } from "./review-read-gate";

const ORIGIN = {
  host: "github.com",
  ownerRepo: "fimoklei/agent-harness",
};
const ROOT = "/harness";
const START = Date.parse("2026-08-01T07:00:00.000Z");
const MAX_AGE = 30_000;

const readOf = (limit: number): HarnessReviewRead => ({
  outcome: "read",
  requests: [],
  complete: true,
  limit,
});

// A GitHub whose answer changes with every review read it is asked for.
function build() {
  let now = START;
  let root: string | undefined = ROOT;
  let next: HarnessReviewRead | null = null;
  let hold: Promise<void> = Promise.resolve();
  const asked = { reviews: 0, viewer: 0 };
  const written: ReviewWriteOutcome = { ok: true };
  const review: HarnessReviewPort = {
    readReviews: async () => {
      asked.reviews += 1;
      await hold;
      return next ?? readOf(asked.reviews);
    },
    readViewer: async () => {
      asked.viewer += 1;
      return { outcome: "read", login: "fimoklei" };
    },
    createRequest: async () => written,
    reopenRequest: async () => written,
    closeRequest: async () => written,
    editRequest: async () => written,
  };
  const gate = new ReviewReadGate({
    review,
    root: async () => root,
    now: () => new Date(now),
  });
  return {
    asked,
    reads: gate.reads(MAX_AGE),
    writes: gate.writes,
    advance: (ms: number) => {
      now += ms;
    },
    connect: (path: string | undefined) => {
      root = path;
    },
    answer: (read: HarnessReviewRead) => {
      next = read;
    },
    // The next reads wait until the returned release is called.
    holdReads: () => {
      let release = () => {};
      hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}

describe("ReviewReadGate", () => {
  it("reuses a review read within the window", async () => {
    const { asked, reads, advance } = build();
    await reads.readReviews(ORIGIN);

    advance(MAX_AGE - 1);

    await expect(reads.readReviews(ORIGIN)).resolves.toEqual(readOf(1));
    expect(asked.reviews).toBe(1);
  });

  it("reads again once the remembered answer is older than the window", async () => {
    const { asked, reads, advance } = build();
    await reads.readReviews(ORIGIN);

    advance(MAX_AGE);

    await expect(reads.readReviews(ORIGIN)).resolves.toEqual(readOf(2));
    expect(asked.reviews).toBe(2);
  });

  it("answers concurrent reads with one review read", async () => {
    const { asked, reads, holdReads } = build();
    const release = holdReads();

    const all = Promise.all([
      reads.readReviews(ORIGIN),
      reads.readReviews(ORIGIN),
      reads.readReviews(ORIGIN),
    ]);
    release();

    expect(await all).toEqual([readOf(1), readOf(1), readOf(1)]);
    expect(asked.reviews).toBe(1);
  });

  it("remembers each Harness root on its own", async () => {
    const { asked, reads, connect } = build();
    await reads.readReviews(ORIGIN);

    connect("/other-harness");
    await reads.readReviews(ORIGIN);

    expect(asked.reviews).toBe(2);
  });

  it("reuses nothing while no Harness root resolves", async () => {
    const { asked, reads, connect } = build();
    connect(undefined);
    await reads.readReviews(ORIGIN);

    await reads.readReviews(ORIGIN);

    expect(asked.reviews).toBe(2);
  });

  it("reuses the sign-in read within the window", async () => {
    const { asked, reads } = build();
    await reads.readViewer(ORIGIN);

    await reads.readViewer(ORIGIN);

    expect(asked.viewer).toBe(1);
  });

  it.each([{ outcome: "unavailable" }, { outcome: "failed" }] as const)(
    "never reuses an $outcome review read",
    async (unread) => {
      const { asked, reads, answer } = build();
      answer(unread);
      await reads.readReviews(ORIGIN);

      await reads.readReviews(ORIGIN);

      expect(asked.reviews).toBe(2);
    },
  );

  it.each([
    {
      action: "create",
      write: (port: HarnessReviewPort) =>
        port.createRequest(ORIGIN, {
          head: "maestro/tdd",
          base: "main",
          title: "Add skill: tdd",
          body: "",
        }),
    },
    {
      action: "reopen",
      write: (port: HarnessReviewPort) => port.reopenRequest(ORIGIN, 45),
    },
    {
      action: "withdraw",
      write: (port: HarnessReviewPort) => port.closeRequest(ORIGIN, 45),
    },
  ])("drops the remembered answer after a $action", async ({ write }) => {
    const { asked, reads, writes } = build();
    await reads.readReviews(ORIGIN);

    await expect(write(writes)).resolves.toEqual({ ok: true });

    await expect(reads.readReviews(ORIGIN)).resolves.toEqual(readOf(2));
    expect(asked.reviews).toBe(2);
  });

  it("gives a Proposal action's recheck a fresh read, never the remembered one", async () => {
    const { asked, reads, writes } = build();
    await reads.readReviews(ORIGIN);

    await expect(writes.readReviews(ORIGIN)).resolves.toEqual(readOf(2));
    expect(asked.reviews).toBe(2);
  });
});

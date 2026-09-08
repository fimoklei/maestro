import type { HarnessReviewPort, HarnessReviewRead } from "@maestro/core";

// The controlled GitHub boundary the server journeys drive: a real Hono app
// and a real clone, with what GitHub answers set by the test rather than by a
// live account (#827 — Testing Decisions).
export type StubReview = HarnessReviewPort & {
  /** What the next read answers. */
  answer: (read: HarnessReviewRead) => void;
  /** Each origin the port was asked about, in order. */
  readonly asked: string[];
};

const EMPTY: HarnessReviewRead = {
  outcome: "read",
  requests: [],
  complete: true,
  limit: 100,
};

export const stubReview = (initial: HarnessReviewRead = EMPTY): StubReview => {
  let current = initial;
  const asked: string[] = [];
  return {
    asked,
    answer: (read) => {
      current = read;
    },
    readReviews: async (origin) => {
      asked.push(origin.ownerRepo);
      return current;
    },
  };
};

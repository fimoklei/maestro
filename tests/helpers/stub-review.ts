import type {
  HarnessReviewPort,
  HarnessReviewRead,
  NewReviewRequest,
  ReviewWriteOutcome,
} from "@maestro/core";

// The controlled GitHub boundary the server journeys drive: a real Hono app
// and a real clone, with what GitHub answers set by the test rather than by a
// live account (#827 — Testing Decisions).
export type StubReview = HarnessReviewPort & {
  /** What the next read answers. */
  answer: (read: HarnessReviewRead) => void;
  /** What the next write answers. Success by default. */
  answerWrite: (outcome: ReviewWriteOutcome) => void;
  /** Each origin the port was asked about, in order. */
  readonly asked: string[];
  /** Every write the port was asked to make, in order. */
  readonly created: NewReviewRequest[];
  readonly reopened: number[];
  readonly closed: number[];
};

const EMPTY: HarnessReviewRead = {
  outcome: "read",
  requests: [],
  complete: true,
  limit: 100,
};

export const stubReview = (initial: HarnessReviewRead = EMPTY): StubReview => {
  let current = initial;
  let write: ReviewWriteOutcome = { ok: true };
  const asked: string[] = [];
  const created: NewReviewRequest[] = [];
  const reopened: number[] = [];
  const closed: number[] = [];
  return {
    asked,
    created,
    reopened,
    closed,
    answer: (read) => {
      current = read;
    },
    answerWrite: (outcome) => {
      write = outcome;
    },
    readReviews: async (origin) => {
      asked.push(origin.ownerRepo);
      return current;
    },
    createRequest: async (_origin, request) => {
      created.push(request);
      return write;
    },
    reopenRequest: async (_origin, number) => {
      reopened.push(number);
      return write;
    },
    closeRequest: async (_origin, number) => {
      closed.push(number);
      return write;
    },
  };
};
